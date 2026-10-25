import { describe, expect, it } from "vitest";
import { addDays, ageInMonths, ageStage, daysBetween, isoDateIn, lastDayOfMonth, parseIso, ruleApplies } from "../src/lib/dates";

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(addDays("not a date", 3)).toBe("not a date");
  });
});

describe("daysBetween", () => {
  it("counts forwards and backwards", () => {
    expect(daysBetween("2026-10-25", "2026-11-01")).toBe(7);
    expect(daysBetween("2026-11-01", "2026-10-25")).toBe(-7);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
  });
});

describe("parseIso and lastDayOfMonth", () => {
  it("reads YYYY-MM-DD and rejects impossible parts", () => {
    expect(parseIso("2026-10-25")).toEqual({ y: 2026, m: 10, d: 25 });
    expect(parseIso("2026-13-01")).toBeNull();
    expect(parseIso("25/10/2026")).toBeNull();
  });

  it("knows February", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 12)).toBe(31);
  });
});

describe("age", () => {
  it("is null without a planting date, which counts as mature", () => {
    expect(ageInMonths(null, "2026-10-25")).toBeNull();
    expect(ageStage(null)).toBe("mature");
    expect(ruleApplies({ age: "establishment" }, null)).toBe(false);
    expect(ruleApplies({ age: "any" }, null)).toBe(true);
  });

  it("turns mature on the second anniversary, not the day before", () => {
    expect(ageInMonths("2024-10-25", "2026-10-24")).toBe(23);
    expect(ageInMonths("2024-10-25", "2026-10-25")).toBe(24);
    expect(ageStage(23)).toBe("establishment");
    expect(ageStage(24)).toBe("mature");
  });

  it("never goes below zero for a planting date in the future", () => {
    expect(ageInMonths("2027-01-01", "2026-10-25")).toBe(0);
  });
});

describe("isoDateIn", () => {
  it("gives the Tunis date at the cron hour", () => {
    // 05:00 UTC is 06:00 in Tunis (UTC+1, no daylight saving).
    expect(isoDateIn("Africa/Tunis", new Date("2026-10-25T05:00:00Z"))).toBe("2026-10-25");
    // 23:30 UTC is already the next day in Tunis.
    expect(isoDateIn("Africa/Tunis", new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });
});
