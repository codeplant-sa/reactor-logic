import { blockDefinitions } from "./blocks";
import {
  getNextPosition,
  isWall,
  samePosition,
  turnLeft,
  turnRight
} from "./mazeGenerator";
import {
  ConditionType,
  CounterOperator,
  ExecutionFrame,
  ExecutionRuntime,
  GameState,
  InterpreterResult,
  ProgramBlock
} from "./types";

const MAX_INSTRUCTIONS = 650;

const cloneFrame = (frame: ExecutionFrame): ExecutionFrame => ({ ...frame });

const log = (state: GameState, message: string): GameState => ({
  ...state,
  missionLog: [message, ...state.missionLog].slice(0, 12)
});

const hotspotCountLeft = (state: GameState): number =>
  state.hotspots.filter((hotspot) => !hotspot.sealed).length;

const fail = (state: GameState, reason: string): GameState =>
  log(
    {
      ...state,
      executionStatus: "failed",
      failureReason: reason,
      activeBlockId: undefined
    },
    reason
  );

const succeed = (state: GameState): GameState =>
  log(
    {
      ...state,
      executionStatus: "success",
      failureReason: undefined,
      activeBlockId: undefined
    },
    "Mission complete. All hotspots are sealed and the robot reached extraction."
  );

const collectProcedures = (blocks: ProgramBlock[]): Record<string, ProgramBlock> => {
  const procedures: Record<string, ProgramBlock> = {};
  const visit = (items: ProgramBlock[]) => {
    items.forEach((block) => {
      if (block.type === "defineProcedure") {
        procedures[String(block.params.name ?? "routine_a")] = block;
      }
      Object.values(block.children ?? {}).forEach((children) => visit(children ?? []));
    });
  };
  visit(blocks);
  return procedures;
};

export const createExecutionRuntime = (
  program: ProgramBlock[],
  maxInstructions = MAX_INSTRUCTIONS
): ExecutionRuntime => ({
  frames: [
    {
      id: "root",
      kind: "root",
      blocks: program,
      index: 0
    }
  ],
  procedures: collectProcedures(program),
  instructionCount: 0,
  maxInstructions
});

const compare = (
  left: number,
  operator: CounterOperator,
  right: number
): boolean => {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">=":
      return left >= right;
    case ">":
      return left > right;
    default:
      return false;
  }
};

export const evaluateCondition = (state: GameState, block: ProgramBlock): boolean => {
  const condition = block.params.condition as ConditionType | undefined;
  const nextPosition = getNextPosition(state.position, state.facing);

  switch (condition) {
    case "wall_ahead":
      return isWall(state.maze, nextPosition);
    case "on_hotspot":
      return state.hotspots.some(
        (hotspot) => !hotspot.sealed && samePosition(hotspot.position, state.position)
      );
    case "hotspot_ahead":
      return state.hotspots.some(
        (hotspot) => !hotspot.sealed && samePosition(hotspot.position, nextPosition)
      );
    case "at_extraction":
      return samePosition(state.position, state.maze.extraction);
    case "foam_remaining_gt_0":
      return state.foamCharges > 0;
    case "hotspots_left_gt_0":
      return hotspotCountLeft(state) > 0;
    case "radiation_level_gt":
      return state.plantRadiation > Number(block.params.threshold ?? 80);
    case "counter_compare":
      return compare(
        state.variables.counter,
        (block.params.operator as CounterOperator | undefined) ?? "<",
        Number(block.params.counterValue ?? 3)
      );
    default:
      return false;
  }
};

const spendPrimitiveAction = (state: GameState, cost: number): GameState => {
  const next = {
    ...state,
    meltdownTicks: state.meltdownTicks - cost,
    plantRadiation: Math.max(0, state.plantRadiation + 1),
    actionsUsed: state.actionsUsed + 1
  };

  if (next.meltdownTicks <= 0) {
    return fail(next, "Meltdown timer reached zero.");
  }

  return next;
};

const afterPositionChange = (state: GameState): GameState => {
  if (state.executionStatus === "failed") {
    return state;
  }

  if (samePosition(state.position, state.maze.extraction)) {
    const remaining = hotspotCountLeft(state);
    if (remaining > 0) {
      return fail(state, `Extraction reached, but ${remaining} hotspots remain.`);
    }
    return succeed(state);
  }

  return state;
};

