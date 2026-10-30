// Zone batches (Phase 11): the periodic waterings of one zone that fall due together, gathered into
// one entry on Today and one line in the morning push. Pure, with no strings of its own: Today words
// it with `t.today`, the push with `en.digest`. The functions under api/ import it like dates.ts,
// so its own imports carry the .js extension Node's resolution needs.
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
  /** Site, folded zone and day: "farm|row 2|now". It stays the same while plants leave the batch. */
  key: string;
  site: Site;
  /** The zone as most of its plants spell it, trimmed; "" for plants with no zone. */
  zone: string;
  /** DUE_NOW for the late waterings and today's together; otherwise the day they fall on. */
  day: string;
  /** In the order given. */
  tasks: T[];
}

export type ListItem<T extends Batchable> = { kind: "task"; task: T } | { kind: "batch"; batch: Batch<T> };

/** The fewest plants that make a batch; one plant's waterings stay cards of their own. */
export const BATCH_MIN = 2;

/** The day bucket of the late waterings and today's, which make one round. */
export const DUE_NOW = "now";

/**
 * A periodic watering the calendar wrote, the only task that joins a batch. A window watering (a
 * rule without `every_days`) stays apart with the other windows, which can be open for weeks; so
 * does a reminder the grower wrote ("manual:") or a diagnosis wrote, whose own words would vanish.
 */
export function joinsBatch(task: Batchable): boolean {
  return task.type === "water" && task.window_end === null && task.plant !== null && !isAppWrittenRule(task.rule_key);
}

/** A zone as compared: case and outer spaces ignored, so "Row 2 " and "row 2" are one zone. */
export function zoneKey(zone: string | null | undefined): string {
  return (zone ?? "").trim().toLowerCase();
}

/** The batch a task would join, or null for a task that joins none. */
export function batchKey(task: Batchable, today: string): string | null {
  if (!joinsBatch(task) || task.plant === null) return null;
  const day = task.due_on <= today ? DUE_NOW : task.due_on;
  return `${task.plant.site}|${zoneKey(task.plant.zone)}|${day}`;
}

/** The spelling most of the batch's plants use, so the label does not flip between "Row 2" and "row 2". */
function commonSpelling(tasks: Batchable[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const zone = (task.plant?.zone ?? "").trim();
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let best = "";
  let most = 0;
  for (const [zone, n] of counts) {
    if (n > most) {
      best = zone;
      most = n;
    }
  }
  return best;
}

/**
 * The list with its batches: the tasks in the order given, and the waterings of one site and zone
 * that fall due together, for two plants or more, folded into one batch at the place of the first
 * of them (so a batch with a late watering sits with the late tasks).
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
    items.push({
      kind: "batch",
      batch: { key, site: group[0].plant?.site ?? "farm", zone: commonSpelling(group), day: key.slice(key.lastIndexOf("|") + 1), tasks: group },
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
  /** Litres per plant, one per rule, largest first; null for a rule whose title carries none. */
  litres: Array<number | null>;
  /** Its earliest day: a plant late on any of its waterings counts as late. */
  since: string;
  task_ids: string[];
}

/** The plants of one amount, for "40 L · OL-01, OL-03"; litres null for the ones with no amount. */
export interface LitresGroup {
  litres: number | null;
  plants: BatchPlant[];
}

export interface BatchSummary {
  /** Plants watered, each counted once and a group by its quantity. */
  plants: number;
  /** Plants late on a watering, counted the same way. */
  late: number;
  /** The earliest day among them. */
  since: string;
  /** Each plant once, in the order of its first task. */
  members: BatchPlant[];
  /** The amounts, largest first, the plants with no amount last; a plant with two rules shows under each. */
  groups: LitresGroup[];
  /** Per plant, smallest and largest; null unless every watering states its litres. */
  range: { min: number; max: number } | null;
  /** For the whole batch, a group's once per plant; null unless every watering states its litres. */
  total: number | null;
}

const byTag = (a: BatchPlant, b: BatchPlant) => a.tag.localeCompare(b.tag, undefined, { numeric: true, sensitivity: "base" });

/**
 * What a batch adds up to. A plant counts once even with two waterings due (yesterday's and
 * today's before the morning's cleanup closes the older, or two rules): for each rule only its
 * newest watering's litres count.
 */
export function summarize(tasks: Batchable[], today: string): BatchSummary {
  const members = new Map<string, BatchPlant>();
  /** Per plant and rule, the newest watering's day and litres. */
  const newest = new Map<string, { day: string; litres: number | null; plant: string }>();
  let since = tasks[0]?.due_on ?? today;
  for (const task of tasks) {
    const litres = litresOf(task.title);
    let member = members.get(task.plant_id);
    if (!member) {
      member = { plant_id: task.plant_id, tag: task.plant?.tag ?? "", quantity: plantsOf(task), litres: [], since: task.due_on, task_ids: [] };
      members.set(task.plant_id, member);
    }
    member.task_ids.push(task.id);
    if (task.due_on < member.since) member.since = task.due_on;
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

  const list = [...members.values()];
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
    late: list.reduce((n, m) => n + (m.since < today ? m.quantity : 0), 0),
    since,
    members: list,
    groups,
    range: known ? { min, max } : null,
    total: known ? Math.round((total as number) * 10) / 10 : null,
  };
}
