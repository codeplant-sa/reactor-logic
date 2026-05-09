import { RobotConfig } from "./types";

export const ROBOTS: RobotConfig[] = [
  {
    id: "kumo-scout",
    name: "Kumo Scout",
    callSign: "Kumo",
    description: "A compact crawler built for fast route execution in narrow service corridors.",
    strength: "Fastest and most efficient. Starts with +10 meltdown ticks.",
    limitation: "Low wall-hit tolerance.",
    accent: "#4fd1c5",
    moveCost: 1,
    turnCost: 1,
    deployCost: 1,
    extraMeltdownTicks: 10,
    extraFoamCharges: 0,
    foamEffectMultiplier: 1,
    wallHitLimit: 2,
    scoreMultiplier: 1.05
  },
  {
    id: "tancho-carrier",
    name: "Tancho Carrier",
    callSign: "Tancho",
    description: "A heavy service unit with larger stabilizing-foam canisters.",
    strength: "Carries more foam and reduces more radiation per seal.",
    limitation: "Heavier movement costs extra meltdown time.",
    accent: "#f59e0b",
    moveCost: 2,
    turnCost: 1,
    deployCost: 1,
    extraMeltdownTicks: 0,
    extraFoamCharges: 2,
    foamEffectMultiplier: 1.25,
    wallHitLimit: 3,
    scoreMultiplier: 1
  },
  {
    id: "sora-mapper",
    name: "Sora Mapper",
    callSign: "Sora",
    description: "A sensor-forward training robot for careful step-by-step debugging.",
    strength: "Shows enhanced sensor hints and tolerates more wall hits.",
    limitation: "Slightly weaker foam effect and lower score multiplier.",
    accent: "#60a5fa",
    moveCost: 1,
    turnCost: 1,
    deployCost: 1,
    extraMeltdownTicks: 0,
    extraFoamCharges: 0,
    foamEffectMultiplier: 0.9,
    wallHitLimit: 5,
    sensorHints: true,
    scoreMultiplier: 0.95
  }
];

export const getRobotById = (id: string): RobotConfig => {
  const robot = ROBOTS.find((item) => item.id === id);
  if (!robot) {
    throw new Error(`Unknown robot id: ${id}`);
  }
  return robot;
};
