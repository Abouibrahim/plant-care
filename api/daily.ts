// Cron at 05:00 UTC (06:00 Tunis): expands the care rules into tasks for the next 90 days.
// Phase 3 adds the push digest after the expansion. Only Vercel's cron secret opens this route.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runExpansion } from "./_tasks.js";
import { bearerToken, handleError, sendError, serviceClient } from "./_supabase.js";
import { isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret || bearerToken(req) !== secret) {
    sendError(res, 401, "Unauthorized");
    return;
  }
  try {
    const result = await runExpansion(serviceClient(), isoDateIn(SITE_TIME_ZONE));
    res.status(200).json({
      ok: true,
      phase: 2,
      today: result.today,
      plants: result.plants,
      tasks_created: result.created,
      tasks_removed: result.removed,
      pushes_sent: 0,
      note: "The push digest arrives in Phase 3",
    });
  } catch (err) {
    handleError(res, err);
  }
}
