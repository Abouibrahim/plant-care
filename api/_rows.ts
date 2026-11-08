// The rows a route writes itself once Claude has answered (Phase 14, review 2.1): the questions row
// of an Ask, the planting_checks row of a check, the photos row of a diagnosis, each under the id the
// app made before the call. Until this phase the app alone wrote them after the reply, so a reply lost
// on mobile data lost the paid answer; now the app's own save meets the row (the unique id, 23505,
// read as saved; the photos row is an upsert on its id) or, after a lost reply, finds it by polling.
// Each write is bounded and never fails the paid call: a failure is logged, and the app's save covers it.
import type { SupabaseClient } from "@supabase/supabase-js";

/** A write that hangs this long is given up: the reply must not wait on it. */
export const ROW_TIMEOUT_MS = 5_000;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An ISO instant the row can carry: parseable, and not more than a year ahead (a camera's clock can run ahead of the server's; garbage cannot). */
export function isInstant(value: unknown, now: Date = new Date()): value is string {
  if (typeof value !== "string") return false;
  const ms = Date.parse(value);
  return !Number.isNaN(ms) && ms <= now.getTime() + 366 * 86_400_000;
}

/** Inserts one row; true when written or already there (23505), false when it could not be written. */
export async function storeRow(db: SupabaseClient, table: "questions" | "planting_checks" | "photos", row: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await db.from(table).insert(row).abortSignal(AbortSignal.timeout(ROW_TIMEOUT_MS));
    if (!error) return true;
    if (error.code === "23505") return true;
    throw error;
  } catch (err) {
    console.error(`${table} row not written by the route: ${(err as Error)?.message ?? String(err)}`);
    return false;
  }
}
