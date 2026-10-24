// Task expansion: species care rules × plants → dated tasks for the next 90 days.
// The reminder engine of CLAUDE.md, steps 1 to 4. `expandPlant` is pure; `runExpansion`
// reads and writes through the service client. /api/daily and /api/expand both call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, ageInMonths, isoDate, lastDayOfMonth, parseIso, ruleApplies } from "../src/lib/dates.js";
import { DIAGNOSIS_RULE_PREFIX, TASK_TYPES, type CareRule, type ExpandResponse, type TaskInsert } from "../src/types.js";

export const HORIZON_DAYS = 90;
const INSERT_CHUNK = 200;
const DELETE_CHUNK = 100;

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

/** `${type}:${months}:${age}` with the months sorted, so the key does not depend on the order Claude wrote. */
export function ruleKey(rule: Pick<CareRule, "type" | "months" | "age">): string {
  return `${rule.type}:${validMonths(rule.months).join("-")}:${rule.age}`;
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
    const periodic = rule.type === "water" && Number.isInteger(rule.every_days) && rule.every_days >= 1;
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
 * Expands every plant (or one) for the next 90 days from `todayIso`, inserts the tasks that do not exist
 * yet (same plant_id, rule_key and due_on; the unique constraint is the final guard) and removes pending
 * tasks whose rule no longer applies: the rule left the calendar after a regeneration, or the plant
 * changed stage. Acted tasks (done, skipped, snoozed) are never touched.
 */
export async function runExpansion(db: SupabaseClient, todayIso: string, plantId?: string): Promise<ExpandResponse> {
  let plantQuery = db.from("plants").select("id, planted_on, species(care_calendar)");
  if (plantId) plantQuery = plantQuery.eq("id", plantId);
  const { data: plantRows, error: plantErr } = await plantQuery;
  if (plantErr) throw plantErr;

  const plants: ExpansionPlant[] = ((plantRows ?? []) as unknown as PlantRow[]).map((row) => {
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
    let existingQuery = db.from("tasks").select("plant_id, rule_key, due_on").gte("due_on", min).lte("due_on", max);
    if (plantId) existingQuery = existingQuery.eq("plant_id", plantId);
    const { data: existingRows, error: existingErr } = await existingQuery;
    if (existingErr) throw existingErr;
    const existing = new Set(((existingRows ?? []) as ExistingRow[]).map((r) => `${r.plant_id}|${r.rule_key}|${r.due_on}`));
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
  let pendingQuery = db.from("tasks").select("id, plant_id, rule_key").eq("status", "pending");
  if (plantId) pendingQuery = pendingQuery.eq("plant_id", plantId);
  const { data: pendingRows, error: pendingErr } = await pendingQuery;
  if (pendingErr) throw pendingErr;
  const obsolete = ((pendingRows ?? []) as PendingRow[])
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

  return { plants: plants.length, created, removed: obsolete.length, today: todayIso };
}
