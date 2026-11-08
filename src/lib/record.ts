// The morning run's record on the phone (Phase 14, review 2.3): the `daily:last` and `daily:started`
// settings rows read back, and when Today should look at the record again. The cron fires anywhere in
// the 05:00 UTC hour, 06:00 to 06:59 in Tunis, so a list read at 06:05 can be older than the run:
// from 06:05 Today reads the record every five minutes while it is visible, until it has seen a record
// for the day or 07:15 has passed, and reads its list again when the record is not the one it read
// with the list. Records are compared by their own stamps, never with the phone's clock. Pure.
import type { DailyRecord, DailyStart } from "../types";

/** The first look of the day, local time; the cron has had its first minutes by then. */
export const RECORD_CHECK_FROM = { hour: 6, minute: 5 };
/** No look after this: a run started at 06:59 has had its 300 s. */
export const RECORD_CHECK_UNTIL = { hour: 7, minute: 15 };
export const RECORD_CHECK_EVERY_MS = 5 * 60_000;
/** A start marker older than this with no record for the day reads as a run that did not finish. */
export const RUN_UNFINISHED_AFTER_MS = 10 * 60_000;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

function instant(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

/** The record as stored, or null when the row holds none worth reading (no time, no date). */
export function parseDailyRecord(raw: unknown): DailyRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof DailyRecord, unknown>>;
  if (!instant(r.at) || typeof r.today !== "string") return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? { value: v.trim() } : null);
  const weather = text(r.weather_error);
  const digest = text(r.digest_error);
  const error = text(r.error);
  return {
    at: r.at,
    today: r.today,
    created: num(r.created),
    removed: num(r.removed),
    expired: num(r.expired),
    superseded: num(r.superseded),
    skipped: num(r.skipped),
    pushes_sent: num(r.pushes_sent),
    pushes_failed: num(r.pushes_failed),
    subscriptions: num(r.subscriptions),
    ...(weather ? { weather_error: weather.value } : {}),
    ...(digest ? { digest_error: digest.value } : {}),
    ...(error ? { error: error.value } : {}),
  };
}

/** The start marker as stored, or null. */
export function parseDailyStart(raw: unknown): DailyStart | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof DailyStart, unknown>>;
  return instant(r.at) && typeof r.today === "string" ? { at: r.at, today: r.today } : null;
}

/**
 * Whether a record just read means a run came after the list: another stamp than the record read
 * with the list, or a record for today where the list saw none. `seenAt` is the stamp of the record
 * read with the list, null when there was none.
 */
export function recordChanged(seenAt: string | null, record: DailyRecord | null, today: string): boolean {
  if (record === null) return false;
  return seenAt === null ? record.today === today : record.at !== seenAt;
}

function at(day: Date, time: { hour: number; minute: number }): Date {
  const d = new Date(day);
  d.setHours(time.hour, time.minute, 0, 0);
  return d;
}

/**
 * When Today next reads the record: 06:05 today when it is earlier; every five minutes until 07:15
 * inside the cron's hour, unless today's record has already been seen; otherwise 06:05 tomorrow.
 * The midnight tick reads the new day's list anyway, so past 07:15 the next morning's first look is
 * all that is needed.
 */
export function nextRecordCheck(now: Date, seenToday = false): Date {
  const from = at(now, RECORD_CHECK_FROM);
  const until = at(now, RECORD_CHECK_UNTIL);
  if (now < from) return from;
  if (now < until && !seenToday) {
    const next = new Date(now.getTime() + RECORD_CHECK_EVERY_MS);
    return next < until ? next : until;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return at(tomorrow, RECORD_CHECK_FROM);
}

export type RunState =
  /** A record for the day. */
  | { kind: "ran"; record: DailyRecord }
  /** A start marker for the day and no record yet: still running, or dead. */
  | { kind: "started"; start: DailyStart; unfinished: boolean; previous: DailyRecord | null }
  /** No record and no start for the day; `late` once the run should have come. */
  | { kind: "pending"; late: boolean; previous: DailyRecord | null }
  | { kind: "never" };

/** Where the morning run stands for Settings: the day's record, a start without an end, nothing yet today, or nothing ever. */
export function runState(record: DailyRecord | null, start: DailyStart | null, today: string, now: Date): RunState {
  if (record && record.today === today) return { kind: "ran", record };
  if (start && start.today === today) {
    return { kind: "started", start, unfinished: now.getTime() - Date.parse(start.at) > RUN_UNFINISHED_AFTER_MS, previous: record };
  }
  if (!record && !start) return { kind: "never" };
  return { kind: "pending", late: now >= at(now, RECORD_CHECK_UNTIL), previous: record };
}
