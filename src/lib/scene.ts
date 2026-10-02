import { FULL_SPHERE, type Coverage } from "../viewer/camera";
import { DEG, TAU, clamp } from "../viewer/math";
import type { Mapping } from "../viewer/renderer";

export type SourceProjection = "equirect" | "cylinder";

/** Partial-sphere crop, as described by GPano XMP metadata (pixels of the full sphere). */
export interface Crop {
  fullW: number;
  fullH: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Scene {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  /** Original pixel size (the bitmap may be downscaled to fit the GPU). */
  width: number;
  height: number;
  thumb: string;
  projection: SourceProjection;
  /** Horizontal coverage in radians, used when cylindrical. */
  hfov: number;
  crop?: Crop;
  /** Compass heading (degrees) of the image centre, when known. */
  heading?: number;
  initial?: { yaw?: number; pitch?: number; fov?: number };
}

export const isEquirectAspect = (aspect: number) => aspect > 1.9 && aspect < 2.1;

/** A phone panorama covers roughly 80° per unit of aspect ratio. */
export const guessHfov = (aspect: number) => clamp(aspect * 80 * DEG, 60 * DEG, TAU);

const imageAspect = (s: Scene) => s.bitmap.width / s.bitmap.height;

export function coverageOf(s: Scene): Coverage {
  if (s.projection === "equirect") {
    const c = s.crop;
    if (!c) return FULL_SPHERE;
    return {
      lonMin: (c.left / c.fullW - 0.5) * TAU,
      lonMax: ((c.left + c.width) / c.fullW - 0.5) * TAU,
      latMax: (0.5 - c.top / c.fullH) * Math.PI,
      latMin: (0.5 - (c.top + c.height) / c.fullH) * Math.PI,
    };
  }
  const lat = Math.atan(s.hfov / (2 * imageAspect(s)));
  return { lonMin: -s.hfov / 2, lonMax: s.hfov / 2, latMin: -lat, latMax: lat };
}

export function mappingOf(s: Scene): Mapping {
  if (s.projection === "equirect") {
    const c = s.crop;
    if (!c) return { source: 0, map: [1, 0, 1, 0], cylV: 0, mask: [0, 0], wrap: true };
    const fullWidth = c.width >= c.fullW - 1;
    return {
      source: 0,
      map: [c.fullW / c.width, c.left / c.width, c.fullH / c.height, c.top / c.height],
      cylV: 0,
      mask: [fullWidth ? 0 : 1, c.height < c.fullH - 1 ? 1 : 0],
      wrap: fullWidth,
    };
  }
  const sx = TAU / s.hfov;
  const wrap = s.hfov >= TAU - 1e-3;
  return {
    source: 1,
    map: [sx, 0.5 * sx - 0.5, 1, 0],
    cylV: imageAspect(s) / s.hfov,
    mask: [wrap ? 0 : 1, 1],
    wrap,
  };
}

export function isFullTurn(s: Scene) {
  const c = coverageOf(s);
  return c.lonMax - c.lonMin >= TAU - 1e-3;
}

export function describe(s: Scene) {
  const size = `${s.width.toLocaleString("en-US")} × ${s.height.toLocaleString("en-US")}`;
  let kind: string;
  if (s.projection === "equirect") {
    const c = coverageOf(s);
    const lon = Math.round((c.lonMax - c.lonMin) / DEG);
    const lat = Math.round((c.latMax - c.latMin) / DEG);
    kind = lon >= 360 && lat >= 180 ? "360° sphere" : `${lon}° × ${lat}° partial sphere`;
  } else {
    kind = `${Math.round(s.hfov / DEG)}° panorama`;
  }
  return `${size} · ${kind}`;
}
