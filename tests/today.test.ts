import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { byActivity, splitNow } from "../src/lib/activities";
import { DUE_NOW, summarize, withBatches, type Batchable } from "../src/lib/batches";
import {
  batchDonePrimary,
  clearsTheDay,
  doneAllIds,
  doneAllRepeatsBatch,
  dueLabel,
  dueNow,
  dueState,
  foldKey,
  isFolded,
  isLate,
  NO_FOLDS,
  parseFolds,
  parseLeftOut,
  roundDueLabel,
  scopedNote,
  scopedNoteRoom,
  sectionFacts,
  settleFolds,
  sharedInstruction,
  shortDate,
  sortByDue,
  toggleFold,
  undoClearsNote,
  weekdayDate,
} from "../src/lib/today";
import { TASK_MAX_NOTE_CHARS, type TaskType } from "../src/types";

const today = "2026-10-26";
const t = (due_on: string, window_end: string | null, type: TaskType = "water", title = "x") => ({ due_on, window_end, type, title });

describe("dueState", () => {
  it("tells a late watering from an open window", () => {
    expect(dueState(t("2026-10-24", null), today)).toBe("overdue");
    expect(dueState(t("2026-10-01", "2026-12-31"), today)).toBe("open");
    expect(dueState(t("2026-10-26", null), today)).toBe("today");
    expect(dueState(t("2026-10-26", "2026-11-30"), today)).toBe("today");
    expect(dueState(t("2026-10-28", null), today)).toBe("upcoming");
  });

  it("calls an ended window late", () => {
    expect(dueState(t("2026-09-01", "2026-10-25"), today)).toBe("overdue");
    expect(isLate(t("2026-09-01", "2026-10-25"), today)).toBe(true);
    expect(isLate(t("2026-10-01", "2026-12-31"), today)).toBe(false);
  });

  it("words the due line a single card and a window batch share", () => {
    expect(dueLabel(t("2026-10-01", "2026-12-31"), today)).toEqual({ text: `${en.today.openSince(shortDate("2026-10-01"))} · ${en.today.until(shortDate("2026-12-31"))}`, state: "open" });
    expect(dueLabel(t(today, "2026-12-31"), today)).toEqual({ text: `${en.today.dueToday} · ${en.today.until(shortDate("2026-12-31"))}`, state: "today" });
    expect(dueLabel(t("2026-09-01", "2026-10-25"), today)).toEqual({ text: en.today.windowEnded(shortDate("2026-10-25")), state: "overdue" });
    expect(dueLabel(t("2026-10-24", null), today)).toEqual({ text: `${en.today.overdue} · ${shortDate("2026-10-24")}`, state: "overdue" });
    expect(dueLabel(t("2026-10-29", "2026-12-31"), today)).toEqual({ text: `${weekdayDate("2026-10-29")} · ${en.today.until(shortDate("2026-12-31"))}`, state: "upcoming" });
  });

  it("counts late and today in the round, open windows and the coming days not", () => {
    expect(dueNow(t("2026-10-24", null), today)).toBe(true);
    expect(dueNow(t("2026-10-26", null), today)).toBe(true);
    expect(dueNow(t("2026-10-01", "2026-12-31"), today)).toBe(false);
    expect(dueNow(t("2026-10-28", null), today)).toBe(false);
  });
});

describe("sortByDue", () => {
  it("puts the late watering before the open windows, and today's tasks between", () => {
    const sorted = sortByDue(
      [
        t("2026-10-01", "2026-11-30", "prune", "Prune"),
        t("2026-10-01", "2026-12-31", "harvest", "Harvest"),
        t("2026-10-26", null, "water", "Water today"),
        t("2026-10-24", null, "water", "Late water"),
        t("2026-10-28", null, "water", "Later"),
      ],
      today,
    );
    expect(sorted.map((x) => x.title)).toEqual(["Late water", "Water today", "Prune", "Harvest", "Later"]);
  });
});

