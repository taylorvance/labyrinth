export type Cell = "wall" | "floor";

export type Point = {
  row: number;
  col: number;
};

export type Direction = "up" | "down" | "left" | "right";

export type GateSide = "top" | "right" | "bottom" | "left";

export type GateAnchor = {
  side: GateSide;
  offset: number;
};

export type Maze = {
  cells: Cell[][];
  entrance: Point;
  entranceSide: GateSide;
  playerStart: Point;
  hunterStart: Point;
  key: Point;
  exit: Point;
  exitSide: GateSide;
};

export type MapMode = "generated" | "fixed";

export type HunterMode = "chasing" | "investigating" | "tracking" | "searching" | "patrolling";

export type HunterBrain = {
  mode: HunterMode;
  lastKnownPlayer: Point | null;
  target: Point | null;
  searchOrigin: Point | null;
  searchTargetsRemaining: number;
  patrolIndex: number;
  turnsSinceClue: number;
};

export type HunterTuning = {
  detectionRadius: number;
  lineOfSight: boolean;
  searchRadius: number;
  searchTargets: number;
  scentRefreshTurns: number;
};

export type PlayabilityTuning = {
  headStartSeconds: number;
  playerStepMs: number;
  hunterStepMs: number;
  minimumHeadStartSteps: number;
  minimumObjectiveSteps: number;
  maximumObjectiveSteps: number;
  minimumSafetyMarginMs: number;
  generatedAttempts: number;
};

export type MazeDiagnostics = {
  playable: boolean;
  objectiveSteps: number;
  headStartSteps: number;
  minimumHunterMarginMs: number;
  interceptStep: number | null;
  warnings: string[];
};

export type MazeBuild = {
  maze: Maze;
  diagnostics: MazeDiagnostics;
  seed: number;
  rejected: number;
};

export type HunterTurn = {
  hunter: Point;
  brain: HunterBrain;
  detected: boolean;
};

type GateCandidate = {
  side: GateSide;
  gate: Point;
  inside: Point;
};

const FIXED_MAP = [
  "###################",
  "HS#.....#.........#",
  "#.#.###.#.#######.#",
  "#.#...#.#.....#...#",
  "#.###.#.#####.#.###",
  "#.....#.....#.#...#",
  "#####.#####.#.###.#",
  "#...#.....#.#.....#",
  "#.#.#####.#.#####.#",
  "#.#.....#.#...#...#",
  "#.#####.#.###.#.###",
  "#.....#.....#.....#",
  "#####.###########.#",
  "#K................E",
  "###################",
];

const GENERATED_ROWS = 15;
const GENERATED_COLS = 21;
const GENERATED_LOOP_DENSITY = 28;
const GATE_SIDES: GateSide[] = ["top", "right", "bottom", "left"];

export function createMaze(mode: MapMode, seed: number): Maze {
  return mode === "fixed" ? parseMap(FIXED_MAP) : createGeneratedMaze(seed);
}

export function createPlayableMaze(
  mode: MapMode,
  seed: number,
  tuning: PlayabilityTuning,
  entranceAnchor: GateAnchor | null = null,
): MazeBuild {
  if (mode === "fixed") {
    const maze = parseMap(FIXED_MAP);
    return {
      maze,
      diagnostics: analyzeMaze(maze, tuning),
      seed,
      rejected: 0,
    };
  }

  let bestBuild: MazeBuild | null = null;

  for (let attempt = 0; attempt < tuning.generatedAttempts; attempt += 1) {
    const candidateSeed = seed + attempt;
    const maze = createGeneratedMaze(candidateSeed, entranceAnchor);
    const diagnostics = analyzeMaze(maze, tuning);
    const build = {
      maze,
      diagnostics,
      seed: candidateSeed,
      rejected: attempt,
    };

    if (diagnostics.playable) {
      return build;
    }

    if (!bestBuild || scoreDiagnostics(diagnostics) > scoreDiagnostics(bestBuild.diagnostics)) {
      bestBuild = build;
    }
  }

  return {
    ...(bestBuild ?? {
      maze: createGeneratedMaze(seed, entranceAnchor),
      diagnostics: analyzeMaze(createGeneratedMaze(seed, entranceAnchor), tuning),
      seed,
      rejected: 0,
    }),
    rejected: tuning.generatedAttempts,
  };
}

