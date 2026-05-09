import React from "react";
import { Bot, CheckCircle2, Gauge, ShieldAlert } from "lucide-react";
import { ROBOTS } from "../game/robots";
import { RobotConfig } from "../game/types";

interface RobotSelectProps {
  onSelect: (robot: RobotConfig) => void;
}

export default function RobotSelect({ onSelect }: RobotSelectProps) {
  return (
    <section className="robot-select">
      <div className="panel-heading">
        <span>Choose Response Robot</span>
        <small>Each changes the mission budget</small>
      </div>
      <div className="robot-card-grid">
        {ROBOTS.map((robot) => (
          <article key={robot.id} className="robot-card">
            <div className="robot-card-header">
              <span className="robot-avatar" style={{ borderColor: robot.accent }}>
                <Bot size={24} color={robot.accent} />
              </span>
              <div>
                <h3>{robot.name}</h3>
                <p>{robot.description}</p>
              </div>
            </div>
            <dl className="robot-stats">
              <div>
                <dt>
                  <CheckCircle2 size={14} />
                  Strength
                </dt>
                <dd>{robot.strength}</dd>
              </div>
              <div>
                <dt>
                  <ShieldAlert size={14} />
                  Limitation
                </dt>
                <dd>{robot.limitation}</dd>
              </div>
              <div>
                <dt>
                  <Gauge size={14} />
                  Costs
                </dt>
                <dd>
                  Move {robot.moveCost}, turn {robot.turnCost}, foam {robot.deployCost}
                </dd>
              </div>
            </dl>
            <button type="button" onClick={() => onSelect(robot)}>
              Deploy {robot.callSign}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
