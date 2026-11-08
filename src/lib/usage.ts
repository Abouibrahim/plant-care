// The usage ledger's arithmetic (review 5.3), shared by api/_usage.ts, which adds each Claude call
// to the month's `usage:YYYY-MM` settings row, and by Settings, which shows the month and what it
// cost at list prices. Pure: no imports from the browser or the functions.
import { USAGE_ROUTES, type CallOutcome, type Usage, type UsageLedger, type UsageRoute, type UsageTotals } from "../types.js";

/**
 * Claude Fable 5.1 list prices in US dollars per million tokens, as published on 2026-11-08: the
 * only place a price is written, so a change is one edit. Thinking is billed as output and is
 * already inside `output`. A call a fallback model answered is priced at these rates too, and
 * counted, so the margin is visible.
 */
export const PRICES_PER_MILLION = {
  model: "claude-fable-5-1",
  input: 10,
  output: 50,
  cache_read: 0.25,
  cache_write: 12.5,
};

export function emptyTotals(): UsageTotals {
  return { calls: 0, failed: 0, fallback: 0, input: 0, output: 0, thinking: 0, cache_read: 0, cache_write: 0 };
}

export function emptyLedger(): UsageLedger {
  return { ...emptyTotals(), by_route: {} };
}

/** "2026-11" from a YYYY-MM-DD date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** The month before "2026-11": "2026-10". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

function totalsOf(raw: unknown): UsageTotals {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof UsageTotals, unknown>>;
  return {
    calls: num(r.calls),
    failed: num(r.failed),
    fallback: num(r.fallback),
    input: num(r.input),
    output: num(r.output),
    thinking: num(r.thinking),
    cache_read: num(r.cache_read),
    cache_write: num(r.cache_write),
  };
}

/** A ledger read back from its row; an empty one for a missing or unreadable value, unknown routes dropped. */
export function parseLedger(raw: unknown): UsageLedger {
  const ledger: UsageLedger = { ...totalsOf(raw), by_route: {} };
  const routes = (raw && typeof raw === "object" ? (raw as { by_route?: unknown }).by_route : null) as Record<string, unknown> | null;
  if (routes && typeof routes === "object") {
    for (const route of USAGE_ROUTES) if (route in routes) ledger.by_route[route] = totalsOf(routes[route]);
  }
  return ledger;
}

/** Whether another model than the priced one answered (a server-side fallback after a refusal). */
export function answeredByFallback(usage: Usage): boolean {
  return typeof usage.model === "string" && usage.model !== "" && usage.model !== PRICES_PER_MILLION.model;
}

function plus(totals: UsageTotals, usage: Usage, outcome: CallOutcome): UsageTotals {
  return {
    calls: totals.calls + 1,
    failed: totals.failed + (outcome === "failed" ? 1 : 0),
    fallback: totals.fallback + (outcome === "answered" && answeredByFallback(usage) ? 1 : 0),
    input: totals.input + num(usage.input_tokens),
    output: totals.output + num(usage.output_tokens),
    thinking: totals.thinking + num(usage.thinking_tokens),
    cache_read: totals.cache_read + num(usage.cache_read_input_tokens),
    cache_write: totals.cache_write + num(usage.cache_creation_input_tokens),
  };
}

/** The ledger with one more call added, in all and under its route. */
export function addCall(ledger: UsageLedger, route: UsageRoute, usage: Usage, outcome: CallOutcome = "answered"): UsageLedger {
  const { by_route, ...totals } = ledger;
  return { ...plus(totals, usage, outcome), by_route: { ...by_route, [route]: plus(by_route[route] ?? emptyTotals(), usage, outcome) } };
}

/** What the tokens cost at list prices, in US dollars: input, output, cache reads and cache writes; thinking is inside the output. */
export function estimateCost(totals: UsageTotals): number {
  const p = PRICES_PER_MILLION;
  return (totals.input * p.input + totals.output * p.output + totals.cache_read * p.cache_read + totals.cache_write * p.cache_write) / 1_000_000;
}

/** "$2.10"; under a cent, "$0.00" is honest enough for a month with no call. */
export function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