export function nextEntranceAnchorFromExit(maze: Maze): GateAnchor {
  return {
    side: oppositeSide(maze.exitSide),
    offset: gateOffset(maze.exit, maze.exitSide),
  };
}

export function analyzeMaze(maze: Maze, tuning: PlayabilityTuning): MazeDiagnostics {
  const pathToKey = shortestPlayerPath(maze.playerStart, maze.key, maze, false);
  const pathToExit = shortestPlayerPath(maze.key, maze.exit, maze, true);
  const warnings: string[] = [];

  if (!pathToKey || !pathToExit) {
    return {
      playable: false,
      objectiveSteps: 0,
      headStartSteps: Math.floor((tuning.headStartSeconds * 1000) / tuning.playerStepMs),
      minimumHunterMarginMs: Number.NEGATIVE_INFINITY,
      interceptStep: null,
      warnings: ["objective_route_missing"],
    };
  }

  const objectivePath = [...pathToKey, ...pathToExit];
  const objectiveSteps = objectivePath.length;
  const headStartSteps = Math.floor((tuning.headStartSeconds * 1000) / tuning.playerStepMs);
  const hunterDistances = hunterDistancesFrom(maze.hunterStart, maze);
  let minimumHunterMarginMs = Number.POSITIVE_INFINITY;
  let interceptStep: number | null = null;

  objectivePath.forEach((point, index) => {
    const hunterDistance = hunterDistances.get(pointKey(point));

    if (hunterDistance === undefined) {
      return;
    }

    const playerArrivalMs = (index + 1) * tuning.playerStepMs;
    const hunterArrivalMs = tuning.headStartSeconds * 1000 + hunterDistance * tuning.hunterStepMs;
    const margin = hunterArrivalMs - playerArrivalMs;

    if (margin < minimumHunterMarginMs) {
      minimumHunterMarginMs = margin;
    }

    if (interceptStep === null && margin <= 0) {
      interceptStep = index + 1;
    }
  });

  if (objectiveSteps < tuning.minimumObjectiveSteps) {
    warnings.push("objective_route_too_short");
  }

  if (objectiveSteps > tuning.maximumObjectiveSteps) {
    warnings.push("objective_route_too_long");
  }

  if (headStartSteps < tuning.minimumHeadStartSteps) {
    warnings.push("head_start_too_short");
  }

  if (minimumHunterMarginMs < tuning.minimumSafetyMarginMs) {
    warnings.push("hunter_timing_margin_too_low");
  }

  return {
    playable: warnings.length === 0,
    objectiveSteps,
    headStartSteps,
    minimumHunterMarginMs: Math.round(minimumHunterMarginMs),
    interceptStep,
    warnings,
  };
}

export function movePoint(point: Point, direction: Direction, maze: Maze): Point {
  const next = getNeighbor(point, direction);
  return canEnter(next, maze) ? next : point;
}

export function movePlayerPoint(
  point: Point,
  direction: Direction,
  maze: Maze,
  hasKey: boolean,
): Point {
  const next = getNeighbor(point, direction);
  return canPlayerEnter(next, maze, hasKey) ? next : point;
}

export function canEnter(point: Point, maze: Maze): boolean {
  return (
    point.row >= 0 &&
    point.row < maze.cells.length &&
    point.col >= 0 &&
    point.col < maze.cells[0].length &&
    maze.cells[point.row][point.col] === "floor"
  );
}

export function canPlayerEnter(point: Point, maze: Maze, hasKey: boolean): boolean {
  return (
    canEnter(point, maze) &&
    !pointsEqual(point, maze.entrance) &&
    (hasKey || !pointsEqual(point, maze.exit))
  );
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col;
}

export function createHunterBrain(): HunterBrain {
  return {
    mode: "patrolling",
    lastKnownPlayer: null,
    target: null,
    searchOrigin: null,
    searchTargetsRemaining: 0,
    patrolIndex: 0,
    turnsSinceClue: 0,
  };
}

