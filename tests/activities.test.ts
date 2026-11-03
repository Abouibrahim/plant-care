// Today by kind of work (Phase 13): the kinds in the calendar's order, a split that keeps every
// entry in its place and never cuts or merges a batch, the app's own rows under their kind, and the
// work due now kept apart from the coming days.
import { describe, expect, it } from "vitest";
import { byActivity, kindOf, splitNow } from "../src/lib/activities";
import { withBatches, type Batchable, type ListItem } from "../src/lib/batches";
import { sortByDue } from "../src/lib/today";
import type { Site, TaskType } from "../src/types";

const today = "2026-11-03";
const yesterday = "2026-11-02";
let n = 0;

interface Extra extends Partial<Omit<Batchable, "plant">> {
  site?: Site;
  quantity?: number;
  tag?: string;
}

/** A periodic watering of its own plant unless the extra says otherwise. */
function task(due_on: string, zone: string, extra: Extra = {}): Batchable {
  n += 1;
  const { site = "farm", quantity = 1, tag, ...rest } = extra;
  const plant_id = rest.plant_id ?? `p${n}`;
  return {
    id: `t${n}`,
    plant_id,
    type: "water",
    rule_key: "water:9-10-11:any:7",
    due_on,
    window_end: null,
    title: "Deep watering (40 L)",
    ...rest,
    plant: { tag: tag ?? plant_id.toUpperCase(), site, zone, quantity },
  };
}

/** A window of the calendar: one kind, one title, from its first day to its last. */
const win = (type: TaskType, title: string, due_on: string, window_end: string): Extra => ({ type, title, due_on, window_end, rule_key: `${type}:10-11-12:any` });

/** The list as "id" for a task and "[id,id]" for a batch, to read the order at a glance. */
const shape = (items: ListItem<Batchable>[]) => items.map((i) => (i.kind === "task" ? i.task.id : `[${i.batch.tasks.map((x) => x.id).join(",")}]`));

/** A farm morning: two zones' rounds (one with a late plant), a hand-set reminder, a watering window, an olive harvest and an olive-fly scout shared by row 2, a lone pruning, a diagnosis's follow-up and Thursday's round. */
function farmDay() {
  const lateRow2 = task(yesterday, "row 2");
  const todayRow2 = task(today, "row 2");
  const row3a = task(today, "row 3");
  const row3b = task(today, "row 3");
  const reminder = task(today, "row 2", { rule_key: "manual:m1", title: "Water the new graft by hand" });
  const dry1 = task("2026-10-01", "row 5", win("water", "Water if dry (20 L)", "2026-10-01", "2026-11-30"));
  const dry2 = task("2026-10-01", "row 5", win("water", "Water if dry (20 L)", "2026-10-01", "2026-11-30"));
  const harvest1 = task("2026-10-01", "row 2", win("harvest", "Harvest the olives", "2026-10-01", "2026-12-31"));
  const harvest2 = task("2026-10-01", "row 2", win("harvest", "Harvest the olives", "2026-10-01", "2026-12-31"));
  const fly1 = task("2026-10-01", "row 2", win("scout", "Scout for olive fly", "2026-10-01", "2026-11-30"));
  const fly2 = task("2026-10-01", "row 2", win("scout", "Scout for olive fly", "2026-10-01", "2026-11-30"));
  const prune = task("2026-10-15", "row 4", win("prune", "Remove suckers", "2026-10-15", "2026-11-30"));
  const followUp = task(yesterday, "row 3", { type: "scout", rule_key: "diagnosis:ph-1", title: "Re-photograph FIG-01: fig rust" });
  const thursday = [task("2026-11-05", "row 1"), task("2026-11-05", "row 1")];
  const all = [lateRow2, todayRow2, row3a, row3b, reminder, dry1, dry2, harvest1, harvest2, fly1, fly2, prune, followUp, ...thursday];
  return { lateRow2, todayRow2, row3a, row3b, reminder, dry1, dry2, harvest1, harvest2, fly1, fly2, prune, followUp, thursday, all };
}

