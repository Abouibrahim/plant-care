// What the app derives from a diagnosis: the stored shape read back from photos.ai_result, the
// leading cause, and the wording of the follow-up task (a scout for the pest when one leads).
import { t } from "../i18n";
import type { Diagnosis, LikelyCause, ProblemAiResult, Urgency } from "../types";

/** A pest named with at least this likelihood turns the follow-up into a scouting task for it. */
export const PEST_SCOUT_LIKELIHOOD = 0.5;
/** Longest follow-up the app schedules. */
const MAX_REPHOTO_DAYS = 365;
/** A cause in a task title is cut to this many characters. */
const MAX_TITLE_CAUSE = 60;

const URGENCIES = new Set<string>(["watch", "this_week", "today"]);
const KINDS = new Set<string>(["pest", "disease", "nutrient", "water", "sun_heat", "salinity", "mechanical", "other"]);

export const URGENCY_PILL: Record<Urgency, string> = { today: "pill danger", this_week: "pill warn", watch: "pill" };

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function isCause(v: unknown): v is LikelyCause {
  const c = v as Partial<LikelyCause> | null;
  return !!c && typeof c === "object" && typeof c.cause === "string" && typeof c.likelihood === "number";
}

/** The diagnosis stored in a problem photo's ai_result, or null when the row holds none. */
export function problemResult(ai: unknown): ProblemAiResult | null {
  if (!ai || typeof ai !== "object") return null;
  const r = ai as Partial<ProblemAiResult>;
  if (typeof r.summary !== "string" || !Array.isArray(r.likely_causes)) return null;
  return {
    summary: r.summary,
    likely_causes: r.likely_causes.filter(isCause).map((c) => ({
      cause: c.cause,
      kind: KINDS.has(c.kind) ? c.kind : "other",
      likelihood: Math.max(0, Math.min(1, c.likelihood)),
      evidence: typeof c.evidence === "string" ? c.evidence : "",
    })),
    checks_to_do: Array.isArray(r.checks_to_do) ? r.checks_to_do.filter((c): c is string => typeof c === "string") : [],
    organic_treatment: typeof r.organic_treatment === "string" ? r.organic_treatment : "",
    prevention: typeof r.prevention === "string" ? r.prevention : "",
    urgency: URGENCIES.has(r.urgency ?? "") ? (r.urgency as Urgency) : "watch",
    rephotograph_in_days: num(r.rephotograph_in_days),
    note: typeof r.note === "string" ? r.note : "",
    model: typeof r.model === "string" ? r.model : null,
    input_tokens: num(r.input_tokens),
    output_tokens: num(r.output_tokens),
    thinking_tokens: num(r.thinking_tokens),
    cache_read_input_tokens: num(r.cache_read_input_tokens),
    cache_creation_input_tokens: num(r.cache_creation_input_tokens),
  };
}

/** Causes by likelihood, highest first. */
export function sortedCauses(d: Diagnosis): LikelyCause[] {
  return [...d.likely_causes].sort((a, b) => b.likelihood - a.likelihood);
}

export function topCause(d: Diagnosis): LikelyCause | null {
  return sortedCauses(d)[0] ?? null;
}

/** A pest in the lead with likelihood 0.5 or more: the follow-up scouts for it by name. */
export function isPestScout(cause: LikelyCause | null): cause is LikelyCause {
  return cause !== null && cause.kind === "pest" && cause.likelihood >= PEST_SCOUT_LIKELIHOOD;
}

/** Days until the follow-up photo, clamped to a sensible range; 0 means none is needed. */
export function rephotoDays(d: Diagnosis): number {
  const n = Math.round(d.rephotograph_in_days);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_REPHOTO_DAYS) : 0;
}

/**
 * A cause cut to a title-sized phrase: Claude writes "Natural early autumn leaf yellowing (deciduous
 * senescence), made earlier by fruit load"; a task title and a digest line want the head of it.
 */
export function shortCause(cause: string): string {
  const head = cause.split(/[,:;([]/)[0].trim() || cause.trim();
  return head.length > MAX_TITLE_CAUSE ? `${head.slice(0, MAX_TITLE_CAUSE - 1).trimEnd()}…` : head;
}

/** Title and instruction of the re-photograph task for a plant, worded as a scout when a pest leads. */
export function rephotoTask(d: Diagnosis, tag: string): { title: string; instruction: string } {
  const top = topCause(d);
  const cause = shortCause(top?.cause ?? "") || t.plant.photoKinds.problem.toLowerCase();
  if (isPestScout(top)) {
    return { title: t.diagnose.scoutTitle(tag, cause), instruction: t.diagnose.scoutInstruction(cause) };
  }
  const check = d.checks_to_do.find((c) => c.trim() !== "");
  return { title: t.diagnose.rephotoTitle(tag, cause), instruction: check ? `${check} ${t.diagnose.rephotoInstruction}` : t.diagnose.rephotoInstruction };
}
