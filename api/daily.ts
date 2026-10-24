// Cron at 05:00 UTC (06:00 Tunis): expands the care rules into tasks for the next 90 days, closes ended
// windows and stale waterings, then sends the push digest, one notification per site. Only Vercel's
// cron secret opens this route.
// `?dry=1` composes the digest without sending it, for checks.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runExpansion } from "./_tasks.js";
import { composeDigest, loadDigestTasks, sendDigest, type SendResult } from "./_push.js";
import { bearerToken, ConfigError, handleError, sendError, serviceClient } from "./_supabase.js";
import { isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import type { DailyResponse } from "../src/types.js";

function flag(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}

/** web-push rejects a bad VAPID subject or key with a plain Error before any request goes out. */
function isVapidError(err: unknown): boolean {
  if (err instanceof ConfigError) return true;
  const e = err as { name?: string; statusCode?: number; message?: string };
  return e?.name === "Error" && e.statusCode === undefined && /vapid|subject|key/i.test(e.message ?? "");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret || bearerToken(req) !== secret) {
    sendError(res, 401, "Unauthorized");
    return;
  }
  try {
    const db = serviceClient();
    const today = isoDateIn(SITE_TIME_ZONE);
    const expansion = await runExpansion(db, today);
    const digest = composeDigest(await loadDigestTasks(db, today), today);
    const dryRun = flag(req.query.dry);

    let send: SendResult = { sent: 0, failed: 0, subscriptions: 0, dropped: 0 };
    let digestError: string | undefined;
    if (!dryRun) {
      try {
        send = await sendDigest(db, digest);
      } catch (err) {
        // A missing VAPID variable must not undo the expansion: the response reports it instead.
        if (!isVapidError(err)) throw err;
        digestError = (err as Error).message;
      }
    }

    const body: DailyResponse = {
      ok: true,
      today: expansion.today,
      plants: expansion.plants,
      created: expansion.created,
      removed: expansion.removed,
      expired: expansion.expired,
      superseded: expansion.superseded,
      tasks_created: expansion.created,
      tasks_removed: expansion.removed,
      pushes_sent: send.sent,
      pushes_failed: send.failed,
      subscriptions: send.subscriptions,
      subscriptions_dropped: send.dropped,
      digest,
      dry_run: dryRun,
    };
    if (digestError) body.digest_error = digestError;
    res.status(200).json(body);
  } catch (err) {
    handleError(res, err);
  }
}
