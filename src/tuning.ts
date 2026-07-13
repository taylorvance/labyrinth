import type { HunterTuning } from "./game";

export const TUNING = {
  headStartSeconds: 7,
  playerStepMs: 160,
  hunterStepMs: 140,
  hunter: {
    detectionRadius: 5,
    lineOfSight: true,
    searchRadius: 6,
    searchTargets: 3,
  } satisfies HunterTuning,
};
