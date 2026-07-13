import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type Direction,
  type HunterBrain,
  type MapMode,
  type Maze,
  type Point,
  createHunterBrain,
  createMaze,
  movePoint,
  nextHunterTurn,
  pointsEqual,
} from "./game";
import { TUNING } from "./tuning";

type GameStatus = "running" | "won" | "lost";

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

export default function App() {
  const [mode, setMode] = useState<MapMode>("generated");
  const [seed, setSeed] = useState(1);
  const maze = useMemo(() => createMaze(mode, seed), [mode, seed]);
  const [player, setPlayer] = useState<Point>(maze.playerStart);
  const [hunter, setHunter] = useState<Point>(maze.hunterStart);
  const [status, setStatus] = useState<GameStatus>("running");
  const [remainingHeadStart, setRemainingHeadStart] = useState(TUNING.headStartSeconds);
  const currentDirection = useRef<Direction | null>(null);
  const queuedDirection = useRef<Direction | null>(null);
  const hunterBrain = useRef<HunterBrain>(createHunterBrain());
  const lastPlayerStep = useRef(0);
  const lastHunterStep = useRef(0);
  const lastFrame = useRef(0);
  const playerRef = useRef(player);
  const hunterRef = useRef(hunter);
  const statusRef = useRef(status);
  const remainingHeadStartRef = useRef(remainingHeadStart);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    hunterRef.current = hunter;
  }, [hunter]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    remainingHeadStartRef.current = remainingHeadStart;
  }, [remainingHeadStart]);

  const resetGame = useCallback(() => {
    setPlayer(maze.playerStart);
    setHunter(maze.hunterStart);
    setStatus("running");
    setRemainingHeadStart(TUNING.headStartSeconds);
    currentDirection.current = null;
    queuedDirection.current = null;
    hunterBrain.current = createHunterBrain();
    lastPlayerStep.current = 0;
    lastHunterStep.current = 0;
    lastFrame.current = 0;
  }, [maze]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  const queueDirection = useCallback((direction: Direction) => {
    queuedDirection.current = direction;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];

      if (!direction) {
        return;
      }

      event.preventDefault();
      queueDirection(direction);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [queueDirection]);

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
        const direction = pickPlayerDirection(
          playerRef.current,
          queuedDirection.current,
          currentDirection.current,
          maze,
        );

        if (direction) {
          const nextPlayer = movePoint(playerRef.current, direction, maze);
          playerRef.current = nextPlayer;
          currentDirection.current = direction;
          setPlayer(nextPlayer);
          lastPlayerStep.current = timestamp;

          if (pointsEqual(nextPlayer, maze.exit)) {
            setStatus("won");
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
        }
      }

      if (
        remainingHeadStartRef.current <= 0 &&
        timestamp - lastHunterStep.current >= TUNING.hunterStepMs
      ) {
        const turn = nextHunterTurn(
          hunterRef.current,
          playerRef.current,
          maze,
          hunterBrain.current,
          TUNING.hunter,
        );
        const nextHunter = turn.hunter;
        hunterBrain.current = turn.brain;
        hunterRef.current = nextHunter;
        setHunter(nextHunter);
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
  }, [maze]);

  const startNewGeneratedMaze = () => {
    setMode("generated");
    setSeed((current) => current + 1);
  };

  const useFixedMap = () => {
    setMode("fixed");
  };

  const useGeneratedMap = () => {
    setMode("generated");
  };

  const hunterReleased = remainingHeadStart <= 0;
  const releaseProgress = 1 - Math.max(0, remainingHeadStart / TUNING.headStartSeconds);
  const statusLabel =
    status === "won"
      ? "Escaped"
      : status === "lost"
        ? "Caught"
        : hunterReleased
          ? "Hunter active"
          : "Head start";

  return (
    <main className="shell">
      <section className="hud" aria-label="Game status">
        <div>
          <p className="eyebrow">Labyrinth</p>
          <h1>Head Start Escape</h1>
        </div>
        <div className={`status status-${status}`}>{statusLabel}</div>
        <div className="actions" aria-label="Game actions">
          <button type="button" onClick={resetGame}>
            Restart
          </button>
          <button type="button" onClick={startNewGeneratedMaze}>
            New Maze
          </button>
        </div>
      </section>

      <section
        className="game"
        style={
          {
            "--rows": maze.cells.length,
            "--cols": maze.cells[0].length,
          } as CSSProperties
        }
      >
        <div className="map-switch" aria-label="Map mode">
          <button
            type="button"
            className={mode === "generated" ? "selected" : ""}
            onClick={useGeneratedMap}
          >
            Generated
          </button>
          <button
            type="button"
            className={mode === "fixed" ? "selected" : ""}
            onClick={useFixedMap}
          >
            Fixed
          </button>
        </div>

        <div className="board-wrap">
          <div className="board" aria-label="Maze board">
            {maze.cells.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const point = { row: rowIndex, col: colIndex };
                const isHunterHome = !hunterReleased && pointsEqual(maze.hunterStart, point);
                const isExit = pointsEqual(maze.exit, point);
                const className = [
                  "cell",
                  `cell-${cell}`,
                  isExit ? "cell-exit" : "",
                  isHunterHome ? "cell-hunter-home" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div className={className} key={`${rowIndex}-${colIndex}`}>
                    {isExit && <ExitIcon />}
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
                className="actor actor-hunter"
                style={actorStyle(hunter, TUNING.hunterStepMs)}
                aria-hidden="true"
              >
                <HunterIcon />
              </div>
            )}
          </div>
        </div>

        <div className="touch-pad" aria-label="Movement controls">
          <button
            type="button"
            className="pad-up"
            aria-label="Move up"
            onPointerDown={() => queueDirection("up")}
          >
            <ArrowIcon direction="up" />
          </button>
          <button
            type="button"
            className="pad-left"
            aria-label="Move left"
            onPointerDown={() => queueDirection("left")}
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            className="pad-right"
            aria-label="Move right"
            onPointerDown={() => queueDirection("right")}
          >
            <ArrowIcon direction="right" />
          </button>
          <button
            type="button"
            className="pad-down"
            aria-label="Move down"
            onPointerDown={() => queueDirection("down")}
          >
            <ArrowIcon direction="down" />
          </button>
        </div>
      </section>
    </main>
  );
}

function pickPlayerDirection(
  player: Point,
  queued: Direction | null,
  current: Direction | null,
  maze: Maze,
): Direction | null {
  if (queued && canMove(player, queued, maze)) {
    return queued;
  }

  if (current && canMove(player, current, maze)) {
    return current;
  }

  return null;
}

function canMove(player: Point, direction: Direction, maze: Maze): boolean {
  return !pointsEqual(player, movePoint(player, direction, maze));
}

function actorStyle(point: Point, stepMs: number): CSSProperties {
  return {
    "--actor-row": point.row,
    "--actor-col": point.col,
    "--actor-step-ms": `${stepMs}ms`,
  } as CSSProperties;
}

function PlayerIcon() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Player" className="piece player">
      <circle cx="16" cy="16" r="11" />
      <path d="M16 7 L23 16 L16 25 L9 16 Z" />
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

function ExitIcon() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Exit" className="piece exit">
      <path d="M7 4 H25 V28 H7 Z" />
      <path d="M13 4 V28" />
      <circle cx="21" cy="16" r="1.6" />
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
