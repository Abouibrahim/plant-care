// Small helpers behind the Today screen: how a task stands against the day (shared by the cards,
// the counts and the week strip, so "overdue" means the same thing everywhere), the time of day
// (greeting and garden scene), the check-in streak kept on this phone, and the short vibration on
// Done. Nothing here touches the data.
import type { Batchable, ListItem } from "./batches";
import { addDays, toLocalDate } from "./dates";
import { t } from "../i18n";
import { TASK_MAX_NOTE_CHARS, TASK_TYPES, type Task } from "../types";

/** "21 Oct" in the phone's language, for the due lines of the cards. */
export function shortDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : iso;
}

/** "Thu 23 Oct" in the phone's language, for a coming day. */
export function weekdayDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : iso;
}

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

/**
 * The due line of a card: "Open since 1 Oct · until 31 Dec" for a window that has started, "Overdue ·
 * 21 Oct" for a missed watering, "Today", or the day of the week for the coming days. Past windows
 * say so. A window batch shares its window, so it reads its first task's line.
 */
export function dueLabel(task: Pick<Task, "due_on" | "window_end">, today: string): { text: string; state: DueState } {
  const end = task.window_end;
  const state = dueState(task, today);
  if (end !== null && end < today) return { text: t.today.windowEnded(shortDate(end)), state };
  let text: string;
  if (state === "open") text = t.today.openSince(shortDate(task.due_on));
  else if (state === "overdue") text = `${t.today.overdue} · ${shortDate(task.due_on)}`;
  else if (state === "today") text = t.today.dueToday;
  else text = weekdayDate(task.due_on);
  if (end !== null) text += ` · ${t.today.until(shortDate(end))}`;
  return { text, state };
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

type Due = Pick<Task, "id" | "type" | "due_on" | "window_end">;

/**
 * The site heading's "Done: all N waterings": the site's waterings late or due today, less those
 * `skip` names (plants left out of a batch, tasks already on their way out); none below two.
 */
export function doneAllIds(tasks: Due[], today: string, skip: (id: string) => boolean): string[] {
  const ids = tasks.filter((x) => x.type === "water" && dueNow(x, today) && !skip(x.id)).map((x) => x.id);
  return ids.length >= 2 ? ids : [];
}

/**
 * Whether Done-all would repeat a batch's own Done: one batch already holds every watering it would
 * close. Any batch counts, whatever else the list holds, so a window batch beside the waterings (a
 * prune, a watering window still open) does not bring the button back.
 */
export function doneAllRepeatsBatch<T extends Batchable>(ids: string[], items: ListItem<T>[]): boolean {
  if (ids.length === 0) return false;
  return items.some((i) => {
    if (i.kind !== "batch") return false;
    const held = new Set(i.batch.tasks.map((x) => x.id));
    return ids.every((id) => held.has(id));
  });
}

/** What a batch's buttons do: Done (a window batch's with an optional note), or Skip with a reason; never a snooze. */
export type BatchAction = { kind: "done"; note?: string } | { kind: "skip"; reason: string };

/**
 * Whether a batch's Done is the green button: only when the batch holds something late or due today
 * (a watering, a window that opens today or has ended). A window that is merely open gets a plain
 * one, as a coming day does: its Done closes the window for the season, and the green buttons on
 * Today mean today's round.
 */
export function batchDonePrimary(tasks: Pick<Task, "due_on" | "window_end">[], today: string): boolean {
  return tasks.some((x) => dueNow(x, today));
}

/** What a window batch's note carries in front: "row 3 · 10 plants", the plants ticked; the plants alone with no zone. */
function noteScope(zone: string, plants: number): string {
  return [zone, t.today.batchPlants(plants)].filter(Boolean).join(" · ");
}

/** The room left for the grower's words once the scope is in front, so the whole note keeps within a note's length. */
export function scopedNoteRoom(zone: string, plants: number): number {
  return Math.max(0, TASK_MAX_NOTE_CHARS - t.today.batchNote(noteScope(zone, plants), "").length);
}

/**
 * A window batch's "Done with a note" as it is written on each ticked plant's row, "row 3 · 10
 * plants: 180 kg", so each tree's journal reads it as the batch's; the words trimmed and cut to the
 * room left. Null when there are no words: the Done then writes no note.
 */
export function scopedNote(zone: string, plants: number, text: string): string | null {
  const words = text.trim().slice(0, scopedNoteRoom(zone, plants)).trim();
  return words === "" ? null : t.today.batchNote(noteScope(zone, plants), words);
}

/** Whether the Undo of a batch's action clears the rows' note: a Skip's reason or a Done's note goes with it; a plain Done wrote none. */
export function undoClearsNote(action: BatchAction): boolean {
  return action.kind === "skip" || (action.note ?? "").trim() !== "";
}

/**
 * Whether closing `ids` clears the day, for the leaf fall: a Done that takes at least one task late
 * or due today and leaves none behind that is not already on its way out. Open windows do not count,
 * since they can stay open for months; a coming day's batch is not today's round.
 */
export function clearsTheDay(tasks: Due[], ids: string[], kind: "done" | "skip" | "snooze", today: string, leaving: (id: string) => boolean): boolean {
  if (kind !== "done") return false;
  const set = new Set(ids);
  return tasks.some((x) => set.has(x.id) && dueNow(x, today)) && !tasks.some((x) => !set.has(x.id) && dueNow(x, today) && !leaving(x.id));
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