describe("Today with zone batches", () => {
  let n = 0;
  /** A task of its own plant at the farm: a calendar watering unless the extra says otherwise. */
  const w = (due_on: string, zone: string, extra: Partial<Batchable> = {}): Batchable => {
    n += 1;
    return {
      id: `w${n}`,
      plant_id: `p${n}`,
      type: "water",
      rule_key: "water:9-10:any:7",
      due_on,
      window_end: null,
      title: "Deep watering (40 L)",
      plant: { tag: `T${n}`, site: "farm", zone, quantity: 1 },
      ...extra,
    };
  };
  const none = () => false;

  it("gives Done-all the site's due waterings, less the plants left out and those on their way out", () => {
    const [a, b, c] = [w(today, "row 2"), w("2026-10-24", "row 2"), w(today, "row 3")];
    const later = w("2026-10-28", "row 2");
    const feed = w(today, "row 2", { type: "feed", window_end: "2026-11-30" });
    expect(doneAllIds([a, b, c, later, feed], today, none)).toEqual([a.id, b.id, c.id]);
    expect(doneAllIds([a, b, c], today, (id) => id === b.id)).toEqual([a.id, c.id]);
    // One watering left is no set.
    expect(doneAllIds([a, b], today, (id) => id === b.id)).toEqual([]);
  });

  it("hides Done-all only when one batch already holds every watering it would close", () => {
    const [a, b] = [w(today, "row 2"), w(today, "row 2")];
    const items = withBatches([a, b], today);
    expect(doneAllRepeatsBatch([a.id, b.id], items)).toBe(true);
    // A watering window opening today is a job of its own, so Done-all still has something to add.
    const opening = w(today, "row 2", { window_end: "2026-11-30", title: "Water if leaves curl (60 L)" });
    expect(doneAllRepeatsBatch([a.id, b.id, opening.id], withBatches([a, b, opening], today))).toBe(false);
    // A window batch beside the waterings (Phase 12) does not bring the button back.
    const prune = { type: "prune" as TaskType, window_end: "2026-11-30", title: "Winter prune" };
    const [p1, p2] = [w("2026-10-01", "row 2", prune), w("2026-10-01", "row 2", prune)];
    expect(doneAllRepeatsBatch([a.id, b.id], withBatches([a, p1, b, p2], today))).toBe(true);
    // Two plants' watering windows opening today make a batch that holds all Done-all would close.
    const [o1, o2] = [w(today, "row 4", { window_end: "2026-11-30", title: "Water if dry (20 L)" }), w(today, "row 4", { window_end: "2026-11-30", title: "Water if dry (20 L)" })];
    expect(doneAllRepeatsBatch(doneAllIds([o1, o2], today, none), withBatches([o1, o2], today))).toBe(true);
    // Two batches due now: Done-all closes both, which neither batch's Done does.
    const [c, d] = [w(today, "row 3"), w(today, "row 3")];
    expect(doneAllRepeatsBatch([a.id, b.id, c.id, d.id], withBatches([a, b, c, d], today))).toBe(false);
    // A coming day's batch is not today's round.
    const [e, f] = [w("2026-10-28", "row 2"), w("2026-10-28", "row 2")];
    expect(doneAllRepeatsBatch([], withBatches([e, f], today))).toBe(false);
  });

  it("clears the day only on a Done that takes today's last due tasks", () => {
    const [a, b] = [w(today, "row 2"), w("2026-10-24", "row 2")];
    const window = w("2026-10-01", "row 2", { type: "harvest", window_end: "2026-12-31" });
    expect(clearsTheDay([a, b, window], [a.id, b.id], "done", today, none)).toBe(true);
    expect(clearsTheDay([a, b], [a.id, b.id], "skip", today, none)).toBe(false);
    // A plant left out of the batch is still due today.
    expect(clearsTheDay([a, b], [a.id], "done", today, none)).toBe(false);
    // ...unless it is already on its way out.
    expect(clearsTheDay([a, b], [a.id], "done", today, (id) => id === b.id)).toBe(true);
    // Thursday's batch is not today's round, even on a free day.
    const [th1, th2] = [w("2026-10-29", "row 2"), w("2026-10-29", "row 2")];
    expect(clearsTheDay([th1, th2], [th1.id, th2.id], "done", today, none)).toBe(false);
  });
});

