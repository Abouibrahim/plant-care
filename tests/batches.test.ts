// Zone batches: which tasks gather (the periodic waterings, Phase 11; every window job, Phase 12),
// where a batch sits in the list, and what its summary says (plants counted once, litres by amount,
// late plants).
import { describe, expect, it } from "vitest";
import { batchKey, joinsBatch, litresOf, plantsOf, summarize, titleKey, withBatches, zoneKey, type Batchable, type ListItem } from "../src/lib/batches";
import { addDays } from "../src/lib/dates";
import { dueNow } from "../src/lib/today";
import type { Site, TaskType } from "../src/types";

const today = "2026-07-15";
let n = 0;

interface Extra extends Partial<Omit<Batchable, "plant">> {
  site?: Site;
  quantity?: number | null;
  tag?: string;
}

/** A watering of its own plant unless `plant_id` says otherwise; "Deep watering (40 L)" by default. */
function task(due_on: string, zone: string, extra: Extra = {}): Batchable {
  n += 1;
  const { site = "farm", quantity = 1, tag, ...rest } = extra;
  const plant_id = rest.plant_id ?? `p${n}`;
  return {
    id: `t${n}`,
    plant_id,
    type: "water",
    rule_key: "water:6-7-8:any:7",
    due_on,
    window_end: null,
    title: "Deep watering (40 L)",
    ...rest,
    plant: { tag: tag ?? plant_id.toUpperCase(), site, zone, quantity },
  };
}

/** The list as "id" for a single task and "[id,id]" for a batch, to read the order at a glance. */
const shape = (items: ListItem<Batchable>[]) => items.map((i) => (i.kind === "task" ? i.task.id : `[${i.batch.tasks.map((x) => x.id).join(",")}]`));

describe("what joins a batch", () => {
  it("takes the calendar's tasks of a plant: its periodic waterings and its windows of every kind", () => {
    expect(joinsBatch(task(today, "row 2"))).toBe(true);
    expect(joinsBatch(task(today, "row 2", { window_end: "2026-08-31" }))).toBe(true);
    expect(joinsBatch(task("2026-07-01", "row 2", { type: "feed", window_end: "2026-08-31" }))).toBe(true);
    expect(joinsBatch({ ...task(today, "row 2"), plant: null })).toBe(false);
    // Only waterings repeat: a row of another kind with no window is not one the expansion writes.
    expect(joinsBatch(task(today, "row 2", { type: "feed" as TaskType }))).toBe(false);
  });

  it("keeps the grower's own reminders and a diagnosis's out, whose words would vanish in a batch", () => {
    expect(joinsBatch(task(today, "row 2", { rule_key: "manual:5f0c", title: "Water the new graft by hand" }))).toBe(false);
    expect(joinsBatch(task(today, "row 2", { rule_key: "diagnosis:ph-1", title: "Water 20 L at dawn" }))).toBe(false);
  });

  it("files a watering under 'now' exactly when Today counts it in the round", () => {
    for (let d = -3; d <= 3; d++) {
      const x = task(addDays(today, d), "row 2");
      expect(batchKey(x, today)?.endsWith("|now")).toBe(dueNow(x, today));
    }
    expect(batchKey(task("2026-07-18", "row 2"), today)).toBe("farm|row 2|2026-07-18");
    expect(batchKey(task(today, "row 2", { site: "backyard" }), today)).toBe("backyard|row 2|now");
  });

  it("reads a zone without its case or outer spaces", () => {
    expect(zoneKey(" Row 2 ")).toBe("row 2");
    expect(zoneKey("")).toBe("");
    expect(zoneKey(undefined)).toBe("");
  });
});

