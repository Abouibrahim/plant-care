// The derja words on the server (Phase 16, 17): the grower's corrections as a glossary for a
// Claude call, the app-wide list of Claude's first word for each term (`derja:words`), and the
// bounded write of a settings row. None of this may fail a paid call: every write answers false.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROW_TIMEOUT_MS } from "./_rows.js";
import { DERJA_KEY, readCorrections, readWords, withWords, WORDS_KEY } from "../src/lib/derja.js";
import type { Correction, DerjaTerm } from "../src/types.js";

/** The whole of extendWords, its re-reads included, gives up after this long. */
export const WORDS_TIMEOUT_MS = 8_000;
const TRIES = 2;

/**
 * The grower's corrections, newest first. A missing row is an empty list; a read that fails is
 * null, so the caller can tell "none" from "unknown" and add nothing to the app-wide list.
 */
export async function loadCorrectionsOrNull(db: SupabaseClient): Promise<Correction[] | null> {
  try {
    const { data, error } = await db.from("settings").select("value").eq("key", DERJA_KEY).abortSignal(AbortSignal.timeout(ROW_TIMEOUT_MS)).maybeSingle();
    if (error) return null;
    return readCorrections((data as { value?: unknown } | null)?.value);
  } catch {
    return null;
  }
}

/** The block of the grower's own derja words for a user message; null when there are none. */
export function correctionsBlock(corrections: Correction[], subject: "diagnosis" | "profile" = "diagnosis"): string | null {
  if (corrections.length === 0) return null;
  const lines = corrections.map((c) => `- ${c.term}: ${c.word || "no local word (if you list this term, give it an empty derja)"}`);
  return [`The grower's own derja words, a glossary for the terms that belong in this ${subject}; use these exactly:`, ...lines].join("\n");
}

/**
 * Adds Claude's first words to the app-wide list after a call. A term already there keeps its
 * word, and a term the grower corrected never enters (its word is his). The write is the usage
 * ledger's: read with updated_at, update only where it is unchanged, insert when the row is
 * missing, so two calls ending together both land. With the corrections unknown (null) nothing is
 * added. Never throws.
 */
export async function extendWords(db: SupabaseClient, terms: DerjaTerm[], corrections: Correction[] | null, now: Date = new Date()): Promise<boolean> {
  if (corrections === null) return false;
  try {
    const signal = AbortSignal.timeout(WORDS_TIMEOUT_MS);
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const { data, error } = await db.from("settings").select("value, updated_at").eq("key", WORDS_KEY).abortSignal(signal).maybeSingle();
      if (error) throw error;
      const row = data as { value?: unknown; updated_at?: string } | null;
      const list = readWords(row?.value);
      const next = withWords(list, terms, corrections, now.toISOString());
      // Nothing new. Compared entry by entry, not by length: at the cap a new term comes in as
      // the oldest goes out, and the list is as long as before.
      if (next.length === list.length && next.every((w, i) => w === list[i])) return true;
      if (!row) {
        const { error: insErr } = await db.from("settings").insert({ key: WORDS_KEY, value: next }).abortSignal(signal);
        if (!insErr) return true;
        if (insErr.code !== "23505") throw insErr;
        continue; // the row appeared meanwhile: read it and add to it
      }
      const { data: changed, error: updErr } = await db.from("settings").update({ value: next }).eq("key", WORDS_KEY).eq("updated_at", row.updated_at).select("key").abortSignal(signal);
      if (updErr) throw updErr;
      if (((changed ?? []) as unknown[]).length > 0) return true;
    }
    throw new Error("the row kept changing");
  } catch (err) {
    console.error(`derja words not extended: ${(err as Error)?.message ?? String(err)}`);
    return false;
  }
}

/** A bounded upsert of one settings row. False on failure, logged; never throws. */
export async function upsertSetting(db: SupabaseClient, key: string, value: unknown): Promise<boolean> {
  try {
    const { error } = await db.from("settings").upsert({ key, value }, { onConflict: "key" }).abortSignal(AbortSignal.timeout(ROW_TIMEOUT_MS));
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`settings row ${key} not written by the route: ${(err as Error)?.message ?? String(err)}`);
    return false;
  }
}
