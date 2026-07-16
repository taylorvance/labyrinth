import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BrandBadge,
  SourceBadge,
  createProjectStorage,
  createStringUnionCodec,
  useHotkeys,
  usePersistentState,
} from "@taylorvance/tv-shared-web";
import {
  type Direction,
  type GateAnchor,
  type HunterBrain,
  type HunterMode,
  type MapMode,
  type Maze,
  type Point,
  canPlayerEnter,
  createHunterBrain,
  createPlayableMaze,
  movePlayerPoint,
  nextEntranceAnchorFromExit,
  nextHunterTurn,
  pointsEqual,
} from "./game";
import { TUNING } from "./tuning";

type GameStatus = "running" | "advancing" | "lost";

const APP_STORAGE = createProjectStorage("labyrinth", { version: 1 });
const MAP_MODE_CODEC = createStringUnionCodec(["generated", "fixed"]);

const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];

export default function App() {
  const [mode, setMode] = usePersistentState<MapMode>(APP_STORAGE, "map-mode", {
    codec: MAP_MODE_CODEC,
    defaultValue: "generated",
  });
  const [seed, setSeed] = useState(1);
  const [entranceAnchor, setEntranceAnchor] = useState<GateAnchor | null>(null);
  const mazeBuild = useMemo(
    () => createPlayableMaze(mode, seed, TUNING.playability, entranceAnchor),
    [entranceAnchor, mode, seed],
  );
  const maze = mazeBuild.maze;
  const [player, setPlayer] = useState<Point>(maze.playerStart);
  const [hunter, setHunter] = useState<Point>(maze.hunterStart);
  const [hasKey, setHasKey] = useState(false);
  const [plannedPath, setPlannedPath] = useState<Point[]>([]);
  const [hunterMode, setHunterMode] = useState<HunterMode>("patrolling");
  const [hunterStepMs, setHunterStepMs] = useState(TUNING.hunterTrackStepMs);
  const [status, setStatus] = useState<GameStatus>("running");
  const [remainingHeadStart, setRemainingHeadStart] = useState(TUNING.headStartSeconds);
  const currentDirection = useRef<Direction | null>(null);
  const queuedDirection = useRef<Direction | null>(null);
  const hunterBrain = useRef<HunterBrain>(createHunterBrain());
  const hunterDirection = useRef<Direction | null>(null);
  const hunterStraightSteps = useRef(0);
  const hunterStepDelay = useRef(TUNING.hunterTrackStepMs);
  const lastPlayerStep = useRef(0);
  const lastHunterStep = useRef(0);
  const lastFrame = useRef(0);
  const playerRef = useRef(player);
  const hunterRef = useRef(hunter);
  const hasKeyRef = useRef(hasKey);
  const plannedPathRef = useRef<Point[]>([]);
  const statusRef = useRef(status);
  const remainingHeadStartRef = useRef(remainingHeadStart);
  const advanceTimeout = useRef<number | null>(null);
  const [room, setRoom] = useState(1);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    hunterRef.current = hunter;
  }, [hunter]);

  useEffect(() => {
    hasKeyRef.current = hasKey;
  }, [hasKey]);

  useEffect(() => {
    plannedPathRef.current = plannedPath;
  }, [plannedPath]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    remainingHeadStartRef.current = remainingHeadStart;
  }, [remainingHeadStart]);

  const resetRoom = useCallback(() => {
    if (advanceTimeout.current !== null) {
      window.clearTimeout(advanceTimeout.current);
      advanceTimeout.current = null;
    }

    setPlayer(maze.playerStart);
    setHunter(maze.hunterStart);
    setHasKey(false);
    setPlannedPath([]);
    setHunterMode("patrolling");
    setHunterStepMs(TUNING.hunterTrackStepMs);
    setStatus("running");
    setRemainingHeadStart(TUNING.headStartSeconds);
    playerRef.current = maze.playerStart;
    hunterRef.current = maze.hunterStart;
    hasKeyRef.current = false;
    plannedPathRef.current = [];
    statusRef.current = "running";
    remainingHeadStartRef.current = TUNING.headStartSeconds;
    currentDirection.current = null;
    queuedDirection.current = null;
    hunterBrain.current = createHunterBrain();
    hunterDirection.current = null;
    hunterStraightSteps.current = 0;
    hunterStepDelay.current = TUNING.hunterTrackStepMs;
    lastPlayerStep.current = 0;
    lastHunterStep.current = 0;
    lastFrame.current = 0;
  }, [maze]);

  const resetRun = useCallback(() => {
    setRoom(1);
    setEntranceAnchor(null);
    resetRoom();
  }, [resetRoom]);

  useEffect(() => {
    resetRoom();
  }, [resetRoom]);

  useEffect(() => {
    return () => {
      if (advanceTimeout.current !== null) {
        window.clearTimeout(advanceTimeout.current);
      }
    };
  }, []);

  const advanceRoom = useCallback(() => {
    if (advanceTimeout.current !== null || statusRef.current !== "running") {
      return;
    }

    statusRef.current = "advancing";
    setStatus("advancing");
    currentDirection.current = null;
    queuedDirection.current = null;
    plannedPathRef.current = [];
    setPlannedPath([]);

    advanceTimeout.current = window.setTimeout(() => {
      advanceTimeout.current = null;
      setEntranceAnchor(nextEntranceAnchorFromExit(maze));
      setRoom((current) => current + 1);
      setSeed((current) => current + TUNING.playability.generatedAttempts);
    }, TUNING.roomTransitionMs);
  }, [maze]);

  const queueDirection = useCallback((direction: Direction) => {
    plannedPathRef.current = [];
    setPlannedPath([]);
    queuedDirection.current = direction;
  }, []);

  const queueDirectionFromPress = useCallback(
    (direction: Direction) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      queueDirection(direction);
    },
    [queueDirection],
  );

  const queueDirectionToCell = useCallback(
    (target: Point) => {
      const path = findLimitedPath(
        playerRef.current,
        target,
        maze,
        hasKeyRef.current,
        TUNING.tapPathMaxSteps,
        TUNING.tapTargetRadius,
      );

      if (path.length === 0) {
        return;
      }

      queuedDirection.current = null;
      currentDirection.current = null;
      plannedPathRef.current = path;
      setPlannedPath(path);
    },
    [maze],
  );

  const handleBoardPress = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();

      const rect = event.currentTarget.getBoundingClientRect();
      const col = Math.min(
        maze.cells[0].length - 1,
        Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * maze.cells[0].length)),
      );
      const row = Math.min(
        maze.cells.length - 1,
        Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * maze.cells.length)),
      );

      queueDirectionToCell({ row, col });
    },
    [maze, queueDirectionToCell],
  );

  useHotkeys(
    [
      { keys: "up,w", callback: () => queueDirection("up") },
      { keys: "down,s", callback: () => queueDirection("down") },
      { keys: "left,a", callback: () => queueDirection("left") },
      { keys: "right,d", callback: () => queueDirection("right") },
    ],
    { preventDefault: true },
    [queueDirection],
  );

  useEffect(() => {
    let animationId = 0;

    const frame = (timestamp: number) => {
      if (statusRef.current !== "running") {
        animationId = requestAnimationFrame(frame);
        return;
      }

      const elapsed = lastFrame.current === 0 ? 0 : (timestamp - lastFrame.current) / 1000;
      lastFrame.current = timestamp;

      if (remainingHeadStartRef.current > 0) {
        setRemainingHeadStart((current) => Math.max(0, current - elapsed));
      }

      if (timestamp - lastPlayerStep.current >= TUNING.playerStepMs) {
        const plannedDirection = pickPlannedDirection(
          playerRef.current,
          plannedPathRef.current,
          maze,
          hasKeyRef.current,
        );
        const usingPlannedPath = queuedDirection.current === null && plannedDirection !== null;
        const direction = pickPlayerDirection(
          playerRef.current,
          queuedDirection.current,
          plannedDirection,
          currentDirection.current,
          maze,
          hasKeyRef.current,
        );

        if (direction) {
          const nextPlayer = movePlayerPoint(playerRef.current, direction, maze, hasKeyRef.current);
          playerRef.current = nextPlayer;
          currentDirection.current = direction;
          setPlayer(nextPlayer);
          lastPlayerStep.current = timestamp;

          if (usingPlannedPath) {
            const [, ...remainingPath] = plannedPathRef.current;
            plannedPathRef.current = remainingPath;
            setPlannedPath(remainingPath);

            if (remainingPath.length === 0) {
              currentDirection.current = null;
            }
          }

          const collectedKey = !hasKeyRef.current && pointsEqual(nextPlayer, maze.key);

          if (collectedKey) {
            hasKeyRef.current = true;
            setHasKey(true);
          }

          if (hasKeyRef.current && pointsEqual(nextPlayer, maze.exit)) {
            advanceRoom();
            animationId = requestAnimationFrame(frame);
            return;
          }

          if (remainingHeadStartRef.current <= 0 && pointsEqual(nextPlayer, hunterRef.current)) {
            setStatus("lost");
            animationId = requestAnimationFrame(frame);
            return;
          }
        }

        if (!direction) {
          currentDirection.current = null;

          if (plannedPathRef.current.length > 0) {
            plannedPathRef.current = [];
            setPlannedPath([]);
          }
        }
      }

      if (
        remainingHeadStartRef.current <= 0 &&
        timestamp - lastHunterStep.current >= hunterStepDelay.current
      ) {
        const currentHunter = hunterRef.current;
        const turn = nextHunterTurn(
          currentHunter,
          playerRef.current,
          maze,
          hunterBrain.current,
          TUNING.hunter,
          currentDirection.current,
        );
        const nextHunter = turn.hunter;
        const momentum = getNextHunterMomentum(
          currentHunter,
          nextHunter,
          turn.brain.mode,
          hunterDirection.current,
          hunterStraightSteps.current,
        );

        hunterDirection.current = momentum.direction;
        hunterStraightSteps.current = momentum.straightSteps;
        hunterStepDelay.current = momentum.stepMs;
        hunterBrain.current = turn.brain;
        hunterRef.current = nextHunter;
        setHunterStepMs(momentum.stepMs);
        setHunter(nextHunter);
        setHunterMode(turn.brain.mode);
        lastHunterStep.current = timestamp;

        if (pointsEqual(nextHunter, playerRef.current)) {
          setStatus("lost");
        }
      }

      animationId = requestAnimationFrame(frame);
    };

    animationId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [advanceRoom, maze]);

  const startNewGeneratedMaze = () => {
    setRoom(1);
    setEntranceAnchor(null);
    setMode("generated");
    setSeed((current) => current + TUNING.playability.generatedAttempts);
  };

  const useFixedMap = () => {
    setRoom(1);
    setEntranceAnchor(null);
    setMode("fixed");
  };

  const useGeneratedMap = () => {
    setRoom(1);
    setEntranceAnchor(null);
    setMode("generated");
  };

  const hunterReleased = remainingHeadStart <= 0;
  const releaseProgress = 1 - Math.max(0, remainingHeadStart / TUNING.headStartSeconds);
  const plannedPathKeys = useMemo(() => new Set(plannedPath.map(viewPointKey)), [plannedPath]);
  const statusLabel =
    status === "lost"
      ? "Caught"
      : status === "advancing"
        ? "Next room"
        : hasKey
          ? "Gate open"
          : hunterReleased
            ? "Find the key"
            : "Head start";

  return (
    <main className={`shell shell-${status}`} onContextMenu={(event) => event.preventDefault()}>
      <p className="sr-only" aria-live="polite">
        {statusLabel}
      </p>
      <section
        className="game"
        style={
          {
            "--rows": maze.cells.length,
            "--cols": maze.cells[0].length,
          } as CSSProperties
        }
      >
        <div className="quick-actions" aria-label="Game actions">
          <div className="room-counter" aria-label={`Room ${room}`}>
            {room}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={resetRun}
            aria-label="Restart"
            title="Restart"
          >
            <RestartIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={startNewGeneratedMaze}
            aria-label="New generated maze"
            title="New generated maze"
          >
            <NewMazeIcon />
          </button>
          <button
            type="button"
            className={`icon-button mode-button ${mode === "generated" ? "selected" : ""}`}
            onClick={useGeneratedMap}
            aria-label="Generated maze"
            aria-pressed={mode === "generated"}
            title="Generated maze"
          >
            <GeneratedMazeIcon />
          </button>
          <button
            type="button"
            className={`icon-button mode-button ${mode === "fixed" ? "selected" : ""}`}
            onClick={useFixedMap}
            aria-label="Fixed maze"
            aria-pressed={mode === "fixed"}
            title="Fixed maze"
          >
            <FixedMazeIcon />
          </button>
        </div>

        <div className="board-wrap">
          <div
            className={`board ${status === "advancing" ? "board-advancing" : ""}`}
            aria-label="Maze board"
            onPointerDown={handleBoardPress}
          >
            {maze.cells.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const point = { row: rowIndex, col: colIndex };
                const isHunterHome = !hunterReleased && pointsEqual(maze.hunterStart, point);
                const isEntrance = pointsEqual(maze.entrance, point);
                const entranceState = !hunterReleased
                  ? "locked"
                  : pointsEqual(hunter, maze.entrance)
                    ? "breaking"
                    : "blocked";
                const isKey = !hasKey && pointsEqual(maze.key, point);
                const isExit = pointsEqual(maze.exit, point);
                const isPlannedPath = plannedPathKeys.has(viewPointKey(point));
                const className = [
                  "cell",
                  `cell-${cell}`,
                  isEntrance ? `cell-entrance cell-entrance-${entranceState}` : "",
                  isExit ? `cell-gate ${hasKey ? "cell-gate-open" : "cell-gate-locked"}` : "",
                  isKey ? "cell-key" : "",
                  isPlannedPath ? "cell-planned-path" : "",
                  isHunterHome ? "cell-hunter-home" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div className={className} key={`${rowIndex}-${colIndex}`}>
                    {isEntrance &&
                      (entranceState === "blocked" ? <RubbleIcon /> : <GateIcon open={false} />)}
                    {isExit && <GateIcon open={hasKey} />}
                    {isKey && <KeyIcon />}
                    {isHunterHome && <HunterIcon asleep />}
                  </div>
                );
              }),
            )}
            {!hunterReleased && status === "running" && (
              <div
                className="actor actor-release"
                style={{
                  ...actorStyle(maze.hunterStart, 0),
                  "--release-progress": releaseProgress,
                } as CSSProperties}
                aria-label="Hunter release timer"
                aria-live="polite"
              >
                <div className="release-pie" />
              </div>
            )}
            <div
              className="actor actor-player"
              style={actorStyle(player, TUNING.playerStepMs)}
              aria-hidden="true"
            >
              <PlayerIcon />
            </div>
            {hunterReleased && (
              <div
                className={`actor actor-hunter hunter-mode-${hunterMode}`}
                style={actorStyle(hunter, hunterStepMs)}
                aria-hidden="true"
              >
                <HunterIcon />
              </div>
            )}
            {status === "advancing" && (
              <div className="room-transition" aria-hidden="true">
                <GateTransitionIcon />
              </div>
            )}
            {status === "lost" && (
              <div className="result result-lost" aria-hidden="true">
                <ResultIcon />
              </div>
            )}
          </div>
        </div>

        <div className="touch-pad" aria-label="Movement controls">
          <button
            type="button"
            className="pad-up"
            aria-label="Move up"
            onPointerDown={queueDirectionFromPress("up")}
          >
            <ArrowIcon direction="up" />
          </button>
          <button
            type="button"
            className="pad-left"
            aria-label="Move left"
            onPointerDown={queueDirectionFromPress("left")}
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            className="pad-right"
            aria-label="Move right"
            onPointerDown={queueDirectionFromPress("right")}
          >
            <ArrowIcon direction="right" />
          </button>
          <button
            type="button"
            className="pad-down"
            aria-label="Move down"
            onPointerDown={queueDirectionFromPress("down")}
          >
            <ArrowIcon direction="down" />
          </button>
        </div>

        <footer className="app-footer" aria-label="Project links">
          <SourceBadge
            aria-label="Open Labyrinth source repository on GitHub"
            className="source-badge"
            href="https://github.com/taylorvance/labyrinth"
            iconClassName="source-badge-icon"
            labelClassName="source-badge-label"
            unstyled
          />
          <BrandBadge
            className="brand-badge"
            iconClassName="brand-badge-icon"
            labelClassName="brand-badge-label"
            unstyled
          />
        </footer>
      </section>
    </main>
  );
}

