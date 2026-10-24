// Calendar-date helpers shared by the app and the Vercel functions (api/ imports this file).
// Dates travel as "YYYY-MM-DD" strings so no time zone shifts them: the functions work on the
// Tunis date, the app on the phone's date. No imports, so both tsconfigs compile it as is.

/** Below this age (in months) a plant is in establishment; from it on it is mature. */
export const ESTABLISHMENT_MONTHS = 24;
export type AgeStage = "establishment" | "mature";

/** Tunisia has no daylight saving; the cron runs at 05:00 UTC = 06:00 here. */
export const SITE_TIME_ZONE = "Africa/Tunis";

const DAY_MS = 86_400_000;

export function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Today's date in a time zone, as YYYY-MM-DD. */
export function isoDateIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return isoDate(get("year"), get("month"), get("day"));
}

/** Today's date on this device, as YYYY-MM-DD. */
export function localIsoDate(date: Date = new Date()): string {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d) + days * DAY_MS);
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Days from one date to another (negative when `to` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A local Date at noon for display (toLocaleDateString), from YYYY-MM-DD; null when unreadable. */
export function toLocalDate(iso: string): Date | null {
  const p = parseIso(iso);
  return p ? new Date(p.y, p.m - 1, p.d, 12) : null;
}

/** Whole months from a planting date to a day, both YYYY-MM-DD; null when the date is unknown or unreadable. */
export function ageInMonths(plantedOn: string | null | undefined, todayIso: string): number | null {
  if (!plantedOn) return null;
  const p = parseIso(plantedOn);
  const t = parseIso(todayIso);
  if (!p || !t) return null;
  let months = (t.y - p.y) * 12 + (t.m - p.m);
  if (t.d < p.d) months -= 1;
  return Math.max(0, months);
}

/** Null (unknown planting date) counts as mature, as CLAUDE.md says. */
export function ageStage(ageMonths: number | null): AgeStage {
  return ageMonths !== null && ageMonths < ESTABLISHMENT_MONTHS ? "establishment" : "mature";
}

export function ruleApplies(rule: { age: AgeStage | "any" }, ageMonths: number | null): boolean {
  return rule.age === "any" || rule.age === ageStage(ageMonths);
}