export function nextHunterTurn(
  hunter: Point,
  player: Point,
  maze: Maze,
  brain: HunterBrain,
  tuning: HunterTuning,
  playerDirection: Direction | null = null,
): HunterTurn {
  if (canHunterSeePlayer(hunter, player, maze, tuning)) {
    const pursuitTarget = chooseSightPursuitTarget(
      player,
      maze,
      playerDirection,
      brain.lastKnownPlayer,
    );

    return {
      hunter: nextHunterStep(hunter, player, maze),
      brain: {
        ...brain,
        mode: "chasing",
        lastKnownPlayer: clonePoint(player),
        target: clonePoint(pursuitTarget),
        searchOrigin: clonePoint(pursuitTarget),
        searchTargetsRemaining: tuning.searchTargets,
        turnsSinceClue: 0,
      },
      detected: true,
    };
  }

  const turnsSinceClue = brain.turnsSinceClue + 1;
  const isSightPursuit = brain.mode === "chasing" || brain.mode === "investigating";
  const pursuitTarget = brain.target ?? brain.lastKnownPlayer;

  if (isSightPursuit && pursuitTarget && !pointsEqual(hunter, pursuitTarget)) {
    return {
      hunter: nextHunterStep(hunter, pursuitTarget, maze),
      brain: {
        ...brain,
        mode: "investigating",
        target: clonePoint(pursuitTarget),
        turnsSinceClue,
      },
      detected: false,
    };
  }

  const canUseTrackingClue = !isSightPursuit;
  const foundTrackingClue =
    canUseTrackingClue &&
    (canHunterTrackPlayer(hunter, player, maze, tuning) ||
      turnsSinceClue >= tuning.scentRefreshTurns);

  if (foundTrackingClue) {
    return {
      hunter: nextHunterStep(hunter, player, maze),
      brain: {
        ...brain,
        mode: "tracking",
        lastKnownPlayer: clonePoint(player),
        target: clonePoint(player),
        searchOrigin: clonePoint(player),
        searchTargetsRemaining: tuning.searchTargets,
        turnsSinceClue: 0,
      },
      detected: false,
    };
  }

  if (brain.mode === "tracking" && brain.target && !pointsEqual(hunter, brain.target)) {
    return {
      hunter: nextHunterStep(hunter, brain.target, maze),
      brain: {
        ...brain,
        mode: "tracking",
        target: clonePoint(brain.target),
        turnsSinceClue,
      },
      detected: false,
    };
  }

  const searchOrigin = brain.searchOrigin ?? brain.lastKnownPlayer;

  if (searchOrigin && brain.searchTargetsRemaining > 0) {
    const finishedSearchTarget =
      brain.mode === "searching" && brain.target && pointsEqual(hunter, brain.target);
    const arrivedAtClue =
      (brain.mode === "investigating" || brain.mode === "tracking") &&
      brain.target &&
      pointsEqual(hunter, brain.target);
    const searchTargetsRemaining = finishedSearchTarget
      ? brain.searchTargetsRemaining - 1
      : brain.searchTargetsRemaining;
    const searchTurnsSinceClue = arrivedAtClue ? 0 : turnsSinceClue;

    if (searchTargetsRemaining > 0) {
      const target =
        brain.mode === "searching" && brain.target && !finishedSearchTarget
          ? brain.target
          : chooseSearchTarget(
              hunter,
              searchOrigin,
              maze,
              tuning.searchRadius,
              searchTargetsRemaining,
            );

      return {
        hunter: target ? nextHunterStep(hunter, target, maze) : hunter,
        brain: {
          ...brain,
          mode: "searching",
          target: target ? clonePoint(target) : null,
          searchOrigin: clonePoint(searchOrigin),
          searchTargetsRemaining,
          turnsSinceClue: searchTurnsSinceClue,
        },
        detected: false,
      };
    }
  }

  const reachedPatrolTarget =
    brain.mode === "patrolling" && brain.target && pointsEqual(hunter, brain.target);
  const patrolIndex = reachedPatrolTarget ? brain.patrolIndex + 1 : brain.patrolIndex;
  const target =
    brain.mode === "patrolling" && brain.target && !reachedPatrolTarget
      ? brain.target
      : choosePatrolTarget(maze, patrolIndex);

  return {
    hunter: nextHunterStep(hunter, target, maze),
    brain: {
      ...brain,
      mode: "patrolling",
      target: clonePoint(target),
      searchOrigin: null,
      searchTargetsRemaining: 0,
      patrolIndex,
      turnsSinceClue,
    },
    detected: false,
  };
}

