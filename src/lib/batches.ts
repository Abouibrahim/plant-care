// Zone batches: the tasks of one zone that make one job falling due together, gathered into one entry
// on Today and one line in the morning push. Phase 11 batched the periodic waterings (a round); Phase
// 12 adds the windows of every kind (a job). Pure, with no strings of its own: Today words it with
// `t.today`, the push with `en.digest`. The functions under api/ import it like dates.ts, so its own
// imports carry the .js extension Node's resolution needs.
import { isAppWrittenRule, type Site, type TaskType } from "../types.js";

/** What the grouping reads of a task: its kind, rule, day and title, and its plant's place and size. */
export interface Batchable {
  id: string;
  plant_id: string;
  type: TaskType;
  rule_key: string;
  due_on: string;
  window_end: string | null;
  title: string;
  plant: { tag: string; site: Site; zone: string; quantity?: number | null } | null;
}

export interface Batch<T extends Batchable> {
  /**
   * What makes the batch, the same while plants leave it: site, folded zone and day for a round of
   * waterings ("farm|row 2|now"), and for a window also the kind, the window and the folded title
   * ("farm|row 2|prune|2027-01-01|2027-02-28|winter prune").
   */
  key: string;
  site: Site;
  /** The zone as most of its plants spell it, trimmed; "" for plants with no zone. */
  zone: string;
  /** The kind of task, the same for all. */
  type: TaskType;
  /** DUE_NOW when its tasks fall due today or before (late, due today, or a window already open); otherwise the coming day they fall on. */
  day: string;
  /**
   * The job of a window batch: the title its plants share, as most of them spell it, trimmed. Null for
   * a round of periodic waterings, whose titles differ by amount.
   */
  title: string | null;
  /** In the order given. */
  tasks: T[];
}

export type ListItem<T extends Batchable> = { kind: "task"; task: T } | { kind: "batch"; batch: Batch<T> };

/** The fewest plants that make a batch; one plant's tasks stay cards of their own. */
export const BATCH_MIN = 2;

/** The day bucket of what is late, due today or open, which make one entry. */
export const DUE_NOW = "now";

/**
 * A task the care calendar wrote for a plant joins a batch: a periodic watering (Phase 11) or a
 * window of any kind, a watering window included (Phase 12). The rows a person or a diagnosis wrote
 * ("manual:", "diagnosis:") stay single, since their own words would vanish in a batch.
 */
export function joinsBatch(task: Batchable): boolean {
  return task.plant !== null && !isAppWrittenRule(task.rule_key) && (task.window_end !== null || task.type === "water");
}

/** A zone as compared: case and outer spaces ignored, so "Row 2 " and "row 2" are one zone. */
export function zoneKey(zone: string | null | undefined): string {
  return (zone ?? "").trim().toLowerCase();
}

/** A title as compared: case and extra spaces ignored, so "Winter  pruning " and "winter pruning" are one job. */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The day bucket of a task: DUE_NOW for today and before, the day itself for a coming day. */
function dayOf(task: Pick<Batchable, "due_on">, today: string): string {
  return task.due_on <= today ? DUE_NOW : task.due_on;
}

/**
 * The batch a task would join, or null for a task that joins none. Waterings gather by site, zone
 * and day, the late ones with today's; a window by site and zone, kind, window and title, so one
 * batch is one job over one window: two species (or a young and a mature tree) whose jobs share the
 * months stay apart when their titles differ, and a snoozed copy, with a day of its own, leaves its
 * mates.
 */
export function batchKey(task: Batchable, today: string): string | null {
  if (!joinsBatch(task) || task.plant === null) return null;
  const place = `${task.plant.site}|${zoneKey(task.plant.zone)}`;
  if (task.window_end === null) return `${place}|${dayOf(task, today)}`;
  return `${place}|${task.type}|${task.due_on}|${task.window_end}|${titleKey(task.title)}`;
}

/** The spelling most of the values use, so a label does not flip between "Row 2" and "row 2"; the first on a tie. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = "";
  let most = 0;
  for (const [value, n] of counts) {
    if (n > most) {
      best = value;
      most = n;
    }
  }
  return best;
}

/**
 * The list with its batches: the tasks in the order given, and the tasks of one batch key, for two
 * plants or more, folded into one batch at the place of the first of them (so a batch with a late
 * watering sits with the late tasks, and a window batch with the open windows).
 */
export function withBatches<T extends Batchable>(tasks: T[], today: string): ListItem<T>[] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = batchKey(task, today);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }
  const items: ListItem<T>[] = [];
  const placed = new Set<string>();
  for (const task of tasks) {
    const key = batchKey(task, today);
    const group = key === null ? undefined : groups.get(key);
    if (key === null || !group || new Set(group.map((x) => x.plant_id)).size < BATCH_MIN) {
      items.push({ kind: "task", task });
      continue;
    }
    if (placed.has(key)) continue;
    placed.add(key);
    const first = group[0];
    items.push({
      kind: "batch",
      batch: {
        key,
        site: first.plant?.site ?? "farm",
        zone: mostCommon(group.map((x) => (x.plant?.zone ?? "").trim())),
        type: first.type,
        day: dayOf(first, today),
        title: first.window_end === null ? null : mostCommon(group.map((x) => x.title.trim())),
        tasks: group,
      },
    });
  }
  return items;
}