const executePrimitive = (state: GameState, block: ProgramBlock): GameState => {
  switch (block.type) {
    case "moveForward": {
      let next = spendPrimitiveAction(state, state.robot.moveCost);
      if (next.executionStatus === "failed") {
        return next;
      }

      const target = getNextPosition(next.position, next.facing);
      if (isWall(next.maze, target)) {
        next = log(
          {
            ...next,
            wallHits: next.wallHits + 1
          },
          `Wall ahead. ${next.robot.callSign} bumped the wall.`
        );

        if (next.wallHits >= next.wallHitLimit) {
          return fail(next, `${next.robot.callSign} exceeded the wall collision limit.`);
        }
        return next;
      }

      next = log(
        {
          ...next,
          position: target,
          pathTrace: [...next.pathTrace, target]
        },
        `${next.robot.callSign} moved to ${target.x}, ${target.y}.`
      );
      return afterPositionChange(next);
    }
    case "turnLeft": {
      let next = spendPrimitiveAction(state, state.robot.turnCost);
      if (next.executionStatus === "failed") {
        return next;
      }
      next = log(
        {
          ...next,
          facing: turnLeft(next.facing)
        },
        `${next.robot.callSign} turned left.`
      );
      return next;
    }
    case "turnRight": {
      let next = spendPrimitiveAction(state, state.robot.turnCost);
      if (next.executionStatus === "failed") {
        return next;
      }
      next = log(
        {
          ...next,
          facing: turnRight(next.facing)
        },
        `${next.robot.callSign} turned right.`
      );
      return next;
    }
    case "deployFoam": {
      if (state.foamCharges <= 0) {
        return fail(state, "No foam remaining.");
      }

      let next = spendPrimitiveAction(state, state.robot.deployCost);
      if (next.executionStatus === "failed") {
        return next;
      }

      const hotspotIndex = next.hotspots.findIndex(
        (hotspot) => !hotspot.sealed && samePosition(hotspot.position, next.position)
      );

      next = {
        ...next,
        foamCharges: next.foamCharges - 1
      };

      if (hotspotIndex >= 0) {
        const hotspot = next.hotspots[hotspotIndex];
        const reduction = Math.round(
          hotspot.radiationValue * next.robot.foamEffectMultiplier
        );
        const updatedHotspots = next.hotspots.map((item, index) =>
          index === hotspotIndex ? { ...item, sealed: true } : item
        );
        next = log(
          {
            ...next,
            hotspots: updatedHotspots,
            plantRadiation: Math.max(0, next.plantRadiation - reduction),
            radiationReduced: next.radiationReduced + reduction
          },
          `${next.robot.callSign} sealed ${hotspot.id} with stabilizing foam.`
        );

        if (
          samePosition(next.position, next.maze.extraction) &&
          hotspotCountLeft(next) === 0
        ) {
          return succeed(next);
        }
        return next;
      }

      next = log(next, "Foam deployed on a non-hotspot tile. One charge was wasted.");
      if (next.foamCharges < hotspotCountLeft(next)) {
        return fail(next, "Not enough foam remains to seal all hotspots.");
      }
      return next;
    }
    default:
      return fail(state, `Unknown primitive block: ${block.type}`);
  }
};

const executeVariable = (state: GameState, block: ProgramBlock): GameState => {
  if (block.type === "setCounter") {
    return log(
      {
        ...state,
        variables: {
          ...state.variables,
          counter: Number(block.params.value ?? 0)
        }
      },
      `Counter set to ${Number(block.params.value ?? 0)}.`
    );
  }

  if (block.type === "increaseCounter") {
    const amount = Number(block.params.amount ?? 1);
    const value = state.variables.counter + amount;
    return log(
      {
        ...state,
        variables: {
          ...state.variables,
          counter: value
        }
      },
      `Counter increased to ${value}.`
    );
  }

  return fail(state, `Unknown variable block: ${block.type}`);
};

const finishProgram = (state: GameState): GameState => {
  if (
    samePosition(state.position, state.maze.extraction) &&
    hotspotCountLeft(state) === 0
  ) {
    return succeed(state);
  }

  if (hotspotCountLeft(state) > 0) {
    return fail(state, "Program ended before all hotspots were sealed.");
  }

  return fail(state, "Program ended before the extraction zone was reached.");
};

