import { describe, expect, it } from "vitest";
import { composeDigest, inDigest, loadDigestTasks, type DigestTask } from "../api/_push.js";
import { runExpansion } from "../api/_tasks.js";
import { en } from "../src/i18n/en";
import type { CareRule } from "../src/types";
import { fixture, water, window } from "./fixtures";

const harvestRule = window("harvest", [10, 11], { lead_days: 14, title: "Harvest olives" });

function task(partial: Partial<DigestTask>): DigestTask {
  return {
    id: "t",
    // Each task its own plant unless the test says otherwise.
    plant_id: `plant-${partial.id ?? "t"}`,
    type: "water",
    rule_key: "water:6:any",
    due_on: "2026-09-17",
    window_end: null,
    title: "Water (20 L)",
    plant: { tag: "fig", site: "farm", zone: "", quantity: 1, care_calendar: [] },
    ...partial,
  };
}

describe("inDigest", () => {
  it("takes what is due or overdue", () => {
    expect(inDigest(task({ due_on: "2026-09-17" }), "2026-09-17")).toBe(true);
    expect(inDigest(task({ due_on: "2026-09-10" }), "2026-09-17")).toBe(true);
    expect(inDigest(task({ due_on: "2026-09-18" }), "2026-09-17")).toBe(false);
  });

  it("sends a window's early notice on the one day lead_days before it opens", () => {
    const harvest = task({
      type: "harvest",
      rule_key: "harvest:10-11:any",
      due_on: "2026-10-01",
      window_end: "2026-11-30",
      plant: { tag: "olive", site: "farm", zone: "", quantity: 1, care_calendar: [harvestRule] },
    });
    expect(inDigest(harvest, "2026-09-16")).toBe(false);
    expect(inDigest(harvest, "2026-09-17")).toBe(true);
    expect(inDigest(harvest, "2026-09-18")).toBe(false);
    expect(inDigest(harvest, "2026-10-01")).toBe(true);
  });
});

describe("composeDigest", () => {
  it("writes one message per site that has something, farm first", () => {
    const tasks = [
      task({ id: "1", plant: { tag: "fig", site: "backyard", zone: "", quantity: 1, care_calendar: [] } }),
      task({ id: "2", plant: { tag: "carob", site: "farm", zone: "", quantity: 1, care_calendar: [] } }),
      task({ id: "3", plant: null }),
    ];
    const messages = composeDigest(tasks, "2026-09-17");
    expect(messages.map((m) => m.site)).toEqual(["farm", "backyard"]);
    expect(messages[0].title).toBe(en.digest.title(en.site.farm, 1));
    expect(messages[0].body).toBe(en.digest.line("Water (20 L)", "carob"));
  });

  it("shows three lines and counts the rest", () => {
    // One watering per zone: nothing to gather.
    const tasks = ["a", "b", "c", "d", "e"].map((id) => task({ id, title: `Water ${id}`, plant: { tag: id, site: "farm", zone: `zone ${id}`, quantity: 1, care_calendar: [] } }));
    const [farm] = composeDigest(tasks, "2026-09-17");
    expect(farm.tasks).toBe(5);
    expect(farm.body.split("\n")).toHaveLength(4);
    expect(farm.body.endsWith(en.digest.more(2))).toBe(true);
  });

  it("puts the one-day early notice first, then the late watering, today's, and the open windows", () => {
    const olive = { tag: "olive", site: "farm" as const, zone: "", quantity: 1, care_calendar: [harvestRule] };
    const tasks = [
      task({ id: "open", type: "scout", rule_key: "scout:6-7-8-9-10:any", due_on: "2026-06-01", window_end: "2026-10-31", title: "Scout for olive fly", plant: olive }),
      task({ id: "today", due_on: "2026-09-17", title: "Water (8 L)", plant: { tag: "papaya", site: "farm", zone: "terrace", quantity: 1, care_calendar: [] } }),
      task({ id: "late", due_on: "2026-09-15", title: "Water (20 L)", plant: { tag: "carob", site: "farm", zone: "row 3", quantity: 1, care_calendar: [] } }),
      task({ id: "notice", type: "harvest", rule_key: "harvest:10-11:any", due_on: "2026-10-01", window_end: "2026-11-30", title: "Harvest olives", plant: olive }),
      task({ id: "fig", due_on: "2026-09-17", title: "Water (20 L)", plant: { tag: "fig", site: "farm", zone: "north hedge", quantity: 1, care_calendar: [] } }),
    ];
    const [farm] = composeDigest(tasks, "2026-09-17");
    expect(farm.tasks).toBe(5);
    expect(farm.body.split("\n")).toEqual([
      en.digest.soon("1 Oct", en.digest.line("Harvest olives", "olive")),
      en.digest.line("Water (20 L)", "carob"),
      en.digest.line("Water (20 L)", "fig"),
      en.digest.more(2),
    ]);
  });

  it("says nothing on a day with nothing due", () => {
    expect(composeDigest([task({ due_on: "2026-09-20" })], "2026-09-17")).toEqual([]);
  });
});

