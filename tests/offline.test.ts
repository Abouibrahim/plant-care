// Today without a connection (Phase 14, review 3.5): the list kept on the phone, the actions made
// offline and their sending, against the in-memory tables with the browser client mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../src/i18n/en";
import { fr } from "../src/i18n/fr";
import { localIsoDate } from "../src/lib/dates";
import type { TaskWithPlant } from "../src/types";
import { resetState, sharedState, type QueryInfo, type Row } from "./mockdb";

/** The session the mocked client reports; null for a phone whose sign-in could not be refreshed. */
const sessionRef: { current: { access_token: string } | null } = { current: { access_token: "token" } };
/** Set to make the next query fail like a dropped connection: true for whichever comes next, or a predicate for the first query it picks. */
const failNext: { current: boolean | ((q: QueryInfo) => boolean) } = { current: false };

vi.mock("../src/lib/supabase", async () => {
  const { makeDb, sharedState } = await import("./mockdb");
  const db = makeDb(sharedState, {
    onQuery: (q) => {
      const when = failNext.current;
      if (when === true || (typeof when === "function" && when(q))) {
        failNext.current = false;
        throw new TypeError("Failed to fetch");
      }
    },
  });
  return { supabase: { ...db, auth: { getSession: async () => ({ data: { session: sessionRef.current }, error: null }) } }, PHOTOS_BUCKET: "photos", supabaseConfigured: true };
});

/** A localStorage for the tests. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}
vi.stubGlobal("localStorage", memoryStorage());

const offline = await import("../src/lib/offline");
const { applyQueue, closedSoFar, dueCountOf, enqueue, forgetAction, isServerNote, keepToday, readQueue, recallToday, removeAction, sendQueue, sentIds } = offline;

let n = 0;
function task(partial: Partial<TaskWithPlant> & { id?: string } = {}): TaskWithPlant {
  n += 1;
  const row: Row = {
    id: `task-${n}`,
    plant_id: "p1",
    type: "water",
    rule_key: "water:6-7-8:any:7",
    due_on: "2026-11-08",
    window_end: null,
    title: "Deep watering (40 L)",
    instruction: "",
    status: "pending",
    acted_at: null,
    note: "",
    created_at: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
    plant: { id: "p1", tag: "OL-01", site: "farm", zone: "row 2", quantity: 1 },
    ...partial,
  };
  return row as unknown as TaskWithPlant;
}

/** Puts a task in the table (without the plant embed) and returns it as Today holds it. */
function seed(partial: Partial<TaskWithPlant> = {}): TaskWithPlant {
  const t = task(partial);
  const { plant, ...row } = t as unknown as Row & { plant: unknown };
  void plant;
  sharedState.tasks.push(row);
  return t;
}

const byId = (id: string) => sharedState.tasks.find((t) => t.id === id)!;
const TAP = "2026-11-08T06:30:00.000Z";

/** enqueue, whose write the phone's storage never refuses here. */
function kept(action: Parameters<typeof enqueue>[0]) {
  const entry = enqueue(action);
  if (!entry) throw new Error("not kept");
  return entry;
}

beforeEach(() => {
  resetState(sharedState);
  localStorage.clear();
  sessionRef.current = { access_token: "token" };
  failNext.current = false;
});

describe("the kept copy", () => {
  it("comes back for the phone's day, with the done count only when read today", () => {
    const tasks = [task({ due_on: "2026-11-07" }), task({ due_on: "2026-11-08" })];
    keepToday({ today: "2026-11-07", at: 1_700_000_000_000, tasks, doneToday: 3 });
    expect(recallToday("2026-11-07")).toEqual({ tasks, doneToday: 3, readAt: 1_700_000_000_000, readDay: "2026-11-07" });
    expect(recallToday("2026-11-08")).toMatchObject({ doneToday: 0, readDay: "2026-11-07" });
    expect(recallToday("2026-11-08")?.tasks).toHaveLength(2);
  });

  it("is nothing when missing or unreadable, and drops rows that are not tasks", () => {
    expect(recallToday("2026-11-08")).toBeNull();
    localStorage.setItem("plantcare.today", "{not json");
    expect(recallToday("2026-11-08")).toBeNull();
    localStorage.setItem("plantcare.today", JSON.stringify({ today: "2026-11-08", at: 1, tasks: [{ id: "x" }, task()], doneToday: 1 }));
    expect(recallToday("2026-11-08")?.tasks).toHaveLength(1);
  });
});

