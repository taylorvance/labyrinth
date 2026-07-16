import type { HunterTuning, PlayabilityTuning } from "./game";

const HEAD_START_SECONDS = 7;
const PLAYER_STEP_MS = 150;
const HUNTER_TRACK_STEP_MS = 240;
const HUNTER_SPRINT_STEP_MS = 125;
const HUNTER_TURN_STEP_MS = 170;
const HUNTER_MAX_SPRINT_STEP_MS = 95;
const HUNTER_STRAIGHT_ACCEL_START_STEPS = 4;
const HUNTER_STRAIGHT_ACCEL_STEP_MS = 10;
const HUNTER_DIAGNOSTIC_STEP_MS = 180;

export const TUNING = {
  headStartSeconds: HEAD_START_SECONDS,
  roomTransitionMs: 280,
  playerStepMs: PLAYER_STEP_MS,
  hunterTrackStepMs: HUNTER_TRACK_STEP_MS,
  hunterSprintStepMs: HUNTER_SPRINT_STEP_MS,
  hunterTurnStepMs: HUNTER_TURN_STEP_MS,
  hunterMaxSprintStepMs: HUNTER_MAX_SPRINT_STEP_MS,
  hunterStraightAccelStartSteps: HUNTER_STRAIGHT_ACCEL_START_STEPS,
  hunterStraightAccelStepMs: HUNTER_STRAIGHT_ACCEL_STEP_MS,
  tapPathMaxSteps: 9,
  tapTargetRadius: 2,
  hunter: {
    detectionRadius: 2,
    lineOfSight: true,
    searchRadius: 5,
    searchTargets: 2,
    scentRefreshTurns: 6,
  } satisfies HunterTuning,
  playability: {
    headStartSeconds: HEAD_START_SECONDS,
    playerStepMs: PLAYER_STEP_MS,
    hunterStepMs: HUNTER_DIAGNOSTIC_STEP_MS,
    minimumHeadStartSteps: 40,
    minimumObjectiveSteps: 26,
    maximumObjectiveSteps: 78,
    minimumSafetyMarginMs: 1800,
    generatedAttempts: 48,
  } satisfies PlayabilityTuning,
};
