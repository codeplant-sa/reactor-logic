import React, { useMemo } from "react";
import {
  collectConcepts,
  CONDITION_OPTIONS,
  programToPseudoCode
} from "../game/blocks";
import { ProgramBlock } from "../game/types";

interface CodePreviewProps {
  program: ProgramBlock[];
}

const conceptText: Record<string, string> = {
  condition: "Conditionals let the robot choose a command path from sensor data.",
  loop: "Loops reduce repeated commands. Step mode shows each loop pass.",
  procedure: "Procedures name a reusable routine so a long route can stay readable.",
  variable: "Variables store small values. Here, counter is a simple number."
};

export default function CodePreview({ program }: CodePreviewProps) {
  const code = useMemo(() => programToPseudoCode(program), [program]);
  const concepts = useMemo(() => collectConcepts(program), [program]);

  return (
    <section className="code-preview">
      <div className="panel-heading">
        <span>Python-like Preview</span>
        <small>Learning view</small>
      </div>
      <pre>{code}</pre>
      <div className="concept-note">
        <strong>Step mode</strong>
        <span>
          Use Step to watch one command or variable change at a time before running the full routine.
        </span>
      </div>
      {concepts.length > 0 ? (
        <div className="concept-stack">
          {concepts.map((concept) => (
            <p key={concept}>
              <strong>{concept}</strong>
              <span>{conceptText[concept]}</span>
            </p>
          ))}
        </div>
      ) : null}
      <details className="sensor-reference">
        <summary>Built-in reads</summary>
        <ul>
          <li>foam_remaining</li>
          <li>radiation_level</li>
          <li>hotspots_left</li>
          <li>actions_used</li>
          <li>wall_hits</li>
          {CONDITION_OPTIONS.map((option) => (
            <li key={option.type}>{option.label}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
