export type Cell = "wall" | "floor";

export type Point = {
  row: number;
  col: number;
};

export type Direction = "up" | "down" | "left" | "right";

export type Maze = {
  cells: Cell[][];
  playerStart: Point;
  hunterStart: Point;
  exit: Point;
};

export type MapMode = "generated" | "fixed";

export type HunterMode = "chasing" | "investigating" | "searching" | "patrolling";

export type HunterBrain = {
  mode: HunterMode;
  lastKnownPlayer: Point | null;
  target: Point | null;
  searchTargetsRemaining: number;
  patrolIndex: number;
};

export type HunterTuning = {
  detectionRadius: number;
  lineOfSight: boolean;
  searchRadius: number;
  searchTargets: number;
};

export type HunterTurn = {
  hunter: Point;
  brain: HunterBrain;
  detected: boolean;
};

const FIXED_MAP = [
  "###################",
  "#S#.....#.........#",
  "#.#.###.#.#######.#",
  "#.#...#.#.....#...#",
  "#.###.#.#####.#.###",
  "#.....#.....#.#...#",
  "#####.#####.#.###.#",
  "#...#.....#.#.....#",
  "#.#.#####.#.#####.#",
  "#.#.....#.#...#...#",
  "#.#####.#.###.#.###",
  "#.....#.....#...H.#",
  "#####.###########.#",
  "#.................E",
  "###################",
];

const GENERATED_ROWS = 15;
const GENERATED_COLS = 21;

export function createMaze(mode: MapMode, seed: number): Maze {
  return mode === "fixed" ? parseMap(FIXED_MAP) : createGeneratedMaze(seed);
}

export function movePoint(point: Point, direction: Direction, maze: Maze): Point {
  const next = getNeighbor(point, direction);
  return canEnter(next, maze) ? next : point;
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

export function pointsEqual(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col;
}

export function createHunterBrain(): HunterBrain {
  return {
    mode: "patrolling",
    lastKnownPlayer: null,
    target: null,
    searchTargetsRemaining: 0,
    patrolIndex: 0,
  };
}

export function nextHunterTurn(
  hunter: Point,
  player: Point,
  maze: Maze,
  brain: HunterBrain,
  tuning: HunterTuning,
): HunterTurn {
  if (canHunterDetectPlayer(hunter, player, maze, tuning)) {
    return {
      hunter: nextHunterStep(hunter, player, maze),
      brain: {
        ...brain,
        mode: "chasing",
        lastKnownPlayer: clonePoint(player),
        target: clonePoint(player),
        searchTargetsRemaining: tuning.searchTargets,
      },
      detected: true,
    };
  }

  if (brain.lastKnownPlayer && !pointsEqual(hunter, brain.lastKnownPlayer)) {
    return {
      hunter: nextHunterStep(hunter, brain.lastKnownPlayer, maze),
      brain: {
        ...brain,
        mode: "investigating",
        target: clonePoint(brain.lastKnownPlayer),
      },
      detected: false,
    };
  }

  if (brain.lastKnownPlayer && brain.searchTargetsRemaining > 0) {
    const finishedSearchTarget =
      brain.mode === "searching" && brain.target && pointsEqual(hunter, brain.target);
    const searchTargetsRemaining = finishedSearchTarget
      ? brain.searchTargetsRemaining - 1
      : brain.searchTargetsRemaining;

    if (searchTargetsRemaining > 0) {
      const target =
        brain.mode === "searching" && brain.target && !finishedSearchTarget
          ? brain.target
          : chooseSearchTarget(
              hunter,
              brain.lastKnownPlayer,
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
          searchTargetsRemaining,
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
      searchTargetsRemaining: 0,
      patrolIndex,
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

      if (!canEnter(neighbor, maze) || visited.has(key)) {
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

function canHunterDetectPlayer(
  hunter: Point,
  player: Point,
  maze: Maze,
  tuning: HunterTuning,
): boolean {
  return (
    pointsEqual(hunter, player) ||
    (tuning.lineOfSight && hasLineOfSight(hunter, player, maze)) ||
    pathDistanceWithin(hunter, player, maze, tuning.detectionRadius)
  );
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
    ({ point }) => !pointsEqual(point, hunter),
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
  const targets = [maze.playerStart, maze.exit, maze.hunterStart];
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

function clonePoint(point: Point): Point {
  return { row: point.row, col: point.col };
}

function createGeneratedMaze(seed: number): Maze {
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

  const floors = collectFloors(cells);
  const playerStart = start;
  const exit = farthestPoint(playerStart, floors, cells);
  const hunterStart = farthestPoint(exit, floors, cells);

  openExitEdge(exit, cells);

  return {
    cells,
    playerStart,
    hunterStart,
    exit,
  };
}

function parseMap(rows: string[]): Maze {
  let playerStart: Point | null = null;
  let hunterStart: Point | null = null;
  let exit: Point | null = null;

  const cells = rows.map((line, row) =>
    Array.from(line).map((char, col): Cell => {
      if (char === "S") {
        playerStart = { row, col };
        return "floor";
      }

      if (char === "H") {
        hunterStart = { row, col };
        return "floor";
      }

      if (char === "E") {
        exit = { row, col };
        return "floor";
      }

      return char === "#" ? "wall" : "floor";
    }),
  );

  if (!playerStart || !hunterStart || !exit) {
    throw new Error("Fixed map must include S, H, and E markers.");
  }

  return { cells, playerStart, hunterStart, exit };
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
    playerStart: start,
    hunterStart: start,
    exit: start,
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

function openExitEdge(exit: Point, cells: Cell[][]): void {
  const rows = cells.length;
  const cols = cells[0].length;
  const candidates: Point[] = [
    { row: exit.row, col: cols - 1 },
    { row: rows - 1, col: exit.col },
    { row: exit.row, col: 0 },
    { row: 0, col: exit.col },
  ];
  const edge = candidates
    .filter((point) => point.row >= 0 && point.row < rows && point.col >= 0 && point.col < cols)
    .sort((a, b) => manhattan(exit, a) - manhattan(exit, b))[0];

  cells[edge.row][edge.col] = "floor";
  exit.row = edge.row;
  exit.col = edge.col;
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

function isCarvable(point: Point, cells: Cell[][]): boolean {
  return (
    point.row > 0 &&
    point.row < cells.length - 1 &&
    point.col > 0 &&
    point.col < cells[0].length - 1 &&
    cells[point.row][point.col] === "wall"
  );
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

function pointKey(point: Point): string {
  return `${point.row},${point.col}`;
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

const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
