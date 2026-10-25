import { describe, expect, it } from "vitest";
import { composeDigest, inDigest, loadDigestTasks, type DigestTask } from "../api/_push.js";
import { runExpansion } from "../api/_tasks.js";
import { en } from "../src/i18n/en";
import { fixture, water, window } from "./fixtures";

const harvestRule = window("harvest", [10, 11], { lead_days: 14, title: "Harvest olives" });

function task(partial: Partial<DigestTask>): DigestTask {
  return {
    id: "t",
    type: "water",
    rule_key: "water:6:any",
    due_on: "2026-09-17",
    window_end: null,
    title: "Water (20 L)",
    plant: { tag: "fig", site: "farm", care_calendar: [] },
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
      plant: { tag: "olive", site: "farm", care_calendar: [harvestRule] },
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
      task({ id: "1", plant: { tag: "fig", site: "backyard", care_calendar: [] } }),
      task({ id: "2", plant: { tag: "carob", site: "farm", care_calendar: [] } }),
      task({ id: "3", plant: null }),
    ];
    const messages = composeDigest(tasks, "2026-09-17");
    expect(messages.map((m) => m.site)).toEqual(["farm", "backyard"]);
    expect(messages[0].title).toBe(en.digest.title(en.site.farm, 1));
    expect(messages[0].body).toBe(en.digest.line("Water (20 L)", "carob"));
  });

  it("shows three lines and counts the rest", () => {
    const tasks = ["a", "b", "c", "d", "e"].map((id) => task({ id, title: `Water ${id}` }));
    const [farm] = composeDigest(tasks, "2026-09-17");
    expect(farm.tasks).toBe(5);
    expect(farm.body.split("\n")).toHaveLength(4);
    expect(farm.body.endsWith(en.digest.more(2))).toBe(true);
  });

  it("puts the one-day early notice first, then the late watering, today's, and the open windows", () => {
    const olive = { tag: "olive", site: "farm" as const, care_calendar: [harvestRule] };
    const tasks = [
      task({ id: "open", type: "scout", rule_key: "scout:6-7-8-9-10:any", due_on: "2026-06-01", window_end: "2026-10-31", title: "Scout for olive fly", plant: olive }),
      task({ id: "today", due_on: "2026-09-17", title: "Water (8 L)", plant: { tag: "papaya", site: "farm", care_calendar: [] } }),
      task({ id: "late", due_on: "2026-09-15", title: "Water (20 L)", plant: { tag: "carob", site: "farm", care_calendar: [] } }),
      task({ id: "notice", type: "harvest", rule_key: "harvest:10-11:any", due_on: "2026-10-01", window_end: "2026-11-30", title: "Harvest olives", plant: olive }),
      task({ id: "fig", due_on: "2026-09-17", title: "Water (20 L)", plant: { tag: "fig", site: "farm", care_calendar: [] } }),
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

describe("loadDigestTasks", () => {
  it("reads pending tasks with their plant's site and rules", async () => {
    const f = fixture();
    f.plant([water([9], 7)], { tag: "fig", site: "backyard" });
    await runExpansion(f.db, "2026-09-02");
    const tasks = await loadDigestTasks(f.db, "2026-09-02");
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].plant).toMatchObject({ tag: "fig", site: "backyard" });
    expect(tasks[0].plant?.care_calendar).toHaveLength(1);
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
