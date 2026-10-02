/**
 * Minimal reader for Google Photo Sphere (GPano) XMP metadata.
 * Cameras and phones embed it in JPEGs to mark 360° / partial spheres.
 */
export interface GPano {
  projection?: string;
  fullW?: number;
  fullH?: number;
  cropW?: number;
  cropH?: number;
  left?: number;
  top?: number;
  heading?: number;
  initialHeading?: number;
  initialPitch?: number;
  initialFov?: number;
}

export async function readGPano(file: Blob): Promise<GPano | null> {
  let head: string;
  try {
    head = await file.slice(0, 1024 * 1024).text();
  } catch {
    return null;
  }
  if (!head.includes("GPano")) return null;

  const get = (name: string) => {
    const attr = head.match(new RegExp(`GPano:${name}\\s*=\\s*["']([^"']*)["']`));
    if (attr) return attr[1];
    const el = head.match(new RegExp(`<GPano:${name}>([^<]*)</GPano:${name}>`));
    return el?.[1];
  };
  const num = (name: string) => {
    const v = get(name);
    if (v == null) return undefined;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    projection: get("ProjectionType")?.trim().toLowerCase(),
    fullW: num("FullPanoWidthPixels"),
    fullH: num("FullPanoHeightPixels"),
    cropW: num("CroppedAreaImageWidthPixels"),
    cropH: num("CroppedAreaImageHeightPixels"),
    left: num("CroppedAreaLeftPixels"),
    top: num("CroppedAreaTopPixels"),
    heading: num("PoseHeadingDegrees"),
    initialHeading: num("InitialViewHeadingDegrees"),
    initialPitch: num("InitialViewPitchDegrees"),
    initialFov: num("InitialHorizontalFOVDegrees"),
  };
}
