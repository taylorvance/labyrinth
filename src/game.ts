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