function pickPlayerDirection(
  player: Point,
  queued: Direction | null,
  planned: Direction | null,
  current: Direction | null,
  maze: Maze,
  hasKey: boolean,
): Direction | null {
  if (queued && canMove(player, queued, maze, hasKey)) {
    return queued;
  }

  if (planned && canMove(player, planned, maze, hasKey)) {
    return planned;
  }

  if (current && canMove(player, current, maze, hasKey)) {
    return current;
  }

  return null;
}

function canMove(player: Point, direction: Direction, maze: Maze, hasKey: boolean): boolean {
  return !pointsEqual(player, movePlayerPoint(player, direction, maze, hasKey));
}

function pickPlannedDirection(
  player: Point,
  plannedPath: Point[],
  maze: Maze,
  hasKey: boolean,
): Direction | null {
  const next = plannedPath[0];

  if (!next || !canPlayerEnter(next, maze, hasKey)) {
    return null;
  }

  if (next.row === player.row - 1 && next.col === player.col) {
    return "up";
  }

  if (next.row === player.row + 1 && next.col === player.col) {
    return "down";
  }

  if (next.row === player.row && next.col === player.col - 1) {
    return "left";
  }

  if (next.row === player.row && next.col === player.col + 1) {
    return "right";
  }

  return null;
}

