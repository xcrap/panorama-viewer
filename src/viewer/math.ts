export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;

export type Vec3 = [number, number, number];

/**
 * Camera state. Angles in radians.
 * `d` blends the projection: 0 = rectilinear (perspective), 1 = stereographic (little planet).
 * `fov` is the vertical field of view.
 */
export interface View {
  yaw: number;
  pitch: number;
  fov: number;
  d: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wrap an angle into [-π, π). */
export function wrapAngle(a: number) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutQuart = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/** Orthonormal camera basis for a yaw/pitch pair. Forward looks down -Z at yaw 0. */
export function basis(yaw: number, pitch: number) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const fwd: Vec3 = [sy * cp, sp, -cy * cp];
  const right: Vec3 = [cy, 0, sy];
  const up: Vec3 = [-sy * sp, cp, cy * sp];
  return { fwd, right, up };
}

/**
 * Screen-plane scale for a given vertical fov and projection blend.
 * Generalised perspective: projecting from a point `d` behind the sphere centre.
 */
export function projScale(fov: number, d: number) {
  const h = fov / 2;
  return Math.sin(h) / (d + Math.cos(h));
}

/** Inverse of projScale. */
export function fovFromScale(s: number, d: number) {
  const r = Math.sqrt(1 + s * s);
  return 2 * (Math.atan(s) + Math.asin(clamp((s * d) / r, -1, 1)));
}

/** Largest valid vertical fov for a projection blend. */
export const maxFovFor = (d: number) => 2 * Math.acos(-d) - 0.02;

/** Direction (unit vector) seen through normalised screen coords (x right, y up, both -1..1). */
export function screenToDir(view: View, aspect: number, x: number, y: number): Vec3 {
  const s = projScale(view.fov, view.d);
  const X = x * aspect * s;
  const Y = y * s;
  const D2 = X * X + Y * Y + 1;
  const d = view.d;
  const t = (d + Math.sqrt(Math.max(d * d - D2 * (d * d - 1), 0))) / D2;
  const cx = t * X;
  const cy = t * Y;
  const cz = d - t;
  const { fwd, right, up } = basis(view.yaw, view.pitch);
  const out: Vec3 = [
    cx * right[0] + cy * up[0] - cz * fwd[0],
    cx * right[1] + cy * up[1] - cz * fwd[1],
    cx * right[2] + cy * up[2] - cz * fwd[2],
  ];
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  return [out[0] / len, out[1] / len, out[2] / len];
}

export function dirToLonLat(d: Vec3) {
  return { lon: Math.atan2(d[0], -d[2]), lat: Math.asin(clamp(d[1], -1, 1)) };
}
