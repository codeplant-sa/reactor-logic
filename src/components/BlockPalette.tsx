import React, { useRef, useState } from "react";
import { blockDefinitions, paletteBlockTypes } from "../game/blocks";
import { ProgramBlock } from "../game/types";

interface BlockPaletteProps {
  onAddBlock: (block: ProgramBlock) => void;
}

export default function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const suppressClickAfterDrag = useRef(false);
  const hoveredDefinition = hoveredType ? blockDefinitions[hoveredType] : null;

  return (
    <section className="block-palette" aria-label="Control modules">
      <div className="palette-rail">
        {paletteBlockTypes.map((type) => {
          const definition = blockDefinitions[type];
          return (
            <button
              key={type}
              className={`palette-block ${definition.category}`}
              draggable
              type="button"
              title={`${definition.label}: ${definition.description}`}
              aria-label={definition.label}
              onMouseEnter={() => setHoveredType(type)}
              onMouseLeave={() => setHoveredType((current) => (current === type ? null : current))}
              onFocus={() => setHoveredType(type)}
              onBlur={() => setHoveredType((current) => (current === type ? null : current))}
              onClick={() => {
                if (suppressClickAfterDrag.current) {
                  return;
                }
                setHoveredType(null);
                onAddBlock(definition.createDefaultBlock());
              }}
              onDragStart={(event) => {
                suppressClickAfterDrag.current = true;
                setHoveredType(null);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(
                  "application/reactor-block",
                  JSON.stringify({ source: "palette", type })
                );
              }}
              onDragEnd={() => {
                window.setTimeout(() => {
                  suppressClickAfterDrag.current = false;
                }, 0);
              }}
            >
              <span className="block-icon">{definition.icon}</span>
            </button>
          );
        })}
      </div>
      {hoveredDefinition ? (
        <aside className={`module-popover ${hoveredDefinition.category}`}>
          <span className="module-popover-kicker">
            {hoveredDefinition.category}
          </span>
          <strong>{hoveredDefinition.label}</strong>
          <p>{hoveredDefinition.description}</p>
        </aside>
      ) : null}
    </section>
  );
}