function findLimitedPath(
  start: Point,
  tapped: Point,
  maze: Maze,
  hasKey: boolean,
  maxSteps: number,
  targetRadius: number,
): Point[] {
  const targets = collectTapTargets(tapped, maze, hasKey, targetRadius);

  if (targets.length === 0) {
    return [];
  }

  const targetKeys = new Set(targets.map(viewPointKey));
  const queue: Point[] = [start];
  const distances = new Map<string, number>([[viewPointKey(start), 0]]);
  const previous = new Map<string, Point>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(viewPointKey(current)) ?? 0;

    if (distance > 0 && targetKeys.has(viewPointKey(current))) {
      return buildPath(start, current, previous);
    }

    if (distance >= maxSteps) {
      continue;
    }

    for (const direction of DIRECTIONS) {
      const next = neighborForDirection(current, direction);
      const key = viewPointKey(next);

      if (!canPlayerEnter(next, maze, hasKey) || distances.has(key)) {
        continue;
      }

      distances.set(key, distance + 1);
      previous.set(key, current);
      queue.push(next);
    }
  }

  return [];
}

function collectTapTargets(
  tapped: Point,
  maze: Maze,
  hasKey: boolean,
  radius: number,
): Point[] {
  const candidates: Point[] = [];

  for (let row = tapped.row - radius; row <= tapped.row + radius; row += 1) {
    for (let col = tapped.col - radius; col <= tapped.col + radius; col += 1) {
      const point = { row, col };
      const distance = Math.abs(row - tapped.row) + Math.abs(col - tapped.col);

      if (distance <= radius && canPlayerEnter(point, maze, hasKey)) {
        candidates.push(point);
      }
    }
  }

  return candidates.sort(
    (a, b) =>
      Math.abs(a.row - tapped.row) +
      Math.abs(a.col - tapped.col) -
      (Math.abs(b.row - tapped.row) + Math.abs(b.col - tapped.col)),
  );
}

