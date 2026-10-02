import { DEG } from "../viewer/math";
import { readGPano } from "./gpano";
import { guessHfov, isEquirectAspect, type Crop, type Scene } from "./scene";

export interface TextureBudget {
  maxSide: number;
  maxPixels: number;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif|tiff?)$/i;

export const isImageFile = (f: File) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name);

export function textureBudget(maxTextureSize: number): TextureBudget {
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return {
    maxSide: Math.min(maxTextureSize, 16384),
    maxPixels: coarse ? 16e6 : 40e6,
  };
}

/** Downscale so the GPU can hold it, keeping aspect ratio. */
export async function fitBitmap(bitmap: ImageBitmap, budget: TextureBudget) {
  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, budget.maxSide / Math.max(w, h), Math.sqrt(budget.maxPixels / (w * h)));
  if (scale > 0.999) return bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return createImageBitmap(canvas);
}

export function makeThumb(source: CanvasImageSource & { width: number; height: number }, width = 320) {
  const aspect = source.width / source.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(40, Math.min(240, Math.round(width / aspect)));
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled";

export async function sceneFromFile(file: File, budget: TextureBudget): Promise<Scene> {
  if (!isImageFile(file)) throw new Error(`“${file.name}” isn’t an image.`);

  let decoded: ImageBitmap;
  const gpanoPromise = readGPano(file);
  try {
    decoded = await createImageBitmap(file);
  } catch {
    throw new Error(`Couldn’t decode “${file.name}”. Try JPEG, PNG, WebP or AVIF.`);
  }
  const gpano = await gpanoPromise;
  const width = decoded.width;
  const height = decoded.height;
  const bitmap = await fitBitmap(decoded, budget);
  const aspect = width / height;

  let crop: Crop | undefined;
  const markedSphere = gpano?.projection === "equirectangular";
  if (markedSphere && gpano.fullW && gpano.fullH) {
    const cw = gpano.cropW ?? width;
    const ch = gpano.cropH ?? height;
    const partial = cw < gpano.fullW - 1 || ch < gpano.fullH - 1;
    if (partial) {
      crop = {
        fullW: gpano.fullW,
        fullH: gpano.fullH,
        left: gpano.left ?? (gpano.fullW - cw) / 2,
        top: gpano.top ?? (gpano.fullH - ch) / 2,
        width: cw,
        height: ch,
      };
    }
  }

  const projection = markedSphere || isEquirectAspect(aspect) ? "equirect" : "cylinder";
  const initial: Scene["initial"] = {};
  if (gpano?.initialHeading != null) initial.yaw = (gpano.initialHeading - (gpano.heading ?? 0)) * DEG;
  if (gpano?.initialPitch != null) initial.pitch = gpano.initialPitch * DEG;

  return {
    id: crypto.randomUUID(),
    name: baseName(file.name),
    bitmap,
    width,
    height,
    thumb: makeThumb(bitmap),
    projection,
    hfov: guessHfov(aspect),
    crop,
    heading: gpano?.heading,
    initial,
  };
}
