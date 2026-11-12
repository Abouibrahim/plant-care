// What Today keeps on the phone (Phase 14, review 3.5): the last list it read, the weather card's
// rows, and the Done and Skip actions made without a connection, sent when it returns. The copy is
// the list as read; the queue is applied whenever a list is shown, kept or fresh, so a fresh read
// never brings a queued task back and an Undo of a waiting action only takes it out of the queue,
// unless a round has already closed part of it (below).
// The sending runs one action at a time behind one promise, only with a session (a write with no
// token goes out under the anon key, matches no row, and would read as "closed meanwhile"), and reads
// back the rows an action left unchanged: a row the server closed (the rain skip, an ended window) is
// closed as the grower asked, since the tap came first; a row still pending means the write never
// applied, and the action stays; a row already closed as the action asked, at the tap's time, was
// this action's own write whose reply was lost, and counts as sent; a row the grower closed
// elsewhere is left out and reported. A set whose read-back fails after its write closed part of it
// reports that part, keeps the rest for the next round, and remembers that part for an Undo that
// comes while the rest waits.
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { localIsoDate } from "./dates";
import { completeTask, completeTasks, overrideServerClose, readTaskStates, skipTask, skipTasks } from "./db";
import { isNetworkFailure, phoneOnline } from "./errors";
import { supabase } from "./supabase";
import { dueNow } from "./today";
import { readCorrections, readWords } from "./derja";
import type { AppWord, Correction, TaskWithPlant, WeatherDay } from "../types";

export const TODAY_KEY = "plantcare.today";
export const WEATHER_KEY = "plantcare.weather";
export const QUEUE_KEY = "plantcare.queue";
/** A task write that hangs this long is given up, and the action kept on the phone instead. */
export const WRITE_TIMEOUT_MS = 8_000;
/** The kept copy is not written past this size: a list that large is a sign of something else. */
const MAX_COPY_CHARS = 2_000_000;

// ---- the kept copy -----------------------------------------------------------------

/** The list as Today read it: the day it was read, when, the tasks of the week and the day's done count. */
export interface TodayCopy {
  today: string;
  at: number;
  tasks: TaskWithPlant[];
  doneToday: number;
}

/** The copy as recalled on another load, re-dated: the tasks and when they were read; the done count only when read today. */
export interface RecalledToday {
  tasks: TaskWithPlant[];
  doneToday: number;
  /** When the list was read (ms) and the day it was read on, for the "shown as of" note. */
  readAt: number;
  readDay: string;
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}

/** Writes a value to the phone's storage; false when it refused (blocked, or full), so a caller that promised to keep something can say it did not. */
function write(key: string, value: unknown): boolean {
  try {
    const text = JSON.stringify(value);
    if (text.length > MAX_COPY_CHARS) return false;
    localStorage.setItem(key, text);
    return true;
  } catch {
    // storage blocked or full: the copy is just not kept
    return false;
  }
}

function isTaskRow(value: unknown): value is TaskWithPlant {
  const t = value as Partial<TaskWithPlant> | null;
  return !!t && typeof t === "object" && typeof t.id === "string" && typeof t.due_on === "string" && typeof t.type === "string" && typeof t.title === "string";
}

export function keepToday(copy: TodayCopy): void {
  write(TODAY_KEY, copy);
}

/** The kept copy for the phone's date, or null when there is none worth showing. */
export function recallToday(today: string): RecalledToday | null {
  const raw = read(TODAY_KEY) as Partial<TodayCopy> | null;
  if (!raw || typeof raw !== "object" || typeof raw.today !== "string" || typeof raw.at !== "number" || !Array.isArray(raw.tasks)) return null;
  const tasks = raw.tasks.filter(isTaskRow);
  return {
    tasks,
    doneToday: raw.today === today && typeof raw.doneToday === "number" ? raw.doneToday : 0,
    readAt: raw.at,
    readDay: raw.today,
  };
}

export function keepWeather(rows: WeatherDay[]): void {
  write(WEATHER_KEY, rows);
}

export const DERJA_COPY_KEY = "plantcare.derja";

/** The derja words as last read (Phase 18): the grower's corrections and the app-wide words, with the time of the read. */
export interface DerjaCopy {
  corrections: Correction[];
  words: AppWord[];
  at: number;
}

/** Kept after every good read of the words, on any screen, so Today's cards have them without a connection. */
export function keepDerja(copy: DerjaCopy): void {
  write(DERJA_COPY_KEY, copy);
}

