import {
  BlockDefinition,
  ChildSlot,
  CodeGenContext,
  ConditionType,
  CounterOperator,
  ProgramBlock
} from "./types";

let blockSequence = 0;

export const CONDITION_OPTIONS: Array<{
  type: ConditionType;
  label: string;
  help: string;
}> = [
  {
    type: "wall_ahead",
    label: "wall ahead",
    help: "True when the next grid cell is blocked."
  },
  {
    type: "on_hotspot",
    label: "on hotspot",
    help: "True when the robot is standing on an unsealed hotspot."
  },
  {
    type: "hotspot_ahead",
    label: "hotspot ahead",
    help: "True when the next grid cell contains an unsealed hotspot."
  },
  {
    type: "at_extraction",
    label: "at extraction",
    help: "True when the robot is on the extraction platform."
  },
  {
    type: "foam_remaining_gt_0",
    label: "foam remaining > 0",
    help: "True while at least one foam charge is available."
  },
  {
    type: "hotspots_left_gt_0",
    label: "hotspots left > 0",
    help: "True while any hotspot remains unsealed."
  },
  {
    type: "radiation_level_gt",
    label: "radiation level > value",
    help: "Compares the plant-wide radiation level to a number."
  },
  {
    type: "counter_compare",
    label: "counter comparison",
    help: "Compares the user variable counter to a number."
  }
];

export const COUNTER_OPERATORS: CounterOperator[] = ["<", "<=", "==", "!=", ">=", ">"];