describe("the queue", () => {
  it("keeps actions, applies them to any list shown, counts the badge, and lets a waiting one go", () => {
    const a = task();
    const b = task({ due_on: "2026-11-10" });
    const c = task();
    const done = kept({ kind: "done", ids: [a.id], single: true, note: "", at: TAP });
    enqueue({ kind: "skip", ids: [b.id], single: true, reason: "rain", at: TAP });
    expect(readQueue()).toHaveLength(2);
    expect(readQueue()[0]).toMatchObject({ id: done.id, attempts: 0 });

    const shown = applyQueue([a, b, c], 2, readQueue(), localIsoDate(new Date(TAP)));
    expect(shown.tasks.map((t) => t.id)).toEqual([c.id]);
    expect(shown.doneToday).toBe(3);
    // A Done kept since another day leaves the list but belongs to that day's count.
    expect(applyQueue([a, b, c], 2, readQueue(), "2020-01-01")).toEqual({ tasks: [c], doneToday: 2 });
    expect(dueCountOf([a, b, c], readQueue(), "2026-11-08")).toBe(1);
    expect(dueCountOf([a, b, c], [], "2026-11-08")).toBe(2);

    expect(removeAction(done.id)).toBe(true);
    expect(removeAction(done.id)).toBe(false);
    expect(readQueue()).toHaveLength(1);
    localStorage.setItem("plantcare.queue", JSON.stringify([{ id: "bad" }, ...readQueue()]));
    expect(readQueue()).toHaveLength(1);
  });

  it("knows the server's notes from the grower's", () => {
    expect(isServerNote(en.expansion.windowEnded)).toBe(true);
    expect(isServerNote(fr.expansion.missed)).toBe(true);
    expect(isServerNote(en.weather.rainNote(12, "past"))).toBe(true);
    expect(isServerNote(fr.weather.rainNote(8, "forecast"))).toBe(true);
    expect(isServerNote("Too late this year")).toBe(false);
    expect(isServerNote("")).toBe(false);
  });
});