export function nextHunterStep(hunter: Point, target: Point, maze: Maze): Point {
  if (pointsEqual(hunter, target)) {
    return hunter;
  }

  const queue: Point[] = [hunter];
  const visited = new Set<string>([pointKey(hunter)]);
  const previous = new Map<string, Point>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!canHunterEnter(neighbor, current, maze) || visited.has(key)) {
        continue;
      }

      visited.add(key);
      previous.set(key, current);

      if (pointsEqual(neighbor, target)) {
        return firstStepToward(hunter, neighbor, previous);
      }

      queue.push(neighbor);
    }
  }

  return hunter;
}

export function formatCountdown(seconds: number): string {
  return Math.max(0, seconds).toFixed(1);
}

function canHunterSeePlayer(
  hunter: Point,
  player: Point,
  maze: Maze,
  tuning: HunterTuning,
): boolean {
  return pointsEqual(hunter, player) || (tuning.lineOfSight && hasLineOfSight(hunter, player, maze));
}

function canHunterTrackPlayer(
  hunter: Point,
  player: Point,
  maze: Maze,
  tuning: HunterTuning,
): boolean {
  return pathDistanceWithin(hunter, player, maze, tuning.detectionRadius);
}

function chooseSightPursuitTarget(
  player: Point,
  maze: Maze,
  playerDirection: Direction | null,
  previousKnownPlayer: Point | null,
): Point {
  const direction = playerDirection ?? inferDirection(previousKnownPlayer, player);
  return extendPursuitTarget(player, direction, maze);
}

function extendPursuitTarget(
  start: Point,
  direction: Direction | null,
  maze: Maze,
): Point {
  if (!direction) {
    return start;
  }

  let current = start;
  let previous = getNeighbor(start, oppositeDirection(direction));
  const maxSteps = maze.cells.length * maze.cells[0].length;

  for (let step = 0; step < maxSteps; step += 1) {
    const onward = openHunterNeighbors(current, maze).filter(
      (neighbor) => !pointsEqual(neighbor, previous),
    );

    if (onward.length !== 1) {
      return current;
    }

    previous = current;
    current = onward[0];
  }

  return current;
}

function inferDirection(from: Point | null, to: Point): Direction | null {
  if (!from || pointsEqual(from, to)) {
    return null;
  }

  if (from.row === to.row) {
    return from.col < to.col ? "right" : "left";
  }

  if (from.col === to.col) {
    return from.row < to.row ? "down" : "up";
  }

  return null;
}

function openHunterNeighbors(point: Point, maze: Maze): Point[] {
  return DIRECTIONS.map((direction) => getNeighbor(point, direction)).filter((neighbor) =>
    canHunterEnter(neighbor, point, maze),
  );
}

function shortestPlayerPath(
  start: Point,
  target: Point,
  maze: Maze,
  hasKey: boolean,
): Point[] | null {
  if (pointsEqual(start, target)) {
    return [];
  }

  const queue: Point[] = [start];
  const visited = new Set<string>([pointKey(start)]);
  const previous = new Map<string, Point>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!canPlayerEnter(neighbor, maze, hasKey) || visited.has(key)) {
        continue;
      }

      visited.add(key);
      previous.set(key, current);

      if (pointsEqual(neighbor, target)) {
        return buildPath(start, neighbor, previous);
      }

      queue.push(neighbor);
    }
  }

  return null;
}

function hunterDistancesFrom(start: Point, maze: Maze): Map<string, number> {
  const queue: Point[] = [start];
  const distances = new Map<string, number>([[pointKey(start), 0]]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(pointKey(current)) ?? 0;

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!canHunterEnter(neighbor, current, maze) || distances.has(key)) {
        continue;
      }

      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }

  return distances;
}

