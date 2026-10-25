import { describe, expect, it } from "vitest";
import { dueNow, dueState, isLate, sortByDue } from "../src/lib/today";
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