describe("sending the queue", () => {
  it("writes a kept Done and Skip with the tap's time, the single way and the set way", async () => {
    const a = seed();
    const b = seed();
    const c = seed({ note: "stake it" });
    const done = kept({ kind: "done", ids: [a.id], single: true, note: "12 kg", at: TAP });
    enqueue({ kind: "skip", ids: [b.id, c.id], single: false, reason: "rain", at: TAP });
    const report = await sendQueue();
    expect(report).toMatchObject({ sent: 2, closed: [a.id, b.id, c.id], leftOut: [], waiting: 0, failed: null });
    expect(byId(a.id)).toMatchObject({ status: "done", note: "12 kg", acted_at: TAP });
    expect(byId(b.id)).toMatchObject({ status: "skipped", note: "rain", acted_at: TAP });
    expect(readQueue()).toEqual([]);
    expect(sentIds(done.id)).toEqual([a.id]);
  });

  it("closes as the grower asked a row the server had closed meanwhile, and leaves one the grower closed elsewhere", async () => {
    const rained = seed({ status: "skipped", note: en.weather.rainNote(12, "past"), acted_at: "2026-11-08T05:41:00.000Z" });
    const ended = seed({ status: "skipped", note: fr.expansion.windowEnded, acted_at: "2026-11-08T05:41:00.000Z", type: "harvest", window_end: "2026-11-07" });
    const elsewhere = seed({ status: "done", note: "", acted_at: "2026-11-08T07:00:00.000Z" });
    const still = seed();
    // Closed as asked at the tap's time: this action's own write, whose reply was lost.
    const lost = seed({ status: "done", note: "", acted_at: TAP });
    enqueue({ kind: "done", ids: [rained.id, ended.id, elsewhere.id, still.id, lost.id], single: false, note: "", at: TAP });
    const report = await sendQueue();
    expect(report.sent).toBe(1);
    expect(report.closed.sort()).toEqual([still.id, rained.id, ended.id, lost.id].sort());
    expect(report.done.sort()).toEqual(report.closed.sort());
    expect(report.leftOut).toEqual([elsewhere.id]);
    expect(byId(lost.id)).toMatchObject({ status: "done", acted_at: TAP });
    expect(byId(rained.id)).toMatchObject({ status: "done", note: "", acted_at: TAP });
    expect(byId(ended.id)).toMatchObject({ status: "done", acted_at: TAP });
    expect(byId(elsewhere.id)).toMatchObject({ status: "done", acted_at: "2026-11-08T07:00:00.000Z" });
    expect(readQueue()).toEqual([]);
  });

  it("sends nothing without a session, and keeps a failed action with its attempt counted", async () => {
    const a = seed();
    enqueue({ kind: "done", ids: [a.id], single: true, note: "", at: TAP });
    sessionRef.current = null;
    expect(await sendQueue()).toMatchObject({ sent: 0, waiting: 1, failed: null });
    expect(byId(a.id).status).toBe("pending");

    sessionRef.current = { access_token: "token" };
    failNext.current = true;
    const report = await sendQueue();
    expect(report).toMatchObject({ sent: 0, waiting: 1 });
    expect(report.failed).toMatch(/Failed to fetch/);
    expect(readQueue()[0].attempts).toBe(1);
    expect(byId(a.id).status).toBe("pending");

    expect(await sendQueue()).toMatchObject({ sent: 1, waiting: 0 });
    expect(byId(a.id).status).toBe("done");
  });

  it("reports what a set write closed when the read-back of the rest then fails, and keeps the rest for the next round", async () => {
    const a = seed();
    const b = seed();
    // Closed from another screen before the send: the write leaves it, so the rest is read back.
    const elsewhere = seed({ status: "done", note: "", acted_at: "2026-11-08T07:00:00.000Z" });
    const entry = kept({ kind: "done", ids: [a.id, b.id, elsewhere.id], single: false, note: "", at: TAP });
    failNext.current = (q) => q.op === "select" && q.columns.includes("acted_at");
    const report = await sendQueue();
    // The two rows the write closed are closed, and the round says so: the list and the done count move by them.
    expect(report.closed.sort()).toEqual([a.id, b.id].sort());
    expect(report.done.sort()).toEqual([a.id, b.id].sort());
    expect(report).toMatchObject({ sent: 0, leftOut: [], waiting: 1 });
    expect(report.failed).toMatch(/Failed to fetch/);
    expect(byId(a.id)).toMatchObject({ status: "done", acted_at: TAP });
    expect(byId(b.id)).toMatchObject({ status: "done", acted_at: TAP });
    // The action keeps only what it could not close, with the attempt counted, and is not sent yet.
    expect(readQueue()).toEqual([expect.objectContaining({ id: entry.id, ids: [elsewhere.id], attempts: 1 })]);
    expect(sentIds(entry.id)).toBeNull();
    // The next round reads the rest back: closed by the grower elsewhere, so left out and reported;
    // the action's outcome then holds what its rounds closed, for an Undo that comes after the send.
    expect(await sendQueue()).toMatchObject({ sent: 1, closed: [], leftOut: [elsewhere.id], waiting: 0 });
    expect(readQueue()).toEqual([]);
    expect(sentIds(entry.id)?.sort()).toEqual([a.id, b.id].sort());
    expect(closedSoFar(entry.id)).toEqual([]);
  });

  it("reports what the write closed when the override of a server-closed row then fails, and overrides it on the next round", async () => {
    const a = seed();
    const rained = seed({ status: "skipped", note: en.weather.rainNote(12, "past"), acted_at: "2026-11-08T05:41:00.000Z" });
    const entry = kept({ kind: "done", ids: [a.id, rained.id], single: false, note: "", at: TAP });
    // The first update is the write, the second the override of the rain-skipped row.
    let updates = 0;
    failNext.current = (q) => q.op === "update" && ++updates === 2;
    const report = await sendQueue();
    expect(report).toMatchObject({ sent: 0, closed: [a.id], done: [a.id], leftOut: [], waiting: 1 });
    expect(report.failed).toMatch(/Failed to fetch/);
    expect(byId(a.id)).toMatchObject({ status: "done", acted_at: TAP });
    expect(byId(rained.id).status).toBe("skipped");
    expect(readQueue()).toEqual([expect.objectContaining({ id: entry.id, ids: [rained.id], attempts: 1 })]);
    expect(closedSoFar(entry.id)).toEqual([a.id]);
    expect(await sendQueue()).toMatchObject({ sent: 1, closed: [rained.id], waiting: 0 });
    expect(byId(rained.id)).toMatchObject({ status: "done", acted_at: TAP });
    expect(sentIds(entry.id)?.sort()).toEqual([a.id, rained.id].sort());
    expect(closedSoFar(entry.id)).toEqual([]);
  });

  it("remembers what a half-written action closed, for its Undo, and forgets it when the action is taken back", async () => {
    const a = seed();
    const b = seed();
    const elsewhere = seed({ status: "done", note: "", acted_at: "2026-11-08T07:00:00.000Z" });
    const entry = kept({ kind: "done", ids: [a.id, b.id, elsewhere.id], single: false, note: "", at: TAP });
    failNext.current = (q) => q.op === "select" && q.columns.includes("acted_at");
    await sendQueue();
    expect(sentIds(entry.id)).toBeNull();
    expect(closedSoFar(entry.id).sort()).toEqual([a.id, b.id].sort());
    // Taking the action back leaves the memory, so a reopen that failed can be tried again from the
    // toast; the screen forgets it once the rows are reopened.
    expect(removeAction(entry.id)).toBe(true);
    expect(closedSoFar(entry.id).sort()).toEqual([a.id, b.id].sort());
    forgetAction(entry.id);
    expect(closedSoFar(entry.id)).toEqual([]);
    expect(await sendQueue()).toMatchObject({ sent: 0, closed: [], waiting: 0 });
  });

  it("keeps a set whole when its own write fails, and writes it on the next round", async () => {
    const a = seed();
    const b = seed();
    const entry = kept({ kind: "done", ids: [a.id, b.id], single: false, note: "", at: TAP });
    failNext.current = (q) => q.op === "update";
    const report = await sendQueue();
    expect(report).toMatchObject({ sent: 0, closed: [], waiting: 1 });
    expect(report.failed).toMatch(/Failed to fetch/);
    expect(readQueue()).toEqual([expect.objectContaining({ id: entry.id, ids: [a.id, b.id], attempts: 1 })]);
    expect(byId(a.id).status).toBe("pending");
    expect(byId(b.id).status).toBe("pending");
    expect(await sendQueue()).toMatchObject({ sent: 1, closed: [a.id, b.id], waiting: 0 });
    expect(byId(a.id)).toMatchObject({ status: "done", acted_at: TAP });
    expect(byId(b.id)).toMatchObject({ status: "done", acted_at: TAP });
  });

  it("reports a half-written Skip's rows as closed but not as done", async () => {
    const a = seed();
    const b = seed();
    const elsewhere = seed({ status: "done", note: "", acted_at: "2026-11-08T07:00:00.000Z" });
    const entry = kept({ kind: "skip", ids: [a.id, b.id, elsewhere.id], single: false, reason: "rain", at: TAP });
    failNext.current = (q) => q.op === "select" && q.columns.includes("acted_at");
    const report = await sendQueue();
    expect(report.closed.sort()).toEqual([a.id, b.id].sort());
    expect(report.done).toEqual([]);
    expect(byId(a.id)).toMatchObject({ status: "skipped", note: "rain", acted_at: TAP });
    expect(byId(b.id)).toMatchObject({ status: "skipped", note: "rain", acted_at: TAP });
    expect(readQueue()).toEqual([expect.objectContaining({ id: entry.id, ids: [elsewhere.id], attempts: 1 })]);
  });

  it("runs one round at a time", async () => {
    seed();
    enqueue({ kind: "done", ids: [sharedState.tasks[0].id as string], single: true, note: "", at: TAP });
    const [first, second] = await Promise.all([sendQueue(), sendQueue()]);
    expect(first).toBe(second);
    expect(first.sent).toBe(1);
  });
});


