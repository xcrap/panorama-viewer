import {
  DEG,
  HALF_PI,
  TAU,
  clamp,
  dirToLonLat,
  easeInOutQuart,
  easeOutExpo,
  fovFromScale,
  lerp,
  maxFovFor,
  projScale,
  screenToDir,
  wrapAngle,
  type View,
} from "./math";

export type CameraMode = "perspective" | "planet";

/** Angular extent of the loaded image, relative to the image centre. Radians. */
export interface Coverage {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export const FULL_SPHERE: Coverage = {
  lonMin: -Math.PI,
  lonMax: Math.PI,
  latMin: -HALF_PI,
  latMax: HALF_PI,
};

interface Limits {
  fovMin: number;
  fovMax: number;
  pitchMin: number;
  pitchMax: number;
  yawMin: number;
  yawMax: number;
  wrap: boolean;
}

interface Anim {
  from: View;
  to: View;
  start: number;
  dur: number;
  kind: "mode" | "move";
  ease: (t: number) => number;
  s0: number;
  s1: number;
}

const PERSPECTIVE_FOV = 75 * DEG;
const PLANET_FOV = 250 * DEG;
const AUTO_SPEED = { perspective: 0.055, planet: 0.09 };

const reducedMotion =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Owns the view state: dragging, inertia, smooth zoom, limits and animated transitions.
 * The render loop calls `tick()` once per frame; HUD pieces subscribe to frame updates.
 */
export class Camera {
  view: View = { yaw: 0, pitch: 0, fov: PERSPECTIVE_FOV, d: 0 };
  mode: CameraMode = "perspective";
  autoRotate = !reducedMotion;
  interacted = false;
  coverage: Coverage = FULL_SPHERE;
  /** Degrees added to yaw when displaying a compass heading. */
  headingOffset = 0;
  width = 1;
  height = 1;
  dragging = false;

  private anim: Anim | null = null;
  private vel = { yaw: 0, pitch: 0 };
  private fovTarget: number | null = null;
  private anchor: [number, number] | null = null;
  private samples: { t: number; yaw: number; pitch: number }[] = [];
  private autoDir = 1;
  private lastPerspective = { pitch: 0, fov: PERSPECTIVE_FOV };
  private dirty = true;
  private frameListeners = new Set<() => void>();
  private stateListeners = new Set<() => void>();

  get aspect() {
    return this.width / this.height;
  }

  /** True while the user is actively moving the view (for transient HUD bits). */
  get busy() {
    return (
      this.dragging ||
      this.fovTarget !== null ||
      Math.abs(this.vel.yaw) + Math.abs(this.vel.pitch) > 0.05
    );
  }

  get wraps() {
    return this.coverage.lonMax - this.coverage.lonMin >= TAU - 1e-3;
  }

  // ── subscriptions ────────────────────────────────────────────────

  onFrame = (fn: () => void) => {
    this.frameListeners.add(fn);
    return () => void this.frameListeners.delete(fn);
  };

  onState = (fn: () => void) => {
    this.stateListeners.add(fn);
    return () => void this.stateListeners.delete(fn);
  };

  private emitState() {
    for (const fn of this.stateListeners) fn();
  }

  // ── configuration ───────────────────────────────────────────────

  setViewport(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.clampView();
    this.dirty = true;
  }

  setCoverage(coverage: Coverage) {
    this.coverage = coverage;
    this.clampView();
    this.dirty = true;
  }

  setAutoRotate(on: boolean) {
    if (this.autoRotate === on) return;
    this.autoRotate = on;
    this.emitState();
  }

  /** Jump to an initial view for a freshly loaded image, with a short "lens settle". */
  reset(initial?: { yaw?: number; pitch?: number; fov?: number }, entrance = true) {
    this.anim = null;
    this.vel = { yaw: 0, pitch: 0 };
    this.fovTarget = null;
    this.anchor = null;
    const planet = this.mode === "planet";
    this.view = planet
      ? { yaw: initial?.yaw ?? 0, pitch: -HALF_PI, fov: PLANET_FOV, d: 1 }
      : {
          yaw: initial?.yaw ?? 0,
          pitch: initial?.pitch ?? 0,
          fov: initial?.fov ?? PERSPECTIVE_FOV,
          d: 0,
        };
    this.lastPerspective = { pitch: 0, fov: PERSPECTIVE_FOV };
    this.clampView();
    this.dirty = true;
    if (!entrance || reducedMotion) return;

    const settled = { ...this.view };
    const atMax = settled.fov >= this.limitsFor(settled.fov, this.mode).fovMax - 1e-3;
    const factor = planet ? 1.9 : atMax ? 0.84 : 1.22;
    const fromFov = Math.min(
      fovFromScale(projScale(settled.fov, settled.d) * factor, settled.d),
      maxFovFor(settled.d),
    );
    const from = { ...settled, fov: fromFov, yaw: settled.yaw + (planet ? -0.9 : 0) };
    this.startAnim(from, settled, planet ? 1500 : 1100, "move", easeOutExpo);
  }

