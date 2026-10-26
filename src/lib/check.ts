// What the app derives from a planting check: the result read back from a planting_checks row (or
// checked as it arrives from /api/check), and the pill each verdict and factor status wears.
import { CHECK_FACTORS, VERDICTS, type CheckFactor, type FactorStatus, type PlantingCheck, type Usage, type Verdict } from "../types";

export const VERDICT_PILL: Record<Verdict, string> = { plant: "pill ok", plant_with_care: "pill warn", avoid: "pill danger" };
export const STATUS_PILL: Record<FactorStatus, string> = { good: "pill ok", caution: "pill warn", problem: "pill danger" };

const STATUSES = new Set<string>(["good", "caution", "problem"]);
const BEST_SITES = new Set<string>(["farm", "backyard", "either", "neither"]);
const MAX_ALTERNATIVES = 3;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * The check and its usage from a planting_checks row or an /api/check response, or null when it
 * holds no verdict. Factors keep the card's order and drop unknown or repeated ones.
 */
export function storedCheck(raw: unknown): (PlantingCheck & Usage) | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof (PlantingCheck & Usage), unknown>>;
  if (typeof r.verdict !== "string" || !VERDICTS.includes(r.verdict as Verdict)) return null;
  const given = new Map<CheckFactor, { status: FactorStatus; note: string }>();
  for (const f of Array.isArray(r.factors) ? r.factors : []) {
    const item = (f && typeof f === "object" ? f : {}) as { factor?: unknown; status?: unknown; note?: unknown };
    const factor = item.factor as CheckFactor;
    if (!CHECK_FACTORS.includes(factor) || given.has(factor) || !STATUSES.has(item.status as string)) continue;
    given.set(factor, { status: item.status as FactorStatus, note: text(item.note) });
  }
  return {
    factors: CHECK_FACTORS.flatMap((factor) => {
      const g = given.get(factor);
      return g ? [{ factor, ...g }] : [];
    }),
    verdict: r.verdict as Verdict,
    best_site: BEST_SITES.has(r.best_site as string) ? (r.best_site as PlantingCheck["best_site"]) : "either",
    summary: text(r.summary),
    placement: text(r.placement),
    planting_time: text(r.planting_time),
    buying_tips: text(r.buying_tips),
    first_year: text(r.first_year),
    alternatives: (Array.isArray(r.alternatives) ? r.alternatives : [])
      .map((a) => {
        const item = (a && typeof a === "object" ? a : {}) as { name?: unknown; scientific_name?: unknown; why?: unknown };
        return { name: text(item.name), scientific_name: text(item.scientific_name), why: text(item.why) };
      })
      .filter((a) => a.name !== "")
      .slice(0, MAX_ALTERNATIVES),
    model: typeof r.model === "string" ? r.model : null,
    input_tokens: num(r.input_tokens),
    output_tokens: num(r.output_tokens),
    thinking_tokens: num(r.thinking_tokens),
    cache_read_input_tokens: num(r.cache_read_input_tokens),
    cache_creation_input_tokens: num(r.cache_creation_input_tokens),
  };
}