describe("withBatches", () => {
  it("places every task once, a batch at its first watering, late before today's", () => {
    const late = task("2026-07-12", "row 2");
    const other = task(today, "row 3");
    const a = task(today, "Row 2 ");
    const prune = task("2026-07-01", "row 2", { type: "prune", window_end: "2026-08-31" });
    const items = withBatches([late, other, a, prune], today);
    expect(shape(items)).toEqual([`[${late.id},${a.id}]`, other.id, prune.id]);
    expect(items[0].kind === "batch" && items[0].batch).toMatchObject({ key: "farm|row 2|now", site: "farm", day: "now" });
  });

  it("names the zone as most of its plants spell it", () => {
    const items = withBatches([task(today, "Row 2"), task(today, "row 2"), task(today, " row 2 ")], today);
    expect(items[0].kind === "batch" && items[0].batch.zone).toBe("row 2");
  });

  it("leaves a zone's lone watering as a card, and batches plants with no zone together", () => {
    const lone = task(today, "row 3");
    const x = task(today, "");
    const y = task(today, "  ");
    const items = withBatches([lone, x, y], today);
    expect(shape(items)).toEqual([lone.id, `[${x.id},${y.id}]`]);
    expect(items[1].kind === "batch" && items[1].batch.zone).toBe("");
  });

  it("needs two plants: one plant's two waterings stay cards", () => {
    const a = task("2026-07-14", "row 2", { plant_id: "olive" });
    const b = task(today, "row 2", { plant_id: "olive" });
    expect(shape(withBatches([a, b], today))).toEqual([a.id, b.id]);
  });

  it("keeps the two sites and each coming day apart", () => {
    const farmA = task(today, "row 2");
    const farmB = task(today, "row 2");
    const yardA = task(today, "row 2", { site: "backyard" });
    const thuA = task("2026-07-18", "row 2");
    const thuB = task("2026-07-18", "row 2");
    const fri = task("2026-07-19", "row 2");
    expect(shape(withBatches([farmA, yardA, farmB, thuA, thuB, fri], today))).toEqual([
      `[${farmA.id},${farmB.id}]`,
      yardA.id,
      `[${thuA.id},${thuB.id}]`,
      fri.id,
    ]);
  });

  it("keeps a batch's key while its plants leave it", () => {
    const [a, b, c] = [task(today, "row 2"), task(today, "row 2"), task(today, "row 2")];
    const key = (items: ListItem<Batchable>[]) => (items[0].kind === "batch" ? items[0].batch.key : null);
    expect(key(withBatches([a, b, c], today))).toBe(key(withBatches([a, c], today)));
  });

  it("keeps a manual reminder as its own card beside its zone's batch", () => {
    const a = task(today, "row 2");
    const b = task(today, "row 2", { title: "Deep watering (20 L)" });
    const reminder = task(today, "row 2", { rule_key: "manual:r1", title: "Water the graft by hand" });
    const items = withBatches([a, reminder, b], today);
    expect(shape(items)).toEqual([`[${a.id},${b.id}]`, reminder.id]);
    expect(items[0].kind === "batch" && summarize(items[0].batch.tasks, today).range).toEqual({ min: 20, max: 40 });
  });
});

describe("litres and plants", () => {
  it("reads the litres the expansion writes at the end of a title", () => {
    expect(litresOf("Deep watering (40 L)")).toBe(40);
    expect(litresOf("Water young tree; Deep watering (2.5 L)")).toBe(2.5);
    expect(litresOf("Arrosage (2,5 L)")).toBe(2.5);
    expect(litresOf("Summer watering")).toBeNull();
    expect(litresOf("Water (0 L)")).toBeNull();
    expect(litresOf("Water (20 L) at dawn")).toBeNull();
    expect(litresOf("Water 40 L of compost tea, then mulch")).toBeNull();
  });

  it("counts a group by its quantity, and anything else as one plant", () => {
    expect(plantsOf(task(today, "", { quantity: 12 }))).toBe(12);
    for (const quantity of [0, -2, 2.5, null, undefined]) expect(plantsOf(task(today, "", { quantity }))).toBe(1);
    expect(plantsOf({ plant: null })).toBe(1);
  });
});