  // ── user input ──────────────────────────────────────────────────

  private markInteracted() {
    if (this.interacted && !this.autoRotate) return;
    this.interacted = true;
    this.autoRotate = false;
    this.emitState();
  }

  private get transitioning() {
    return this.anim?.kind === "mode";
  }

  beginDrag() {
    this.markInteracted();
    this.dragging = true;
    this.vel = { yaw: 0, pitch: 0 };
    if (!this.transitioning) this.anim = null;
    this.samples = [];
    this.record();
  }

  /** Drag from (x0,y0) to (x1,y1), CSS pixels relative to the viewport. */
  dragBy(x0: number, y0: number, x1: number, y1: number) {
    if (this.transitioning) return;
    this.anim = null;
    if (this.mode === "planet") {
      // Spin the planet around the screen centre, following the pointer.
      const cx = this.width / 2;
      const cy = this.height / 2;
      if (Math.hypot(x1 - cx, y1 - cy) < 14) return;
      const a0 = Math.atan2(cy - y0, x0 - cx);
      const a1 = Math.atan2(cy - y1, x1 - cx);
      this.view.yaw += wrapAngle(a1 - a0);
    } else {
      const k = (2 * (1 + this.view.d) * projScale(this.view.fov, this.view.d)) / this.height;
      this.view.yaw -= (x1 - x0) * k;
      this.view.pitch += (y1 - y0) * k;
    }
    this.clampView();
    this.record();
    this.dirty = true;
  }

  endDrag() {
    this.dragging = false;
    this.dirty = true;
    const now = performance.now();
    const recent = this.samples.filter((s) => now - s.t < 90);
    const a = recent[0];
    const b = recent[recent.length - 1];
    if (a && b && b !== a && now - b.t < 50) {
      const dt = (b.t - a.t) / 1000;
      if (dt > 0.008) {
        const cap = 5;
        this.vel.yaw = clamp(wrapAngle(b.yaw - a.yaw) / dt, -cap, cap);
        this.vel.pitch = clamp((b.pitch - a.pitch) / dt, -cap, cap);
      }
    }
    this.samples = [];
  }

  private record() {
    this.samples.push({ t: performance.now(), yaw: this.view.yaw, pitch: this.view.pitch });
    if (this.samples.length > 12) this.samples.shift();
  }

  /** Zoom by a factor of the projection scale (>1 zooms out). Anchor in NDC keeps that point fixed. */
  zoomBy(factor: number, anchor?: [number, number]) {
    if (this.transitioning) return;
    this.markInteracted();
    if (this.anim) this.anim = null;
    const L = this.limits();
    const base = this.fovTarget ?? this.view.fov;
    const target = fovFromScale(projScale(base, this.view.d) * factor, this.view.d);
    this.fovTarget = clamp(target, L.fovMin, Math.min(L.fovMax, maxFovFor(this.view.d)));
    this.anchor = anchor ?? null;
  }

  /** Immediate zoom used by pinch gestures. */
  pinch(startFov: number, ratio: number) {
    if (this.transitioning) return;
    const L = this.limits();
    const fov = fovFromScale(projScale(startFov, this.view.d) * ratio, this.view.d);
    this.view.fov = clamp(fov, L.fovMin, Math.min(L.fovMax, maxFovFor(this.view.d)));
    this.fovTarget = null;
    this.clampView();
    this.dirty = true;
  }

  /** Keyboard impulse, in rad/s. */
  nudge(dYaw: number, dPitch: number) {
    if (this.transitioning) return;
    this.markInteracted();
    this.anim = null;
    this.vel.yaw = clamp(this.vel.yaw + dYaw, -2.2, 2.2);
    this.vel.pitch = clamp(this.vel.pitch + dPitch, -2.2, 2.2);
  }