/** The words as last read; null when none were kept or what is there is not a copy. */
export function recallDerja(): DerjaCopy | null {
  const raw = read(DERJA_COPY_KEY) as Partial<DerjaCopy> | null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.corrections) || !Array.isArray(raw.words)) return null;
  return { corrections: readCorrections(raw.corrections), words: readWords(raw.words), at: typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : 0 };
}

/** The weather rows as last read, for the card when its read fails. */
export function recallWeather(): WeatherDay[] | null {
  const raw = read(WEATHER_KEY);
  if (!Array.isArray(raw)) return null;
  return raw.filter((d): d is WeatherDay => !!d && typeof d === "object" && typeof (d as WeatherDay).day === "string");
}

// ---- the queue ------------------------------------------------------------------

/** A Done or a Skip made without a connection: one card (`single`, sent through the single write) or a set, with the tap's time. */
export type NewAction =
  | { kind: "done"; ids: string[]; single: boolean; note: string; at: string }
  | { kind: "skip"; ids: string[]; single: boolean; reason: string; at: string };

/** The action as kept: with its own id and the sends that failed so far. */
export type QueuedAction = NewAction & { id: string; attempts: number };

function isAction(value: unknown): value is QueuedAction {
  const a = value as Partial<QueuedAction> | null;
  if (!a || typeof a !== "object" || typeof a.id !== "string" || !Array.isArray(a.ids) || typeof a.at !== "string") return false;
  if (!a.ids.every((id) => typeof id === "string")) return false;
  if (a.kind === "done") return typeof (a as { note?: unknown }).note === "string";
  if (a.kind === "skip") return typeof (a as { reason?: unknown }).reason === "string";
  return false;
}

export function readQueue(): QueuedAction[] {
  const raw = read(QUEUE_KEY);
  return Array.isArray(raw) ? raw.filter(isAction).map((a) => ({ ...a, attempts: typeof a.attempts === "number" ? a.attempts : 0 })) : [];
}

function writeQueue(actions: QueuedAction[]): void {
  write(QUEUE_KEY, actions);
}

/** Keeps an action on the phone; returns it with its id, or null when the phone's storage refused it. */
export function enqueue(action: NewAction): QueuedAction | null {
  const entry: QueuedAction = { ...action, id: crypto.randomUUID(), attempts: 0 };
  return write(QUEUE_KEY, [...readQueue(), entry]) ? entry : null;
}

/** The ids the rounds so far closed for an action still in the queue, by action id: what its Undo reopens while the rest waits. Per app session, like `sentOutcomes`. */
const partialOutcomes = new Map<string, string[]>();

/** The ids an action still waiting has closed in the rounds so far (a set written in part); empty once it is sent or taken back. */
export function closedSoFar(actionId: string): string[] {
  return partialOutcomes.get(actionId) ?? [];
}

/** Forgets what an action closed, once its Undo has reopened the rows, or it was sent whole. */
export function forgetAction(actionId: string): void {
  partialOutcomes.delete(actionId);
}

/** Takes a waiting action out of the queue (its Undo); false when it was no longer there. The rows its rounds closed stay in `closedSoFar` for the caller to reopen, then forget. */
export function removeAction(id: string): boolean {
  const queue = readQueue();
  const next = queue.filter((a) => a.id !== id);
  if (next.length === queue.length) return false;
  writeQueue(next);
  return true;
}

/** The ids every queued action holds, whatever its kind. */
export function queuedIds(queue: QueuedAction[]): Set<string> {
  return new Set(queue.flatMap((a) => a.ids));
}

/**
 * A list as Today shows it with the queue applied: the queued tasks leave, and the queued Dones that
 * were on the list and were tapped today count in the round, since the server's count does not know
 * them yet (a Done kept since last evening belongs to that day's count).
 */
export function applyQueue(tasks: TaskWithPlant[], doneToday: number, queue: QueuedAction[], today: string): { tasks: TaskWithPlant[]; doneToday: number } {
  if (queue.length === 0) return { tasks, doneToday };
  const gone = queuedIds(queue);
  const doneIds = new Set(queue.filter((a) => a.kind === "done" && localIsoDate(new Date(a.at)) === today).flatMap((a) => a.ids));
  const done = tasks.filter((t) => doneIds.has(t.id)).length;
  return { tasks: tasks.filter((t) => !gone.has(t.id)), doneToday: doneToday + done };
}

