// POST /api/expand  { plant_id? }  ->  { plants, created, removed, expired, superseded, today }
// The same expansion as the cron, on demand: the app calls it after a plant is saved and from the
// Today screen, so new tasks do not wait for 06:00. The notes it writes follow the language chosen
// in Settings, like the 06:00 run's (Phase 14).
import type { VercelRequest, VercelResponse } from "./_http.js";
import { readStrings } from "./_lang.js";
import { runExpansion } from "./_tasks.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import type { ExpandRequest } from "../src/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const body = (req.body ?? {}) as ExpandRequest;
    const plantId = body.plant_id;
    if (plantId !== undefined && (typeof plantId !== "string" || !UUID.test(plantId))) {
      sendError(res, 400, "plant_id must be a UUID");
      return;
    }
    const db = serviceClient();
    const result = await runExpansion(db, isoDateIn(SITE_TIME_ZONE), plantId, await readStrings(db));
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err);
  }
}
