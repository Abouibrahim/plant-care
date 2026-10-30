import { describe, expect, it } from "vitest";
import { withBatches, type Batchable } from "../src/lib/batches";
import { clearsTheDay, doneAllIds, doneAllRepeatsBatch, dueNow, dueState, isLate, sortByDue } from "../src/lib/today";
import type { TaskType } from "../src/types";

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

  it("hides Done-all only when one batch due now already holds every watering it would close", () => {
    const [a, b] = [w(today, "row 2"), w(today, "row 2")];
    const items = withBatches([a, b], today);
    expect(doneAllRepeatsBatch([a.id, b.id], items)).toBe(true);
    // A window watering due today never joins a batch, so Done-all still has something of its own.
    const opening = w(today, "row 2", { window_end: "2026-11-30" });
    expect(doneAllRepeatsBatch([a.id, b.id, opening.id], withBatches([a, b, opening], today))).toBe(false);
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