export const executeNextInstruction = (
  state: GameState,
  runtime: ExecutionRuntime
): InterpreterResult => {
  let nextState: GameState = {
    ...state,
    variables: { ...state.variables },
    hotspots: state.hotspots.map((hotspot) => ({ ...hotspot })),
    pathTrace: [...state.pathTrace],
    missionLog: [...state.missionLog],
    activeBlockId: state.activeBlockId
  };
  const nextRuntime: ExecutionRuntime = {
    ...runtime,
    frames: runtime.frames.map(cloneFrame),
    procedures: { ...runtime.procedures }
  };

  while (nextState.executionStatus !== "failed" && nextState.executionStatus !== "success") {
    if (nextRuntime.instructionCount >= nextRuntime.maxInstructions) {
      nextState = fail(
        nextState,
        "Loop safety limit reached. Check your while condition."
      );
      break;
    }

    const frame = nextRuntime.frames[nextRuntime.frames.length - 1];

    if (!frame) {
      nextState = finishProgram(nextState);
      break;
    }

    if (frame.index >= frame.blocks.length) {
      if (frame.kind === "repeat" && (frame.repeatRemaining ?? 1) > 1) {
        frame.repeatRemaining = (frame.repeatRemaining ?? 1) - 1;
        frame.index = 0;
        continue;
      }
      nextRuntime.frames.pop();
      continue;
    }

    const block = frame.blocks[frame.index];
    const definition = blockDefinitions[block.type];
    nextState = { ...nextState, activeBlockId: block.id };
    nextRuntime.instructionCount += 1;

    if (!definition) {
      nextState = fail(nextState, `Unknown block type: ${block.type}`);
      break;
    }

    if (definition.interpreter.kind === "primitive") {
      frame.index += 1;
      nextState = executePrimitive(nextState, block);
      break;
    }

    if (definition.interpreter.kind === "variable") {
      frame.index += 1;
      nextState = executeVariable(nextState, block);
      break;
    }

    if (block.type === "repeat") {
      const count = Math.max(0, Math.min(99, Number(block.params.count ?? 0)));
      frame.index += 1;
      if (count > 0) {
        nextRuntime.frames.push({
          id: `${block.id}-repeat`,
          kind: "repeat",
          blocks: block.children?.body ?? [],
          index: 0,
          sourceBlockId: block.id,
          repeatRemaining: count
        });
      }
      continue;
    }

    if (block.type === "while") {
      if (evaluateCondition(nextState, block)) {
        nextRuntime.frames.push({
          id: `${block.id}-while-${nextRuntime.instructionCount}`,
          kind: "while",
          blocks: block.children?.body ?? [],
          index: 0,
          sourceBlockId: block.id
        });
      } else {
        frame.index += 1;
      }
      continue;
    }

    if (block.type === "if" || block.type === "ifCounter") {
      const conditionBlock =
        block.type === "ifCounter"
          ? {
              ...block,
              params: {
                ...block.params,
                condition: "counter_compare"
              }
            }
          : block;
      frame.index += 1;
      if (evaluateCondition(nextState, conditionBlock)) {
        nextRuntime.frames.push({
          id: `${block.id}-if`,
          kind: "if",
          blocks: block.children?.body ?? [],
          index: 0,
          sourceBlockId: block.id
        });
      }
      continue;
    }

    if (block.type === "ifElse") {
      frame.index += 1;
      const branch = evaluateCondition(nextState, block)
        ? block.children?.body ?? []
        : block.children?.elseBody ?? [];
      nextRuntime.frames.push({
        id: `${block.id}-branch`,
        kind: "if",
        blocks: branch,
        index: 0,
        sourceBlockId: block.id
      });
      continue;
    }

    if (block.type === "defineProcedure") {
      frame.index += 1;
      continue;
    }

    if (block.type === "callProcedure") {
      frame.index += 1;
      const name = String(block.params.name ?? "routine_a");
      const procedure = nextRuntime.procedures[name];
      if (!procedure) {
        nextState = fail(nextState, `Procedure "${name}" is not defined.`);
        break;
      }
      nextRuntime.frames.push({
        id: `${block.id}-procedure`,
        kind: "procedure",
        blocks: procedure.children?.procedureBody ?? [],
        index: 0,
        sourceBlockId: block.id
      });
      continue;
    }

    nextState = fail(nextState, `Block "${definition.label}" has no interpreter behavior.`);
    break;
  }

  return {
    state: nextState,
    runtime: nextRuntime,
    executedBlockId: nextState.activeBlockId
  };
};
