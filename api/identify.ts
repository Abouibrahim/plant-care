// POST /api/identify  { images: [{ media_type, data }], site? }  ->  IdentifyResult + usage
import type { VercelRequest, VercelResponse } from "./_http.js";
import { callJson, imagesThenText, readPrompt, readSchema } from "./_claude.js";
import { parseImages } from "./_images.js";
import { handleError, sendError, verifyUser } from "./_supabase.js";
import type { IdentifyRequest, IdentifyResult } from "../src/types.js";

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
    const images = parseImages((req.body as IdentifyRequest | undefined)?.images);
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
