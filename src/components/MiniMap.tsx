import React from "react";
import { positionKey, samePosition } from "../game/mazeGenerator";
import { GameState, Position } from "../game/types";

interface MiniMapProps {
  state: GameState;
}

const hasPosition = (items: Position[], position: Position): boolean =>
  items.some((item) => samePosition(item, position));

export default function MiniMap({ state }: MiniMapProps) {
  const trace = new Set(state.pathTrace.map(positionKey));

  return (
    <section className="minimap-panel" aria-label="Mission minimap">
      <div className="panel-heading">
        <span>Minimap</span>
        <small>Seed {state.seed}</small>
      </div>
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
        <span className="legend robot-dot">Robot</span>
        <span className="legend hotspot-dot">Hotspot</span>
        <span className="legend sealed-dot">Sealed</span>
        <span className="legend exit-dot">Exit</span>
      </div>
    </section>
  );
}
