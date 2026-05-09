import React from "react";

interface PreloaderProps {
  loaded: number;
  total: number;
  label: string;
  ready: boolean;
  error?: string;
  onEnter: () => void;
  repoLink?: React.ReactNode;
}

export default function Preloader({
  loaded,
  total,
  label,
  ready,
  error,
  onEnter,
  repoLink
}: PreloaderProps) {
  const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <main className="preloader-screen" aria-live="polite">
      {repoLink}
      <div className="preloader-grid" aria-hidden>
        <span className="preload-scanline" />
        <span className="preload-path one" />
        <span className="preload-path two" />
        <span className="preload-hotspot alpha" />
        <span className="preload-hotspot beta" />
        <span className="preload-robot" />
        <span className="preload-foam" />
      </div>
      <section className="preloader-panel">
        <div className="preloader-kicker">Emergency containment simulation</div>
        <h1>Reactor Logic</h1>
        <p>
          Kuroshio Coastal Research Reactor is sealed in emergency mode. A
          response robot is staging outside the service maze.
        </p>
        <p>
          Load the control modules, seal fictional radiation hotspots with
          stabilizing foam, then route the robot to extraction.
        </p>
        <div className="preloader-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="preloader-status">
          <span>{error ? "Asset check needs attention" : ready ? "Assets ready" : label}</span>
          <strong>{progress}%</strong>
        </div>
        {error ? <p className="preloader-error">{error}</p> : null}
        <button type="button" disabled={!ready} onClick={onEnter}>
          Begin briefing
        </button>
      </section>
    </main>
  );
}