/** The Today badge's count from a kept copy: late or due today, less the actions waiting (the rule of `countDueTasks`). */
export function dueCountOf(tasks: TaskWithPlant[], queue: QueuedAction[], today: string): number {
  const gone = queuedIds(queue);
  return tasks.filter((t) => !gone.has(t.id) && dueNow(t, today)).length;
}

// ---- the notes the server writes ---------------------------------------------------

/** The notes the server writes when it closes a watering or a window itself, in either language: the rain skip's and the expansion's. */
const SERVER_NOTES = new Set([en, fr].flatMap((s) => [s.expansion.windowEnded, s.expansion.superseded, s.expansion.missed]));
const RAIN_PREFIXES = [en, fr].flatMap((s) => (["past", "forecast"] as const).map((reason) => s.weather.rainNote(1, reason).split("1")[0]));

/** Whether a skipped row's note is the server's, not the grower's. */
export function isServerNote(note: string): boolean {
  return SERVER_NOTES.has(note) || RAIN_PREFIXES.some((prefix) => prefix !== "" && note.startsWith(prefix));
}

// ---- sending --------------------------------------------------------------------

export interface SendReport {
  /** Actions sent and taken out of the queue. */
  sent: number;
  /** The ids the sent actions closed, as the grower asked (a row the server had closed meanwhile included). */
  closed: string[];
  /** The ids closed as done among `closed`: Today's round moves by them before the fresh read lands. */
  done: string[];
  /** The ids left as they were: the grower had closed them from another screen. */
  leftOut: string[];
  /** Actions still waiting, with the last failure when there was one. */
  waiting: number;
  failed: string | null;
}

/** Why a round of sending stopped before the queue was empty; the actions stay. */
class StopSending extends Error {}

const bound = () => AbortSignal.timeout(WRITE_TIMEOUT_MS);

/** The writes an action makes: the single or the set write, with the tap's time. */
async function writeAction(action: QueuedAction): Promise<string[]> {
  const opts = { actedAt: action.at, signal: bound() };
  if (action.single) {
    const id = action.ids[0];
    const changed = action.kind === "done" ? await completeTask(id, action.note, opts) : await skipTask(id, action.reason, opts);
    return changed ? [id] : [];
  }
  return action.kind === "done" ? completeTasks(action.ids, action.note, opts) : skipTasks(action.ids, action.reason, opts);
}

type TaskState = Awaited<ReturnType<typeof readTaskStates>>[number];

/** Whether a row stands as the action asked, at the tap's time: the action's own earlier write, whose reply was lost. */
function closedByThisAction(state: TaskState, action: QueuedAction): boolean {
  const wanted = action.kind === "done" ? "done" : "skipped";
  return state.status === wanted && state.acted_at !== null && Date.parse(state.acted_at) === Date.parse(action.at);
}

/** What one send of an action did. */
interface SendOutcome {
  /** The ids closed as the grower asked: by this write, recognised as its own earlier one, or closed over the server's skip. */
  closed: string[];
  /** The ids the grower had closed elsewhere, left as they were, and the ids the read did not return. */
  leftOut: string[];
  /** The ids the action keeps for the next round: still pending after the write, or not read back. */
  pending: string[];
  /** The error that cut the round short after the write had gone through, in the read-back or the override; null otherwise. */
  failure: unknown;
}

