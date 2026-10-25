// Task expansion: species care rules × plants → dated tasks for the next 90 days.
// The reminder engine of CLAUDE.md, steps 1 to 4, plus the closing of ended windows and stale
// waterings (docs/DECISIONS.md). `expandPlant` and `staleTasks` are pure; `runExpansion` reads and
// writes through the service client. /api/daily and /api/expand both call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, ageInMonths, isoDate, lastDayOfMonth, parseIso, ruleApplies } from "../src/lib/dates.js";
import { en } from "../src/i18n/en.js";
import {
  DIAGNOSIS_RULE_PREFIX,
  TASK_TYPES,
  type CareRule,
  type ExpandResponse,
  type TaskInsert,
  type TaskStatus,
  type TaskType,
} from "../src/types.js";

export const HORIZON_DAYS = 90;
const INSERT_CHUNK = 200;
const DELETE_CHUNK = 100;
const CLOSE_CHUNK = 100;
/** PostgREST answers at most this many rows per request, for the service role too. */
const PAGE = 1000;

/**
 * Reads a whole result in pages of PAGE rows: `page` builds the query afresh with the range to read,
 * on an order that includes a unique column so no row moves between pages. A read past 1,000 rows
 * (a summer of waterings for a few dozen young plants) would otherwise stop silently.
 */
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export interface ExpansionPlant {
  id: string;
  planted_on: string | null;
  care_calendar: CareRule[];
}

export interface PlantExpansion {
  seeds: TaskInsert[];
  /** rule_key of every rule that applies at the plant's age; pending tasks outside it are obsolete. */
  keys: Set<string>;
}

const AGES = new Set(["establishment", "mature", "any"]);

function isRule(value: unknown): value is CareRule {
  const r = value as Partial<CareRule> | null;
  return (
    !!r &&
    typeof r === "object" &&
    (TASK_TYPES as string[]).includes(r.type ?? "") &&
    Array.isArray(r.months) &&
    AGES.has(r.age ?? "") &&
    typeof r.title === "string"
  );
}

function validMonths(months: number[]): number[] {
  return [...new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
}

/** A water rule with a usable interval makes one task per `every_days`; any other rule makes window tasks. */
export function isPeriodic(rule: Pick<CareRule, "type"> & Partial<Pick<CareRule, "every_days">>): boolean {
  return rule.type === "water" && Number.isInteger(rule.every_days) && (rule.every_days as number) >= 1;
}

/**
 * `${type}:${months}:${age}` with the months sorted, so the key does not depend on the order Claude
 * wrote, plus `:${every_days}` for a periodic watering: a changed interval is a new schedule, and the
 * old one's pending tasks must go as obsolete rather than stay beside the new ones.
 */
export function ruleKey(rule: Pick<CareRule, "type" | "months" | "age"> & Partial<Pick<CareRule, "every_days">>): string {
  const base = `${rule.type}:${validMonths(rule.months).join("-")}:${rule.age}`;
  return isPeriodic(rule) ? `${base}:${rule.every_days}` : base;
}

/** The interval of a periodic watering, read back from its rule_key; null for any other key. */
export function periodOf(ruleKeyValue: string): number | null {
  const parts = ruleKeyValue.split(":");
  if (parts[0] !== "water" || parts.length < 4) return null;
  const days = Number(parts[3]);
  return Number.isInteger(days) && days >= 1 ? days : null;
}

/**
 * Contiguous runs of months on the 12-month circle, each in calendar order:
 * [4, 10] → [[4], [10]]; [11, 12, 1, 2, 3] → [[11, 12, 1, 2, 3]]; [1..12] → one run from January.
 */
export function monthRuns(months: number[]): number[][] {
  const sorted = validMonths(months);
  if (sorted.length === 0) return [];
  const runs: number[][] = [];
  let run = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) run.push(sorted[i]);
    else {
      runs.push(run);
      run = [sorted[i]];
    }
  }
  runs.push(run);
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length > 1 && first[0] === 1 && last[last.length - 1] === 12) {
    runs.pop();
    runs[0] = [...last, ...first];
  }
  return runs;
}

interface Window {
  start: string; // first day of the run's first month
  end: string; // last day of the run's last month (next year when the run wraps past December)
}

/** The yearly instances of a run that overlap [today, horizonEnd]. */
function windowsOf(run: number[], todayIso: string, horizonEndIso: string): Window[] {
  const year = parseIso(todayIso)?.y;
  if (!year) return [];
  const firstMonth = run[0];
  const lastMonth = run[run.length - 1];
  const wraps = lastMonth < firstMonth;
  const out: Window[] = [];
  for (let y = year - 1; y <= year + 1; y++) {
    const endYear = wraps ? y + 1 : y;
    const start = isoDate(y, firstMonth, 1);
    const end = isoDate(endYear, lastMonth, lastDayOfMonth(endYear, lastMonth));
    if (start <= horizonEndIso && end >= todayIso) out.push({ start, end });
  }
  return out;
}

