export type Direction = "north" | "east" | "south" | "west";

export type ExecutionStatus =
  | "idle"
  | "running"
  | "stepping"
  | "paused"
  | "success"
  | "failed";

export type BlockCategory =
  | "movement"
  | "logic"
  | "loop"
  | "procedure"
  | "variable";

export type ChildSlot = "body" | "elseBody" | "procedureBody";

export type ConditionType =
  | "wall_ahead"
  | "on_hotspot"
  | "hotspot_ahead"
  | "at_extraction"
  | "foam_remaining_gt_0"
  | "hotspots_left_gt_0"
  | "radiation_level_gt"
  | "counter_compare";

export type CounterOperator = "<" | "<=" | "==" | "!=" | ">=" | ">";

export type PrimitiveAction =
  | "moveForward"
  | "turnLeft"
  | "turnRight"
  | "deployFoam";

export interface Position {
  x: number;
  y: number;
}

export interface Cell {
  x: number;
  y: number;
  wall: boolean;
}

export interface Hotspot {
  id: string;
  position: Position;
  radiationValue: number;
  sealed: boolean;
}

export interface TrainingGuide {
  id: string;
  title: string;
  focus: string;
  summary: string;
  referenceLabel: string;
  concepts: string[];
}

export interface Maze {
  width: number;
  height: number;
  cells: Cell[][];
  start: Position;
  extraction: Position;
  hotspots: Hotspot[];
  parActions: number;
  seed: string;
  baseRadiation: number;
  initialFoam: number;
  meltdownTicks: number;
  difficulty: number;
  predefined?: boolean;
  trainingGuide?: TrainingGuide;
}

export interface RobotConfig {
  id: string;
  name: string;
  callSign: string;
  description: string;
  strength: string;
  limitation: string;
  accent: string;
  moveCost: number;
  turnCost: number;
  deployCost: number;
  extraMeltdownTicks: number;
  extraFoamCharges: number;
  foamEffectMultiplier: number;
  wallHitLimit: number;
  sensorHints?: boolean;
  scoreMultiplier: number;
}

export interface GameVariables {
  counter: number;
}

export interface GameState {
  level: number;
  seed: string;
  maze: Maze;
  robot: RobotConfig;
  position: Position;
  facing: Direction;
  program: ProgramBlock[];
  variables: GameVariables;
  hotspots: Hotspot[];
  foamCharges: number;
  meltdownTicks: number;
  plantRadiation: number;
  radiationReduced: number;
  actionsUsed: number;
  blocksUsed: number;
  wallHits: number;
  wallHitLimit: number;
  pathTrace: Position[];
  missionLog: string[];
  executionStatus: ExecutionStatus;
  activeBlockId?: string;
  failureReason?: string;
  score?: ScoreResult;
}

export interface ProgramBlock {
  id: string;
  type: string;
  params: Record<string, string | number | boolean | undefined>;
  children?: Partial<Record<ChildSlot, ProgramBlock[]>>;
}

export interface CodeGenContext {
  indent: number;
  renderBlocks: (blocks: ProgramBlock[], indent: number) => string[];
}

export interface BlockDefinition {
  type: string;
  label: string;
  icon: string;
  category: BlockCategory;
  createDefaultBlock: () => ProgramBlock;
  childSlots?: ChildSlot[];
  interpreter:
    | { kind: "primitive"; action: PrimitiveAction }
    | { kind: "control" }
    | { kind: "variable" }
    | { kind: "procedure" };
  toPseudoCode: (block: ProgramBlock, context: CodeGenContext) => string[];
  description: string;
  concept: "sequence" | "condition" | "loop" | "procedure" | "variable";
}

export interface ExecutionFrame {
  id: string;
  kind: "root" | "repeat" | "if" | "else" | "while" | "procedure";
  blocks: ProgramBlock[];
  index: number;
  sourceBlockId?: string;
  repeatRemaining?: number;
}

export interface ExecutionRuntime {
  frames: ExecutionFrame[];
  procedures: Record<string, ProgramBlock>;
  instructionCount: number;
  maxInstructions: number;
}

export interface InterpreterResult {
  state: GameState;
  runtime: ExecutionRuntime;
  executedBlockId?: string;
}

export interface ScoreResult {
  success: boolean;
  totalScore: number;
  stars: number;
  radiationReduced: number;
  actionsUsed: number;
  parActions: number;
  blocksUsed: number;
  meltdownTicksRemaining: number;
  wallHits: number;
  foamRemaining: number;
  breakdown: {
    mission: number;
    radiation: number;
    time: number;
    actions: number;
    blocks: number;
    wallHits: number;
    foamUse: number;
    robotMultiplier: number;
  };
}
