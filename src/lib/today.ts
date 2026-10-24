// Small helpers behind the Today screen's mood: the time of day (greeting and garden scene), the
// check-in streak kept on this phone, and the short vibration on Done. Nothing here touches the data.
import { addDays } from "./dates";

/** Sky of the garden scene: dawn 5–9 h, day 10–16 h, dusk 17–19 h, night 20–4 h. */
export type DayPhase = "dawn" | "day" | "dusk" | "night";

export function dayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 10) return "dawn";
  if (hour >= 10 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

export type Greeting = "morning" | "afternoon" | "evening" | "night";

/** Morning 5–11 h, afternoon 12–16 h, evening 17–21 h, night 22–4 h. */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const CHECKINS_KEY = "plantcare.checkins";
/** Days kept; a streak longer than this still shows this many. */
const CHECKINS_KEPT = 120;

function readCheckins(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKINS_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Records that Today was opened on this day and returns the streak: consecutive days, ending today,
 * with a check-in. Kept in localStorage, so it belongs to this phone; blocked storage gives 1.
 */
export function checkIn(todayIso: string): number {
  const days = new Set(readCheckins());
  days.add(todayIso);
  const kept = [...days].sort().slice(-CHECKINS_KEPT);
  try {
    localStorage.setItem(CHECKINS_KEY, JSON.stringify(kept));
  } catch {
    // storage blocked: the streak is just today
  }
  const set = new Set(kept);
  let streak = 0;
  for (let day = todayIso; set.has(day); day = addDays(day, -1)) streak += 1;
  return Math.max(1, streak);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** A short vibration on phones that have one (Android Chrome); silent elsewhere. */
export function buzz(pattern: number | number[]): void {
  try {
    if (!prefersReducedMotion()) navigator.vibrate?.(pattern);
  } catch {
    // no vibration motor or blocked by the browser
  }
}