export const makeBlockId = (prefix = "block"): string => {
  blockSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${blockSequence}`;
};

const block = (
  type: string,
  params: ProgramBlock["params"] = {},
  children?: ProgramBlock["children"]
): ProgramBlock => ({
  id: makeBlockId(type),
  type,
  params,
  children
});

const indent = (level: number): string => "    ".repeat(level);

const ensureBody = (slot: ChildSlot): ProgramBlock["children"] => ({
  [slot]: []
});

const renderChild = (
  context: CodeGenContext,
  blocks: ProgramBlock[] | undefined,
  childIndent: number
): string[] => {
  if (!blocks || blocks.length === 0) {
    return [`${indent(childIndent)}pass`];
  }
  return context.renderBlocks(blocks, childIndent);
};

export const conditionToPseudo = (block: ProgramBlock): string => {
  const condition = block.params.condition as ConditionType | undefined;
  const threshold = Number(block.params.threshold ?? 80);
  const operator = (block.params.operator as CounterOperator | undefined) ?? "<";
  const counterValue = Number(block.params.counterValue ?? 3);

  switch (condition) {
    case "wall_ahead":
      return "wall_ahead()";
    case "on_hotspot":
      return "on_hotspot()";
    case "hotspot_ahead":
      return "hotspot_ahead()";
    case "at_extraction":
      return "at_extraction()";
    case "foam_remaining_gt_0":
      return "foam_remaining > 0";
    case "hotspots_left_gt_0":
      return "hotspots_left > 0";
    case "radiation_level_gt":
      return `radiation_level > ${threshold}`;
    case "counter_compare":
      return `counter ${operator} ${counterValue}`;
    default:
      return "wall_ahead()";
  }
};

const conditionParams = (): ProgramBlock["params"] => ({
  condition: "wall_ahead",
  threshold: 80,
  operator: "<",
  counterValue: 3
});

export const blockDefinitions: Record<string, BlockDefinition> = {
  moveForward: {
    type: "moveForward",
    label: "Move Forward",
    icon: "M",
    category: "movement",
    createDefaultBlock: () => block("moveForward"),
    interpreter: { kind: "primitive", action: "moveForward" },
    toPseudoCode: (_block, context) => [`${indent(context.indent)}move_forward()`],
    description: "Advance one grid tile in the direction the robot is facing.",
    concept: "sequence"
  },
  turnLeft: {
    type: "turnLeft",
    label: "Turn Left",
    icon: "L",
    category: "movement",
    createDefaultBlock: () => block("turnLeft"),
    interpreter: { kind: "primitive", action: "turnLeft" },
    toPseudoCode: (_block, context) => [`${indent(context.indent)}turn_left()`],
    description: "Rotate the robot left without changing grid position.",
    concept: "sequence"
  },
  turnRight: {
    type: "turnRight",
    label: "Turn Right",
    icon: "R",
    category: "movement",
    createDefaultBlock: () => block("turnRight"),
    interpreter: { kind: "primitive", action: "turnRight" },
    toPseudoCode: (_block, context) => [`${indent(context.indent)}turn_right()`],
    description: "Rotate the robot right without changing grid position.",
    concept: "sequence"
  },
  deployFoam: {
    type: "deployFoam",
    label: "Deploy Foam",
    icon: "F",
    category: "movement",
    createDefaultBlock: () => block("deployFoam"),
    interpreter: { kind: "primitive", action: "deployFoam" },
    toPseudoCode: (_block, context) => [`${indent(context.indent)}deploy_foam()`],
    description:
      "Use one fictional stabilizing-foam charge on the robot's current tile.",
    concept: "sequence"
  },
  if: {
    type: "if",
    label: "If Then",
    icon: "?",
    category: "logic",
    childSlots: ["body"],
    createDefaultBlock: () => block("if", conditionParams(), ensureBody("body")),
    interpreter: { kind: "control" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}if ${conditionToPseudo(item)}:`,
      ...renderChild(context, item.children?.body, context.indent + 1)
    ],
    description: "Run nested blocks only when a sensor condition is true.",
    concept: "condition"
  },
  ifElse: {
    type: "ifElse",
    label: "If Then Else",
    icon: "Y/N",
    category: "logic",
    childSlots: ["body", "elseBody"],
    createDefaultBlock: () =>
      block("ifElse", conditionParams(), { body: [], elseBody: [] }),
    interpreter: { kind: "control" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}if ${conditionToPseudo(item)}:`,
      ...renderChild(context, item.children?.body, context.indent + 1),
      `${indent(context.indent)}else:`,
      ...renderChild(context, item.children?.elseBody, context.indent + 1)
    ],
    description: "Choose between two nested command paths.",
    concept: "condition"
  },
  repeat: {
    type: "repeat",
    label: "Repeat N",
    icon: "Nx",
    category: "loop",
    childSlots: ["body"],
    createDefaultBlock: () => block("repeat", { count: 3 }, ensureBody("body")),
    interpreter: { kind: "control" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}repeat ${Number(item.params.count ?? 1)}:`,
      ...renderChild(context, item.children?.body, context.indent + 1)
    ],
    description: "Run nested blocks a fixed number of times.",
    concept: "loop"
  },
  while: {
    type: "while",
    label: "While",
    icon: "W",
    category: "loop",
    childSlots: ["body"],
    createDefaultBlock: () =>
      block(
        "while",
        {
          condition: "hotspots_left_gt_0",
          threshold: 80,
          operator: "<",
          counterValue: 3
        },
        ensureBody("body")
      ),
    interpreter: { kind: "control" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}while ${conditionToPseudo(item)}:`,
      ...renderChild(context, item.children?.body, context.indent + 1)
    ],
    description:
      "Keep running nested blocks while a condition remains true. The safety cap stops accidental infinite loops.",
    concept: "loop"
  },
  defineProcedure: {
    type: "defineProcedure",
    label: "Define Procedure",
    icon: "def",
    category: "procedure",
    childSlots: ["procedureBody"],
    createDefaultBlock: () =>
      block("defineProcedure", { name: "routine_a" }, ensureBody("procedureBody")),
    interpreter: { kind: "procedure" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}def ${String(item.params.name ?? "routine_a")}():`,
      ...renderChild(context, item.children?.procedureBody, context.indent + 1)
    ],
    description: "Create a named command routine that can be called later.",
    concept: "procedure"
  },
  callProcedure: {
    type: "callProcedure",
    label: "Call Procedure",
    icon: "call",
    category: "procedure",
    createDefaultBlock: () => block("callProcedure", { name: "routine_a" }),
    interpreter: { kind: "procedure" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}call ${String(item.params.name ?? "routine_a")}()`
    ],
    description: "Run the blocks inside a named procedure.",
    concept: "procedure"
  },
  setCounter: {
    type: "setCounter",
    label: "Set Counter",
    icon: "=",
    category: "variable",
    createDefaultBlock: () => block("setCounter", { value: 0 }),
    interpreter: { kind: "variable" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}counter = ${Number(item.params.value ?? 0)}`
    ],
    description: "Store a number in the user variable counter.",
    concept: "variable"
  },
  increaseCounter: {
    type: "increaseCounter",
    label: "Increase Counter",
    icon: "+",
    category: "variable",
    createDefaultBlock: () => block("increaseCounter", { amount: 1 }),
    interpreter: { kind: "variable" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}counter += ${Number(item.params.amount ?? 1)}`
    ],
    description: "Add a number to the counter variable.",
    concept: "variable"
  },
  ifCounter: {
    type: "ifCounter",
    label: "If Counter",
    icon: "C?",
    category: "variable",
    childSlots: ["body"],
    createDefaultBlock: () =>
      block(
        "ifCounter",
        { operator: "<", counterValue: 3 },
        ensureBody("body")
      ),
    interpreter: { kind: "control" },
    toPseudoCode: (item, context) => [
      `${indent(context.indent)}if counter ${
        (item.params.operator as CounterOperator | undefined) ?? "<"
      } ${Number(item.params.counterValue ?? 3)}:`,
      ...renderChild(context, item.children?.body, context.indent + 1)
    ],
    description: "Run nested blocks when counter matches a comparison.",
    concept: "variable"
  }
};

export const paletteBlockTypes = [
  "moveForward",
  "turnLeft",
  "turnRight",
  "deployFoam",
  "if",
  "ifElse",
  "repeat",
  "while",
  "defineProcedure",
  "callProcedure",
  "setCounter",
  "increaseCounter",
  "ifCounter"
];

export const createBlock = (type: string): ProgramBlock => {
  const definition = blockDefinitions[type];
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`);
  }
  return definition.createDefaultBlock();
};