function buildPath(start: Point, target: Point, previous: Map<string, Point>): Point[] {
  const path: Point[] = [];
  let current = target;

  while (!pointsEqual(current, start)) {
    path.push(current);
    const parent = previous.get(viewPointKey(current));

    if (!parent) {
      return [];
    }

    current = parent;
  }

  return path.reverse();
}

function neighborForDirection(point: Point, direction: Direction): Point {
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

function viewPointKey(point: Point): string {
  return `${point.row},${point.col}`;
}

function actorStyle(point: Point, stepMs: number): CSSProperties {
  return {
    "--actor-row": point.row,
    "--actor-col": point.col,
    "--actor-step-ms": `${stepMs}ms`,
  } as CSSProperties;
}

function getNextHunterMomentum(
  previous: Point,
  next: Point,
  mode: HunterMode,
  previousDirection: Direction | null,
  previousStraightSteps: number,
): { direction: Direction | null; straightSteps: number; stepMs: number } {
  const direction = directionBetween(previous, next);

  if (!direction || !isHunterSprintMode(mode)) {
    return {
      direction: null,
      straightSteps: 0,
      stepMs: TUNING.hunterTrackStepMs,
    };
  }

  if (previousDirection && previousDirection !== direction) {
    return {
      direction,
      straightSteps: 1,
      stepMs: TUNING.hunterTurnStepMs,
    };
  }

  const straightSteps = previousDirection === direction ? previousStraightSteps + 1 : 1;

  return {
    direction,
    straightSteps,
    stepMs: hunterSprintStepMsForStraightRun(straightSteps),
  };
}

function isHunterSprintMode(mode: HunterMode): boolean {
  return mode === "chasing" || mode === "investigating";
}

function hunterSprintStepMsForStraightRun(straightSteps: number): number {
  const accelerationSteps = Math.max(0, straightSteps - TUNING.hunterStraightAccelStartSteps);
  return Math.max(
    TUNING.hunterMaxSprintStepMs,
    TUNING.hunterSprintStepMs - accelerationSteps * TUNING.hunterStraightAccelStepMs,
  );
}

function directionBetween(previous: Point, next: Point): Direction | null {
  if (next.row === previous.row - 1 && next.col === previous.col) {
    return "up";
  }

  if (next.row === previous.row + 1 && next.col === previous.col) {
    return "down";
  }

  if (next.row === previous.row && next.col === previous.col - 1) {
    return "left";
  }

  if (next.row === previous.row && next.col === previous.col + 1) {
    return "right";
  }

  return null;
}

function PlayerIcon() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Player" className="piece player">
      <circle cx="16" cy="16" r="12" />
      <path d="M16 7 25 16 16 25 7 16Z" />
    </svg>
  );
}

