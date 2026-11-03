// Today by kind of work (Phase 13): a site's list split into one share per kind of task, in the
// calendar's order, with the work due now kept apart from the coming days. Pure, with no strings of
// its own, and its imports carry the .js extension Node's resolution needs, as batches.ts does, so
// the functions under api/ could use it too.
import type { Batchable, ListItem } from "./batches.js";
import { TASK_TYPES, type TaskType } from "../types.js";

/** One kind's share of a list, its entries in the order given. */
export interface ActivityGroup<T extends Batchable> {
  type: TaskType;
  items: ListItem<T>[];
}

/**
 * The kind of an entry: a task's own, or a batch's, which holds one kind by construction (a round
 * is periodic waterings, and a window job's key carries its kind).
 */
export function kindOf<T extends Batchable>(item: ListItem<T>): TaskType {
  return item.kind === "batch" ? item.batch.type : item.task.type;
}

/**
 * The entries split by kind, in the calendar's order (water, prune, feed, mulch, harvest, scout,
 * propagate, protect); a kind with no entry gets no group. A stable partition: each kind keeps its
 * entries in the order given, so a batch keeps its place among its kind's cards, and a kind outside
 * the list (none today) comes last rather than being lost.
 */
export function byActivity<T extends Batchable>(items: ListItem<T>[]): ActivityGroup<T>[] {
  const groups = new Map<TaskType, ListItem<T>[]>();
  for (const item of items) {
    const type = kindOf(item);
    const group = groups.get(type);
    if (group) group.push(item);
    else groups.set(type, [item]);
  }
  const order = [...TASK_TYPES, ...[...groups.keys()].filter((type) => !TASK_TYPES.includes(type))];
  return order.flatMap((type) => {
    const group = groups.get(type);
    return group ? [{ type, items: group }] : [];
  });
}

/**
 * A site's tasks split into the work due now (due today or before: late, due today, and a window
 * that is open, opens today or has ended) and the coming days, each in the order given. A batch never
 * straddles the two: a round's key holds its day bucket, and a window job's its first day.
 */
export function splitNow<T extends Pick<Batchable, "due_on">>(tasks: T[], today: string): { now: T[]; later: T[] } {
  const now: T[] = [];
  const later: T[] = [];
  for (const task of tasks) (task.due_on <= today ? now : later).push(task);
  return { now, later };
}
