// Zone batches (Phase 11): which waterings gather, where a batch sits in the list, and what its
// summary says (plants counted once, litres by amount, late plants).
import { describe, expect, it } from "vitest";
import { batchKey, joinsBatch, litresOf, plantsOf, summarize, withBatches, zoneKey, type Batchable, type ListItem } from "../src/lib/batches";
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
  it("takes the calendar's periodic waterings of a plant, not windows, other tasks or tasks without a plant", () => {
    expect(joinsBatch(task(today, "row 2"))).toBe(true);
    expect(joinsBatch(task(today, "row 2", { window_end: "2026-08-31" }))).toBe(false);
    expect(joinsBatch(task(today, "row 2", { type: "feed" as TaskType }))).toBe(false);
    expect(joinsBatch({ ...task(today, "row 2"), plant: null })).toBe(false);
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
