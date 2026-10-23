// POST /api/identify  { images: [{ media_type, data }], site? }  ->  IdentifyResult + usage
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callJson, imagesThenText, readPrompt, readSchema } from "./_claude.js";
import { handleError, sendError, verifyUser } from "./_supabase.js";
import type { IdentifyRequest, IdentifyResult, ImagePayload } from "../src/types.js";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// ~2 MB decoded. The client resizes to 1,280 px, so real payloads are far smaller.
const MAX_BASE64_CHARS = 2_800_000;

function parseImages(body: unknown): ImagePayload[] | string {
  const images = (body as IdentifyRequest | undefined)?.images;
  if (!Array.isArray(images) || images.length < 1 || images.length > 2) return "Send 1 or 2 images";
  for (const img of images) {
    if (!img || typeof img !== "object") return "Each image needs media_type and data";
    const { media_type, data } = img as ImagePayload;
    if (!MEDIA_TYPES.has(media_type)) return `Unsupported media_type ${String(media_type)}`;
    if (typeof data !== "string" || data.length === 0) return "Image data must be a base64 string";
    if (data.startsWith("data:")) return "Send raw base64 without the data: prefix";
    if (data.length > MAX_BASE64_CHARS) return "Image is too large; resize to 1,280 px first";
  }
  return images;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // The bearer check comes first: any request without a valid token is a 401, whatever the method.
    const user = await verifyUser(req);
    if (!user) {
      sendError(res, 401, "Unauthorized");
      return;
    }
    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }
    const images = parseImages(req.body);
    if (typeof images === "string") {
      sendError(res, 400, images);
      return;
    }
    const site = (req.body as IdentifyRequest).site;
    const where = site === "farm" ? "at the farm" : site === "backyard" ? "in the backyard" : "at one of the two sites";
    const text =
      images.length === 2
        ? `Identify this plant, photographed ${where}. The two images show the same plant.`
        : `Identify this plant, photographed ${where}.`;

    const result = await callJson<IdentifyResult>({
      rules: readPrompt("identify.md"),
      schema: readSchema("identify.schema.json"),
      content: imagesThenText(images, text),
      maxTokens: 2048,
      // Identification is perception, not planning: low effort keeps thinking short so the
      // 2,048-token budget is for the JSON (see docs/DECISIONS.md).
      effort: "low",
    });

    if (!result.ok) {
      res.status(200).json({ refusal: result.refusal, ...result.usage });
      return;
    }
    res.status(200).json({ ...result.data, ...result.usage });
  } catch (err) {
    handleError(res, err);
  }
}
