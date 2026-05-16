import React from "react";

interface MissionBriefingProps {
  compact?: boolean;
}

export default function MissionBriefing({ compact = false }: MissionBriefingProps) {
  return (
    <section className={compact ? "briefing compact" : "briefing"}>
      <div className="panel-heading">
        <span>Kuroshio Coastal Research Reactor</span>
        <small>Emergency containment mode</small>
      </div>
      <p>
        This simulation is inspired by the reactor emergency at Fukushima, where
        radiation and structural damage made direct human access impossible.
        Remote robots must navigate service corridors, locate radioactive leaks,
        stabilize damaged systems, and prevent the crisis from spreading.
      </p>
      {!compact ? (
        <p>
          You are not a trained nuclear operator. You are a gamer selected for
          the mission because your exceptional control skills, pattern reading,
          and split-second routing decisions give the robot its best chance of
          reaching the shutdown points.
        </p>
      ) : null}
    </section>
  );
}
