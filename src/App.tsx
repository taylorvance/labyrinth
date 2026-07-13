import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type Direction,
  type MapMode,
  type Point,
  createMaze,
  formatCountdown,
  movePoint,
  nextHunterStep,
  pointsEqual,
} from "./game";

type GameStatus = "running" | "won" | "lost";

const HEAD_START_SECONDS = 6;
const PLAYER_STEP_MS = 160;
const HUNTER_STEP_MS = 115;

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
  const [remainingHeadStart, setRemainingHeadStart] = useState(HEAD_START_SECONDS);
  const heldDirections = useRef<Direction[]>([]);
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
    setRemainingHeadStart(HEAD_START_SECONDS);
    heldDirections.current = [];
    lastPlayerStep.current = 0;
    lastHunterStep.current = 0;
    lastFrame.current = 0;
  }, [maze]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  const setDirection = useCallback((direction: Direction, isHeld: boolean) => {
    heldDirections.current = heldDirections.current.filter((item) => item !== direction);

    if (isHeld) {
      heldDirections.current.unshift(direction);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];

      if (!direction) {
        return;
      }

      event.preventDefault();
      setDirection(direction, true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.code];

      if (!direction) {
        return;
      }

      event.preventDefault();
      setDirection(direction, false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setDirection]);

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

      if (timestamp - lastPlayerStep.current >= PLAYER_STEP_MS) {
        const direction = heldDirections.current[0];

        if (direction) {
          const nextPlayer = movePoint(playerRef.current, direction, maze);
          playerRef.current = nextPlayer;
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
      }

      if (
        remainingHeadStartRef.current <= 0 &&
        timestamp - lastHunterStep.current >= HUNTER_STEP_MS
      ) {
        const nextHunter = nextHunterStep(hunterRef.current, playerRef.current, maze);
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
  const statusLabel =
    status === "won"
      ? "Escaped"
      : status === "lost"
        ? "Caught"
        : hunterReleased
          ? "Hunter active"
          : `Release in ${formatCountdown(remainingHeadStart)}`;

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
                const isPlayer = pointsEqual(player, point);
                const isHunter = hunterReleased && pointsEqual(hunter, point);
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
                    {isHunter && <HunterIcon />}
                    {isPlayer && <PlayerIcon />}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <div className="touch-pad" aria-label="Movement controls">
          <button
            type="button"
            className="pad-up"
            aria-label="Move up"
            onPointerDown={() => setDirection("up", true)}
            onPointerUp={() => setDirection("up", false)}
            onPointerCancel={() => setDirection("up", false)}
            onPointerLeave={() => setDirection("up", false)}
          >
            <ArrowIcon direction="up" />
          </button>
          <button
            type="button"
            className="pad-left"
            aria-label="Move left"
            onPointerDown={() => setDirection("left", true)}
            onPointerUp={() => setDirection("left", false)}
            onPointerCancel={() => setDirection("left", false)}
            onPointerLeave={() => setDirection("left", false)}
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            className="pad-right"
            aria-label="Move right"
            onPointerDown={() => setDirection("right", true)}
            onPointerUp={() => setDirection("right", false)}
            onPointerCancel={() => setDirection("right", false)}
            onPointerLeave={() => setDirection("right", false)}
          >
            <ArrowIcon direction="right" />
          </button>
          <button
            type="button"
            className="pad-down"
            aria-label="Move down"
            onPointerDown={() => setDirection("down", true)}
            onPointerUp={() => setDirection("down", false)}
            onPointerCancel={() => setDirection("down", false)}
            onPointerLeave={() => setDirection("down", false)}
          >
            <ArrowIcon direction="down" />
          </button>
        </div>
      </section>
    </main>
  );
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
