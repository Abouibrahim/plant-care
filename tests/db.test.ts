// The app's task writes and reads (src/lib/db.ts) against the in-memory tables, with the browser client mocked.
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

const {
  snoozeTask,
  completeTask,
  completeTasks,
  reopenTask,
  reopenTasks,
  skipTasks,
  insertManualTask,
  deletePlant,
  countDueTasks,
  listRecentTreatments,
  findPlantsByTagCode,
  listPlantSpots,
  latestPhotos,
  photoUrl,
  uploadThumbnail,
} = await import("../src/lib/db");

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

  it("keeps the note given with Done, trimmed, and Undo clears it", async () => {
    const task = addTask({});
    expect(await completeTask(task.id, "  12 kg ")).toBe(true);
    expect(byId(task.id)).toMatchObject({ status: "done", note: "12 kg" });
    expect(byId(task.id).acted_at).not.toBeNull();
    await reopenTask(task.id);
    expect(byId(task.id).note).toBe("");
  });
});

describe("completeTasks and reopenTasks", () => {
  it("closes the pending rows of the set in one update and returns the ids that changed", async () => {
    const a = addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-06-01", window_end: null });
    const b = addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-06-08", window_end: null, plant_id: "p2" });
    const c = addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-06-01", window_end: null, plant_id: "p3", status: "done", acted_at: "2026-06-01T06:00:00Z" });
    const closed = await completeTasks([a.id, b.id, c.id]);
    expect(closed.sort()).toEqual([a.id, b.id].sort());
    expect(byId(a.id).status).toBe("done");
    expect(byId(b.id).status).toBe("done");
    expect(byId(a.id).acted_at).not.toBeNull();
    // The row closed elsewhere keeps its own time.
    expect(byId(c.id).acted_at).toBe("2026-06-01T06:00:00Z");
    expect(await completeTasks([a.id, b.id])).toEqual([]);
  });

  it("reopens the done rows of the set only, so a skipped row and an empty set change nothing", async () => {
    const a = addTask({ status: "done", acted_at: "2026-10-01T06:00:00Z" });
    const b = addTask({ status: "done", acted_at: "2026-10-01T06:00:00Z", plant_id: "p2" });
    const skipped = addTask({ status: "skipped", acted_at: "2026-10-01T06:00:00Z", note: "Too wet", plant_id: "p3" });
    const reopened = await reopenTasks([a.id, b.id, skipped.id], "done");
    expect(reopened.sort()).toEqual([a.id, b.id].sort());
    expect(byId(a.id)).toMatchObject({ status: "pending", acted_at: null, note: "" });
    expect(byId(b.id).status).toBe("pending");
    expect(byId(skipped.id)).toMatchObject({ status: "skipped", note: "Too wet" });
    expect(await reopenTasks([], "done")).toEqual([]);
    expect(await completeTasks([])).toEqual([]);
  });

  it("keeps a pending reminder's own words through a set Done and its Undo", async () => {
    const reminder = addTask({ type: "water", rule_key: "manual:r1", due_on: "2026-06-01", window_end: null, title: "Water the new graft", note: "by hand, 5 L" });
    expect(await completeTasks([reminder.id])).toEqual([reminder.id]);
    expect(byId(reminder.id)).toMatchObject({ status: "done", note: "by hand, 5 L" });
    expect(await reopenTasks([reminder.id], "done")).toEqual([reminder.id]);
    expect(byId(reminder.id)).toMatchObject({ status: "pending", acted_at: null, note: "by hand, 5 L" });
  });
});

describe("skipTasks", () => {
  it("skips the pending rows of a set with one reason, and Undo by status reopens them", async () => {
    const a = addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-06-01", window_end: null });
    const b = addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-06-01", window_end: null, plant_id: "p2" });
    const done = addTask({ type: "water", rule_key: "water:6:any:7", due_on: "2026-06-01", window_end: null, plant_id: "p3", status: "done", acted_at: "2026-06-01T06:00:00Z" });
    const skipped = await skipTasks([a.id, b.id, done.id], " soil still wet ");
    expect(skipped.sort()).toEqual([a.id, b.id].sort());
    expect(byId(a.id)).toMatchObject({ status: "skipped", note: "soil still wet" });
    expect(byId(done.id)).toMatchObject({ status: "done", note: "" });
    // Undo of a skipped set reopens the skipped rows only, never the one that was done.
    expect((await reopenTasks([a.id, b.id, done.id], "skipped")).sort()).toEqual([a.id, b.id].sort());
    expect(byId(a.id)).toMatchObject({ status: "pending", acted_at: null, note: "" });
    expect(byId(done.id).status).toBe("done");
    expect(await skipTasks([], "x")).toEqual([]);
  });
});

