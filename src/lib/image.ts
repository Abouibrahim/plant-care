// Photo preparation in the browser: read EXIF GPS first (the resize strips it),
// then draw to a canvas at 1,280 px on the long edge and export JPEG at 0.85.
import exifr from "exifr";
import type { ImagePayload } from "../types";

export const MAX_EDGE = 1280;
export const JPEG_QUALITY = 0.85;

export interface Gps {
  lat: number;
  lng: number;
}

export interface PreparedImage {
  /** What /api/identify receives. */
  payload: ImagePayload;
  /** The resized JPEG, uploaded to Storage as is. */
  blob: Blob;
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
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const [gps, takenAt] = await Promise.all([readGps(file), readTakenAt(file)]);
  const bitmap = await loadBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed"))), "image/jpeg", JPEG_QUALITY);
  });
  const data = await blobToBase64(blob);

  return {
    payload: { media_type: "image/jpeg", data },
    blob,
    previewUrl: URL.createObjectURL(blob),
    width,
    height,
    gps,
    takenAt,
  };
}
