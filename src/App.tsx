import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Info,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shuffle,
  SkipForward,
  X
} from "lucide-react";
import BlockPalette from "./components/BlockPalette";
import CodePreview from "./components/CodePreview";
import GameScene from "./components/GameScene";
import HUD from "./components/HUD";
import MiniMap from "./components/MiniMap";
import MissionBriefing from "./components/MissionBriefing";
import ProgramEditor, { PaletteAddRequest } from "./components/ProgramEditor";
import RobotSelect from "./components/RobotSelect";
import { countBlocks } from "./game/blocks";
import { executeNextInstruction, createExecutionRuntime } from "./game/interpreter";
import {
  buildPracticeProgram,
  generateMaze,
  getNextPosition,
  isWall,
  samePosition
} from "./game/mazeGenerator";
import { calculateScore } from "./game/scoring";
import {
  ExecutionRuntime,
  GameState,
  ProgramBlock,
  RobotConfig
} from "./game/types";

const createGameState = (
  robot: RobotConfig,
  level: number,
  seed?: string,
  program: ProgramBlock[] = []
): GameState => {
  const maze = generateMaze(level, seed);
  const hotspots = maze.hotspots.map((hotspot) => ({ ...hotspot, sealed: false }));
  const plantRadiation =
    maze.baseRadiation +
    hotspots.reduce((total, hotspot) => total + hotspot.radiationValue, 0);

  return {
    level,
    seed: maze.seed,
    maze,
    robot,
    position: maze.start,
    facing: "east",
    program,
    variables: { counter: 0 },
    hotspots,
    foamCharges: maze.initialFoam + robot.extraFoamCharges,
    meltdownTicks: maze.meltdownTicks + robot.extraMeltdownTicks,
    plantRadiation,
    radiationReduced: 0,
    actionsUsed: 0,
    blocksUsed: countBlocks(program),
    wallHits: 0,
    wallHitLimit: Math.max(1, robot.wallHitLimit - Math.floor((level - 1) / 5)),
    pathTrace: [maze.start],
    missionLog: [
      `Level ${level} ready. Seal ${hotspots.length} hotspots, then reach extraction.`
    ],
    executionStatus: "idle"
  };
};

function ScorePanel({ state }: { state: GameState }) {
  if (!state.score && state.executionStatus !== "failed") {
    return null;
  }

  if (state.executionStatus === "failed") {
    return (
      <section className="result-panel failed">
        <h2>Mission incomplete</h2>
        <p>{state.failureReason}</p>
      </section>
    );
  }

  const score = state.score ?? calculateScore(state);

  return (
    <section className="result-panel success">
      <h2>Mission complete</h2>
      <div className="score-total">
        <strong>{score.totalScore}</strong>
        <span>Stars: {score.stars} / 5</span>
      </div>
      <dl className="score-grid">
        <div>
          <dt>Hotspots sealed</dt>
          <dd>{state.hotspots.length}/{state.hotspots.length}</dd>
        </div>
        <div>
          <dt>Radiation reduced</dt>
          <dd>{score.radiationReduced}</dd>
        </div>
        <div>
          <dt>Actions used vs par</dt>
          <dd>{score.actionsUsed} / {score.parActions}</dd>
        </div>
        <div>
          <dt>Blocks used</dt>
          <dd>{score.blocksUsed}</dd>
        </div>
        <div>
          <dt>Meltdown ticks left</dt>
          <dd>{score.meltdownTicksRemaining}</dd>
        </div>
        <div>
          <dt>Wall hits</dt>
          <dd>{score.wallHits}</dd>
        </div>
      </dl>
    </section>
  );
}