function buildPath(start: Point, target: Point, previous: Map<string, Point>): Point[] {
  const path: Point[] = [];
  let current = target;

  while (!pointsEqual(current, start)) {
    path.push(current);
    const parent = previous.get(pointKey(current));

    if (!parent) {
      return [];
    }

    current = parent;
  }

  return path.reverse();
}

function scoreDiagnostics(diagnostics: MazeDiagnostics): number {
  const warningPenalty = diagnostics.warnings.length * 100000;
  const objectivePenalty = Math.abs(diagnostics.objectiveSteps - 54) * 1000;
  const margin = Number.isFinite(diagnostics.minimumHunterMarginMs)
    ? diagnostics.minimumHunterMarginMs
    : -100000;

  return margin - warningPenalty - objectivePenalty;
}

function hasLineOfSight(a: Point, b: Point, maze: Maze): boolean {
  if (a.row === b.row) {
    const start = Math.min(a.col, b.col);
    const end = Math.max(a.col, b.col);

    for (let col = start; col <= end; col += 1) {
      if (!canEnter({ row: a.row, col }, maze)) {
        return false;
      }
    }

    return true;
  }

  if (a.col === b.col) {
    const start = Math.min(a.row, b.row);
    const end = Math.max(a.row, b.row);

    for (let row = start; row <= end; row += 1) {
      if (!canEnter({ row, col: a.col }, maze)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function pathDistanceWithin(
  start: Point,
  target: Point,
  maze: Maze,
  maxDistance: number,
): boolean {
  const distances = reachableWithin(start, maze, maxDistance);
  return distances.some(({ point }) => pointsEqual(point, target));
}

function chooseSearchTarget(
  hunter: Point,
  origin: Point,
  maze: Maze,
  radius: number,
  searchTargetsRemaining: number,
): Point | null {
  const reachable = reachableWithin(origin, maze, radius).filter(
    ({ point }) => !pointsEqual(point, hunter) && !pointsEqual(point, maze.entrance),
  );
  const decisionPoints = reachable.filter(({ point }) => countOpenNeighbors(point, maze) !== 2);
  const candidates = decisionPoints.length > 0 ? decisionPoints : reachable;

  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    const distanceDifference = b.distance - a.distance;

    if (distanceDifference !== 0) {
      return distanceDifference;
    }

    const hunterDistanceDifference = manhattan(b.point, hunter) - manhattan(a.point, hunter);

    if (hunterDistanceDifference !== 0) {
      return hunterDistanceDifference;
    }

    return a.point.row - b.point.row || a.point.col - b.point.col;
  });

  return sorted[searchTargetsRemaining % sorted.length].point;
}

function choosePatrolTarget(maze: Maze, patrolIndex: number): Point {
  const targets = [maze.key, maze.exit, maze.playerStart];
  return targets[patrolIndex % targets.length];
}

function reachableWithin(
  start: Point,
  maze: Maze,
  maxDistance: number,
): Array<{ point: Point; distance: number }> {
  const queue: Point[] = [start];
  const distances = new Map<string, number>([[pointKey(start), 0]]);
  const reachable: Array<{ point: Point; distance: number }> = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(pointKey(current)) ?? 0;
    reachable.push({ point: current, distance });

    if (distance >= maxDistance) {
      continue;
    }

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!canEnter(neighbor, maze) || distances.has(key)) {
        continue;
      }

      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }

  return reachable;
}

function countOpenNeighbors(point: Point, maze: Maze): number {
  return DIRECTIONS.filter((direction) => canEnter(getNeighbor(point, direction), maze)).length;
}

function canHunterEnter(point: Point, hunter: Point, maze: Maze): boolean {
  return canEnter(point, maze) && (!pointsEqual(point, maze.entrance) || pointsEqual(hunter, point));
}

function clonePoint(point: Point): Point {
  return { row: point.row, col: point.col };
}

