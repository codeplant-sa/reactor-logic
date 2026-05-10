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
        A severe coastal systems failure has locked down a fictional service maze.
        Human teams cannot enter, so a response robot must seal glowing hotspots
        with fictional stabilizing foam and reach the extraction hatch before the
        meltdown timer reaches zero.
      </p>
      {!compact ? (
        <p>
          The opening training levels use fixed mazes and reference solutions:
          sequence first, then conditions and loops, then procedures and while
          logic. Debug safely with Step mode.
        </p>
      ) : null}
    </section>
  );
}