function SensorPanel({ state }: { state: GameState }) {
  if (!state.robot.sensorHints) {
    return null;
  }

  const next = getNextPosition(state.position, state.facing);
  const onHotspot = state.hotspots.some(
    (hotspot) => !hotspot.sealed && samePosition(hotspot.position, state.position)
  );
  const hotspotAhead = state.hotspots.some(
    (hotspot) => !hotspot.sealed && samePosition(hotspot.position, next)
  );

  return (
    <section className="sensor-panel">
      <div className="panel-heading">
        <span>Sora Sensor Hints</span>
        <small>Read-only values</small>
      </div>
      <dl>
        <div>
          <dt>wall_ahead()</dt>
          <dd>{isWall(state.maze, next) ? "true" : "false"}</dd>
        </div>
        <div>
          <dt>on_hotspot()</dt>
          <dd>{onHotspot ? "true" : "false"}</dd>
        </div>
        <div>
          <dt>hotspot_ahead()</dt>
          <dd>{hotspotAhead ? "true" : "false"}</dd>
        </div>
        <div>
          <dt>counter</dt>
          <dd>{state.variables.counter}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function App() {
  const [selectedRobot, setSelectedRobot] = useState<RobotConfig | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [level, setLevel] = useState(1);
  const [seedDraft, setSeedDraft] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [paletteAddRequest, setPaletteAddRequest] =
    useState<PaletteAddRequest | null>(null);
  const runtimeRef = useRef<ExecutionRuntime | null>(null);

  const resetRuntime = () => {
    runtimeRef.current = null;
  };

  const beginMission = (robot: RobotConfig, nextLevel = level, seed?: string) => {
    resetRuntime();
    const created = createGameState(robot, nextLevel, seed);
    setSelectedRobot(robot);
    setLevel(nextLevel);
    setSeedDraft(created.seed);
    setGame(created);
  };

  const executeStep = useCallback((nextStatus: GameState["executionStatus"]) => {
    setGame((previous) => {
      if (!previous) return previous;
      if (previous.executionStatus === "failed" || previous.executionStatus === "success") {
        return previous;
      }
      const runtime =
        runtimeRef.current ?? createExecutionRuntime(previous.program);
      const result = executeNextInstruction(
        {
          ...previous,
          executionStatus: previous.executionStatus === "idle" ? "running" : previous.executionStatus
        },
        runtime
      );
      runtimeRef.current = result.runtime;
      let nextState = result.state;
      if (
        nextState.executionStatus !== "failed" &&
        nextState.executionStatus !== "success"
      ) {
        nextState = { ...nextState, executionStatus: nextStatus };
      }
      if (nextState.executionStatus === "success") {
        nextState = { ...nextState, score: calculateScore(nextState) };
      }
      return nextState;
    });
  }, []);

  useEffect(() => {
    if (game?.executionStatus !== "running") {
      return undefined;
    }

    const timer = window.setInterval(() => executeStep("running"), 420);
    return () => window.clearInterval(timer);
  }, [executeStep, game?.executionStatus]);

  const handleProgramChange = (program: ProgramBlock[]) => {
    resetRuntime();
    setGame((previous) =>
      previous
        ? {
            ...previous,
            program,
            blocksUsed: countBlocks(program),
            executionStatus:
              previous.executionStatus === "running" ? "paused" : previous.executionStatus,
            activeBlockId: undefined
          }
        : previous
    );
  };

  const resetRobot = (programOverride?: ProgramBlock[]) => {
    if (!game) return;
    resetRuntime();
    const program = programOverride ?? game.program;
    const reset = createGameState(game.robot, game.level, game.seed, program);
    setGame(reset);
    setSeedDraft(reset.seed);
  };

  const resetLevel = () => {
    if (!game) return;
    resetRuntime();
    const reset = createGameState(game.robot, game.level, game.seed, []);
    setGame(reset);
    setSeedDraft(reset.seed);
  };

  const newLevel = () => {
    if (!selectedRobot) return;
    const nextLevel = level + 1;
    const created = createGameState(selectedRobot, nextLevel);
    resetRuntime();
    setLevel(nextLevel);
    setGame(created);
    setSeedDraft(created.seed);
  };

  const loadSeed = () => {
    if (!selectedRobot) return;
    beginMission(selectedRobot, level, seedDraft);
  };

  const loadPracticeRoute = () => {
    if (!game) return;
    const program = buildPracticeProgram(game.maze, "east");
    resetRuntime();
    setGame((previous) =>
      previous
        ? {
            ...previous,
            program,
            blocksUsed: countBlocks(program),
            executionStatus:
              previous.executionStatus === "running" ? "paused" : previous.executionStatus,
            activeBlockId: undefined,
            missionLog: [
              "Practice route loaded into the command list.",
              ...previous.missionLog
            ].slice(0, 12)
          }
        : previous
    );
  };

  const canRun = useMemo(
    () =>
      Boolean(
        game &&
          game.program.length > 0 &&
          game.executionStatus !== "failed" &&
          game.executionStatus !== "success"
      ),
    [game]
  );

  const runProgram = () => {
    if (!game || !canRun || game.executionStatus === "running") return;
    if (!runtimeRef.current) {
      runtimeRef.current = createExecutionRuntime(game.program);
    }
    setGame((previous) =>
      previous ? { ...previous, executionStatus: "running" } : previous
    );
  };

  if (!selectedRobot || !game) {
    return (
      <main className="landing-screen">
        <section className="landing-title-lockup" aria-label="Game title">
          <h1>Reactor Logic</h1>
        </section>
        <a
          className="codeplant-corner"
          href="https://codeplant.co.za"
          target="_blank"
          rel="noreferrer"
          aria-label="Visit CodePlant"
        >
          <span className="codeplant-logo" aria-hidden />
        </a>
        <div className="landing-inner">
          <MissionBriefing />
          <RobotSelect onSelect={(robot) => beginMission(robot, 1)} />
        </div>
      </main>
    );
  }

  return (
    <main className="game-layout">
      <HUD
        state={game}
        controls={
          <>
            <button
              type="button"
              disabled={!canRun || game.executionStatus === "running"}
              onClick={runProgram}
            >
              <Play size={15} />
              Run
            </button>
            <button
              type="button"
              disabled={!canRun || game.executionStatus === "running"}
              onClick={() => executeStep("paused")}
            >
              <SkipForward size={15} />
              Step
            </button>
            <button
              type="button"
              disabled={game.executionStatus !== "running"}
              onClick={() =>
                setGame((previous) =>
                  previous ? { ...previous, executionStatus: "paused" } : previous
                )
              }
            >
              <Pause size={15} />
              Pause
            </button>
            <button
              type="button"
              className={`tray-toggle ${trayOpen ? "active" : ""}`}
              aria-expanded={trayOpen}
              aria-controls="mission-tray"
              onClick={() => setTrayOpen((open) => !open)}
            >
              <Info size={15} />
              Mission tray
            </button>
          </>
        }
      />
      <section className="playfield-zone">
        <GameScene state={game} />
      </section>
      <aside
        id="mission-tray"
        className={`mission-tray ${trayOpen ? "open" : ""}`}
        aria-hidden={!trayOpen}
      >
        {trayOpen ? (
          <>
            <div className="tray-header">
              <div>
                <strong>Mission Tray</strong>
                <span>Map, code, logs, and reset tools</span>
              </div>
              <button
                type="button"
                title="Close tray"
                onClick={() => setTrayOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="tray-scroll">
              <MissionBriefing compact />
              <MiniMap state={game} />
              <SensorPanel state={game} />
              <ScorePanel state={game} />
              <CodePreview program={game.program} />
              <section className="tray-panel">
                <div className="panel-heading">
                  <span>Level Tools</span>
                  <small>Replay and reset</small>
                </div>
                <div className="tray-actions">
                  <button type="button" onClick={() => resetRobot()}>
                    <RotateCcw size={15} />
                    Reset robot
                  </button>
                  <button type="button" onClick={resetLevel}>
                    <RefreshCw size={15} />
                    Reset level
                  </button>
                  <button type="button" onClick={newLevel}>
                    <Shuffle size={15} />
                    New level
                  </button>
                </div>
                <div className="seed-row tray-seed-row">
                  <label>
                    Seed
                    <input
                      value={seedDraft}
                      onChange={(event) => setSeedDraft(event.target.value)}
                    />
                  </label>
                  <button type="button" onClick={loadSeed}>
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRobot(null);
                      setGame(null);
                      setTrayOpen(false);
                      resetRuntime();
                    }}
                  >
                    Robot
                  </button>
                </div>
              </section>
              <div className="mission-log tray-panel">
                <div className="panel-heading">
                  <span>Mission Log</span>
                  <small>Latest first</small>
                </div>
                <ol>
                  {game.missionLog.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        ) : null}
      </aside>
      <aside className="side-panel">
        <div className="editor-grid">
          <BlockPalette
            onAddBlock={(block) =>
              setPaletteAddRequest({
                id: Date.now(),
                block
              })
            }
          />
          <ProgramEditor
            program={game.program}
            activeBlockId={game.activeBlockId}
            onProgramChange={handleProgramChange}
            onLoadPracticeRoute={loadPracticeRoute}
            onClearProgram={() => handleProgramChange([])}
            paletteAddRequest={paletteAddRequest}
            onPaletteAddHandled={(id) =>
              setPaletteAddRequest((request) =>
                request?.id === id ? null : request
              )
            }
          />
        </div>
      </aside>
    </main>
  );
}