describe("composeDigest: zone batches", () => {
  const today = "2026-09-17";
  const at = (tag: string, zone: string, quantity = 1, site: "farm" | "backyard" = "farm") => ({ tag, site, zone, quantity, care_calendar: [] });

  it("gives a zone's due waterings one line, in the place of the most pressing, with the plants and litres", () => {
    const olive = { ...at("olive", "row 2"), care_calendar: [harvestRule] };
    const tasks = [
      task({ id: "notice", type: "harvest", rule_key: "harvest:10-11:any", due_on: "2026-10-01", window_end: "2026-11-30", title: "Harvest olives", plant: olive }),
      task({ id: "single", due_on: "2026-09-16", title: "Water (30 L)", plant: at("carob", "row 3") }),
      task({ id: "late", due_on: "2026-09-15", title: "Deep watering (20 L)", plant: at("OL-01", "row 2") }),
      task({ id: "hedge", due_on: today, title: "Water the hedge (8 L)", plant: at("POM-H", "Row 2 ", 12) }),
      task({ id: "today", due_on: today, title: "Deep watering (20 L)", plant: at("OL-03", "row 2") }),
    ];
    const [farm] = composeDigest(tasks, today);
    expect(farm.tasks).toBe(5);
    expect(farm.title).toBe(en.digest.title(en.site.farm, 5));
    expect(farm.body.split("\n")).toEqual([
      en.digest.soon("1 Oct", en.digest.line("Harvest olives", "olive")),
      en.digest.line(en.digest.batch(14, 8, 20), "row 2"),
      en.digest.line("Water (30 L)", "carob"),
    ]);
    expect(en.digest.batch(14, 8, 20)).toBe("Water 14 plants (8–20 L each)");
  });

  it("counts the tasks a batch line holds when it says how many more there are", () => {
    const tasks = [
      task({ id: "a1", due_on: "2026-09-15", plant: at("a1", "A") }),
      task({ id: "a2", plant: at("a2", "A") }),
      task({ id: "b1", plant: at("b1", "B") }),
      task({ id: "b2", plant: at("b2", "B") }),
      task({ id: "b3", plant: at("b3", "B") }),
      task({ id: "c", plant: at("c", "C") }),
      task({ id: "d1", plant: at("d1", "D") }),
      task({ id: "d2", plant: at("d2", "D") }),
    ];
    const [farm] = composeDigest(tasks, today);
    expect(farm.tasks).toBe(8);
    // A (late first), then B, then C: 2 + 3 + 1 tasks shown, D's two left.
    expect(farm.body.split("\n")).toEqual([
      en.digest.line(en.digest.batch(2, 20, 20), "A"),
      en.digest.line(en.digest.batch(3, 20, 20), "B"),
      en.digest.line("Water (20 L)", "c"),
      en.digest.more(2),
    ]);
  });

  it("ends a batch of plants with no zone at its plants, leaves the litres out when a title has none, and keeps the sites apart", () => {
    const tasks = [
      task({ id: "x", title: "Summer watering (25 L)", plant: at("FIG-02", "") }),
      task({ id: "y", title: "Summer watering", plant: at("FIG-03", "  ") }),
      task({ id: "yard", plant: at("LEM-01", "", 1, "backyard") }),
    ];
    const [farm, yard] = composeDigest(tasks, today);
    expect(farm.body).toBe("Water 2 plants");
    expect(yard.body).toBe(en.digest.line("Water (20 L)", "LEM-01"));
  });

  it("counts a plant once when two of its waterings are due", () => {
    const olive = (id: string, due_on: string) => task({ id, plant_id: "olive", due_on, plant: at("OL-01", "row 2", 3) });
    const tasks = [olive("y", "2026-09-16"), olive("t", today), task({ id: "fig", plant: at("FIG-01", "row 2") })];
    const [farm] = composeDigest(tasks, today);
    expect(farm.tasks).toBe(3);
    expect(farm.body).toBe(en.digest.line(en.digest.batch(4, 20, 20), "row 2"));
  });

  it("keeps a reminder the grower wrote on its own line beside its zone's batch", () => {
    const tasks = [
      task({ id: "a", plant: at("OL-01", "row 2") }),
      task({ id: "b", plant: at("OL-03", "row 2") }),
      task({ id: "m", rule_key: "manual:r1", title: "Water the new graft by hand", plant: at("OL-04", "row 2") }),
    ];
    const [farm] = composeDigest(tasks, today);
    expect(farm.body.split("\n")).toEqual([
      en.digest.line(en.digest.batch(2, 20, 20), "row 2"),
      en.digest.line("Water the new graft by hand", "OL-04"),
    ]);
  });

  it("writes no '+N more' when the lines hold every task", () => {
    const tasks = [
      task({ id: "a1", plant: at("a1", "A") }),
      task({ id: "a2", plant: at("a2", "A") }),
      task({ id: "c", plant: at("c", "C") }),
      task({ id: "b1", plant: at("b1", "B") }),
      task({ id: "b2", plant: at("b2", "B") }),
      task({ id: "b3", plant: at("b3", "B") }),
    ];
    const [farm] = composeDigest(tasks, today);
    expect(farm.body.split("\n")).toHaveLength(3);
    expect(farm.body).not.toContain("+");
  });

  it("never gathers a zone's lone watering", () => {
    const tasks = [task({ id: "lone", title: "Water (20 L)", plant: at("OL-03", "row 3") }), task({ id: "other", plant: at("OL-04", "row 4") })];
    const [farm] = composeDigest(tasks, today);
    expect(farm.body.split("\n")).toEqual([en.digest.line("Water (20 L)", "OL-03"), en.digest.line("Water (20 L)", "OL-04")]);
  });
});

