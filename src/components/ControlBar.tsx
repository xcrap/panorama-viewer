import type { Scene, SourceProjection } from "../lib/scene";
import type { CameraMode } from "../viewer/camera";
import { DEG } from "../viewer/math";
import { OrbitIcon, RecentreIcon } from "./Icons";

interface Props {
  scene: Scene;
  mode: CameraMode;
  planetAvailable: boolean;
  autoRotate: boolean;
  onMode: (mode: CameraMode) => void;
  onScene: (patch: Partial<Pick<Scene, "projection" | "hfov">>) => void;
  onAutoRotate: (on: boolean) => void;
  onRecentre: () => void;
}

export function ControlBar({
  scene,
  mode,
  planetAvailable,
  autoRotate,
  onMode,
  onScene,
  onAutoRotate,
  onRecentre,
}: Props) {
  const hfovDeg = Math.round(scene.hfov / DEG);
  const setProjection = (projection: SourceProjection) => {
    if (scene.projection !== projection) onScene({ projection });
  };

  return (
    <div className="controls" role="toolbar" aria-label="View controls">
      <div className="segmented" role="radiogroup" aria-label="Projection">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "perspective"}
          onClick={() => onMode("perspective")}
          title="Perspective (P)"
        >
          Perspective
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "planet"}
          disabled={!planetAvailable}
          onClick={() => onMode("planet")}
          title={planetAvailable ? "Little planet (P)" : "Little planet needs a full 360° image"}
        >
          Little planet
        </button>
      </div>

      <span className="controls__sep" aria-hidden="true" />

      <div className="controls__image">
        <div className="segmented" role="radiogroup" aria-label="Image type">
          <button
            type="button"
            role="radio"
            aria-checked={scene.projection === "equirect"}
            onClick={() => setProjection("equirect")}
            title="360° × 180° sphere (equirectangular)"
          >
            Sphere
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scene.projection === "cylinder"}
            onClick={() => setProjection("cylinder")}
            title="Cylindrical panorama"
          >
            Panorama
          </button>
        </div>
        {scene.projection === "cylinder" && (
          <label className="coverage" title="How far around the panorama reaches">
            <input
              type="range"
              min={60}
              max={360}
              step={1}
              value={hfovDeg}
              onChange={(e) => onScene({ hfov: Number(e.target.value) * DEG })}
              aria-label="Horizontal coverage in degrees"
            />
            <output className="coverage__value">{hfovDeg}°</output>
          </label>
        )}
      </div>

      <span className="controls__sep" aria-hidden="true" />

      <div className="controls__tools">
        <button
          type="button"
          className="icon-btn"
          onClick={onRecentre}
          title="Recentre (0)"
          aria-label="Recentre view"
        >
          <RecentreIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={autoRotate}
          onClick={() => onAutoRotate(!autoRotate)}
          title="Auto-rotate (Space)"
          aria-label="Auto-rotate"
        >
          <OrbitIcon />
        </button>
      </div>
    </div>
  );
}
