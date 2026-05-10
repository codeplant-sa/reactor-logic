import type { Direction, Position, ProgramBlock } from "./types";

export type CopilotMode = "hint" | "review" | "next_step" | "explain";

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