describe("a batch's Done, note and Undo (Phase 12)", () => {
  it("makes Done green only for a batch holding something late or due today", () => {
    // A round of waterings due now, late or today.
    expect(batchDonePrimary([t(today, null), t("2026-10-24", null)], today)).toBe(true);
    // A window merely open: plain, since its Done closes the window for the season.
    expect(batchDonePrimary([t("2026-10-01", "2026-12-31"), t("2026-10-01", "2026-12-31")], today)).toBe(false);
    // A window that opens today, or has ended: green.
    expect(batchDonePrimary([t(today, "2026-12-31")], today)).toBe(true);
    expect(batchDonePrimary([t("2026-09-01", "2026-10-25")], today)).toBe(true);
    // A coming day: plain.
    expect(batchDonePrimary([t("2026-10-29", null)], today)).toBe(false);
    expect(batchDonePrimary([t("2026-10-29", "2026-12-31")], today)).toBe(false);
  });

  it("puts the batch's zone and the plants ticked in front of the note, and nothing for no words", () => {
    expect(scopedNote("row 3", 10, "  180 kg ")).toBe(en.today.batchNote("row 3 · 10 plants", "180 kg"));
    expect(scopedNote("row 3", 10, "  180 kg ")).toBe("row 3 · 10 plants: 180 kg");
    expect(scopedNote("", 1, "no rings seen")).toBe("1 plant: no rings seen");
    expect(scopedNote("row 3", 10, "   ")).toBeNull();
  });

  it("keeps the scoped note within a note's length, cutting the words", () => {
    const room = scopedNoteRoom("north terrace", 12);
    expect(room).toBe(TASK_MAX_NOTE_CHARS - "north terrace · 12 plants: ".length);
    const note = scopedNote("north terrace", 12, "x".repeat(300));
    expect(note).toHaveLength(TASK_MAX_NOTE_CHARS);
    expect(note?.startsWith("north terrace · 12 plants: xxx")).toBe(true);
  });

  it("lets Undo clear a Skip's reason and a Done's note, and keep the rows' notes after a plain Done", () => {
    expect(undoClearsNote({ kind: "skip", reason: "" })).toBe(true);
    expect(undoClearsNote({ kind: "done", note: "row 3 · 10 plants: 180 kg" })).toBe(true);
    expect(undoClearsNote({ kind: "done" })).toBe(false);
    expect(undoClearsNote({ kind: "done", note: "  " })).toBe(false);
  });
});

