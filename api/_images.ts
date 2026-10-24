// Validation of the images a route receives: 1 or 2, a supported media type, raw base64 of a
// sensible size. The client has already resized to 1,280 px (src/lib/image.ts).
import type { ImagePayload } from "../src/types.js";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// ~2 MB decoded. The client resizes to 1,280 px, so real payloads are far smaller.
const MAX_BASE64_CHARS = 2_800_000;

/** The validated images, or the message for a 400. */
export function parseImages(value: unknown): ImagePayload[] | string {
  const images = value;
  if (!Array.isArray(images) || images.length < 1 || images.length > 2) return "Send 1 or 2 images";
  for (const img of images) {
    if (!img || typeof img !== "object") return "Each image needs media_type and data";
    const { media_type, data } = img as ImagePayload;
    if (!MEDIA_TYPES.has(media_type)) return `Unsupported media_type ${String(media_type)}`;
    if (typeof data !== "string" || data.length === 0) return "Image data must be a base64 string";
    if (data.startsWith("data:")) return "Send raw base64 without the data: prefix";
    if (data.length > MAX_BASE64_CHARS) return "Image is too large; resize to 1,280 px first";
  }
  return images as ImagePayload[];
}
