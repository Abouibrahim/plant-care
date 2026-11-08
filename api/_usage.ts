// The usage ledger (review 5.3): every Claude call adds its tokens to the settings row
// `usage:YYYY-MM` of the Tunis month, in all and per route, so Settings can say what the month
// cost. `callJson` reports each call once, answered, refused or failed after spending, so the paid
// failures count too. The row is read with its `updated_at` and written back only where it is still
// the one read (the schema's trigger keeps `updated_at`), with up to two more tries otherwise, so two routes
// ending together lose nothing. Each request is bounded, and a failure is logged and never fails the
// paid call it records.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import { addCall, monthOf, parseLedger } from "../src/lib/usage.js";
import { usageKey, type CallOutcome, type Usage, type UsageRoute } from "../src/types.js";

/** A write that hangs this long is given up: the app's reply must not wait on the ledger. */
export const LEDGER_TIMEOUT_MS = 5_000;
const TRIES = 3;

const bound = () => AbortSignal.timeout(LEDGER_TIMEOUT_MS);

/** Adds one call to the month's ledger; true when the row was written. */
export async function recordUsage(db: SupabaseClient, route: UsageRoute, usage: Usage, outcome: CallOutcome = "answered", now: Date = new Date()): Promise<boolean> {
  try {
    const key = usageKey(monthOf(isoDateIn(SITE_TIME_ZONE, now)));
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const { data, error } = await db.from("settings").select("value, updated_at").eq("key", key).abortSignal(bound()).maybeSingle();
      if (error) throw error;
      const row = data as { value?: unknown; updated_at?: string } | null;
      const ledger = addCall(parseLedger(row?.value), route, usage, outcome);
      if (!row) {
        const { error: insErr } = await db.from("settings").insert({ key, value: ledger }).abortSignal(bound());
        if (!insErr) return true;
        if (insErr.code !== "23505") throw insErr;
        continue; // the month's row appeared meanwhile: read it and add to it
      }
      const { data: changed, error: updErr } = await db
        .from("settings")
        .update({ value: ledger })
        .eq("key", key)
        .eq("updated_at", row.updated_at)
        .select("key")
        .abortSignal(bound());
      if (updErr) throw updErr;
      if (((changed ?? []) as unknown[]).length > 0) return true;
      // Another call wrote between the read and this write: once more, on the fresh row.
    }
    throw new Error("the ledger row kept changing");
  } catch (err) {
    console.error(`usage not recorded for ${route}: ${(err as Error)?.message ?? String(err)}`);
    return false;
  }
}