export const cloneBlock = (source: ProgramBlock): ProgramBlock => ({
  ...source,
  id: makeBlockId(source.type),
  params: { ...source.params },
  children: source.children
    ? Object.fromEntries(
        Object.entries(source.children).map(([slot, blocks]) => [
          slot,
          (blocks ?? []).map((child) => cloneBlock(child))
        ])
      )
    : undefined
});

export const countBlocks = (blocks: ProgramBlock[]): number =>
  blocks.reduce((total, item) => {
    const childTotal = Object.values(item.children ?? {}).reduce(
      (sum, children) => sum + countBlocks(children ?? []),
      0
    );
    return total + 1 + childTotal;
  }, 0);

export const collectProcedureNames = (blocks: ProgramBlock[]): string[] => {
  const names = new Set<string>();
  const visit = (items: ProgramBlock[]) => {
    items.forEach((item) => {
      if (item.type === "defineProcedure") {
        names.add(String(item.params.name ?? "routine_a"));
      }
      Object.values(item.children ?? {}).forEach((children) => {
        visit(children ?? []);
      });
    });
  };
  visit(blocks);
  return [...names].sort();
};

export const collectConcepts = (blocks: ProgramBlock[]): string[] => {
  const concepts = new Set<string>();
  const visit = (items: ProgramBlock[]) => {
    items.forEach((item) => {
      const concept = blockDefinitions[item.type]?.concept;
      if (concept && concept !== "sequence") {
        concepts.add(concept);
      }
      Object.values(item.children ?? {}).forEach((children) => {
        visit(children ?? []);
      });
    });
  };
  visit(blocks);
  return [...concepts];
};

export const programToPseudoCode = (blocks: ProgramBlock[]): string => {
  const renderBlocks = (items: ProgramBlock[], currentIndent: number): string[] =>
    items.flatMap((item) => {
      const definition = blockDefinitions[item.type];
      if (!definition) {
        return [`${indent(currentIndent)}# Unknown block: ${item.type}`];
      }
      return definition.toPseudoCode(item, {
        indent: currentIndent,
        renderBlocks
      });
    });

  const lines = renderBlocks(blocks, 0);
  return lines.length > 0 ? lines.join("\n") : "# Drag control modules here";
};