function createGeneratedMaze(seed: number, entranceAnchor: GateAnchor | null = null): Maze {
  const random = createRandom(seed);
  const cells = Array.from({ length: GENERATED_ROWS }, () =>
    Array.from({ length: GENERATED_COLS }, () => "wall" as Cell),
  );

  const start: Point = { row: 1, col: 1 };
  const stack: Point[] = [start];
  cells[start.row][start.col] = "floor";

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = shuffledDirections(random)
      .map((direction) => ({
        between: getNeighbor(current, direction),
        next: getNeighbor(getNeighbor(current, direction), direction),
      }))
      .filter(({ next }) => isCarvable(next, cells));

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const chosen = neighbors[0];
    cells[chosen.between.row][chosen.between.col] = "floor";
    cells[chosen.next.row][chosen.next.col] = "floor";
    stack.push(chosen.next);
  }

  carveExtraLoops(cells, random);

  const entrance = entranceAnchor
    ? forceGateCandidate(cells, entranceAnchor)
    : chooseEntranceGate(cells, random);
  cells[entrance.gate.row][entrance.gate.col] = "floor";

  const playerStart = clonePoint(entrance.inside);
  const floors = collectInteriorFloors(cells);
  const key = farthestPoint(playerStart, floors, cells);
  const exitGate = chooseExitGate(key, cells, entrance.side);
  cells[exitGate.gate.row][exitGate.gate.col] = "floor";

  return {
    cells,
    entrance: clonePoint(entrance.gate),
    entranceSide: entrance.side,
    playerStart,
    hunterStart: clonePoint(entrance.gate),
    key,
    exit: clonePoint(exitGate.gate),
    exitSide: exitGate.side,
  };
}

function parseMap(rows: string[]): Maze {
  let entrance: Point | null = null;
  let playerStart: Point | null = null;
  let hunterStart: Point | null = null;
  let key: Point | null = null;
  let exit: Point | null = null;

  const cells = rows.map((line, row) =>
    Array.from(line).map((char, col): Cell => {
      if (char === "S") {
        playerStart = { row, col };
        return "floor";
      }

      if (char === "H") {
        hunterStart = { row, col };
        entrance = { row, col };
        return "floor";
      }

      if (char === "K") {
        key = { row, col };
        return "floor";
      }

      if (char === "E") {
        exit = { row, col };
        return "floor";
      }

      return char === "#" ? "wall" : "floor";
    }),
  );

  if (!entrance || !playerStart || !hunterStart || !key || !exit) {
    throw new Error("Fixed map must include S, H, K, and E markers.");
  }

  return {
    cells,
    entrance,
    entranceSide: gateSideForPoint(entrance, cells),
    playerStart,
    hunterStart,
    key,
    exit,
    exitSide: gateSideForPoint(exit, cells),
  };
}

function firstStepToward(
  start: Point,
  target: Point,
  previous: Map<string, Point>,
): Point {
  let current = target;

  while (true) {
    const parent = previous.get(pointKey(current));

    if (!parent) {
      return start;
    }

    if (pointsEqual(parent, start)) {
      return current;
    }

    current = parent;
  }
}

function farthestPoint(start: Point, floors: Point[], cells: Cell[][]): Point {
  const maze: Maze = {
    cells,
    entrance: start,
    entranceSide: "left",
    playerStart: start,
    hunterStart: start,
    key: start,
    exit: start,
    exitSide: "right",
  };
  const distances = new Map<string, number>([[pointKey(start), 0]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(pointKey(current)) ?? 0;

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!canEnter(neighbor, maze) || distances.has(key)) {
        continue;
      }

      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }

  return floors.reduce((best, point) => {
    const bestDistance = distances.get(pointKey(best)) ?? -1;
    const distance = distances.get(pointKey(point)) ?? -1;
    return distance > bestDistance ? point : best;
  }, start);
}

function chooseEntranceGate(cells: Cell[][], random: () => number): GateCandidate {
  const candidates = GATE_SIDES.flatMap((side) => collectGateCandidates(cells, side));

  if (candidates.length === 0) {
    throw new Error("Generated maze has no valid entrance gate candidates.");
  }

  return candidates[Math.floor(random() * candidates.length)];
}

function forceGateCandidate(cells: Cell[][], anchor: GateAnchor): GateCandidate {
  const candidate = gateCandidateFromAnchor(cells, anchor);
  connectGateInside(cells, candidate.inside);
  return candidate;
}

