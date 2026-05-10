import {
  directionBetween,
  getNextPosition,
  isWall,
  positionKey,
  samePosition
} from "./mazeGenerator";
import type {
  CopilotRouteCommand,
  CopilotRouteWaypoint,
  CopilotShortestPath
} from "./copilot";
import type { Direction, GameState, Hotspot, Maze, Position } from "./types";

const directionOrder: Direction[] = ["north", "east", "south", "west"];

const turnRightFrom: Record<Direction, Direction> = {
  north: "east",
  east: "south",
  south: "west",
  west: "north"
};

const turnLeftFrom: Record<Direction, Direction> = {
  north: "west",
  west: "south",
  south: "east",
  east: "north"
};

interface SearchNode {
  position: Position;
  mask: number;
}

const stateKey = (position: Position, mask: number): string =>
  `${position.x},${position.y}|${mask}`;

const commandLabel: Record<CopilotRouteCommand["action"], string> = {
  moveForward: "move_forward",
  turnLeft: "turn_left",
  turnRight: "turn_right",
  deployFoam: "deploy_foam"
};

const compressMoveCommands = (
  commands: CopilotRouteCommand[]
): CopilotRouteCommand[] =>
  commands.reduce<CopilotRouteCommand[]>((result, command) => {
    const previous = result[result.length - 1];
    if (
      command.action === "moveForward" &&
      previous?.action === "moveForward" &&
      !previous.position &&
      !command.position
    ) {
      previous.count = (previous.count ?? 1) + (command.count ?? 1);
      return result;
    }

    result.push(command);
    return result;
  }, []);

const commandsToPseudoCode = (commands: CopilotRouteCommand[]): string =>
  commands
    .map((command) => {
      const name = commandLabel[command.action];
      if (command.action === "moveForward" && (command.count ?? 1) > 1) {
        return `repeat ${command.count}:\n    ${name}()`;
      }
      return `${name}()`;
    })
    .join("\n");

const turnsToFace = (
  from: Direction,
  to: Direction
): { facing: Direction; commands: CopilotRouteCommand[] } => {
  if (from === to) {
    return { facing: from, commands: [] };
  }

  if (turnRightFrom[from] === to) {
    return {
      facing: to,
      commands: [{ action: "turnRight" }]
    };
  }

  if (turnLeftFrom[from] === to) {
    return {
      facing: to,
      commands: [{ action: "turnLeft" }]
    };
  }

  return {
    facing: to,
    commands: [{ action: "turnRight" }, { action: "turnRight" }]
  };
};

const reconstructPath = (
  endKey: string,
  parents: Map<string, string | null>,
  nodes: Map<string, SearchNode>
): Position[] => {
  const path: Position[] = [];
  let cursor: string | null = endKey;

  while (cursor) {
    path.push(nodes.get(cursor)!.position);
    cursor = parents.get(cursor) ?? null;
  }

  return path.reverse();
};

const findShortestHotspotPath = (
  maze: Maze,
  start: Position,
  hotspots: Hotspot[]
): Position[] | null => {
  const hotspotIndexes = new Map(
    hotspots.map((hotspot, index) => [positionKey(hotspot.position), index])
  );
  const allVisitedMask = (1 << hotspots.length) - 1;
  const startingHotspotIndex = hotspotIndexes.get(positionKey(start));
  const startMask =
    startingHotspotIndex === undefined ? 0 : 1 << startingHotspotIndex;
  const startKey = stateKey(start, startMask);
  const queue: SearchNode[] = [{ position: start, mask: startMask }];
  const parents = new Map<string, string | null>([[startKey, null]]);
  const nodes = new Map<string, SearchNode>([
    [startKey, { position: start, mask: startMask }]
  ]);

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex];
    const currentKey = stateKey(current.position, current.mask);

    if (
      current.mask === allVisitedMask &&
      samePosition(current.position, maze.extraction)
    ) {
      return reconstructPath(currentKey, parents, nodes);
    }

    directionOrder.forEach((direction) => {
      const next = getNextPosition(current.position, direction);
      if (isWall(maze, next)) {
        return;
      }

      const hotspotIndex = hotspotIndexes.get(positionKey(next));
      const nextMask =
        hotspotIndex === undefined ? current.mask : current.mask | (1 << hotspotIndex);
      const nextKey = stateKey(next, nextMask);

      if (parents.has(nextKey)) {
        return;
      }

      const node = { position: next, mask: nextMask };
      parents.set(nextKey, currentKey);
      nodes.set(nextKey, node);
      queue.push(node);
    });
  }

  return null;
};

