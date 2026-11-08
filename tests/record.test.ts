// The morning run's record (Phase 14, review 2.3): the settings row api/_record.ts writes.
import { describe, expect, it } from "vitest";
import { failedRunRecord, writeDailyRecord, writeDailyStart } from "../api/_record.js";
import { nextRecordCheck, parseDailyRecord, parseDailyStart, recordChanged, runState } from "../src/lib/record";
import { DAILY_RECORD_KEY, DAILY_STARTED_KEY, type DailyRecord } from "../src/types";
import { makeClient, makeState } from "./mockdb";

const record: DailyRecord = {
  at: "2026-11-08T05:41:00.000Z",
  today: "2026-11-08",
  created: 3,
  removed: 0,
  expired: 1,
  superseded: 0,
  skipped: 2,
  pushes_sent: 3,
  pushes_failed: 0,
  subscriptions: 1,
};

describe("writeDailyRecord", () => {
  it("writes the one row and replaces it the next morning, beside the start marker", async () => {
    const state = makeState();
    const db = makeClient(state);
    await writeDailyStart(db, { at: "2026-11-08T05:40:30.000Z", today: "2026-11-08" });
    expect(await writeDailyRecord(db, record)).toBeNull();
    expect(await writeDailyRecord(db, { ...record, at: "2026-11-09T05:12:00.000Z", today: "2026-11-09", created: 0 })).toBeNull();
    expect(state.settings.map((r) => r.key).sort()).toEqual([DAILY_RECORD_KEY, DAILY_STARTED_KEY]);
    expect(state.settings.find((r) => r.key === DAILY_RECORD_KEY)).toMatchObject({ value: { today: "2026-11-09", created: 0, skipped: 2, subscriptions: 1 } });
  });

  it("never fails the run, and says what went wrong", async () => {
    const state = makeState();
    const failing = makeClient(state, {
      onQuery: () => {
        throw new Error("relation settings does not exist");
      },
    });
    expect(await writeDailyRecord(failing, record)).toBe("relation settings does not exist");
    await expect(writeDailyStart(failing, { at: record.at, today: record.today })).resolves.toBeUndefined();
  });

  it("shapes a failed run's record with its error and zero counts", () => {
    const failed = failedRunRecord("2026-11-08", "2026-11-08T05:02:00.000Z", new Error("Open-Meteo answered 500"));
    expect(failed).toMatchObject({ today: "2026-11-08", error: "Open-Meteo answered 500", created: 0, pushes_sent: 0 });
    expect(failedRunRecord("2026-11-08", "2026-11-08T05:02:00.000Z", "plain").error).toBe("plain");
  });
});

describe("the record on the phone", () => {
  it("reads a stored record and a start marker back, and refuses one without a time or a date", () => {
    expect(parseDailyRecord(record)).toEqual(record);
    expect(parseDailyRecord({ ...record, created: "x", weather_error: " ", error: "boom" })).toMatchObject({ created: 0, error: "boom" });
    expect(parseDailyRecord({ ...record, created: "x" })).not.toHaveProperty("weather_error");
    expect(parseDailyRecord({ today: "2026-11-08" })).toBeNull();
    expect(parseDailyRecord({ at: "not a time", today: "2026-11-08" })).toBeNull();
    expect(parseDailyRecord(null)).toBeNull();
    expect(parseDailyStart({ at: record.at, today: record.today })).toEqual({ at: record.at, today: record.today });
    expect(parseDailyStart({ at: record.at })).toBeNull();
  });

  it("tells a run that came after the list by the record's stamp, never by the clock", () => {
    expect(recordChanged("2026-11-07T05:30:00.000Z", record, "2026-11-08")).toBe(true);
    expect(recordChanged(record.at, record, "2026-11-08")).toBe(false);
    // The list saw no record at all: only a record for today counts as news.
    expect(recordChanged(null, record, "2026-11-08")).toBe(true);
    expect(recordChanged(null, { ...record, today: "2026-11-07" }, "2026-11-08")).toBe(false);
    expect(recordChanged(null, null, "2026-11-08")).toBe(false);
  });

  it("looks at 06:05, then every five minutes until 07:15 unless the run was seen, then the next morning", () => {
    const local = (h: number, m: number) => new Date(2026, 10, 8, h, m, 0, 0);
    const tomorrow = new Date(2026, 10, 9, 6, 5, 0, 0);
    expect(nextRecordCheck(local(4, 30))).toEqual(local(6, 5));
    expect(nextRecordCheck(local(6, 5))).toEqual(local(6, 10));
    expect(nextRecordCheck(local(7, 12))).toEqual(local(7, 15));
    expect(nextRecordCheck(local(7, 15))).toEqual(tomorrow);
    expect(nextRecordCheck(local(22, 15))).toEqual(tomorrow);
    expect(nextRecordCheck(local(6, 20), true)).toEqual(tomorrow);
  });

  it("says where the run stands for the Settings line", () => {
    const start = { at: "2026-11-08T05:41:00.000Z", today: "2026-11-08" };
    const at = (h: number, m: number) => new Date(2026, 10, 8, h, m, 0, 0);
    expect(runState(record, start, "2026-11-08", at(8, 0))).toEqual({ kind: "ran", record });
    const yesterday = { ...record, today: "2026-11-07", at: "2026-11-07T05:30:00.000Z" };
    expect(runState(yesterday, null, "2026-11-08", at(6, 30))).toEqual({ kind: "pending", late: false, previous: yesterday });
    expect(runState(yesterday, null, "2026-11-08", at(7, 20))).toEqual({ kind: "pending", late: true, previous: yesterday });
    expect(runState(yesterday, start, "2026-11-08", new Date("2026-11-08T05:45:00.000Z"))).toEqual({ kind: "started", start, unfinished: false, previous: yesterday });
    expect(runState(yesterday, start, "2026-11-08", new Date("2026-11-08T06:00:00.000Z"))).toMatchObject({ kind: "started", unfinished: true });
    expect(runState(null, null, "2026-11-08", at(8, 0))).toEqual({ kind: "never" });
  });
});