describe("composeDigest: window batches (Phase 12)", () => {
  const today = "2026-09-17";
  const at = (tag: string, zone: string, quantity = 1, care_calendar: CareRule[] = []) => ({ tag, site: "farm" as const, zone, quantity, care_calendar });
  /** A window of its own plant, "Scout for olive fly" from 1 Jun to 31 Oct unless the partial says otherwise. */
  const win = (id: string, plant: DigestTask["plant"], partial: Partial<DigestTask> = {}) =>
    task({ id, type: "scout", rule_key: "scout:6-7-8-9-10:any", due_on: "2026-06-01", window_end: "2026-10-31", title: "Scout for olive fly", plant, ...partial });

  it("gives a window job its plants share one line, with the title, the plants and the zone", () => {
    const tasks = [
      win("a", at("OL-01", "row 2")),
      win("b", at("POM-H", "Row 2", 12)),
      task({ id: "w1", due_on: "2026-09-01", window_end: "2026-09-30", title: "Establishment watering", plant: at("OL-05", "row 2") }),
      task({ id: "w2", due_on: "2026-09-01", window_end: "2026-09-30", title: "Establishment watering", plant: at("OL-06", "row 2") }),
    ];
    const [farm] = composeDigest(tasks, today);
    expect(farm.tasks).toBe(4);
    expect(farm.body.split("\n")).toEqual([
      en.digest.line(en.digest.group("Scout for olive fly", 13), "row 2"),
      en.digest.line(en.digest.group("Establishment watering", 2), "row 2"),
    ]);
    expect(en.digest.group("Scout for olive fly", 13)).toBe("Scout for olive fly · 13 plants");
  });

  it("keeps different jobs on lines of their own, and a lone plant's window as its own line", () => {
    const tasks = [
      win("a", at("OL-01", "row 2")),
      win("b", at("OL-02", "row 2")),
      win("fig", at("FIG-01", "row 2"), { title: "Scout for fig mites" }),
      win("c", at("OL-03", "row 2"), { type: "prune", rule_key: "prune:6-7-8-9-10:any", title: "Scout for olive fly" }),
    ];
    const [farm] = composeDigest(tasks, today);
    // Same day: the calendar's kind order (prune before scout), then the title.
    expect(farm.body.split("\n")).toEqual([
      en.digest.line("Scout for olive fly", "OL-03"),
      en.digest.line("Scout for fig mites", "FIG-01"),
      en.digest.line(en.digest.group("Scout for olive fly", 2), "row 2"),
    ]);
  });

  it("batches the early notices of one job with their day in front, and plants with no zone without a zone part", () => {
    const rule = window("harvest", [10, 11], { lead_days: 14, title: "Harvest olives" });
    const notice = (id: string, zone: string) =>
      task({ id, type: "harvest", rule_key: "harvest:10-11:any", due_on: "2026-10-01", window_end: "2026-11-30", title: "Harvest olives", plant: at(id, zone, 1, [rule]) });
    const [farm] = composeDigest([notice("OL-01", ""), notice("OL-02", " ")], today);
    expect(farm.body).toBe(en.digest.soon("1 Oct", en.digest.group("Harvest olives", 2)));
  });

  it("counts the tasks a window line holds when it says how many more there are", () => {
    const tasks = [
      task({ id: "late", due_on: "2026-09-15", plant: at("c", "C") }),
      win("a1", at("a1", "A")),
      win("a2", at("a2", "A")),
      win("a3", at("a3", "A")),
      win("b", at("b", "B")),
      win("d1", at("d1", "D")),
      win("d2", at("d2", "D")),
    ];
    const [farm] = composeDigest(tasks, today);
    expect(farm.tasks).toBe(7);
    expect(farm.body.split("\n")).toEqual([
      en.digest.line("Water (20 L)", "c"),
      en.digest.line(en.digest.group("Scout for olive fly", 3), "A"),
      en.digest.line("Scout for olive fly", "b"),
      en.digest.more(2),
    ]);
  });
});