const buildWaypoints = (
  path: Position[],
  hotspots: Hotspot[],
  extraction: Position
): CopilotRouteWaypoint[] => {
  const visited = new Set<string>();
  const hotspotByPosition = new Map(
    hotspots.map((hotspot) => [positionKey(hotspot.position), hotspot])
  );
  const waypoints: CopilotRouteWaypoint[] = [];

  path.forEach((position, pathIndex) => {
    const hotspot = hotspotByPosition.get(positionKey(position));
    if (hotspot && !visited.has(hotspot.id)) {
      visited.add(hotspot.id);
      waypoints.push({
        kind: "hotspot",
        id: hotspot.id,
        position,
        pathIndex
      });
    }
  });

  waypoints.push({
    kind: "extraction",
    position: extraction,
    pathIndex: Math.max(0, path.length - 1)
  });

  return waypoints;
};

const buildRouteCommands = (
  path: Position[],
  facing: Direction,
  hotspots: Hotspot[]
): { commands: CopilotRouteCommand[]; moveDirections: Direction[] } => {
  const hotspotByPosition = new Map(
    hotspots.map((hotspot) => [positionKey(hotspot.position), hotspot])
  );
  const sealedByRoute = new Set<string>();
  const commands: CopilotRouteCommand[] = [];
  const moveDirections: Direction[] = [];
  let currentFacing = facing;

  const addFoamCommand = (position: Position) => {
    const hotspot = hotspotByPosition.get(positionKey(position));
    if (!hotspot || sealedByRoute.has(hotspot.id)) {
      return;
    }

    sealedByRoute.add(hotspot.id);
    commands.push({
      action: "deployFoam",
      position,
      hotspotId: hotspot.id
    });
  };

  if (path[0]) {
    addFoamCommand(path[0]);
  }

  for (let index = 1; index < path.length; index += 1) {
    const direction = directionBetween(path[index - 1], path[index]);
    const turn = turnsToFace(currentFacing, direction);
    currentFacing = turn.facing;
    moveDirections.push(direction);
    commands.push(...turn.commands);
    commands.push({ action: "moveForward" });
    addFoamCommand(path[index]);
  }

  return {
    commands: compressMoveCommands(commands),
    moveDirections
  };
};

export const planShortestPath = (state: GameState): CopilotShortestPath => {
  const hotspots = state.hotspots.filter((hotspot) => !hotspot.sealed);
  const foamRequired = hotspots.length;
  const base = {
    totalTiles: 0,
    hotspotsToSeal: hotspots.length,
    foamRequired,
    foamAvailable: state.foamCharges,
    foamSufficient: state.foamCharges >= foamRequired,
    path: [],
    moveDirections: [],
    waypoints: [],
    commands: [],
    pseudoCode: ""
  };

  if (state.foamCharges < foamRequired) {
    return {
      ...base,
      available: false,
      reason: "Not enough foam charges remain to seal every unsealed hotspot."
    };
  }

  const path = findShortestHotspotPath(state.maze, state.position, hotspots);
  if (!path) {
    return {
      ...base,
      available: false,
      reason: "No route reaches every unsealed hotspot and then extraction."
    };
  }

  const { commands, moveDirections } = buildRouteCommands(
    path,
    state.facing,
    hotspots
  );

  return {
    ...base,
    available: true,
    totalTiles: Math.max(0, path.length - 1),
    path,
    moveDirections,
    waypoints: buildWaypoints(path, hotspots, state.maze.extraction),
    commands,
    pseudoCode: commandsToPseudoCode(commands)
  };
};