/** Litres per plant in a watering's title, where the expansion writes them: "Deep watering (40 L)". */
export function litresOf(title: string): number | null {
  const match = /\((\d+(?:[.,]\d+)?) L\)\s*$/.exec(title);
  if (!match) return null;
  const litres = Number(match[1].replace(",", "."));
  return Number.isFinite(litres) && litres > 0 ? litres : null;
}

/** The plants a task stands for: a group's quantity, one for a single plant or a quantity that is not a count. */
export function plantsOf(task: Pick<Batchable, "plant">): number {
  const quantity = task.plant?.quantity;
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
}

/** A plant of a batch: its tag, size and litres, with the tasks that stand for it. */
export interface BatchPlant {
  plant_id: string;
  tag: string;
  quantity: number;
  /** Litres per plant, one per rule, largest first; null for a rule whose title carries none, and for every task that is not a watering. */
  litres: Array<number | null>;
  /** Its earliest day. */
  since: string;
  /** Late on any of its tasks: a watering past its day, or a window past its end. */
  late: boolean;
  task_ids: string[];
}

/** The plants of one amount, for "40 L · OL-01, OL-03"; litres null for the ones with no amount. */
export interface LitresGroup {
  litres: number | null;
  plants: BatchPlant[];
}

export interface BatchSummary {
  /** Plants in the batch, each counted once and a group by its quantity. */
  plants: number;
  /** Plants late on a task, counted the same way: a watering past its day, a window past its end (an open window is not late). */
  late: number;
  /** The earliest day among them. */
  since: string;
  /** Each plant once, by tag, as the amounts list them. */
  members: BatchPlant[];
  /** The amounts, largest first, the plants with no amount last; a plant with two rules shows under each. */
  groups: LitresGroup[];
  /** Per plant, smallest and largest; null unless every task is a watering that states its litres. */
  range: { min: number; max: number } | null;
  /** For the whole batch, a group's once per plant; null unless every task is a watering that states its litres. */
  total: number | null;
}

const byTag = (a: BatchPlant, b: BatchPlant) => a.tag.localeCompare(b.tag, undefined, { numeric: true, sensitivity: "base" });

/** Late as Today reads it (`dueState` in today.ts, which the functions cannot import): a watering past its day, a window past its end. */
function lateOn(task: Pick<Batchable, "due_on" | "window_end">, today: string): boolean {
  return (task.window_end ?? task.due_on) < today;
}

/**
 * What a batch adds up to. A plant counts once even with two tasks due (yesterday's and today's
 * waterings before the morning's cleanup closes the older, or two rules): for each rule only its
 * newest watering's litres count. Litres are read only from waterings.
 */
export function summarize(tasks: Batchable[], today: string): BatchSummary {
  const members = new Map<string, BatchPlant>();
  /** Per plant and rule, the newest task's day and litres. */
  const newest = new Map<string, { day: string; litres: number | null; plant: string }>();
  let since = tasks[0]?.due_on ?? today;
  for (const task of tasks) {
    const litres = task.type === "water" ? litresOf(task.title) : null;
    let member = members.get(task.plant_id);
    if (!member) {
      member = { plant_id: task.plant_id, tag: task.plant?.tag ?? "", quantity: plantsOf(task), litres: [], since: task.due_on, late: false, task_ids: [] };
      members.set(task.plant_id, member);
    }
    member.task_ids.push(task.id);
    if (task.due_on < member.since) member.since = task.due_on;
    if (lateOn(task, today)) member.late = true;
    if (task.due_on < since) since = task.due_on;
    const rule = `${task.plant_id}|${task.rule_key}`;
    const kept = newest.get(rule);
    if (!kept || task.due_on > kept.day) newest.set(rule, { day: task.due_on, litres, plant: task.plant_id });
  }

  let total: number | null = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const { litres, plant } of newest.values()) {
    const member = members.get(plant);
    if (!member) continue;
    member.litres.push(litres);
    if (litres === null) total = null;
    else {
      min = Math.min(min, litres);
      max = Math.max(max, litres);
      if (total !== null) total += litres * member.quantity;
    }
  }

  // By tag, in their natural order (OL-2 before OL-10): the database gives a batch's rows in no set order.
  const list = [...members.values()].sort(byTag);
  const amounts = new Map<number | null, BatchPlant[]>();
  for (const member of list) {
    member.litres.sort((a, b) => (b ?? -1) - (a ?? -1));
    for (const litres of new Set(member.litres)) {
      const group = amounts.get(litres);
      if (group) group.push(member);
      else amounts.set(litres, [member]);
    }
  }
  const groups = [...amounts.entries()]
    .sort(([a], [b]) => (b ?? -1) - (a ?? -1))
    .map(([litres, plants]) => ({ litres, plants: [...plants].sort(byTag) }));

  const known = total !== null && list.length > 0;
  return {
    plants: list.reduce((n, m) => n + m.quantity, 0),
    late: list.reduce((n, m) => n + (m.late ? m.quantity : 0), 0),
    since,
    members: list,
    groups,
    range: known ? { min, max } : null,
    total: known ? Math.round((total as number) * 10) / 10 : null,
  };
}
