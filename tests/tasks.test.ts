import { describe, expect, it } from "vitest";
import { expandPlant, monthRuns, periodOf, ruleKey, runExpansion, staleTasks, type StaleCandidate } from "../api/_tasks.js";
import { en } from "../src/i18n/en";
import { addDays } from "../src/lib/dates";
import { dueDates, fixture, rule, water, window } from "./fixtures";

describe("ruleKey", () => {
  it("sorts and cleans the months so the order Claude wrote does not matter", () => {
    expect(ruleKey(rule({ type: "prune", months: [12, 1, 2], age: "mature" }))).toBe("prune:1-2-12:mature");
    expect(ruleKey(rule({ type: "prune", months: [2, 2, 13, 0, 1], age: "any" }))).toBe("prune:1-2:any");
  });

  it("carries the interval of a periodic watering, and nothing for a water window", () => {
    expect(ruleKey(water([6, 7, 8], 7))).toBe("water:6-7-8:any:7");
    expect(ruleKey(water([6, 7, 8], 0))).toBe("water:6-7-8:any");
    expect(periodOf("water:6-7-8:any:7")).toBe(7);
    expect(periodOf("water:6-7-8:any")).toBeNull();
    expect(periodOf("prune:1-2:any")).toBeNull();
    expect(periodOf("diagnosis:photo-1")).toBeNull();
  });
});

describe("monthRuns", () => {
  it("splits separate months and joins runs across the year end", () => {
    expect(monthRuns([4, 10])).toEqual([[4], [10]]);
    expect(monthRuns([11, 12, 1, 2, 3])).toEqual([[11, 12, 1, 2, 3]]);
    expect(monthRuns([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]);
    expect(monthRuns([])).toEqual([]);
    expect(monthRuns([6, 7, 8, 10])).toEqual([[6, 7, 8], [10]]);
  });
});

describe("expandPlant", () => {
  const plant = (calendar: Parameters<typeof expandPlant>[0]["care_calendar"], planted_on: string | null = null) => ({
    id: "p1",
    planted_on,
    care_calendar: calendar,
  });

  it("makes one task per window, due on its first day, even when the window is already open", () => {
    const { seeds } = expandPlant(plant([window("harvest", [10, 11, 12])]), "2026-10-25");
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ due_on: "2026-10-01", window_end: "2026-12-31", type: "harvest", rule_key: "harvest:10-11-12:any" });
  });

  it("skips a window that ended and one that starts after the horizon", () => {
    expect(expandPlant(plant([window("harvest", [10, 11, 12])]), "2027-01-05").seeds).toHaveLength(0);
    expect(expandPlant(plant([window("harvest", [10, 11, 12])]), "2026-06-01").seeds).toHaveLength(0);
    expect(expandPlant(plant([window("harvest", [10, 11, 12])]), "2026-07-10").seeds).toHaveLength(1);
  });

  it("runs a window across the year end", () => {
    const { seeds } = expandPlant(plant([window("prune", [11, 12, 1, 2, 3])]), "2026-12-20");
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ due_on: "2026-11-01", window_end: "2027-03-31" });
  });

  it("anchors waterings on the window's first day and keeps the litres in the title", () => {
    const { seeds } = expandPlant(plant([water([6, 7, 8], 7)]), "2026-06-10");
    expect(dueDates(seeds)[0]).toBe("2026-06-15");
    expect(dueDates(seeds).at(-1)).toBe("2026-08-31");
    expect(seeds).toHaveLength(12);
    expect(seeds[0].title).toBe("Deep watering (40 L)");
    expect(seeds[0].window_end).toBeNull();
  });

  it("gives the same days whatever day the expansion runs on", () => {
    const a = dueDates(expandPlant(plant([water([6, 7, 8], 7)]), "2026-06-10").seeds);
    const b = dueDates(expandPlant(plant([water([6, 7, 8], 7)]), "2026-06-12").seeds);
    expect(b.every((d) => a.includes(d))).toBe(true);
  });

  it("applies rules by the plant's stage, with no planting date counting as mature", () => {
    const calendar = [water([6, 7, 8], 7, { age: "establishment", title: "Young" }), water([6, 7, 8], 21, { age: "mature", title: "Old" })];
    const mature = expandPlant(plant(calendar, null), "2026-06-10");
    expect(mature.seeds.every((s) => s.title.startsWith("Old"))).toBe(true);
    const young = expandPlant(plant(calendar, "2025-01-01"), "2026-06-10");
    expect(young.seeds.every((s) => s.title.startsWith("Young"))).toBe(true);
    expect([...young.keys]).toEqual([ruleKey(calendar[0])]);
  });

  it("ignores malformed rules", () => {
    const bad = { type: "swim", months: [1], age: "any", title: "x" } as unknown as ReturnType<typeof rule>;
    expect(expandPlant(plant([bad]), "2026-01-10").seeds).toHaveLength(0);
  });
});