/**
 * Tasks a plant needs between today and today + horizonDays, before deduplication against the table.
 * Window rules: one task per window that overlaps the horizon, due on the window's first day (so a window
 * already open today, for example a plant added mid-harvest, shows up at once), window_end its last day.
 * Water rules: one task every `every_days` from the window's first day, kept only when the day is in the
 * horizon. A water rule without a usable `every_days` behaves like a window rule.
 */
export function expandPlant(plant: ExpansionPlant, todayIso: string, horizonDays: number = HORIZON_DAYS): PlantExpansion {
  const horizonEnd = addDays(todayIso, horizonDays);
  const age = ageInMonths(plant.planted_on, todayIso);
  const seeds: TaskInsert[] = [];
  const seen = new Set<string>();
  const keys = new Set<string>();

  const push = (seed: TaskInsert) => {
    const id = `${seed.rule_key}|${seed.due_on}`;
    if (seen.has(id)) return;
    seen.add(id);
    seeds.push(seed);
  };

  for (const rule of plant.care_calendar ?? []) {
    if (!isRule(rule) || !ruleApplies(rule, age)) continue;
    const rule_key = ruleKey(rule);
    keys.add(rule_key);
    const periodic = isPeriodic(rule);
    const litres = rule.type === "water" && typeof rule.litres === "number" && rule.litres > 0 ? rule.litres : 0;
    const title = litres > 0 ? `${rule.title} (${litres} L)` : rule.title;
    const instruction = typeof rule.instruction === "string" ? rule.instruction : "";
    const base = { plant_id: plant.id, type: rule.type, rule_key, title, instruction };

    for (const run of monthRuns(rule.months)) {
      for (const w of windowsOf(run, todayIso, horizonEnd)) {
        if (periodic) {
          for (let day = w.start; day <= w.end && day <= horizonEnd; day = addDays(day, rule.every_days)) {
            if (day < todayIso) continue;
            push({ ...base, due_on: day, window_end: null });
          }
        } else {
          push({ ...base, due_on: w.start, window_end: w.end });
        }
      }
    }
  }
  return { seeds, keys };
}

// ---- stale tasks ---------------------------------------------------------------

/** The columns `staleTasks` reads. `status` is checked again inside, so any rows can be passed. */
export interface StaleCandidate {
  id: string;
  plant_id: string;
  type: TaskType;
  rule_key: string;
  due_on: string;
  window_end: string | null;
  status: TaskStatus;
}

export interface StaleTasks {
  /** Pending window tasks whose window ended before today. */
  expired: string[];
  /** Pending waterings due on or before today with a newer one of the same plant and rule also due. */
  superseded: string[];
  /** The newest due watering of a rule once a whole interval has passed since it, with no newer one coming. */
  missed: string[];
}

/**
 * Pending tasks the expansion closes as `skipped` (ids out; nothing is written here):
 * - a window task (`window_end` set) whose window ended before today, so it leaves Today and the
 *   digest but keeps its line in the plant's journal ("Window ended");
 * - a periodic watering (`window_end` null) due on or before today when a later watering of the same
 *   plant and `rule_key` is also due, so a week away leaves one overdue watering, the newest, not one
 *   per interval ("Superseded by the next watering"). Waterings due after today are not looked at;
 * - the last due watering of a rule once `every_days` (read from its key) have passed since it with no
 *   newer one: inside the season the next watering supersedes it on that same day, so this only
 *   closes the season's last watering, which otherwise stayed in the digest until the season came
 *   round again ("Missed watering").
 * Done, skipped and snoozed rows are never listed, nor the rows a diagnosis wrote (`rule_key` starting
 * with `DIAGNOSIS_RULE_PREFIX`, the Phase 4 carve-out).
 */
export function staleTasks(tasks: StaleCandidate[], todayIso: string): StaleTasks {
  const expired: string[] = [];
  const superseded: string[] = [];
  const missed: string[] = [];
  const newestDue = new Map<string, StaleCandidate>();
  for (const task of tasks) {
    if (task.status !== "pending" || task.rule_key.startsWith(DIAGNOSIS_RULE_PREFIX)) continue;
    if (task.window_end !== null) {
      if (task.window_end < todayIso) expired.push(task.id);
      continue;
    }
    if (task.type !== "water" || task.due_on > todayIso) continue;
    const group = `${task.plant_id}|${task.rule_key}`;
    const newest = newestDue.get(group);
    if (newest === undefined) {
      newestDue.set(group, task);
    } else if (task.due_on > newest.due_on) {
      superseded.push(newest.id);
      newestDue.set(group, task);
    } else {
      superseded.push(task.id);
    }
  }
  for (const newest of newestDue.values()) {
    const period = periodOf(newest.rule_key);
    if (period !== null && addDays(newest.due_on, period) <= todayIso) missed.push(newest.id);
  }
  return { expired, superseded, missed };
}

interface PlantRow {
  id: string;
  planted_on: string | null;
  species: { care_calendar: unknown } | null;
}

interface ExistingRow {
  plant_id: string;
  rule_key: string;
  due_on: string;
}