  /** Double-click: centre on a point and move closer. In planet mode, step back down to the ground. */
  focusAt(nx: number, ny: number) {
    if (this.transitioning) return;
    const { lon, lat } = dirToLonLat(screenToDir(this.view, this.aspect, nx, ny));
    if (this.mode === "planet") {
      this.markInteracted();
      this.setMode("perspective", { yaw: lon, pitch: 0 });
      return;
    }
    const fov = fovFromScale(projScale(this.view.fov, 0) * 0.6, 0);
    this.lookAt(lon, lat, fov, 750);
  }

  lookAt(yaw: number, pitch: number, fov = this.view.fov, dur = 600) {
    if (this.transitioning) return;
    this.markInteracted();
    this.vel = { yaw: 0, pitch: 0 };
    this.fovTarget = null;
    const to = this.clampTarget({ yaw, pitch, fov, d: this.view.d });
    if (this.wraps) to.yaw = this.view.yaw + wrapAngle(to.yaw - this.view.yaw);
    this.startAnim({ ...this.view }, to, reducedMotion ? 1 : dur, "move", easeInOutQuart);
  }

  /** Immediate jump (minimap scrubbing). */
  jumpTo(yaw: number, pitch: number) {
    if (this.transitioning) return;
    this.markInteracted();
    this.anim = null;
    this.vel = { yaw: 0, pitch: 0 };
    this.view.yaw = this.wraps ? this.view.yaw + wrapAngle(yaw - this.view.yaw) : yaw;
    this.view.pitch = pitch;
    this.clampView();
    this.dirty = true;
  }

  setMode(mode: CameraMode, look?: { yaw?: number; pitch?: number }) {
    if (mode === this.mode && !look) return;
    const prev = this.mode;
    this.mode = mode;
    this.emitState();
    this.vel = { yaw: 0, pitch: 0 };
    this.fovTarget = null;
    const from = { ...this.view };
    let to: View;
    if (mode === "planet") {
      if (prev === "perspective") this.lastPerspective = { pitch: from.pitch, fov: from.fov };
      to = { yaw: from.yaw, pitch: -HALF_PI, fov: PLANET_FOV, d: 1 };
    } else {
      to = this.clampTarget({
        yaw: look?.yaw ?? from.yaw,
        pitch: look?.pitch ?? this.lastPerspective.pitch,
        fov: this.lastPerspective.fov,
        d: 0,
      });
    }
    to.yaw = from.yaw + wrapAngle(to.yaw - from.yaw);
    this.startAnim(from, to, reducedMotion ? 1 : 1300, "mode", easeInOutQuart);
  }

  // ── frame update ────────────────────────────────────────────────

  private startAnim(from: View, to: View, dur: number, kind: Anim["kind"], ease: Anim["ease"]) {
    this.view = { ...from };
    this.anim = {
      from,
      to,
      start: performance.now(),
      dur,
      kind,
      ease,
      s0: Math.log(projScale(from.fov, from.d)),
      s1: Math.log(projScale(to.fov, to.d)),
    };
    this.dirty = true;
  }

  tick(dt: number, now: number): boolean {
    let changed = this.dirty;
    this.dirty = false;
    const v = this.view;

    if (this.anim) {
      const a = this.anim;
      const t = clamp((now - a.start) / a.dur, 0, 1);
      const e = a.ease(t);
      v.yaw = lerp(a.from.yaw, a.to.yaw, e);
      v.pitch = lerp(a.from.pitch, a.to.pitch, e);
      v.d = lerp(a.from.d, a.to.d, e);
      v.fov = fovFromScale(Math.exp(lerp(a.s0, a.s1, e)), v.d);
      if (t >= 1) {
        this.view = { ...a.to };
        this.anim = null;
        this.clampView();
      }
      changed = true;
    } else {
      if (!this.dragging) {
        const speed = Math.abs(this.vel.yaw) + Math.abs(this.vel.pitch);
        if (speed > 1e-3) {
          v.yaw += this.vel.yaw * dt;
          v.pitch += this.vel.pitch * dt;
          const k = Math.exp(-4.2 * dt);
          this.vel.yaw *= k;
          this.vel.pitch *= k;
          changed = true;
        } else {
          this.vel.yaw = this.vel.pitch = 0;
        }
        if (this.autoRotate) {
          v.yaw += this.autoDir * AUTO_SPEED[this.mode] * dt;
          changed = true;
        }
      }

      if (this.fovTarget !== null) {
        const anchor = this.anchor && v.d < 0.5 ? this.anchor : null;
        const before = anchor ? screenToDir(v, this.aspect, anchor[0], anchor[1]) : null;
        const s = Math.log(projScale(v.fov, v.d));
        const st = Math.log(projScale(this.fovTarget, v.d));
        if (Math.abs(st - s) < 1e-4) {
          v.fov = this.fovTarget;
          this.fovTarget = null;
        } else {
          v.fov = fovFromScale(Math.exp(lerp(s, st, 1 - Math.exp(-dt * 16))), v.d);
        }
        if (before && anchor) {
          const A = dirToLonLat(before);
          const B = dirToLonLat(screenToDir(v, this.aspect, anchor[0], anchor[1]));
          v.yaw += wrapAngle(A.lon - B.lon);
          v.pitch += A.lat - B.lat;
        }
        changed = true;
      }

      if (changed) {
        const L = this.clampView();
        if (L && !L.wrap && this.autoRotate) {
          if (v.yaw >= L.yawMax - 1e-4) this.autoDir = -1;
          else if (v.yaw <= L.yawMin + 1e-4) this.autoDir = 1;
        }
        if (L && (v.pitch <= L.pitchMin || v.pitch >= L.pitchMax)) this.vel.pitch = 0;
      }
      if (this.wraps) this.view.yaw = wrapAngle(this.view.yaw);
    }

    if (changed) for (const fn of this.frameListeners) fn();
    return changed;
  }

