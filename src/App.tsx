import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Github,
  Info,
  Map as MapIcon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shuffle,
  SkipForward,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import AiCopilot from "./components/AiCopilot";
import BlockPalette from "./components/BlockPalette";
import CodePreview from "./components/CodePreview";
import GameScene, { CameraViewMode } from "./components/GameScene";
import HUD from "./components/HUD";
import MiniMap from "./components/MiniMap";
import MissionBriefing from "./components/MissionBriefing";
import ProgramEditor, { PaletteAddRequest } from "./components/ProgramEditor";
import Preloader from "./components/Preloader";
import RobotSelect from "./components/RobotSelect";
import {
  isBackgroundMusicMuted,
  playIntroMusic,
  playBackgroundMusic,
  setBackgroundMusicMuted,
  stopIntroMusic,
  stopBackgroundMusic
} from "./game/audio";
import {
  blockDefinitions,
  CONDITION_OPTIONS,
  countBlocks,
  programToPseudoCode
} from "./game/blocks";
import type {
  CopilotMode,
  CopilotProgramBlock,
  CopilotResponse,
  CopilotSnapshot
} from "./game/copilot";
import { executeNextInstruction, createExecutionRuntime } from "./game/interpreter";
import { preloadGameAssets, PreloadProgress } from "./game/preloadAssets";
import { planShortestPath } from "./game/routePlanner";
import {
  buildTrainingProgram,
  generateMaze,
  getNextPosition,
  isWall,
  samePosition
} from "./game/mazeGenerator";
import { calculateScore } from "./game/scoring";
import {
  Direction,
  ExecutionRuntime,
  GameState,
  ProgramBlock,
  RobotConfig
} from "./game/types";

const GITHUB_REPO_URL = "https://github.com/codeplant-sa/reactor-logic";
const START_FACING_PREFERENCE: Direction[] = ["east", "south", "north", "west"];

const chooseStartFacing = (maze: GameState["maze"]): Direction =>
  START_FACING_PREFERENCE.find(
    (direction) => !isWall(maze, getNextPosition(maze.start, direction))
  ) ?? "east";