interface PendingRow {
  id: string;
  plant_id: string;
  rule_key: string;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Closes tasks as `skipped` with `acted_at` set and a note. Only rows still pending change, so a task
 * acted on from the phone between the read and this write keeps its status. Returns how many changed.
 */
async function closeTasks(db: SupabaseClient, ids: string[], note: string): Promise<number> {
  let closed = 0;
  const acted_at = new Date().toISOString();
  for (const chunk of chunks(ids, CLOSE_CHUNK)) {
    const { data, error } = await db
      .from("tasks")
      .update({ status: "skipped", acted_at, note })
      .in("id", chunk)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    closed += data?.length ?? 0;
  }
  return closed;
}

/**
 * Expands every plant (or one) for the next 90 days from `todayIso`, inserts the tasks that do not exist
 * yet (same plant_id, rule_key and due_on; the unique constraint is the final guard) and removes pending
 * tasks whose rule no longer applies: the rule left the calendar after a regeneration, or the plant
 * changed stage. Then it closes ended windows and stale waterings as `skipped` (see `staleTasks`).
 * Acted tasks (done, skipped, snoozed) are never touched.
 */
export async function runExpansion(db: SupabaseClient, todayIso: string, plantId?: string): Promise<ExpandResponse> {
  const plantRows = await readAll<PlantRow>((from, to) => {
    const q = db.from("plants").select("id, planted_on, species(care_calendar)");
    return (plantId ? q.eq("id", plantId) : q).order("id").range(from, to);
  });

  const plants: ExpansionPlant[] = plantRows.map((row) => {
    const calendar = row.species?.care_calendar;
    return { id: row.id, planted_on: row.planted_on, care_calendar: Array.isArray(calendar) ? (calendar as CareRule[]) : [] };
  });

  const seeds: TaskInsert[] = [];
  const keysByPlant = new Map<string, Set<string>>();
  for (const plant of plants) {
    const { seeds: s, keys } = expandPlant(plant, todayIso);
    seeds.push(...s);
    keysByPlant.set(plant.id, keys);
  }

  // --- insert what is missing ---------------------------------------------------
  let created = 0;
  if (seeds.length > 0) {
    let min = seeds[0].due_on;
    let max = seeds[0].due_on;
    for (const s of seeds) {
      if (s.due_on < min) min = s.due_on;
      if (s.due_on > max) max = s.due_on;
    }
    const existingRows = await readAll<ExistingRow>((from, to) => {
      const q = db.from("tasks").select("plant_id, rule_key, due_on").gte("due_on", min).lte("due_on", max);
      return (plantId ? q.eq("plant_id", plantId) : q).order("id").range(from, to);
    });
    const existing = new Set(existingRows.map((r) => `${r.plant_id}|${r.rule_key}|${r.due_on}`));
    const fresh = seeds.filter((s) => !existing.has(`${s.plant_id}|${s.rule_key}|${s.due_on}`));

    for (const chunk of chunks(fresh, INSERT_CHUNK)) {
      const { data: inserted, error: insErr } = await db
        .from("tasks")
        .upsert(chunk, { onConflict: "plant_id,rule_key,due_on", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw insErr;
      created += inserted?.length ?? 0;
    }
  }

  // --- drop pending tasks of rules that no longer apply --------------------------
  const pendingRows = await readAll<PendingRow>((from, to) => {
    const q = db.from("tasks").select("id, plant_id, rule_key").eq("status", "pending");
    return (plantId ? q.eq("plant_id", plantId) : q).order("id").range(from, to);
  });
  const obsolete = pendingRows
    .filter((r) => {
      // Phase 4 carve-out: rows a diagnosis wrote (rule_key "diagnosis:<photo_id>", the
      // re-photograph task) come from the app, not from a species rule; they are never obsolete here.
      if (r.rule_key.startsWith(DIAGNOSIS_RULE_PREFIX)) return false;
      const keys = keysByPlant.get(r.plant_id);
      return keys !== undefined && !keys.has(r.rule_key);
    })
    .map((r) => r.id);
  for (const chunk of chunks(obsolete, DELETE_CHUNK)) {
    const { error: delErr } = await db.from("tasks").delete().in("id", chunk);
    if (delErr) throw delErr;
  }

  // --- close ended windows and stale waterings -----------------------------------
  // Read again after the delete so only rows still in the table are looked at; both rules concern
  // tasks due on or before today, so later ones stay out of the query.
  const staleRows = await readAll<StaleCandidate>((from, to) => {
    const q = db.from("tasks").select("id, plant_id, type, rule_key, due_on, window_end, status").eq("status", "pending").lte("due_on", todayIso);
    return (plantId ? q.eq("plant_id", plantId) : q).order("id").range(from, to);
  });
  const stale = staleTasks(staleRows, todayIso);
  const expired = await closeTasks(db, stale.expired, en.expansion.windowEnded);
  const superseded = (await closeTasks(db, stale.superseded, en.expansion.superseded)) + (await closeTasks(db, stale.missed, en.expansion.missed));

  return { plants: plants.length, created, removed: obsolete.length, expired, superseded, today: todayIso };
}