function HunterIcon({ asleep = false }: { asleep?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={asleep ? "Hunter waiting" : "Hunter"}
      className={`piece hunter ${asleep ? "asleep" : ""}`}
    >
      <path d="M9 8 L3 3 L4 14 Z" />
      <path d="M23 8 L29 3 L28 14 Z" />
      <circle cx="16" cy="17" r="10" />
      <circle cx="12" cy="16" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M12 22 H20" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Key" className="piece key">
      <circle cx="11" cy="15" r="5" />
      <path d="M16 15 H27 M22 15 V20 M26 15 V19" />
    </svg>
  );
}

function GateIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={open ? "Open gate" : "Locked gate"}
      className={`piece gate ${open ? "open" : "locked"}`}
    >
      <path d="M7 5 H25 V28 H7 Z" />
      <path d="M12 5 V28 M20 5 V28" />
      <path d={open ? "M12 17 H20" : "M10 17 H22"} />
      {!open && <circle cx="16" cy="17" r="2.3" />}
    </svg>
  );
}

function RubbleIcon() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Blocked doorway" className="piece rubble">
      <path d="M5 25 10 13 16 25Z" />
      <path d="M14 25 20 8 27 25Z" />
      <path d="M2 27 H30" />
      <path d="M11 18 15 14 M21 16 25 13" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: Direction }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`arrow arrow-${direction}`}>
      <path d="M12 4 L20 14 H15 V20 H9 V14 H4 Z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M6.5 8.4A7 7 0 1 1 5 13.7H2.8A9.2 9.2 0 1 0 5 6.9V3.5H2.8v7.1h7.1V8.4Z" />
    </svg>
  );
}

function NewMazeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6ZM6 6v2h2V6Zm10 0v2h2V6ZM6 16v2h2v-2Zm10 0v2h2v-2Z" />
    </svg>
  );
}

function GeneratedMazeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M4 4h16v16H4Zm2 2v4h3v2H6v6h3v-3h2v3h7v-4h-4v-2h4V6h-5v3h-2V6Zm5 5h2v2h-2Z" />
    </svg>
  );
}

function FixedMazeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M7 3h10v4h2v14H5V7h2Zm2 4h6V5H9Zm-2 2v10h10V9Zm3 2h4v2h-4Zm0 4h4v2h-4Z" />
    </svg>
  );
}

function GateTransitionIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="transition-icon">
      <path d="M14 50 V14 H50 V50" />
      <path d="M22 50 V22 H42 V50" />
      <path d="M32 50 V28" />
      <path d="M47 32 57 32 51 26 M57 32 51 38" />
    </svg>
  );
}

function ResultIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="result-icon">
      <circle cx="32" cy="32" r="28" />
      <path d="M22 22 42 42M42 22 22 42" />
    </svg>
  );
}