describe("summarize", () => {
  it("adds the plants and the litres, a group's once per plant, and counts the late plants", () => {
    const tasks = [
      task("2026-07-12", "row 2", { tag: "OL-01" }),
      task(today, "row 2", { title: "Hedge (8 L)", quantity: 12, tag: "POM-H" }),
      task(today, "row 2", { tag: "OL-10" }),
      task(today, "row 2", { tag: "OL-2" }),
    ];
    const s = summarize(tasks, today);
    expect(s).toMatchObject({ plants: 15, late: 1, since: "2026-07-12", range: { min: 8, max: 40 }, total: 40 * 3 + 8 * 12 });
    // Each amount with its plants, largest first, tags in their natural order (OL-2 before OL-10).
    expect(s.groups.map((g) => [g.litres, g.plants.map((p) => p.tag)])).toEqual([
      [40, ["OL-01", "OL-2", "OL-10"]],
      [8, ["POM-H"]],
    ]);
  });

  it("counts a plant once when two of its waterings are due, with its newest litres", () => {
    const tasks = [
      task("2026-07-14", "row 2", { plant_id: "olive", quantity: 3, title: "Deep watering (20 L)" }),
      task(today, "row 2", { plant_id: "olive", quantity: 3, title: "Deep watering (20 L)" }),
      task(today, "row 2", { plant_id: "fig", title: "Deep watering (20 L)" }),
    ];
    const s = summarize(tasks, today);
    expect(s.plants).toBe(4);
    expect(s.late).toBe(3);
    expect(s.total).toBe(20 * 3 + 20);
    expect(s.members.find((m) => m.plant_id === "olive")?.task_ids).toHaveLength(2);
  });

  it("shows a plant with no amount in its own group and gives no range or total", () => {
    const tasks = [task(today, "", { title: "Summer watering (25 L)", tag: "FIG-02" }), task(today, "", { title: "Summer watering", tag: "FIG-03" })];
    const s = summarize(tasks, today);
    expect(s).toMatchObject({ plants: 2, range: null, total: null, late: 0 });
    expect(s.groups.map((g) => [g.litres, g.plants.map((p) => p.tag)])).toEqual([
      [25, ["FIG-02"]],
      [null, ["FIG-03"]],
    ]);
  });

  it("keeps a decimal total to one place", () => {
    const tasks = [task(today, "", { title: "Water (2.5 L)", quantity: 3 }), task(today, "", { title: "Water (0.1 L)", quantity: 3 })];
    expect(summarize(tasks, today)).toMatchObject({ range: { min: 0.1, max: 2.5 }, total: 7.8 });
  });
});

