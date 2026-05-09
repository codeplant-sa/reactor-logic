import { GameState, ScoreResult } from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const calculateScore = (state: GameState): ScoreResult => {
  const success = state.executionStatus === "success";
  const actionEfficiency = clamp(
    state.maze.parActions / Math.max(1, state.actionsUsed),
    0,
    1.4
  );
  const blockEfficiency = clamp(18 / Math.max(1, state.blocksUsed), 0, 1.2);
  const sealedCount = state.hotspots.filter((hotspot) => hotspot.sealed).length;
  const foamMistakes = Math.max(0, state.maze.initialFoam - state.foamCharges - sealedCount);

  const mission = success ? 600 : 0;
  const radiation = Math.round(state.radiationReduced * 4);
  const time = success ? Math.max(0, state.meltdownTicks) * 8 : 0;
  const actions = success ? Math.round(220 * actionEfficiency) : 0;
  const blocks = success ? Math.round(120 * blockEfficiency) : 0;
  const wallHits = success ? Math.max(0, 120 - state.wallHits * 38) : 0;
  const foamUse = success ? Math.max(0, 90 - foamMistakes * 45) : 0;

  const subtotal = mission + radiation + time + actions + blocks + wallHits + foamUse;
  const totalScore = Math.round(subtotal * state.robot.scoreMultiplier);
  const stars = success
    ? clamp(
        1 +
          Math.floor(
            actionEfficiency * 1.5 +
              blockEfficiency +
              (state.meltdownTicks > 0 ? 1 : 0) +
              (state.wallHits === 0 ? 1 : 0)
          ),
        1,
        5
      )
    : 0;

  return {
    success,
    totalScore,
    stars,
    radiationReduced: Math.round(state.radiationReduced),
    actionsUsed: state.actionsUsed,
    parActions: state.maze.parActions,
    blocksUsed: state.blocksUsed,
    meltdownTicksRemaining: state.meltdownTicks,
    wallHits: state.wallHits,
    foamRemaining: state.foamCharges,
    breakdown: {
      mission,
      radiation,
      time,
      actions,
      blocks,
      wallHits,
      foamUse,
      robotMultiplier: state.robot.scoreMultiplier
    }
  };
};