describe("insertManualTask", () => {
  const base = { plant_id: "p1", type: "feed" as const, title: "  Compost under the fig ", note: " two buckets ", todayIso: "2026-10-30" };

  it("writes a done row keyed manual:, dated today, with the title and note trimmed and no instruction", async () => {
    const row = await insertManualTask(base);
    expect(row.rule_key.startsWith("manual:")).toBe(true);
    expect(row).toMatchObject({ plant_id: "p1", type: "feed", status: "done", due_on: "2026-10-30", window_end: null, instruction: "", title: "Compost under the fig", note: "two buckets" });
    expect(row.acted_at).not.toBeNull();
    expect(sharedState.tasks).toHaveLength(1);
  });

  it("writes a pending reminder on the chosen day instead when asked", async () => {
    const row = await insertManualTask({ ...base, type: "protect", title: "Stake it", note: "", remind_on: "2026-11-03" });
    expect(row).toMatchObject({ status: "pending", due_on: "2026-11-03", acted_at: null, window_end: null });
    expect(row.rule_key.startsWith("manual:")).toBe(true);
    expect(await countDueTasks("2026-11-03")).toBe(1);
  });

  it("gives every entry its own key, so two of one kind on one day both stand", async () => {
    const first = await insertManualTask(base);
    const second = await insertManualTask(base);
    expect(first.rule_key).not.toBe(second.rule_key);
    expect(sharedState.tasks).toHaveLength(2);
  });

  it("is left alone by the expansion, the reminder pending and the log done", async () => {
    sharedState.species.push({ id: "s1", care_calendar: [water([6, 7, 8, 9], 3)] });
    sharedState.plants.push({ id: "p1", species_id: "s1", tag: "Fig", site: "farm", planted_on: null });
    const done = await insertManualTask(base);
    const reminder = await insertManualTask({ ...base, type: "protect", title: "Stake it", remind_on: "2026-10-20" });
    const r = await runExpansion(db, "2026-10-30");
    expect(r.removed).toBe(0);
    expect(r.expired + r.superseded).toBe(0);
    expect(byId(done.id).status).toBe("done");
    expect(byId(reminder.id)).toMatchObject({ status: "pending", due_on: "2026-10-20" });
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
    sharedState.objects.add("p1/1.thumb.jpg");
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

describe("latestPhotos", () => {
  it("reads the three columns a tile needs, keeping each plant's newest", async () => {
    const big = { candidates: new Array(50).fill({ name: "x" }) };
    sharedState.photos.push({ id: "a", plant_id: "p1", storage_path: "p1/1.jpg", taken_at: "2026-01-01T00:00:00Z", kind: "identify", ai_result: big, note: "" });
    sharedState.photos.push({ id: "b", plant_id: "p1", storage_path: "p1/2.jpg", taken_at: "2026-02-01T00:00:00Z", kind: "journal", ai_result: null, note: "" });
    sharedState.photos.push({ id: "c", plant_id: "p2", storage_path: "p2/1.jpg", taken_at: "2026-01-15T00:00:00Z", kind: "problem", ai_result: big, note: "" });
    const map = await latestPhotos(["p1", "p2", "p3"]);
    expect(map.get("p1")).toEqual({ plant_id: "p1", storage_path: "p1/2.jpg", taken_at: "2026-02-01T00:00:00Z" });
    expect(map.get("p2")).toEqual({ plant_id: "p2", storage_path: "p2/1.jpg", taken_at: "2026-01-15T00:00:00Z" });
    expect(map.has("p3")).toBe(false);
    expect(await latestPhotos([])).toEqual(new Map());
  });
});

describe("photoUrl", () => {
  it("signs the paths asked for in one tick in one request, and keeps each", async () => {
    sharedState.objects.add("s1/1.jpg");
    sharedState.objects.add("s1/2.jpg");
    const urls = await Promise.all([photoUrl("s1/1.jpg"), photoUrl("s1/2.jpg"), photoUrl("s1/1.jpg")]);
    expect(sharedState.signed).toEqual([["s1/1.jpg", "s1/2.jpg"]]);
    expect(urls).toEqual(["https://signed.test/s1/1.jpg?ttl=3600", "https://signed.test/s1/2.jpg?ttl=3600", "https://signed.test/s1/1.jpg?ttl=3600"]);
    // Kept: no second request for a path already signed.
    expect(await photoUrl("s1/2.jpg")).toBe(urls[1]);
    expect(sharedState.signed).toHaveLength(1);
    // A later tick is its own request, for the new path only.
    sharedState.objects.add("s1/3.jpg");
    await Promise.all([photoUrl("s1/1.jpg"), photoUrl("s1/3.jpg")]);
    expect(sharedState.signed).toEqual([
      ["s1/1.jpg", "s1/2.jpg"],
      ["s1/3.jpg"],
    ]);
  });

  it("rejects a path the bucket does not hold while the others in its batch resolve", async () => {
    sharedState.objects.add("s2/1.jpg");
    const [ok, missing] = await Promise.allSettled([photoUrl("s2/1.jpg"), photoUrl("s2/1.thumb.jpg")]);
    expect(sharedState.signed).toEqual([["s2/1.jpg", "s2/1.thumb.jpg"]]);
    expect(ok).toEqual({ status: "fulfilled", value: "https://signed.test/s2/1.jpg?ttl=3600" });
    expect(missing.status).toBe("rejected");
    // Nothing kept for it: asked again, it is signed again.
    await photoUrl("s2/1.thumb.jpg").catch(() => undefined);
    expect(sharedState.signed).toHaveLength(2);
  });
});

describe("uploadThumbnail", () => {
  it("stores the thumbnail beside the original and swallows a refusal", async () => {
    await uploadThumbnail("p1/5.jpg", new Blob(["t"], { type: "image/jpeg" }));
    expect(sharedState.objects.has("p1/5.thumb.jpg")).toBe(true);
    // The path is taken and this is not a retry (no upsert): refused with 409, which is not reported.
    await expect(uploadThumbnail("p1/5.jpg", new Blob(["t"], { type: "image/jpeg" }))).resolves.toBeUndefined();
    await expect(uploadThumbnail("p1/5.jpg", new Blob(["t"], { type: "image/jpeg" }), true)).resolves.toBeUndefined();
  });
});

describe("listRecentTreatments", () => {
  it("reads each plant's latest recent diagnosis, with Claude's spray answer when it has one and the leading cause", async () => {
    sharedState.plants.push({ id: "p1", species_id: "s1", tag: "OL-01", site: "farm", planted_on: null });
    sharedState.plants.push({ id: "p2", species_id: "s1", tag: "FIG-01", site: "farm", planted_on: null });
    sharedState.plants.push({ id: "p3", species_id: "s1", tag: "LEM-01", site: "backyard", planted_on: null });
    const cause = (kind: string, likelihood: number) => ({ cause: kind, kind, likelihood, evidence: "" });
    const diagnosis = (id: string, plant_id: string, taken_at: string, ai_result: unknown) =>
      sharedState.photos.push({ id, plant_id, storage_path: `${plant_id}/${id}.jpg`, kind: "problem", taken_at, ai_result, note: "" });
    diagnosis("old", "p1", "2026-10-20T08:00:00Z", { summary: "Aphids", likely_causes: [cause("pest", 0.8)], organic_treatment: "Savon noir 2 % at dusk", spray: true });
    diagnosis("new", "p1", "2026-10-27T08:00:00Z", { summary: "Drought", likely_causes: [cause("pest", 0.2), cause("water", 0.7)], organic_treatment: "No spray is needed: water 20 L at dawn", spray: false });
    diagnosis("pre", "p2", "2026-10-25T08:00:00Z", { summary: "Scale", likely_causes: [cause("pest", 0.6)], organic_treatment: "White oil at 2 % in the cool of the evening" });
    diagnosis("stale", "p3", "2026-10-01T08:00:00Z", { summary: "Old", likely_causes: [cause("pest", 0.9)], organic_treatment: "Neem", spray: true });
    sharedState.photos.push({ id: "journal", plant_id: "p3", storage_path: "p3/j.jpg", kind: "journal", taken_at: "2026-10-28T08:00:00Z", ai_result: null, note: "" });

    expect(await listRecentTreatments("2026-10-15T00:00:00Z")).toEqual([
      { tag: "OL-01", text: "No spray is needed: water 20 L at dawn", spray: false, kind: "water" },
      { tag: "FIG-01", text: "White oil at 2 % in the cool of the evening", spray: null, kind: "pest" },
    ]);
  });
});

describe("findPlantsByTagCode and listPlantSpots", () => {
  it("finds the plant whose id starts with a tag's code, and nothing for a code no plant carries", async () => {
    sharedState.plants.push({ id: "0d6f2c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f", species_id: "s1", tag: "OL-01", site: "farm", planted_on: null, lat: 36.68, lng: 10.58 });
    sharedState.plants.push({ id: "0d6f2c1f-0000-4000-8000-000000000000", species_id: "s1", tag: "OL-02", site: "farm", planted_on: null, lat: null, lng: null });
    sharedState.plants.push({ id: "0d6f2c1d-ffff-4fff-bfff-ffffffffffff", species_id: "s1", tag: "FIG-01", site: "farm", planted_on: null, lat: null, lng: null });

    expect(await findPlantsByTagCode("0d6f2c1e")).toEqual([{ id: "0d6f2c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f", tag: "OL-01", site: "farm" }]);
    expect(await findPlantsByTagCode("aaaaaaaa")).toEqual([]);
    expect((await listPlantSpots()).map((p) => [p.tag, p.lat])).toEqual([
      ["OL-01", 36.68],
      ["OL-02", null],
      ["FIG-01", null],
    ]);
  });
});