const createGameState = (
  robot: RobotConfig,
  level: number,
  seed?: string,
  program: ProgramBlock[] = []
): GameState => {
  const maze = generateMaze(level, seed);
  const startFacing = chooseStartFacing(maze);
  const hotspots = maze.hotspots.map((hotspot) => ({ ...hotspot, sealed: false }));
  const plantRadiation =
    maze.baseRadiation +
    hotspots.reduce((total, hotspot) => total + hotspot.radiationValue, 0);

  const missionLog = [
    `Level ${level} ready. Seal ${hotspots.length} hotspots, then reach extraction.`
  ];
  if (maze.trainingGuide) {
    missionLog.unshift(`Training mode: ${maze.trainingGuide.focus}.`);
  }

  return {
    level,
    seed: maze.seed,
    maze,
    robot,
    position: maze.start,
    facing: startFacing,
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
    missionLog,
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

function TrainingPanel({ state }: { state: GameState }) {
  const guide = state.maze.trainingGuide;
  if (!guide) {
    return null;
  }

  return (
    <section className="training-panel">
      <div className="panel-heading">
        <span>{guide.title}</span>
        <small>{guide.focus}</small>
      </div>
      <p>{guide.summary}</p>
      <ul>
        {guide.concepts.map((concept) => (
          <li key={concept}>{concept}</li>
        ))}
      </ul>
    </section>
  );
}

const COPILOT_MAZE_LEGEND: Record<string, string> = {
  "#": "wall",
  ".": "open floor",
  S: "start",
  E: "extraction",
  H: "unsealed hotspot",
  X: "sealed hotspot",
  R: "robot"
};

const compactProgramBlock = (block: ProgramBlock): CopilotProgramBlock => ({
  type: block.type,
  params: block.params,
  children: block.children
    ? Object.fromEntries(
        Object.entries(block.children).map(([slot, blocks]) => [
          slot,
          (blocks ?? []).map(compactProgramBlock)
        ])
      )
    : undefined
});

const buildCopilotMazeRows = (state: GameState): string[] => {
  const hotspotsByPosition = new Map(
    state.hotspots.map((hotspot) => [
      `${hotspot.position.x},${hotspot.position.y}`,
      hotspot
    ])
  );

  return state.maze.cells.map((row) =>
    row
      .map((cell) => {
        const position = { x: cell.x, y: cell.y };
        const hotspot = hotspotsByPosition.get(`${cell.x},${cell.y}`);

        if (samePosition(state.position, position)) return "R";
        if (samePosition(state.maze.start, position)) return "S";
        if (samePosition(state.maze.extraction, position)) return "E";
        if (hotspot) return hotspot.sealed ? "X" : "H";
        return cell.wall ? "#" : ".";
      })
      .join("")
  );
};

const buildCopilotSnapshot = (state: GameState): CopilotSnapshot => ({
  level: state.level,
  seed: state.seed,
  trainingFocus: state.maze.trainingGuide?.focus,
  robot: {
    name: state.robot.name,
    callSign: state.robot.callSign,
    position: state.position,
    facing: state.facing,
    foamCharges: state.foamCharges,
    meltdownTicks: state.meltdownTicks,
    wallHits: state.wallHits,
    wallHitLimit: state.wallHitLimit
  },
  mission: {
    start: state.maze.start,
    extraction: state.maze.extraction,
    hotspots: state.hotspots.map((hotspot) => ({
      id: hotspot.id,
      position: hotspot.position,
      sealed: hotspot.sealed,
      radiationValue: hotspot.radiationValue
    })),
    plantRadiation: state.plantRadiation,
    radiationReduced: state.radiationReduced,
    actionsUsed: state.actionsUsed,
    blocksUsed: state.blocksUsed
  },
  maze: {
    width: state.maze.width,
    height: state.maze.height,
    legend: COPILOT_MAZE_LEGEND,
    rows: buildCopilotMazeRows(state)
  },
  program: {
    pseudoCode: programToPseudoCode(state.program),
    blocks: state.program.map(compactProgramBlock)
  },
  shortestPath: planShortestPath(state),
  availableBlocks: Object.values(blockDefinitions).map((definition) => ({
    type: definition.type,
    label: definition.label,
    description: definition.description,
    category: definition.category
  })),
  availableConditions: CONDITION_OPTIONS.map((condition) => ({
    type: condition.type,
    label: condition.label,
    help: condition.help
  }))
});

const readCopilotError = (payload: unknown): string | undefined => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return undefined;
};

function MissionSummaryModal({
  state,
  onContinue,
  onQuit
}: {
  state: GameState;
  onContinue: () => void;
  onQuit: () => void;
}) {
  if (state.executionStatus !== "success") {
    return null;
  }

  const score = state.score ?? calculateScore(state);
  const tilesMoved = Math.max(0, state.pathTrace.length - 1);
  const sealed = state.hotspots.filter((hotspot) => hotspot.sealed).length;

  return (
    <div className="mission-summary-overlay" role="presentation">
      <section
        className="mission-summary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-summary-title"
      >
        <div className="summary-header">
          <div>
            <span>Level {state.level} complete</span>
            <h2 id="mission-summary-title">Mission Summary</h2>
          </div>
          <div className="summary-score">
            <strong>{score.totalScore}</strong>
            <span>{score.stars} / 5 stars</span>
          </div>
        </div>
        <dl className="summary-grid">
          <div>
            <dt>Tiles moved</dt>
            <dd>{tilesMoved}</dd>
          </div>
          <div>
            <dt>Actions used</dt>
            <dd>{score.actionsUsed} / {score.parActions}</dd>
          </div>
          <div>
            <dt>Hotspots sealed</dt>
            <dd>{sealed} / {state.hotspots.length}</dd>
          </div>
          <div>
            <dt>Radiation reduced</dt>
            <dd>{score.radiationReduced}</dd>
          </div>
          <div>
            <dt>Foam remaining</dt>
            <dd>{score.foamRemaining}</dd>
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
        <div className="summary-actions">
          <button type="button" className="secondary-action" onClick={onQuit}>
            Quit
          </button>
          <button type="button" className="primary-action" onClick={onContinue}>
            Continue
          </button>
        </div>
      </section>
    </div>
  );
}

function GitHubLink() {
  return (
    <a
      className="github-link"
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Open project on GitHub"
    >
      <Github size={18} />
    </a>
  );
}

function CodePlantCorner() {
  return (
    <a
      className="codeplant-corner"
      href="https://codeplant.co.za"
      target="_blank"
      rel="noreferrer"
      aria-label="Visit CodePlant"
    >
      <span className="codeplant-logo" aria-hidden />
    </a>
  );
}

export default function App() {
  const [selectedRobot, setSelectedRobot] = useState<RobotConfig | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [briefingEntered, setBriefingEntered] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress>({
    loaded: 0,
    total: 4,
    label: "Starting asset check"
  });
  const [preloadError, setPreloadError] = useState<string | undefined>();
  const [level, setLevel] = useState(1);
  const [seedDraft, setSeedDraft] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [mapPinned, setMapPinned] = useState(true);
  const [cameraViewMode, setCameraViewMode] = useState<CameraViewMode>("robot");
  const [musicMuted, setMusicMuted] = useState(isBackgroundMusicMuted());
  const [paletteAddRequest, setPaletteAddRequest] =
    useState<PaletteAddRequest | null>(null);
  const runtimeRef = useRef<ExecutionRuntime | null>(null);

  const resetRuntime = () => {
    runtimeRef.current = null;
  };

  useEffect(() => {
    let active = true;

    preloadGameAssets((progress) => {
      if (active) {
        setPreloadProgress(progress);
      }
    })
      .then(() => {
        if (active) {
          setAssetsReady(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPreloadError(
            error instanceof Error ? error.message : "Unable to load game assets."
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const beginMission = (robot: RobotConfig, nextLevel = level, seed?: string) => {
    resetRuntime();
    const created = createGameState(robot, nextLevel, seed);
    stopIntroMusic();
    setSelectedRobot(robot);
    setLevel(nextLevel);
    setSeedDraft(created.seed);
    setGame(created);
    setBackgroundMusicMuted(musicMuted);
    if (!musicMuted) {
      playBackgroundMusic();
    }
  };

  const enterBriefing = () => {
    setBriefingEntered(true);
    setBackgroundMusicMuted(musicMuted);
    if (!musicMuted) {
      playIntroMusic();
    }
  };

  const toggleMusic = () => {
    const nextMuted = !musicMuted;
    setMusicMuted(nextMuted);
    setBackgroundMusicMuted(nextMuted);
    if (!nextMuted && game) {
      playBackgroundMusic();
    }
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

  const quitMission = () => {
    setSelectedRobot(null);
    setGame(null);
    setTrayOpen(false);
    stopBackgroundMusic();
    if (!musicMuted) {
      playIntroMusic();
    }
    resetRuntime();
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

  const loadTrainingProgram = () => {
    if (!game) return;
    const program = buildTrainingProgram(game.maze, chooseStartFacing(game.maze));
    const guide = game.maze.trainingGuide;
    const trainingMessage = guide
      ? `${guide.referenceLabel.replace(/^Load /, "")} loaded into the command list.`
      : "Practice route loaded into the command list.";
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
              trainingMessage,
              ...previous.missionLog
            ].slice(0, 12)
          }
        : previous
    );
  };

  const askCopilot = useCallback(
    async (
      mode: CopilotMode,
      question?: string
    ): Promise<CopilotResponse> => {
      if (!game) {
        throw new Error("No active mission.");
      }

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          question,
          snapshot: buildCopilotSnapshot(game)
        })
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }

      if (!response.ok) {
        throw new Error(readCopilotError(payload) ?? "Copilot request failed.");
      }

      return payload as CopilotResponse;
    },
    [game]
  );

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

  if (!assetsReady || !briefingEntered) {
    return (
      <Preloader
        loaded={preloadProgress.loaded}
        total={preloadProgress.total}
        label={preloadProgress.label}
        ready={assetsReady}
        error={preloadError}
        onEnter={enterBriefing}
        repoLink={<GitHubLink />}
        brandLink={<CodePlantCorner />}
      />
    );
  }

  if (!selectedRobot || !game) {
    return (
      <main className="landing-screen">
        <GitHubLink />
        <section className="landing-title-lockup" aria-label="Game title">
          <h1>Reactor Logic</h1>
        </section>
        <CodePlantCorner />
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
            <button type="button" onClick={() => resetRobot()}>
              <RotateCcw size={15} />
              Reset robot
            </button>
            <button
              type="button"
              className={`audio-toggle ${!musicMuted ? "active" : ""}`}
              aria-pressed={!musicMuted}
              onClick={toggleMusic}
            >
              {musicMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              {musicMuted ? "Muted" : "Music"}
            </button>
            <button
              type="button"
              className={`map-pin-toggle ${mapPinned ? "active" : ""}`}
              aria-pressed={mapPinned}
              onClick={() => setMapPinned((pinned) => !pinned)}
            >
              <MapIcon size={15} />
              {mapPinned ? "Hide map" : "Pin map"}
            </button>
            <button
              type="button"
              className={`view-toggle ${cameraViewMode === "robot" ? "active" : ""}`}
              aria-pressed={cameraViewMode === "robot"}
              onClick={() =>
                setCameraViewMode((mode) => (mode === "overhead" ? "robot" : "overhead"))
              }
            >
              <Camera size={15} />
              {cameraViewMode === "robot" ? "Robot cam" : "Overhead"}
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
        <GameScene state={game} viewMode={cameraViewMode} />
        {mapPinned ? (
          <div className="pinned-minimap" aria-label="Pinned minimap">
            <MiniMap state={game} compact />
          </div>
        ) : null}
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
                <span>Map, code, logs, and level tools</span>
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
              {mapPinned ? (
                <section className="tray-panel map-pin-note">
                  <div className="panel-heading">
                    <span>Minimap</span>
                    <small>Pinned</small>
                  </div>
                  <p>The minimap is pinned to the playfield so it stays visible with the command list.</p>
                </section>
              ) : (
                <MiniMap state={game} />
              )}
              <SensorPanel state={game} />
              <ScorePanel state={game} />
              <TrainingPanel state={game} />
              <CodePreview program={game.program} />
              <section className="tray-panel">
                <div className="panel-heading">
                  <span>Level Tools</span>
                  <small>Replay and level options</small>
                </div>
                <div className="tray-actions">
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
                    onClick={quitMission}
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
        <AiCopilot
          disabled={game.executionStatus === "running"}
          onAsk={askCopilot}
        />
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
            onLoadTrainingProgram={loadTrainingProgram}
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
      <MissionSummaryModal
        state={game}
        onContinue={newLevel}
        onQuit={quitMission}
      />
    </main>
  );
}