describe("Today by kind of work (Phase 13)", () => {
  let n = 0;
  /** A calendar watering of its own plant at the farm unless the extra says otherwise. */
  const w = (due_on: string, zone: string, extra: Partial<Batchable> = {}): Batchable => {
    n += 1;
    return {
      id: `k${n}`,
      plant_id: `kp${n}`,
      type: "water",
      rule_key: "water:9-10-11:any:7",
      due_on,
      window_end: null,
      title: "Deep watering (40 L)",
      plant: { tag: `T${n}`, site: "farm", zone, quantity: 1 },
      ...extra,
    };
  };

  it("counts a kind's heading in tasks, as the site heading does, and flags it late only for late work", () => {
    // One plant with yesterday's and today's waterings counts two tasks; a group of 12 counts one.
    const yesterdays = w("2026-10-25", "row 2");
    const todays = w(today, "row 2", { plant_id: yesterdays.plant_id });
    const group = w(today, "row 2", { plant: { tag: "POM-H", site: "farm", zone: "row 2", quantity: 12 } });
    const items = withBatches([yesterdays, todays, group], today);
    expect(items).toHaveLength(1);
    const ids = [yesterdays.id, todays.id, group.id];
    expect(sectionFacts(items, today)).toEqual({ tasks: 3, late: true, ids, live: ids });
    // A task on its way out still counts, but a fold neither keeps it nor checks it.
    expect(sectionFacts(items, today, (id) => id === todays.id).live).toEqual([yesterdays.id, group.id]);
    // An open window and a coming day are not late; an ended window is.
    const open = w("2026-10-01", "row 3", { type: "harvest", window_end: "2026-12-31", title: "Harvest the olives" });
    const coming = w("2026-10-28", "row 3");
    expect(sectionFacts(withBatches([open, coming], today), today).late).toBe(false);
    const ended = w("2026-09-01", "row 3", { type: "harvest", window_end: "2026-10-25", title: "Pick the late figs" });
    expect(sectionFacts(withBatches([ended], today), today).late).toBe(true);
  });

  it("adds the kinds' counts and the coming days up to the site heading", () => {
    const tasks = sortByDue(
      [
        w("2026-10-25", "row 2"),
        w(today, "row 2"),
        w(today, "row 3", { type: "prune", window_end: "2027-02-28", title: "Winter prune" }),
        w("2026-10-01", "row 3", { type: "harvest", window_end: "2026-12-31", title: "Harvest the olives" }),
        w("2026-10-01", "row 3", { type: "harvest", window_end: "2026-12-31", title: "Harvest the olives" }),
        w("2026-10-28", "row 2"),
        w("2026-10-30", "row 4", { type: "feed", window_end: "2026-11-30", title: "Autumn compost" }),
      ],
      today,
    );
    const { now, later } = splitNow(tasks, today);
    const kinds = byActivity(withBatches(now, today)).map((g) => sectionFacts(g.items, today).tasks);
    expect(kinds.reduce((a, b) => a + b, 0) + later.length).toBe(tasks.length);
  });

  it("keys a fold by site, kind and view", () => {
    const keys = [foldKey("farm", "water", DUE_NOW), foldKey("backyard", "water", DUE_NOW), foldKey("farm", "prune", DUE_NOW), foldKey("farm", "water", "2026-10-28")];
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toBe("farm|water|now");
  });

  it("folds a kind with the tasks it shows and opens it again, leaving the other kinds alone", () => {
    const water = foldKey("farm", "water", DUE_NOW);
    const prune = foldKey("farm", "prune", DUE_NOW);
    const one = toggleFold(NO_FOLDS, today, water, ["a", "b"]);
    expect(isFolded(one, today, water, ["a", "b"])).toBe(true);
    const two = toggleFold(one, today, prune, ["c"]);
    const opened = toggleFold(two, today, water, ["a", "b"]);
    expect(isFolded(opened, today, water, ["a", "b"])).toBe(false);
    expect(isFolded(opened, today, prune, ["c"])).toBe(true);
  });

  it("keeps a fold while tasks leave, and opens it when a task it did not have appears", () => {
    const key = foldKey("farm", "water", DUE_NOW);
    const folds = toggleFold(NO_FOLDS, today, key, ["a", "b", "c"]);
    // A Done, or the rain skip, takes tasks away: still folded.
    expect(isFolded(folds, today, key, ["a", "c"])).toBe(true);
    // A reminder set for today, a plant saved, an Undo: a task it did not have opens it.
    expect(isFolded(folds, today, key, ["a", "c", "d"])).toBe(false);
    // Nothing to show, another day: open.
    expect(isFolded(folds, today, key, [])).toBe(false);
    expect(isFolded(folds, "2026-10-27", key, ["a"])).toBe(false);
    // A kind shown open after new work folds again, now with the new task.
    const again = toggleFold(folds, today, key, ["a", "c", "d"]);
    expect(isFolded(again, today, key, ["a", "c", "d"])).toBe(true);
  });

  it("keeps a kind that new work opened open until a tap folds it again", () => {
    const key = foldKey("farm", "water", DUE_NOW);
    const folds = toggleFold(NO_FOLDS, today, key, ["a", "b"]);
    // A reminder for today appears: the kind shows open, and its fold goes as it shows.
    const settled = settleFolds(folds, today, { [key]: ["a", "b", "r"] });
    expect(settled.keys[key]).toBeUndefined();
    // The reminder done, the kind stays open rather than folding by itself.
    expect(isFolded(settled, today, key, ["a", "b"])).toBe(false);
    // Nothing new, a kind not on screen, another day: the same folds come back.
    expect(settleFolds(folds, today, { [key]: ["a"] })).toBe(folds);
    expect(settleFolds(folds, today, { [key]: [] })).toBe(folds);
    expect(settleFolds(folds, today, { "farm|prune|now": ["z"] })).toBe(folds);
    expect(settleFolds(folds, "2026-10-27", { [key]: ["z"] })).toBe(folds);
  });

  it("opens a kind folded while a task was being saved, when an Undo or a failed save brings the task back", () => {
    const [a, b, c] = [w(today, "row 2"), w(today, "row 2"), w("2026-10-01", "row 5", { window_end: "2026-11-30", title: "Water if dry (20 L)" })];
    const items = withBatches([a, b, c], today);
    const key = foldKey("farm", "water", DUE_NOW);
    // a is being saved when the heading is tapped: the fold keeps b and c only.
    const saving = sectionFacts(items, today, (id) => id === a.id);
    const folds = toggleFold(NO_FOLDS, today, key, saving.live);
    expect(isFolded(folds, today, key, saving.live)).toBe(true);
    // Saved, a leaves: still folded.
    expect(isFolded(folds, today, key, sectionFacts(withBatches([b, c], today), today).live)).toBe(true);
    // Back after an Undo or a failed save: new to the fold, it opens the kind.
    const back = sectionFacts(items, today).live;
    expect(isFolded(folds, today, key, back)).toBe(false);
    expect(settleFolds(folds, today, { [key]: back }).keys[key]).toBeUndefined();
  });

  it("drops another day's folds on the next tap", () => {
    const old = toggleFold(NO_FOLDS, "2026-10-25", foldKey("farm", "water", DUE_NOW), ["a"]);
    const next = toggleFold(old, today, foldKey("farm", "prune", DUE_NOW), ["c"]);
    expect(next).toEqual({ day: today, keys: { "farm|prune|now": ["c"] } });
  });

  it("reads the folds and the ticks kept on the phone, and nothing from a value of another shape", () => {
    for (const raw of [null, "not json", "[]", "5", '"x"', '{"day":3,"keys":{}}', '{"day":"2026-10-26","keys":[]}', '{"day":"2026-10-26"}']) {
      expect(parseFolds(raw)).toEqual(NO_FOLDS);
    }
    expect(parseFolds('{"day":"2026-10-26","keys":{"farm|water|now":["a",4,"b"],"farm|prune|now":"x"}}')).toEqual({ day: "2026-10-26", keys: { "farm|water|now": ["a", "b"] } });
    const folds = toggleFold(NO_FOLDS, today, "farm|water|now", ["a"]);
    expect(parseFolds(JSON.stringify(folds))).toEqual(folds);

    for (const raw of [null, "not json", "[]", '{"day":"2026-10-26","ids":"a"}', '{"ids":["a"]}']) {
      expect(parseLeftOut(raw)).toEqual({ day: "", ids: new Set() });
    }
    expect(parseLeftOut('{"day":"2026-10-26","ids":["a",7,"b"]}')).toEqual({ day: "2026-10-26", ids: new Set(["a", "b"]) });
  });

  it("words a round's due line in plants, as the card and the shared list read it", () => {
    expect(roundDueLabel(DUE_NOW, { plants: 5, late: 0, since: today })).toEqual({ text: en.today.dueToday, state: "today" });
    expect(roundDueLabel(DUE_NOW, { plants: 5, late: 3, since: "2026-10-24" })).toEqual({ text: `${en.today.dueToday} · ${en.today.batchLate(3)}`, state: "overdue" });
    expect(roundDueLabel(DUE_NOW, { plants: 2, late: 2, since: "2026-10-24" })).toEqual({ text: `${en.today.overdue} · ${shortDate("2026-10-24")}`, state: "overdue" });
    expect(roundDueLabel("2026-10-29", { plants: 2, late: 0, since: "2026-10-29" })).toEqual({ text: weekdayDate("2026-10-29"), state: "upcoming" });
    // The card's own summary feeds it.
    const [a, b] = [w("2026-10-25", "row 2"), w(today, "row 2")];
    expect(roundDueLabel(DUE_NOW, summarize([a, b], today)).text).toBe(`${en.today.dueToday} · ${en.today.batchLate(1)}`);
  });

  it("shows a batch's instruction only when all its plants give the same", () => {
    expect(sharedInstruction([{ instruction: "Open the centre." }, { instruction: "Open the centre." }])).toBe("Open the centre.");
    expect(sharedInstruction([{ instruction: "Open the centre." }, { instruction: "Remove suckers." }])).toBe("");
    expect(sharedInstruction([])).toBe("");
  });
});