function chooseExitGate(key: Point, cells: Cell[][], entranceSide: GateSide): GateCandidate {
  const distances = distancesFrom(key, cells);
  const candidates = GATE_SIDES.filter((side) => side !== entranceSide).flatMap((side) =>
    collectGateCandidates(cells, side),
  );

  if (candidates.length === 0) {
    throw new Error("Generated maze has no valid exit gate candidates.");
  }

  return [...candidates].sort((a, b) => {
    const distanceDifference =
      (distances.get(pointKey(b.inside)) ?? -1) - (distances.get(pointKey(a.inside)) ?? -1);

    if (distanceDifference !== 0) {
      return distanceDifference;
    }

    const edgeDistanceDifference = manhattan(b.gate, key) - manhattan(a.gate, key);

    if (edgeDistanceDifference !== 0) {
      return edgeDistanceDifference;
    }

    return a.gate.row - b.gate.row || a.gate.col - b.gate.col;
  })[0];
}

function collectGateCandidates(cells: Cell[][], side: GateSide): GateCandidate[] {
  const rows = cells.length;
  const cols = cells[0].length;
  const candidates: GateCandidate[] = [];

  const addCandidate = (gate: Point, inside: Point) => {
    if (cells[inside.row]?.[inside.col] === "floor") {
      candidates.push({ side, gate, inside });
    }
  };

  if (side === "top" || side === "bottom") {
    const gateRow = side === "top" ? 0 : rows - 1;
    const insideRow = side === "top" ? 1 : rows - 2;

    for (let col = 1; col < cols - 1; col += 1) {
      addCandidate({ row: gateRow, col }, { row: insideRow, col });
    }
  } else {
    const gateCol = side === "left" ? 0 : cols - 1;
    const insideCol = side === "left" ? 1 : cols - 2;

    for (let row = 1; row < rows - 1; row += 1) {
      addCandidate({ row, col: gateCol }, { row, col: insideCol });
    }
  }

  return candidates;
}

function gateCandidateFromAnchor(cells: Cell[][], anchor: GateAnchor): GateCandidate {
  const rows = cells.length;
  const cols = cells[0].length;

  if (anchor.side === "top" || anchor.side === "bottom") {
    const col = clamp(anchor.offset, 1, cols - 2);
    const gateRow = anchor.side === "top" ? 0 : rows - 1;
    const insideRow = anchor.side === "top" ? 1 : rows - 2;

    return {
      side: anchor.side,
      gate: { row: gateRow, col },
      inside: { row: insideRow, col },
    };
  }

  const row = clamp(anchor.offset, 1, rows - 2);
  const gateCol = anchor.side === "left" ? 0 : cols - 1;
  const insideCol = anchor.side === "left" ? 1 : cols - 2;

  return {
    side: anchor.side,
    gate: { row, col: gateCol },
    inside: { row, col: insideCol },
  };
}

function connectGateInside(cells: Cell[][], inside: Point): void {
  if (cells[inside.row][inside.col] === "floor") {
    return;
  }

  const queue: Point[] = [inside];
  const visited = new Set<string>([pointKey(inside)]);
  const previous = new Map<string, Point>();
  let target: Point | null = null;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (cells[current.row][current.col] === "floor") {
      target = current;
      break;
    }

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!isInteriorPoint(neighbor, cells) || visited.has(key)) {
        continue;
      }

      visited.add(key);
      previous.set(key, current);
      queue.push(neighbor);
    }
  }

  if (!target) {
    cells[inside.row][inside.col] = "floor";
    return;
  }

  let current = target;

  while (true) {
    cells[current.row][current.col] = "floor";

    if (pointsEqual(current, inside)) {
      break;
    }

    const parent = previous.get(pointKey(current));

    if (!parent) {
      break;
    }

    current = parent;
  }
}

function distancesFrom(start: Point, cells: Cell[][]): Map<string, number> {
  const maze: Maze = {
    cells,
    entrance: start,
    entranceSide: "left",
    playerStart: start,
    hunterStart: start,
    key: start,
    exit: start,
    exitSide: "right",
  };
  const distances = new Map<string, number>([[pointKey(start), 0]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(pointKey(current)) ?? 0;

    for (const direction of DIRECTIONS) {
      const neighbor = getNeighbor(current, direction);
      const key = pointKey(neighbor);

      if (!canEnter(neighbor, maze) || distances.has(key)) {
        continue;
      }

      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }

  return distances;
}

function collectFloors(cells: Cell[][]): Point[] {
  const floors: Point[] = [];

  cells.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === "floor") {
        floors.push({ row: rowIndex, col: colIndex });
      }
    });
  });

  return floors;
}

