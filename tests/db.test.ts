// The app's task writes (src/lib/db.ts) against the in-memory tables, with the browser client mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runExpansion } from "../api/_tasks.js";
import { en } from "../src/i18n/en";
import { addDays } from "../src/lib/dates";
import type { Task } from "../src/types";
import { makeClient, resetState, sharedState, type Row } from "./mockdb";
import { water } from "./fixtures";

vi.mock("../src/lib/supabase", async () => {
  const { makeDb, sharedState } = await import("./mockdb");
  return { supabase: makeDb(sharedState), PHOTOS_BUCKET: "photos", supabaseConfigured: true };
});

const { snoozeTask, completeTask, reopenTask, deletePlant, countDueTasks } = await import("../src/lib/db");

const db = makeClient(sharedState);
let n = 0;

function addTask(partial: Partial<Task>): Task {
  n += 1;
  const row: Row = {
    id: `task-${n}`,
    plant_id: "p1",
    type: "harvest",
    rule_key: "harvest:10-11:any",
    due_on: "2026-10-01",
    window_end: "2026-11-30",
    title: "Harvest",
    instruction: "",
    status: "pending",
    acted_at: null,
    note: "",
    created_at: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
    ...partial,
  };
  sharedState.tasks.push(row);
  return row as unknown as Task;
}

const pending = () => sharedState.tasks.filter((t) => t.status === "pending");
const byId = (id: string) => sharedState.tasks.find((t) => t.id === id)!;

beforeEach(() => resetState(sharedState));

describe("snoozeTask", () => {
  it("moves an overdue task to today + days and closes the old row", async () => {
    const task = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-01", window_end: null });
    const moved = await snoozeTask(task, 1, "2026-06-05");
    expect(moved).toBe("2026-06-06");
    expect(byId(task.id).status).toBe("snoozed");
    expect(pending().map((t) => t.due_on)).toEqual(["2026-06-06"]);
  });

  it("counts from the task's own day when it is in the future, so it never moves earlier or vanishes", async () => {
    const task = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-11-04", window_end: null });
    const moved = await snoozeTask(task, 1, "2026-11-03");
    expect(moved).toBe("2026-11-05");
    expect(pending()).toHaveLength(1);
    expect(pending()[0].due_on).toBe("2026-11-05");
    expect(byId(task.id).status).toBe("snoozed");
  });

  it("lets a pending task of the same rule on the new day stand in", async () => {
    const task = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-01", window_end: null });
    const next = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-08", window_end: null });
    const moved = await snoozeTask(task, 7, "2026-06-01");
    expect(moved).toBe("2026-06-08");
    expect(pending().map((t) => t.id)).toEqual([next.id]);
  });

  it("steps past a day taken by an acted row of the same rule", async () => {
    const task = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-01", window_end: null });
    addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-08", window_end: null, status: "done", acted_at: "2026-06-07T10:00:00Z" });
    const moved = await snoozeTask(task, 7, "2026-06-01");
    expect(moved).toBe("2026-06-09");
    expect(pending().map((t) => t.due_on)).toEqual(["2026-06-09"]);
  });

  it("gives up with a message when a week of days is taken", async () => {
    const task = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-01", window_end: null });
    for (let i = 0; i <= 8; i++) {
      addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: addDays("2026-06-02", i), window_end: null, status: "skipped", acted_at: "2026-06-01T10:00:00Z" });
    }
    await expect(snoozeTask(task, 1, "2026-06-01")).rejects.toThrow(en.today.snoozeNoDay);
    expect(byId(task.id).status).toBe("pending");
  });

  it("refuses to snooze a task acted on since the screen loaded, and takes its copy back", async () => {
    const task = addTask({ type: "water", rule_key: "water:6-7-8:any:7", due_on: "2026-06-01", window_end: null });
    byId(task.id).status = "done";
    byId(task.id).acted_at = "2026-06-01T08:00:00Z";
    await expect(snoozeTask(task, 3, "2026-06-01")).rejects.toThrow(en.today.alreadyActed);
    expect(sharedState.tasks).toHaveLength(1);
    expect(byId(task.id).status).toBe("done");
  });

  it("extends a window to the new day when the snooze passes its end", async () => {
    const task = addTask({ due_on: "2026-08-01", window_end: "2026-09-30" });
    const moved = await snoozeTask(task, 3, "2026-09-29");
    expect(moved).toBe("2026-10-02");
    const copy = pending()[0];
    expect(copy.window_end).toBe("2026-10-02");
    // The expansion does not close it before its day.
    const r = await runExpansion(db, "2026-10-01");
    expect(r.expired).toBe(0);
    expect(pending()).toHaveLength(1);
  });

  it("keeps the window's end when the snooze stays inside it", async () => {
    const task = addTask({ due_on: "2026-10-01", window_end: "2026-11-30" });
    await snoozeTask(task, 7, "2026-10-20");
    expect(pending()[0].window_end).toBe("2026-11-30");
  });

  it("holds back the waterings a snooze skips over, and the expansion leaves them closed", async () => {
    sharedState.species.push({ id: "s1", care_calendar: [water([6, 7, 8, 9], 3)] });
    sharedState.plants.push({ id: "p1", species_id: "s1", tag: "Fig", site: "farm", planted_on: null });
    await runExpansion(db, "2026-07-04");
    const today = pending().find((t) => t.due_on === "2026-07-04") as unknown as Task;
    expect(today).toBeDefined();
    const moved = await snoozeTask(today, 7, "2026-07-04");
    expect(moved).toBe("2026-07-11");
    const inside = sharedState.tasks.filter((t) => (t.due_on as string) > "2026-07-04" && (t.due_on as string) < "2026-07-11");
    expect(inside.map((t) => t.due_on)).toEqual(["2026-07-07", "2026-07-10"]);
    expect(inside.every((t) => t.status === "snoozed" && (t.note as string).startsWith("Covered by the snooze"))).toBe(true);
    expect(pending().map((t) => t.due_on).sort().slice(0, 2)).toEqual(["2026-07-11", "2026-07-13"]);
    for (let day = "2026-07-05"; day <= "2026-07-10"; day = addDays(day, 1)) await runExpansion(db, day);
    expect(pending().filter((t) => (t.due_on as string) <= "2026-07-10")).toHaveLength(0);
  });
});

