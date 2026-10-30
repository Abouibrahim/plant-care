// Photo preparation in the browser: read EXIF GPS first (the resize strips it), then draw to a
// canvas at 1,280 px on the long edge and export JPEG at 0.85, plus a 320 px copy for the tiles.
import exifr from "exifr";
import { t } from "../i18n";
import type { ImagePayload } from "../types";

export const MAX_EDGE = 1280;
export const JPEG_QUALITY = 0.85;
/** The thumbnail shown on tiles (84 px on a phone): 320 px on the long edge, about 15 KB. */
export const THUMB_EDGE = 320;
export const THUMB_QUALITY = 0.8;

export interface Gps {
  lat: number;
  lng: number;
}

export interface PreparedImage {
  /** What /api/identify receives. */
  payload: ImagePayload;
  /** The resized JPEG, uploaded to Storage as is. */
  blob: Blob;
  /** The thumbnail, uploaded beside it as `<path>.thumb.jpg`. */
  thumb: Blob;
  /** Object URL for the preview; revoke it when done. */
  previewUrl: string;
  width: number;
  height: number;
  gps: Gps | null;
  /** EXIF DateTimeOriginal as ISO, when present. */
  takenAt: string | null;
}

async function readGps(file: File): Promise<Gps | null> {
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // no EXIF or unreadable: fine
  }
  return null;
}

async function readTakenAt(file: File): Promise<string | null> {
  try {
    const exif = (await exifr.parse(file, { pick: ["DateTimeOriginal"] })) as { DateTimeOriginal?: unknown } | undefined;
    const d = exif?.DateTimeOriginal;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  } catch {
    // ignore
  }
  return null;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers: fall back to an <img>, which also applies EXIF orientation.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t.errors.readFailed));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Draws the source on a fresh canvas scaled to `maxEdge` on the long edge (never up). */
function drawScaled(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t.errors.canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t.errors.encode))), "image/jpeg", quality);
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const [gps, takenAt] = await Promise.all([readGps(file), readTakenAt(file)]);
  const bitmap = await loadBitmap(file);
  const canvas = drawScaled(bitmap, MAX_EDGE);
  if ("close" in bitmap) bitmap.close();
  // The thumbnail is drawn from the resized canvas, which is already in memory.
  const [blob, thumb] = await Promise.all([toJpeg(canvas, JPEG_QUALITY), toJpeg(drawScaled(canvas, THUMB_EDGE), THUMB_QUALITY)]);
  const data = await blobToBase64(blob);

  return {
    payload: { media_type: "image/jpeg", data },
    blob,
    thumb,
    previewUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    gps,
    takenAt,
  };
}
