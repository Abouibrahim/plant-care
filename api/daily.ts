// Cron at 05:00 UTC (06:00 Tunis). Phase 1 only checks the secret so the cron entry is valid;
// task expansion and the push digest arrive in Phase 2 (reminder engine in CLAUDE.md).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearerToken, sendError } from "./_supabase";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret || bearerToken(req) !== secret) {
    sendError(res, 401, "Unauthorized");
    return;
  }
  res.status(200).json({
    ok: true,
    phase: 1,
    tasks_created: 0,
    pushes_sent: 0,
    note: "Task expansion and the digest arrive in Phase 2",
  });
}