describe("completeTask and reopenTask", () => {
  it("closes a pending row once and reopens a done one", async () => {
    const task = addTask({});
    expect(await completeTask(task.id)).toBe(true);
    expect(await completeTask(task.id)).toBe(false);
    expect(byId(task.id).status).toBe("done");
    expect(await reopenTask(task.id)).toBe(true);
    expect(byId(task.id)).toMatchObject({ status: "pending", acted_at: null, note: "" });
  });
});

describe("countDueTasks", () => {
  it("counts what is late or due today, like the round: open windows stay out, ended ones count", async () => {
    addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-10-24", window_end: null }); // late
    addTask({ type: "water", rule_key: "water:6:any:8", due_on: "2026-10-26", window_end: null }); // today
    addTask({ type: "water", rule_key: "water:6:any:9", due_on: "2026-10-28", window_end: null }); // coming
    addTask({ due_on: "2026-10-01", window_end: "2026-12-31" }); // open window
    addTask({ rule_key: "harvest:9:any", due_on: "2026-09-01", window_end: "2026-10-20" }); // ended window
    addTask({ rule_key: "prune:10-11:any", due_on: "2026-10-26", window_end: "2026-11-30" }); // window opening today
    addTask({ rule_key: "harvest:8:any", due_on: "2026-08-01", window_end: "2026-09-30", status: "done" });
    expect(await countDueTasks("2026-10-26")).toBe(4);
  });
});

describe("deletePlant", () => {
  it("removes the row, what hangs off it, and its files in the bucket", async () => {
    sharedState.species.push({ id: "s1", care_calendar: [water([6, 7, 8, 9], 3)] });
    sharedState.plants.push({ id: "p1", species_id: "s1", tag: "Fig", site: "farm", planted_on: null });
    sharedState.plants.push({ id: "p2", species_id: "s1", tag: "Other", site: "farm", planted_on: null });
    sharedState.photos.push({ id: "ph1", plant_id: "p1", storage_path: "p1/1.jpg", kind: "identify" });
    sharedState.objects.add("p1/1.jpg");
    sharedState.objects.add("p2/1.jpg");
    await runExpansion(db, "2026-07-04");
    expect(pending().some((t) => t.plant_id === "p1")).toBe(true);
    await deletePlant("p1");
    expect(sharedState.plants.map((p) => p.id)).toEqual(["p2"]);
    expect(sharedState.tasks.some((t) => t.plant_id === "p1")).toBe(false);
    expect(sharedState.photos).toHaveLength(0);
    expect([...sharedState.objects]).toEqual(["p2/1.jpg"]);
    expect(sharedState.species).toHaveLength(1);
  });
});
