import type { Direction, Position, ProgramBlock } from "./types";

export type CopilotMode =
  | "hint"
  | "review"
  | "next_step"
  | "explain"
  | "shortest_path";

export interface CopilotHotspotSnapshot {
  id: string;
  position: Position;
  sealed: boolean;
  radiationValue: number;
}

export interface CopilotProgramBlock {
  type: string;
  params: ProgramBlock["params"];
  children?: Record<string, CopilotProgramBlock[]>;
}

export interface CopilotBlockReference {
  type: string;
  label: string;
  description: string;
  category: string;
}

export interface CopilotRouteWaypoint {
  kind: "hotspot" | "extraction";
  id?: string;
  position: Position;
  pathIndex: number;
}

export interface CopilotRouteCommand {
  action: "moveForward" | "turnLeft" | "turnRight" | "deployFoam";
  count?: number;
  position?: Position;
  hotspotId?: string;
}

export interface CopilotShortestPath {
  available: boolean;
  reason?: string;
  totalTiles: number;
  hotspotsToSeal: number;
  foamRequired: number;
  foamAvailable: number;
  foamSufficient: boolean;
  path: Position[];
  moveDirections: Direction[];
  waypoints: CopilotRouteWaypoint[];
  commands: CopilotRouteCommand[];
  pseudoCode: string;
}

export interface CopilotSnapshot {
  level: number;
  seed: string;
  trainingFocus?: string;
  robot: {
    name: string;
    callSign: string;
    position: Position;
    facing: Direction;
    foamCharges: number;
    meltdownTicks: number;
    wallHits: number;
    wallHitLimit: number;
  };
  mission: {
    start: Position;
    extraction: Position;
    hotspots: CopilotHotspotSnapshot[];
    plantRadiation: number;
    radiationReduced: number;
    actionsUsed: number;
    blocksUsed: number;
  };
  maze: {
    width: number;
    height: number;
    legend: Record<string, string>;
    rows: string[];
  };
  program: {
    pseudoCode: string;
    blocks: CopilotProgramBlock[];
  };
  shortestPath: CopilotShortestPath;
  availableBlocks: CopilotBlockReference[];
  availableConditions: Array<{
    type: string;
    label: string;
    help: string;
  }>;
}

export interface CopilotRequest {
  mode: CopilotMode;
  question?: string;
  snapshot: CopilotSnapshot;
}

export interface CopilotHint {
  title: string;
  detail: string;
}

export interface CopilotResponse {
  summary: string;
  riskLevel: "low" | "medium" | "high";
  hints: CopilotHint[];
  nextSteps: string[];
  codeGuidance: string[];
  suggestedBlocks: string[];
}