  // ── limits ──────────────────────────────────────────────────────

  limits() {
    return this.limitsFor(this.view.fov, this.mode);
  }

  private limitsFor(fov: number, mode: CameraMode): Limits {
    const c = this.coverage;
    const lonSpan = c.lonMax - c.lonMin;
    const latSpan = c.latMax - c.latMin;
    const wrap = lonSpan >= TAU - 1e-3;

    if (mode === "planet") {
      return {
        fovMin: 140 * DEG,
        fovMax: 320 * DEG,
        pitchMin: -HALF_PI,
        pitchMax: -HALF_PI,
        yawMin: -Infinity,
        yawMax: Infinity,
        wrap: true,
      };
    }

    const fullLat = c.latMin <= -HALF_PI + 1e-3 && c.latMax >= HALF_PI - 1e-3;
    let fovMax = 115 * DEG;
    if (!fullLat) fovMax = Math.min(fovMax, latSpan);
    if (!wrap && lonSpan / 2 < HALF_PI - 0.01) {
      fovMax = Math.min(fovMax, 2 * Math.atan(Math.tan(lonSpan / 2) / this.aspect));
    }
    const fovMin = Math.min(10 * DEG, fovMax);
    const h = clamp(fov, fovMin, fovMax) / 2;

    let pitchMin = -HALF_PI;
    let pitchMax = HALF_PI;
    if (!fullLat) {
      pitchMin = c.latMin + h;
      pitchMax = c.latMax - h;
      if (pitchMin > pitchMax) pitchMin = pitchMax = (c.latMin + c.latMax) / 2;
    }

    let yawMin = -Infinity;
    let yawMax = Infinity;
    if (!wrap) {
      const hh = Math.atan(this.aspect * Math.tan(h));
      yawMin = c.lonMin + hh;
      yawMax = c.lonMax - hh;
      if (yawMin > yawMax) yawMin = yawMax = (c.lonMin + c.lonMax) / 2;
    }

    return { fovMin, fovMax, pitchMin, pitchMax, yawMin, yawMax, wrap };
  }

  private clampTarget(view: View): View {
    const L = this.limitsFor(view.fov, view.d > 0.5 ? "planet" : "perspective");
    const fov = clamp(view.fov, L.fovMin, L.fovMax);
    return {
      yaw: L.wrap ? view.yaw : clamp(view.yaw, L.yawMin, L.yawMax),
      pitch: clamp(view.pitch, L.pitchMin, L.pitchMax),
      fov,
      d: view.d,
    };
  }

  private clampView(): Limits | null {
    if (this.anim) return null;
    const L = this.limits();
    const v = this.view;
    v.fov = clamp(v.fov, L.fovMin, L.fovMax);
    if (this.fovTarget !== null) this.fovTarget = clamp(this.fovTarget, L.fovMin, L.fovMax);
    const L2 = this.limits();
    v.pitch = clamp(v.pitch, L2.pitchMin, L2.pitchMax);
    if (!L2.wrap) v.yaw = clamp(v.yaw, L2.yawMin, L2.yawMax);
    return L2;
  }
}