describe("window batches (Phase 12)", () => {
  /** A window of its own plant, "Scout for olive fly" from 1 Jun to 31 Oct unless the extra says otherwise. */
  const win = (zone: string, extra: Extra = {}) =>
    task("2026-06-01", zone, { type: "scout", rule_key: "scout:6-7-8-9-10:any", window_end: "2026-10-31", title: "Scout for olive fly", ...extra });
  const batches = (items: ListItem<Batchable>[]) => items.flatMap((i) => (i.kind === "batch" ? [i.batch] : []));

  it("gathers one job over one window: kind, window and title, at one site and zone", () => {
    expect(batchKey(win("row 2"), today)).toBe("farm|row 2|scout|2026-06-01|2026-10-31|scout for olive fly");
    const [a, b] = [win("row 2"), win("Row 2 ", { title: " Scout for  olive fly" })];
    const items = withBatches([a, b], today);
    expect(shape(items)).toEqual([`[${a.id},${b.id}]`]);
    expect(batches(items)[0]).toMatchObject({ type: "scout", day: "now", title: "Scout for olive fly", zone: "row 2" });
  });

  it("keeps different jobs apart: another title, another window, another kind, another site or zone", () => {
    const [a, b] = [win("row 2"), win("row 2")];
    const fig = win("row 2", { title: "Scout for fig mites" });
    const later = win("row 2", { due_on: "2026-07-01", window_end: "2026-09-30" });
    const harvest = win("row 2", { type: "harvest", rule_key: "harvest:6-7-8-9-10:any" });
    const yard = win("row 2", { site: "backyard" });
    const row3 = win("row 3");
    const items = withBatches([a, fig, later, harvest, yard, row3, b], today);
    expect(shape(items)).toEqual([`[${a.id},${b.id}]`, fig.id, later.id, harvest.id, yard.id, row3.id]);
  });

  it("keeps a young tree's job apart from a mature tree's when their titles differ, though the months match", () => {
    const prune = (title: string, age: string) => win("row 2", { type: "prune", rule_key: `prune:1-2:${age}`, title });
    const mature = [prune("Winter pruning", "mature"), prune("Winter pruning", "mature")];
    const young = prune("Formative pruning", "establishment");
    expect(shape(withBatches([...mature, young], today))).toEqual([`[${mature[0].id},${mature[1].id}]`, young.id]);
  });

  it("lets a snoozed window, with a day of its own, leave its mates, and batches two snoozed to the same day", () => {
    const [a, b, c, d] = [win("row 2"), win("row 2"), win("row 2"), win("row 2")];
    const copy = (x: Batchable) => ({ ...x, id: `${x.id}-copy`, due_on: "2026-07-18" });
    expect(shape(withBatches([a, b, copy(c)], today))).toEqual([`[${a.id},${b.id}]`, copy(c).id]);
    expect(shape(withBatches([a, b, copy(c), copy(d)], today))).toEqual([`[${a.id},${b.id}]`, `[${copy(c).id},${copy(d).id}]`]);
  });

  it("lets a snoozed watering, written under its rule's key, join the round of its new day", () => {
    const moved = task("2026-07-16", "row 2", { rule_key: "water:6-7-8:any:7" });
    const mate = task("2026-07-16", "row 2");
    expect(shape(withBatches([moved, mate], today))).toEqual([`[${moved.id},${mate.id}]`]);
  });

  it("lists a batch's plants by tag, whatever order the database gives them in", () => {
    const tags = ["OL-07", "OL-2", "OL-10", "OL-01"];
    const s = summarize(tags.map((tag) => win("row 2", { tag })), today);
    expect(s.members.map((m) => m.tag)).toEqual(["OL-01", "OL-2", "OL-07", "OL-10"]);
  });

  it("files an open, an opening and an ended window under 'now', and a window yet to open under its day", () => {
    expect(batches(withBatches([win("a"), win("a")], today))[0].day).toBe("now");
    const opening = { due_on: today, window_end: "2026-08-31" };
    expect(batches(withBatches([win("b", opening), win("b", opening)], today))[0].day).toBe("now");
    const ended = { due_on: "2026-05-01", window_end: "2026-07-14" };
    expect(batches(withBatches([win("c", ended), win("c", ended)], today))[0].day).toBe("now");
    const coming = { due_on: "2026-07-18", window_end: "2026-08-31" };
    expect(batches(withBatches([win("d", coming), win("d", coming)], today))[0].day).toBe("2026-07-18");
  });

  it("never joins a watering window to the round of periodic waterings", () => {
    const [r1, r2] = [task(today, "row 2"), task(today, "row 2")];
    const w = { window_end: "2026-08-31", title: "Water if leaves curl (60 L)", rule_key: "water:6-7-8:mature" };
    const [w1, w2] = [task("2026-06-01", "row 2", w), task("2026-06-01", "row 2", w)];
    const found = batches(withBatches([r1, w1, r2, w2], today));
    expect(found.map((b) => [b.title, b.tasks.map((x) => x.id)])).toEqual([
      [null, [r1.id, r2.id]],
      ["Water if leaves curl (60 L)", [w1.id, w2.id]],
    ]);
  });

  it("leaves a lone plant's window, and a reminder the grower wrote, as cards", () => {
    const lone = win("row 4");
    const reminder = win("row 4", { rule_key: "manual:r2" });
    expect(shape(withBatches([lone, reminder], today))).toEqual([lone.id, reminder.id]);
  });

  it("names the job as most of its plants spell it", () => {
    const items = withBatches([win("row 2", { title: "Scout for Olive Fly" }), win("row 2"), win("row 2")], today);
    expect(batches(items)[0].title).toBe("Scout for olive fly");
    expect(titleKey("  Scout for   Olive Fly ")).toBe("scout for olive fly");
  });

  it("sums a window batch in plants, with no litres and no lateness while the window is open", () => {
    const s = summarize([win("row 2", { quantity: 12, tag: "POM-H" }), win("row 2", { tag: "OL-01" })], today);
    expect(s).toMatchObject({ plants: 13, late: 0, range: null, total: null });
    expect(s.members.every((m) => !m.late)).toBe(true);
    // An ended window is late for every plant.
    const ended = { due_on: "2026-05-01", window_end: "2026-07-14" };
    expect(summarize([win("row 2", ended), win("row 2", ended)], today).late).toBe(2);
  });

  it("counts a plant once when two of its rules give the same job", () => {
    const olive = { plant_id: "olive", type: "prune" as TaskType, title: "Winter pruning" };
    const tasks = [win("row 2", { ...olive, rule_key: "prune:1-2:any" }), win("row 2", { ...olive, rule_key: "prune:1-2:mature" }), win("row 2", { type: "prune", title: "Winter pruning" })];
    expect(withBatches(tasks, today)).toHaveLength(1);
    const s = summarize(tasks, today);
    expect(s.plants).toBe(2);
    expect(s.members.find((m) => m.plant_id === "olive")?.task_ids).toHaveLength(2);
  });
});
