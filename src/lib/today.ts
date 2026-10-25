// Small helpers behind the Today screen: how a task stands against the day (shared by the cards,
// the counts and the week strip, so "overdue" means the same thing everywhere), the time of day
// (greeting and garden scene), the check-in streak kept on this phone, and the short vibration on
// Done. Nothing here touches the data.
import { addDays } from "./dates";
import { TASK_TYPES, type Task } from "../types";

export type DueState = "overdue" | "open" | "today" | "upcoming";

/**
 * Late: a watering past its day, or a window past its end. Open: a window that has started and is
 * not over, which is not late, whatever its start date. Then due today, or still to come.
 */
export function dueState(task: Pick<Task, "due_on" | "window_end">, today: string): DueState {
  const end = task.window_end;
  if (end !== null && end < today) return "overdue";
  if (task.due_on < today) return end !== null ? "open" : "overdue";
  if (task.due_on === today) return "today";
  return "upcoming";
}

export function isLate(task: Pick<Task, "due_on" | "window_end">, today: string): boolean {
  return dueState(task, today) === "overdue";
}

/** Late or due today: what today's round counts and what clears the day. An open window is neither. */
export function dueNow(task: Pick<Task, "due_on" | "window_end">, today: string): boolean {
  const state = dueState(task, today);
  return state === "overdue" || state === "today";
}

const DUE_RANK: Record<DueState, number> = { overdue: 0, today: 1, open: 2, upcoming: 3 };

/** Late first, then due today, then open windows, then the coming days; within a rank by day, the calendar's type order and the title. */
export function sortByDue<T extends Pick<Task, "due_on" | "window_end" | "type" | "title">>(tasks: T[], today: string): T[] {
  return [...tasks].sort(
    (a, b) =>
      DUE_RANK[dueState(a, today)] - DUE_RANK[dueState(b, today)] ||
      a.due_on.localeCompare(b.due_on) ||
      TASK_TYPES.indexOf(a.type) - TASK_TYPES.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

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