describe("the kept derja words (Phase 18)", () => {
  const at = "2026-11-12T08:00:00Z";
  it("come back as they were kept, cleaned", () => {
    offline.keepDerja({
      corrections: [{ term: "kaolin", word: "كاولان", at, kind: "product" }],
      words: [{ term: "olive fly", word: "ذبانة", at, kind: "pest" }, { term: "saw", word: "", at, kind: "tool" }],
      at: 1762934400000,
    });
    expect(offline.recallDerja()).toEqual({
      corrections: [{ term: "kaolin", word: "كاولان", at, kind: "product" }],
      words: [{ term: "olive fly", word: "ذبانة", at, kind: "pest" }, { term: "saw", word: "", at, kind: "tool" }],
      at: 1762934400000,
    });
  });
  it("are nothing when missing or unexpected, and lose an entry's invalid kind only", () => {
    expect(offline.recallDerja()).toBeNull();
    for (const bad of ['"x"', "[]", '{"corrections":3}', "{not json"]) {
      localStorage.setItem("plantcare.derja", bad);
      expect(offline.recallDerja()).toBeNull();
    }
    localStorage.setItem("plantcare.derja", JSON.stringify({ corrections: [], words: [{ term: "saw", word: "منشار", at, kind: "weapon" }], at: "soon" }));
    expect(offline.recallDerja()).toEqual({ corrections: [], words: [{ term: "saw", word: "منشار", at }], at: 0 });
  });
});