function collectInteriorFloors(cells: Cell[][]): Point[] {
  return collectFloors(cells).filter(
    (point) =>
      point.row > 0 &&
      point.row < cells.length - 1 &&
      point.col > 0 &&
      point.col < cells[0].length - 1,
  );
}

function isCarvable(point: Point, cells: Cell[][]): boolean {
  return (
    point.row > 0 &&
    point.row < cells.length - 1 &&
    point.col > 0 &&
    point.col < cells[0].length - 1 &&
    cells[point.row][point.col] === "wall"
  );
}

function isInteriorPoint(point: Point, cells: Cell[][]): boolean {
  return (
    point.row > 0 &&
    point.row < cells.length - 1 &&
    point.col > 0 &&
    point.col < cells[0].length - 1
  );
}

function carveExtraLoops(cells: Cell[][], random: () => number): void {
  const loopTarget = Math.floor((cells.length * cells[0].length) / GENERATED_LOOP_DENSITY);
  const candidates = shufflePoints(collectLoopConnectors(cells), random);
  let loopsCarved = 0;

  for (const point of candidates) {
    if (loopsCarved >= loopTarget) {
      break;
    }

    if (!isLoopConnector(point, cells)) {
      continue;
    }

    cells[point.row][point.col] = "floor";
    loopsCarved += 1;
  }
}

function collectLoopConnectors(cells: Cell[][]): Point[] {
  const connectors: Point[] = [];

  for (let row = 1; row < cells.length - 1; row += 1) {
    for (let col = 1; col < cells[0].length - 1; col += 1) {
      const point = { row, col };

      if (isLoopConnector(point, cells)) {
        connectors.push(point);
      }
    }
  }

  return connectors;
}

function isLoopConnector(point: Point, cells: Cell[][]): boolean {
  if (cells[point.row][point.col] !== "wall") {
    return false;
  }

  const vertical =
    cells[point.row - 1][point.col] === "floor" &&
    cells[point.row + 1][point.col] === "floor";
  const horizontal =
    cells[point.row][point.col - 1] === "floor" &&
    cells[point.row][point.col + 1] === "floor";

  return vertical !== horizontal;
}

function getNeighbor(point: Point, direction: Direction): Point {
  switch (direction) {
    case "up":
      return { row: point.row - 1, col: point.col };
    case "down":
      return { row: point.row + 1, col: point.col };
    case "left":
      return { row: point.row, col: point.col - 1 };
    case "right":
      return { row: point.row, col: point.col + 1 };
  }
}

function oppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

function pointKey(point: Point): string {
  return `${point.row},${point.col}`;
}

function gateSideForPoint(point: Point, cells: Cell[][]): GateSide {
  if (point.row === 0) {
    return "top";
  }

  if (point.col === cells[0].length - 1) {
    return "right";
  }

  if (point.row === cells.length - 1) {
    return "bottom";
  }

  if (point.col === 0) {
    return "left";
  }

  throw new Error("Gate point must be on the map edge.");
}

function oppositeSide(side: GateSide): GateSide {
  switch (side) {
    case "top":
      return "bottom";
    case "right":
      return "left";
    case "bottom":
      return "top";
    case "left":
      return "right";
  }
}

function gateOffset(point: Point, side: GateSide): number {
  return side === "top" || side === "bottom" ? point.col : point.row;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function createRandom(seed: number): () => number {
  let state = seed || 1;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function shuffledDirections(random: () => number): Direction[] {
  const directions = [...DIRECTIONS];

  for (let index = directions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [directions[index], directions[swapIndex]] = [
      directions[swapIndex],
      directions[index],
    ];
  }

  return directions;
}

function shufflePoints(points: Point[], random: () => number): Point[] {
  const shuffled = [...points];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
