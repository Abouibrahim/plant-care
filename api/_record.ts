// The morning run's record (review 2.3): what /api/daily did, written to the settings row
// `daily:last` as soon as the run's data is final (before the pushes, whose counts follow in a
// second write that keeps `at`), so Today can tell that a run came after its read and Settings can
// say when the run happened and what it did. A start marker (`daily:started`) goes in first, so a run
// that never finishes still leaves a trace. A dry run writes nothing; a run that fails writes its
// error. The settings table missing, or any other failure, is logged and never fails the run; the
// record's own failure is reported back in the response.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_RECORD_KEY, DAILY_STARTED_KEY, type DailyRecord, type DailyStart } from "../src/types.js";

const TIMEOUT_MS = 5_000;

function text(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Marks the run's start; a failure is logged only. */
export async function writeDailyStart(db: SupabaseClient, start: DailyStart): Promise<void> {
  try {
    const { error } = await db.from("settings").upsert({ key: DAILY_STARTED_KEY, value: start }, { onConflict: "key" }).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw error;
  } catch (err) {
    console.error(`daily start not written: ${text(err)}`);
  }
}

/** Writes the record; null when written, else the failure's message (logged too). */
export async function writeDailyRecord(db: SupabaseClient, record: DailyRecord): Promise<string | null> {
  try {
    const { error } = await db.from("settings").upsert({ key: DAILY_RECORD_KEY, value: record }, { onConflict: "key" }).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw error;
    return null;
  } catch (err) {
    console.error(`daily record not written: ${text(err)}`);
    return text(err);
  }
}

/** The record of a run that stopped before its end: the counts are zero and the error says why. */
export function failedRunRecord(today: string, at: string, err: unknown): DailyRecord {
  return {
    at,
    today,
    created: 0,
    removed: 0,
    expired: 0,
    superseded: 0,
    skipped: 0,
    pushes_sent: 0,
    pushes_failed: 0,
    subscriptions: 0,
    error: text(err),
  };
}
