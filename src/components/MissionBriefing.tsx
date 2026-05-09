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
          The lesson is logic: sequence commands, use sensor conditions, compress
          repeated movement with loops, and debug safely with Step mode.
        </p>
      ) : null}
    </section>
  );
}
