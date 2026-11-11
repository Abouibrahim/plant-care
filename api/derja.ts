// POST /api/derja  { species_id, asked_at }  ->  { terms, at, asked_at } + usage   (Phase 17)
// The derja words of a species profile: Claude reads the stored profile and lists its key terms
// with the word said for each in Tunisian. Nothing in the species row is read for writing or
// written: the list goes to the settings row `derja:species:<id>`, before the reply, so a reply
// lost on the way is found by the asked_at the app sent. Claude's first word for each term then
// joins the app-wide list, which every profile and diagnosis draws from.
import { keepAlive, reply, type VercelRequest, type VercelResponse } from "./_http.js";
import { callJson, readPrompt, readSchema } from "./_claude.js";
import { calendarBlock, guildUsesBlock, monthList, speciesBlock } from "./_context.js";
import { correctionsBlock, extendWords, loadCorrectionsOrNull, upsertSetting } from "./_derja.js";
import { isInstant, ROW_TIMEOUT_MS, UUID } from "./_rows.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { recordUsage } from "./_usage.js";
import { cleanTerms, MAX_SPECIES_TERMS, speciesWordsKey, withoutCorrected } from "../src/lib/derja.js";
import type { Correction, DerjaRequest, DerjaTerm, Species, SpeciesWords } from "../src/types.js";

/** The validated body, or the message of a 400. */
export function parseDerjaRequest(body: unknown): DerjaRequest | string {
  const b = (body && typeof body === "object" ? body : {}) as Partial<Record<keyof DerjaRequest, unknown>>;
  if (typeof b.species_id !== "string" || !UUID.test(b.species_id)) return "species_id must be a UUID";
  if (!isInstant(b.asked_at)) return "asked_at must be an ISO time";
  return { species_id: b.species_id, asked_at: b.asked_at };
}

/**
 * The profile's pests with each one's prevention. The shared pestLine leaves the prevention out
 * (diagnose, ask and check do not need it); here Claude must see every text the Health tab draws,
 * since a term is copied from the text.
 */
export function pestsWithPrevention(s: Species): string {
  const pests = Array.isArray(s.pests) ? s.pests : [];
  if (pests.length === 0) return "The profile lists no pests or diseases for this species.";
  const lines = pests.map((p) => {
    const fr = p.name_fr ? ` (${p.name_fr})` : "";
    return `- ${p.name_en}${fr}, ${monthList(p.months)}: ${p.symptoms} Organic treatment: ${p.organic_treatment} Prevention: ${p.prevention}`;
  });
  return `Pests and diseases of this species in Cap Bon, from its profile:\n${lines.join("\n")}`;
}

/** The user message: the profile's text, the grower's glossary when there is one, the instruction. */
export function describeProfile(s: Species, corrections: Correction[]): string {
  const block = correctionsBlock(corrections, "profile");
  return [speciesBlock(s), calendarBlock(s), pestsWithPrevention(s), guildUsesBlock(s), ...(block ? [block] : []), "List the key terms of this profile with the word said for each in Tunisian."].join("\n\n");
}

/** The settings row the route writes: the species' list, cleaned and capped, with the two times. */
export function speciesWordsRow(input: DerjaRequest, terms: unknown, at: string): { key: string; value: SpeciesWords } {
  return { key: speciesWordsKey(input.species_id), value: { terms: cleanTerms(terms, MAX_SPECIES_TERMS), at, asked_at: input.asked_at } };
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
    const input = parseDerjaRequest(req.body);
    if (typeof input === "string") {
      sendError(res, 400, input);
      return;
    }

    const db = serviceClient();
    const { data: speciesRow, error: speciesErr } = await db.from("species").select("*").eq("id", input.species_id).maybeSingle();
    if (speciesErr) throw speciesErr;
    const species = speciesRow as Species | null;
    if (!species) {
      sendError(res, 404, "Species not found");
      return;
    }
    // null when the row could not be read: Claude then gets no glossary, and nothing joins the
    // app-wide list, since a word of the grower's could not be told from one of Claude's.
    const corrections = await loadCorrectionsOrNull(db);

    keepAlive(res);
    const result = await callJson<{ terms: DerjaTerm[] }>({
      rules: readPrompt("derja.md"),
      schema: readSchema("derja.schema.json"),
      content: [{ type: "text", text: describeProfile(species, corrections ?? []) }],
      maxTokens: 3072,
      effort: "medium",
      onUsage: (usage, outcome) => recordUsage(db, "derja", usage, outcome),
    });
    if (!result.ok) {
      reply(res, 200, { refusal: result.refusal, ...result.usage });
      return;
    }

    // A species deleted during the call gets no row: it would be an orphan nothing ever reads.
    // Bounded like the writes after it: a read that hangs here must not cost the paid list.
    const { data: still, error: stillErr } = await db.from("species").select("id").eq("id", input.species_id).abortSignal(AbortSignal.timeout(ROW_TIMEOUT_MS)).maybeSingle();
    if (!stillErr && !still) {
      await result.recorded;
      sendError(res, 404, "Species not found");
      return;
    }

    // A term the grower corrected is stored without the word Claude echoed: that word is his.
    const row = speciesWordsRow(input, withoutCorrected(cleanTerms(result.data.terms, MAX_SPECIES_TERMS), corrections), new Date().toISOString());
    await upsertSetting(db, row.key, row.value);
    await extendWords(db, row.value.terms, corrections);
    await result.recorded;
    reply(res, 200, { ...row.value, ...result.usage });
  } catch (err) {
    handleError(res, err);
  }
}