describe("loadDigestTasks", () => {
  it("reads pending tasks with their plant's site and rules", async () => {
    const f = fixture();
    f.plant([water([9], 7)], { tag: "fig", site: "backyard", zone: "courtyard", quantity: 3 });
    await runExpansion(f.db, "2026-09-02");
    const tasks = await loadDigestTasks(f.db, "2026-09-02");
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].plant).toMatchObject({ tag: "fig", site: "backyard", zone: "courtyard", quantity: 3 });
    expect(tasks[0].plant_id).toBe(f.state.plants[0].id);
    expect(tasks[0].plant?.care_calendar).toHaveLength(1);
  });

  it("reads a plant row with no quantity or zone as one plant with no zone", async () => {
    const f = fixture();
    f.plant([water([9], 7)], { quantity: null, zone: null });
    await runExpansion(f.db, "2026-09-02");
    const [first] = await loadDigestTasks(f.db, "2026-09-02");
    expect(first.plant).toMatchObject({ zone: "", quantity: 1 });
  });

  it("reads past the 1,000-row cap", async () => {
    const f = fixture();
    for (let i = 0; i < 12; i++) f.plant([water([9, 10, 11, 12], 1)]);
    await runExpansion(f.db, "2026-09-02");
    const tasks = await loadDigestTasks(f.db, "2026-09-02");
    expect(f.pending().length).toBeGreaterThan(1000);
    expect(tasks.length).toBe(f.pending().length);
  });
});
