import React from "react";
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  Droplet,
  Move,
  Radiation,
  Target,
  Timer
} from "lucide-react";
import { GameState } from "../game/types";

interface HUDProps {
  state: GameState;
  controls?: React.ReactNode;
}

const StatusPill = ({ state }: { state: GameState }) => {
  const label =
    state.executionStatus === "success"
      ? "Mission complete"
      : state.executionStatus === "failed"
        ? "Mission failed"
        : state.executionStatus;

  return <span className={`status-pill ${state.executionStatus}`}>{label}</span>;
};

const Stat = ({
  icon,
  label,
  value,
  warning
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  warning?: boolean;
}) => (
  <div className={`hud-stat ${warning ? "warning" : ""}`}>
    <span className="hud-icon">{icon}</span>
    <span className="hud-label">{label}</span>
    <strong>{value}</strong>
  </div>
);

export default function HUD({ state, controls }: HUDProps) {
  const sealed = state.hotspots.filter((hotspot) => hotspot.sealed).length;

  return (
    <header className="top-hud">
      <div className="mission-title">
        <span>Reactor Logic: Foam Run</span>
        <StatusPill state={state} />
      </div>
      <div className="hud-grid">
        <Stat
          icon={<Timer size={16} />}
          label="Meltdown"
          value={state.meltdownTicks}
          warning={state.meltdownTicks <= 8}
        />
        <Stat
          icon={<Radiation size={16} />}
          label="Radiation"
          value={Math.round(state.plantRadiation)}
          warning={state.plantRadiation > state.maze.baseRadiation + 35}
        />
        <Stat
          icon={<Activity size={16} />}
          label="Reduced"
          value={Math.round(state.radiationReduced)}
        />
        <Stat icon={<Droplet size={16} />} label="Foam" value={state.foamCharges} />
        <Stat icon={<Move size={16} />} label="Actions" value={state.actionsUsed} />
        <Stat icon={<Box size={16} />} label="Blocks" value={state.blocksUsed} />
        <Stat
          icon={<AlertTriangle size={16} />}
          label="Wall hits"
          value={`${state.wallHits}/${state.wallHitLimit}`}
          warning={state.wallHits >= state.wallHitLimit - 1}
        />
        <Stat
          icon={sealed === state.hotspots.length ? <CheckCircle2 size={16} /> : <Target size={16} />}
          label="Hotspots"
          value={`${sealed}/${state.hotspots.length}`}
        />
      </div>
      {controls ? <div className="header-controls">{controls}</div> : null}
    </header>
  );
}
