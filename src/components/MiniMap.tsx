import React from "react";
import { GripVertical } from "lucide-react";
import { positionKey, samePosition } from "../game/mazeGenerator";
import { GameState, Position } from "../game/types";

interface MiniMapProps {
  state: GameState;
  compact?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const hasPosition = (items: Position[], position: Position): boolean =>
  items.some((item) => samePosition(item, position));

export default function MiniMap({
  state,
  compact = false,
  dragHandleProps
}: MiniMapProps) {
  const trace = new Set(state.pathTrace.map(positionKey));
  const seedLabel = compact
    ? `L${state.level}`
    : `${state.maze.width} x ${state.maze.height}`;
  const {
    className: dragHandleClassName,
    title: dragHandleTitle,
    ...restDragHandleProps
  } = dragHandleProps ?? {};
  const minimapDragHandleClassName = [
    "minimap-drag-handle",
    dragHandleClassName
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={`minimap-panel ${compact ? "compact" : ""}`}
      aria-label="Mission minimap"
    >
      <div className="panel-heading minimap-heading">
        {dragHandleProps ? (
          <div
            {...restDragHandleProps}
            className={minimapDragHandleClassName}
            title={dragHandleTitle ?? "Drag minimap"}
          >
            <GripVertical size={15} aria-hidden />
            <span>Minimap</span>
          </div>
        ) : (
          <span>Minimap</span>
        )}
        <small>{seedLabel}</small>
      </div>
      {!compact ? (
        <div className="minimap-meta">
          <span>Level {state.level}</span>
          <span title={state.seed}>Seed {state.seed}</span>
        </div>
      ) : null}
      <div
        className="minimap"
        style={{
          gridTemplateColumns: `repeat(${state.maze.width}, 1fr)`,
          gridTemplateRows: `repeat(${state.maze.height}, 1fr)`
        }}
      >
        {state.maze.cells.flatMap((row) =>
          row.map((cell) => {
            const position = { x: cell.x, y: cell.y };
            const hotspot = state.hotspots.find((item) =>
              samePosition(item.position, position)
            );
            const classes = [
              "mini-cell",
              cell.wall ? "wall" : "floor",
              trace.has(positionKey(position)) ? "path" : "",
              samePosition(state.maze.extraction, position) ? "extraction" : "",
              hotspot ? (hotspot.sealed ? "sealed" : "hotspot") : "",
              samePosition(state.position, position) ? "robot" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={`${cell.x}-${cell.y}`} className={classes}>
                {samePosition(state.position, position) ? (
                  <span className={`mini-arrow ${state.facing}`}>^</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="minimap-legend">
        <span className="legend robot-dot">
          <span className="legend-marker" />
          <span className="legend-copy">
            <strong>Robot</strong>
            <small>heading</small>
          </span>
        </span>
        <span className="legend hotspot-dot">
          <span className="legend-marker" />
          <span className="legend-copy">
            <strong>Radiation</strong>
            <small>seal</small>
          </span>
        </span>
        <span className="legend sealed-dot">
          <span className="legend-marker" />
          <span className="legend-copy">
            <strong>Sealed</strong>
            <small>safe</small>
          </span>
        </span>
        <span className="legend exit-dot">
          <span className="legend-marker" />
          <span className="legend-copy">
            <strong>Extract</strong>
            <small>finish</small>
          </span>
        </span>
      </div>
    </section>
  );
}