describe("staleTasks", () => {
  const task = (partial: Partial<StaleCandidate>): StaleCandidate => ({
    id: "t",
    plant_id: "p1",
    type: "water",
    rule_key: "water:6-7-8:any",
    due_on: "2026-06-01",
    window_end: null,
    status: "pending",
    ...partial,
  });

  it("expires ended windows and keeps open ones", () => {
    const rows = [
      task({ id: "ended", type: "harvest", rule_key: "harvest:10:any", due_on: "2026-10-01", window_end: "2026-10-31" }),
      task({ id: "open", type: "harvest", rule_key: "harvest:11:any", due_on: "2026-11-01", window_end: "2026-11-30" }),
    ];
    expect(staleTasks(rows, "2026-11-05")).toEqual({ expired: ["ended"], superseded: [], missed: [] });
  });

  it("keeps the newest of several due waterings of one rule", () => {
    const rows = [task({ id: "a", due_on: "2026-06-01" }), task({ id: "b", due_on: "2026-06-08" }), task({ id: "c", due_on: "2026-06-15" })];
    const stale = staleTasks(rows, "2026-06-16");
    expect(stale.superseded.sort()).toEqual(["a", "b"]);
    expect(stale.missed).toEqual([]);
  });

  it("leaves acted rows, future waterings and diagnosis rows alone", () => {
    const rows = [
      task({ id: "done", status: "done" }),
      task({ id: "future", due_on: "2026-06-20" }),
      task({ id: "diag", type: "scout", rule_key: "diagnosis:photo-1", due_on: "2026-05-01" }),
      task({ id: "only" }),
    ];
    expect(staleTasks(rows, "2026-06-16")).toEqual({ expired: [], superseded: [], missed: [] });
  });

  it("closes the season's last watering once its interval has passed, and not before", () => {
    const last = task({ id: "last", rule_key: "water:6-7-8-9:any:7", due_on: "2026-09-28" });
    expect(staleTasks([last], "2026-10-04").missed).toEqual([]);
    expect(staleTasks([last], "2026-10-05").missed).toEqual(["last"]);
    // A key from before the interval was part of it says nothing about the period: left alone.
    expect(staleTasks([task({ id: "legacy", rule_key: "water:6-7-8-9:any", due_on: "2026-09-28" })], "2027-03-01").missed).toEqual([]);
  });
});