/** One action sent. The write's own failure is thrown; a failure after it, in the read-back or the override, is returned, so what the write closed is never lost. */
async function sendOne(action: QueuedAction): Promise<SendOutcome> {
  const closed = await writeAction(action);
  const rest = action.ids.filter((id) => !closed.includes(id));
  if (rest.length === 0) return { closed, leftOut: [], pending: [], failure: null };
  // Read back what the write did not change: pending means the write never applied (no token yet,
  // a bad moment); a row closed as asked at the tap's time was this action's own write whose reply
  // was lost; the server's own skip is overridden since the tap came first; and the grower's
  // closing from another screen stands.
  let states: TaskState[];
  try {
    states = await readTaskStates(rest, bound());
  } catch (err) {
    // The rows the write closed are closed whatever became of the read-back: they are reported, so
    // the list and the round move by them, and the action keeps the rest for the next round, which
    // reads them back as this one would have.
    return { closed, leftOut: [], pending: rest, failure: err };
  }
  const pending = states.filter((s) => s.status === "pending").map((s) => s.id);
  const own = states.filter((s) => closedByThisAction(s, action)).map((s) => s.id);
  const serverClosed = states.filter((s) => s.status === "skipped" && !own.includes(s.id) && isServerNote(s.note)).map((s) => s.id);
  const known = new Set(states.map((s) => s.id));
  const leftOut = rest.filter((id) => known.has(id) && !pending.includes(id) && !own.includes(id) && !serverClosed.includes(id));
  // Rows the read did not return are gone (the plant deleted) or hidden by the policies: not pending, nothing to do.
  const unknown = rest.filter((id) => !known.has(id));
  closed.push(...own);
  if (serverClosed.length > 0) {
    const note = (action.kind === "done" ? action.note : action.reason).trim();
    const patch = action.kind === "done" ? { status: "done" as const, note, acted_at: action.at } : { status: "skipped" as const, note, acted_at: action.at };
    try {
      closed.push(...(await overrideServerClose(serverClosed, patch, bound())));
    } catch (err) {
      // The override did not go through, or its reply was lost (the next round then knows the rows
      // as this action's own): those rows stay with the action, and what was closed is reported.
      return { closed, leftOut: [...leftOut, ...unknown], pending: [...pending, ...serverClosed], failure: err };
    }
  }
  return { closed, leftOut: [...leftOut, ...unknown], pending, failure: null };
}

let inFlight: Promise<SendReport> | null = null;
/** The outcome of each action sent in this app session, by action id, for an Undo that comes after the send. */
const sentOutcomes = new Map<string, string[]>();

/** The ids an action closed once sent, or null while it waits or sends. */
export function sentIds(actionId: string): string[] | null {
  return sentOutcomes.get(actionId) ?? null;
}

/** Whether a send is under way, so an Undo can wait for it. */
export function sendingNow(): Promise<SendReport> | null {
  return inFlight;
}

async function sendAll(): Promise<SendReport> {
  const report: SendReport = { sent: 0, closed: [], done: [], leftOut: [], waiting: 0, failed: null };
  try {
    if (!phoneOnline()) throw new StopSending();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new StopSending();
    for (;;) {
      const queue = readQueue();
      const action = queue[0];
      if (!action) break;
      let outcome: SendOutcome;
      try {
        outcome = await sendOne(action);
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        // No connection after all: the action stays, with the attempt counted, and this round ends.
        writeQueue(readQueue().map((a) => (a.id === action.id ? { ...a, attempts: a.attempts + 1 } : a)));
        report.failed = err instanceof Error ? err.message : String(err);
        throw new StopSending();
      }
      report.closed.push(...outcome.closed);
      if (action.kind === "done") report.done.push(...outcome.closed);
      report.leftOut.push(...outcome.leftOut);
      if (outcome.pending.length > 0) {
        // Rows this round could not settle: the write reached the table and changed nothing on rows
        // still pending (the token not accepted yet, the sign-in not refreshed), or the read-back
        // failed, after a partial close or none. The action keeps those ids, with the attempt counted,
        // and this round ends; what the write closed is reported above and remembered for an Undo.
        writeQueue(readQueue().map((a) => (a.id === action.id ? { ...a, ids: outcome.pending, attempts: a.attempts + 1 } : a)));
        if (outcome.closed.length > 0) partialOutcomes.set(action.id, [...closedSoFar(action.id), ...outcome.closed]);
        if (outcome.failure !== null) report.failed = outcome.failure instanceof Error ? outcome.failure.message : String(outcome.failure);
        throw new StopSending();
      }
      // Sent whole: its outcome is what this round and the rounds before it closed.
      sentOutcomes.set(action.id, [...closedSoFar(action.id), ...outcome.closed]);
      removeAction(action.id);
      forgetAction(action.id);
      report.sent += 1;
    }
  } catch (err) {
    if (!(err instanceof StopSending)) {
      // A failure that is not the connection's (the policies, a bug): say so, keep the actions, stop.
      report.failed = err instanceof Error ? err.message : String(err);
    }
  }
  report.waiting = readQueue().length;
  return report;
}

/** Sends the queue, one action at a time, one round at a time: a second call while a round runs gets that round's report. */
export function sendQueue(): Promise<SendReport> {
  if (inFlight) return inFlight;
  const round = sendAll().finally(() => {
    if (inFlight === round) inFlight = null;
  });
  inFlight = round;
  return round;
}