describe("Today by kind of work (Phase 13)", () => {
  it("orders a site's kinds as the calendar does, whatever the list's order, and gives a kind with nothing no group", () => {
    const { all, thursday } = farmDay();
    const now = all.filter((x) => !thursday.includes(x));
    const groups = byActivity(withBatches(sortByDue(now, today), today));
    expect(groups.map((g) => g.type)).toEqual(["water", "prune", "harvest", "scout"]);
    // The same kinds come out in the same order from a shuffled list.
    const shuffled = [...now].reverse();
    expect(byActivity(withBatches(shuffled, today)).map((g) => g.type)).toEqual(["water", "prune", "harvest", "scout"]);
  });

  it("is a stable split: every entry once, the very same, each kind in the order given", () => {
    const { all } = farmDay();
    const items = withBatches(sortByDue(all, today), today);
    const groups = byActivity(items);
    const laidOut = groups.flatMap((g) => g.items);
    expect(laidOut).toHaveLength(items.length);
    expect(new Set(laidOut)).toEqual(new Set(items));
    for (const g of groups) {
      const positions = g.items.map((item) => items.indexOf(item));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(g.items.every((item) => kindOf(item) === g.type)).toBe(true);
    }
  });

  it("keeps Today's order inside a kind, a batch at its most pressing plant", () => {
    const { lateRow2, todayRow2, row3a, row3b, reminder, dry1, dry2, all, thursday } = farmDay();
    const now = all.filter((x) => !thursday.includes(x));
    const water = byActivity(withBatches(sortByDue(now, today), today)).find((g) => g.type === "water");
    // Row 2's round leads with its late plant, then row 3's round due today, the hand-set reminder,
    // and the watering window, which is open and never joins a round.
    expect(water && shape(water.items)).toEqual([`[${lateRow2.id},${todayRow2.id}]`, `[${row3a.id},${row3b.id}]`, reminder.id, `[${dry1.id},${dry2.id}]`]);
  });

  it("never splits or merges a batch: a kind's batches are those it would make on its own", () => {
    const { all } = farmDay();
    const sorted = sortByDue(all, today);
    const together = byActivity(withBatches(sorted, today));
    for (const group of together) {
      const alone = withBatches(
        sorted.filter((x) => x.type === group.type),
        today,
      );
      expect(shape(group.items)).toEqual(shape(alone));
      const keys = (items: ListItem<Batchable>[]) => items.map((i) => (i.kind === "batch" ? i.batch.key : i.task.id));
      expect(keys(group.items)).toEqual(keys(alone));
    }
  });

  it("files the rows a person or a diagnosis wrote under their own kind, as cards of their own", () => {
    const { reminder, followUp, all } = farmDay();
    const groups = byActivity(withBatches(sortByDue(all, today), today));
    const water = groups.find((g) => g.type === "water");
    const scout = groups.find((g) => g.type === "scout");
    expect(water?.items.some((i) => i.kind === "task" && i.task === reminder)).toBe(true);
    expect(scout?.items.some((i) => i.kind === "task" && i.task === followUp)).toBe(true);
    // Each sits beside its kind's batches: the reminder next to the rounds, the follow-up before the olive-fly batch.
    expect(water?.items.filter((i) => i.kind === "batch").length).toBeGreaterThan(0);
    expect(scout && shape(scout.items)[0]).toBe(followUp.id);
  });

  it("reads a batch's kind and a task's", () => {
    const { harvest1, harvest2, prune } = farmDay();
    const [batch] = withBatches([harvest1, harvest2], today);
    expect(kindOf(batch)).toBe("harvest");
    expect(kindOf({ kind: "task", task: prune })).toBe("prune");
  });

  it("puts a kind it does not know last rather than losing it", () => {
    const odd = task(today, "row 9", { type: "graft" as TaskType });
    const water = task(today, "row 9");
    const groups = byActivity(withBatches([odd, water], today));
    expect(groups.map((g) => g.type)).toEqual(["water", "graft"]);
  });
});

describe("the work due now and the coming days", () => {
  it("puts late, due today, open, ended and opening windows in now, and the coming days in later, each in the order given", () => {
    const late = task(yesterday, "row 2");
    const due = task(today, "row 2");
    const open = task("2026-10-01", "row 2", win("harvest", "Harvest the olives", "2026-10-01", "2026-12-31"));
    const ended = task("2026-09-01", "row 2", win("harvest", "Pick the late figs", "2026-09-01", "2026-11-02"));
    const opening = task(today, "row 2", win("prune", "Winter prune", today, "2027-02-28"));
    const thursday = task("2026-11-05", "row 2");
    const comingWindow = task("2026-11-07", "row 2", win("feed", "Autumn compost", "2026-11-07", "2026-11-30"));
    const { now, later } = splitNow([thursday, late, open, comingWindow, due, ended, opening], today);
    expect(now).toEqual([late, open, due, ended, opening]);
    expect(later).toEqual([thursday, comingWindow]);
  });

  it("never cuts a batch between the two", () => {
    const { all } = farmDay();
    const { now, later } = splitNow(all, today);
    const nowIds = new Set(now.map((x) => x.id));
    for (const item of withBatches(all, today)) {
      if (item.kind !== "batch") continue;
      const inNow = item.batch.tasks.map((x) => nowIds.has(x.id));
      expect(new Set(inNow).size).toBe(1);
    }
    expect(later.every((x) => x.due_on > today)).toBe(true);
  });
});