describe("runExpansion", () => {
  it("creates the tasks once and is idempotent", async () => {
    const f = fixture();
    f.plant([window("harvest", [10, 11, 12]), water([6, 7, 8, 9, 10], 7)]);
    const first = await runExpansion(f.db, "2026-10-25");
    expect(first.plants).toBe(1);
    expect(first.created).toBeGreaterThan(1);
    const second = await runExpansion(f.db, "2026-10-25");
    expect(second.created).toBe(0);
    expect(second.removed).toBe(0);
  });

  it("removes pending tasks of rules that no longer apply and leaves acted ones", async () => {
    const f = fixture();
    f.plant([water([10, 11], 7)]);
    await runExpansion(f.db, "2026-10-25");
    const pending = f.pending();
    expect(pending.length).toBeGreaterThan(2);
    pending[0].status = "done";
    pending[0].acted_at = "2026-10-26T08:00:00Z";
    f.state.species[0].care_calendar = [window("prune", [1, 2])];
    const r = await runExpansion(f.db, "2026-10-27");
    expect(r.removed).toBe(pending.length - 1);
    expect(f.tasks((t) => t.type === "water")).toHaveLength(1);
    expect(f.tasks((t) => t.type === "water")[0].status).toBe("done");
    expect(f.pending().every((t) => t.type === "prune")).toBe(true);
  });

  it("closes an ended window with its note and a done task keeps its status", async () => {
    const f = fixture();
    f.plant([window("harvest", [10])]);
    await runExpansion(f.db, "2026-10-25");
    const r = await runExpansion(f.db, "2026-11-02");
    expect(r.expired).toBe(1);
    const row = f.tasks()[0];
    expect(row.status).toBe("skipped");
    expect(row.note).toBe(en.expansion.windowEnded);
  });

  it("collapses the missed waterings of a week away to the newest", async () => {
    const f = fixture();
    f.plant([water([6, 7, 8], 3)]);
    for (let day = "2026-06-01"; day <= "2026-06-14"; day = addDays(day, 1)) await runExpansion(f.db, day);
    const due = f.pending().filter((t) => (t.due_on as string) <= "2026-06-14");
    expect(due).toHaveLength(1);
    expect(due[0].due_on).toBe("2026-06-13");
    expect(f.tasks((t) => t.note === en.expansion.superseded).length).toBeGreaterThan(0);
  });

  it("does not keep the season's last watering in the digest until the next season", async () => {
    const f = fixture();
    f.plant([water([6, 7, 8, 9], 7)]);
    for (let day = "2026-09-20"; day <= "2026-10-06"; day = addDays(day, 1)) await runExpansion(f.db, day);
    expect(f.pending()).toHaveLength(0);
    const closed = f.tasks((t) => t.note === en.expansion.missed);
    expect(closed).toHaveLength(1);
    expect(closed[0].due_on).toBe("2026-09-28");
    expect(f.tasks((t) => t.due_on === "2026-09-21")[0].note).toBe(en.expansion.superseded);
  });

  it("replaces the schedule when a watering interval changes", async () => {
    const f = fixture();
    f.plant([water([6, 7, 8], 3)]);
    for (let day = "2026-06-01"; day <= "2026-06-04"; day = addDays(day, 1)) await runExpansion(f.db, day);
    f.state.species[0].care_calendar = [water([6, 7, 8], 7)];
    const r = await runExpansion(f.db, "2026-06-05");
    expect(r.removed).toBeGreaterThan(0);
    const june = dueDates(f.pending().filter((t) => (t.due_on as string) <= "2026-06-30"));
    expect(june).toEqual(["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]);
  });

  it("does not bring back a finished window when its rule changes months", async () => {
    const f = fixture();
    f.plant([window("harvest", [10, 11, 12])]);
    await runExpansion(f.db, "2026-10-20");
    const harvest = f.pending()[0];
    harvest.status = "done";
    harvest.acted_at = "2026-10-20T10:00:00Z";
    f.state.species[0].care_calendar = [window("harvest", [10, 11, 12, 1])];
    const r = await runExpansion(f.db, "2026-10-25");
    expect(r.created).toBe(0);
    expect(f.pending()).toHaveLength(0);
    // The next year's window is a new one and comes back as usual.
    const next = await runExpansion(f.db, "2027-09-15");
    expect(next.created).toBe(1);
    expect(f.pending()[0].due_on).toBe("2027-10-01");
  });

  it("brings back a window the expansion closed as ended when the new rule extends it", async () => {
    const f = fixture();
    f.plant([window("harvest", [10, 11])]);
    await runExpansion(f.db, "2026-10-20");
    await runExpansion(f.db, "2026-12-02"); // closes it: "Window ended"
    expect(f.pending()).toHaveLength(0);
    f.state.species[0].care_calendar = [window("harvest", [10, 11, 12, 1])];
    const r = await runExpansion(f.db, "2026-12-05");
    expect(r.created).toBe(1);
  });

  it("keeps the stage change from re-opening a done window", async () => {
    const f = fixture();
    // Planted 2024-11-01: establishment until 2026-11-01, when the mature rule takes over mid-window.
    f.plant([window("prune", [10, 11, 12], { age: "establishment" }), window("prune", [10, 11, 12], { age: "mature" })], {
      planted_on: "2024-11-01",
    });
    await runExpansion(f.db, "2026-10-20");
    const prune = f.pending()[0];
    expect(prune.rule_key).toBe("prune:10-11-12:establishment");
    prune.status = "done";
    prune.acted_at = "2026-10-21T10:00:00Z";
    const r = await runExpansion(f.db, "2026-11-03");
    expect(r.created).toBe(0);
    expect(f.pending()).toHaveLength(0);
  });

  it("reads past PostgREST's 1,000-row cap, so no obsolete task is left behind", async () => {
    // Twelve plants watered daily all year: 12 × 91 pending rows, more than one response holds.
    const f = fixture();
    for (let i = 0; i < 12; i++) f.plant([water([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 1)]);
    const first = await runExpansion(f.db, "2026-06-01");
    expect(first.created).toBe(12 * 91);
    const again = await runExpansion(f.db, "2026-06-01");
    expect(again.created).toBe(0);
    for (const species of f.state.species) species.care_calendar = [window("prune", [1, 2])];
    const r = await runExpansion(f.db, "2026-06-01");
    expect(r.removed).toBe(12 * 91);
    expect(f.pending()).toHaveLength(0);
  });

  it("expands one plant only when asked", async () => {
    const f = fixture();
    const a = f.plant([window("harvest", [10])]);
    f.plant([window("harvest", [10])]);
    const r = await runExpansion(f.db, "2026-10-25", a);
    expect(r.plants).toBe(1);
    expect(f.tasks().every((t) => t.plant_id === a)).toBe(true);
  });
});
