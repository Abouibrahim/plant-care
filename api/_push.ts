// The push digest: step 5 of the reminder engine in CLAUDE.md. `composeDigest` is pure (tasks in,
// messages out); `loadDigestTasks` reads the pending tasks with their plant and species rules;
// `sendDigest` delivers one push per subscription per site with web-push and drops subscriptions
// the push service no longer knows. /api/daily calls the three after the expansion.
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { HORIZON_DAYS, readAll, ruleKey } from "./_tasks.js";
import { requireEnv } from "./_supabase.js";
import { addDays, parseIso } from "../src/lib/dates.js";
import { en } from "../src/i18n/en.js";
import { TASK_TYPES, type CareRule, type DigestMessage, type PushSubscriptionJson, type Site, type TaskType } from "../src/types.js";

/** Farm first, then Backyard, as on the Today screen. */
const SITE_ORDER: Site[] = ["farm", "backyard"];
/** Titles in the notification body; the rest is "+N more". */
const BODY_LINES = 3;
/** The push service keeps an undelivered digest this long (the phone may be off at 06:00). */
const TTL_SECONDS = 12 * 3600;

export interface DigestTask {
  id: string;
  type: TaskType;
  rule_key: string;
  due_on: string;
  window_end: string | null;
  title: string;
  plant: { tag: string; site: Site; care_calendar: CareRule[] } | null;
}

interface TaskRow {
  id: string;
  type: TaskType;
  rule_key: string;
  due_on: string;
  window_end: string | null;
  title: string;
  plant: { tag: string; site: Site; species: { care_calendar: unknown } | null } | null;
}

/** Pending tasks up to the horizon with the plant's site and tag and its species' rules, read in pages. */
export async function loadDigestTasks(db: SupabaseClient, todayIso: string): Promise<DigestTask[]> {
  const rows = await readAll<TaskRow>((from, to) =>
    db
      .from("tasks")
      .select("id, type, rule_key, due_on, window_end, title, plant:plants(tag, site, species(care_calendar))")
      .eq("status", "pending")
      .lte("due_on", addDays(todayIso, HORIZON_DAYS))
      .order("due_on", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map((row) => {
    const calendar = row.plant?.species?.care_calendar;
    return {
      id: row.id,
      type: row.type,
      rule_key: row.rule_key,
      due_on: row.due_on,
      window_end: row.window_end,
      title: row.title,
      plant: row.plant
        ? { tag: row.plant.tag, site: row.plant.site, care_calendar: Array.isArray(calendar) ? (calendar as CareRule[]) : [] }
        : null,
    };
  });
}

/** The rule's lead in days, found by rule_key in the species calendar; 0 when the rule is gone. */
function leadDays(task: DigestTask): number {
  const rule = task.plant?.care_calendar.find((r) => r && typeof r === "object" && Array.isArray(r.months) && ruleKey(r) === task.rule_key);
  const lead = rule?.lead_days;
  return typeof lead === "number" && Number.isInteger(lead) && lead > 0 ? lead : 0;
}

/**
 * Whether a task belongs in today's digest: due today or overdue, or a window task on the one day
 * exactly `lead_days` before it opens (so the early notice goes out once; from the due date on the
 * task is in every digest until it is acted on).
 */
export function inDigest(task: DigestTask, todayIso: string): boolean {
  if (task.due_on <= todayIso) return true;
  if (task.window_end === null) return false;
  const lead = leadDays(task);
  return lead > 0 && task.due_on === addDays(todayIso, lead);
}

/** "1 Nov" from YYYY-MM-DD, without a time zone shift. */
function shortDate(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The order of the body lines, the same reading as Today's (`dueState` in src/lib/today.ts, which
 * the functions cannot import): the one-day early notices first, since the other lines come back
 * every morning and a notice buried in "+N more" is never read; then what is late (a missed
 * watering), then what is due today, then the windows that are open. Within a rank, earliest due
 * first, then the calendar's type order, then the title.
 */
function digestRank(task: DigestTask, todayIso: string): number {
  if (task.due_on > todayIso) return 0;
  if (task.window_end !== null) return task.due_on === todayIso ? 2 : 3;
  return task.due_on < todayIso ? 1 : 2;
}

function sortTasks(tasks: DigestTask[], todayIso: string): DigestTask[] {
  return [...tasks].sort(
    (a, b) =>
      digestRank(a, todayIso) - digestRank(b, todayIso) ||
      a.due_on.localeCompare(b.due_on) ||
      TASK_TYPES.indexOf(a.type) - TASK_TYPES.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

/** One message per site that has something to say today; sites with nothing are left out. */
export function composeDigest(tasks: DigestTask[], todayIso: string): DigestMessage[] {
  const due = tasks.filter((t) => t.plant !== null && inDigest(t, todayIso));
  const messages: DigestMessage[] = [];
  for (const site of SITE_ORDER) {
    const mine = sortTasks(
      due.filter((t) => t.plant?.site === site),
      todayIso,
    );
    if (mine.length === 0) continue;
    const lines = mine.slice(0, BODY_LINES).map((t) => {
      const line = en.digest.line(t.title, t.plant?.tag ?? "");
      return t.due_on > todayIso ? en.digest.soon(shortDate(t.due_on), line) : line;
    });
    if (mine.length > BODY_LINES) lines.push(en.digest.more(mine.length - BODY_LINES));
    messages.push({
      site,
      title: en.digest.title(en.site[site], mine.length),
      body: lines.join("\n"),
      tag: `digest-${site}`,
      url: en.digest.openUrl,
      tasks: mine.length,
    });
  }
  return messages;
}

export interface SendResult {
  sent: number;
  failed: number;
  subscriptions: number;
  dropped: number;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  keys: PushSubscriptionJson["keys"];
}

/** Reads the VAPID variables once per instance; throws ConfigError when one is missing. */
let vapidReady = false;
function configureVapid(): void {
  if (vapidReady) return;
  const subject = requireEnv("VAPID_SUBJECT");
  const publicKey = requireEnv("VAPID_PUBLIC_KEY");
  const privateKey = requireEnv("VAPID_PRIVATE_KEY");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
}

/** Status codes that mean the subscription is gone for good; the row is deleted. */
const GONE = new Set([404, 410]);

/**
 * Sends every message to every subscription. Returns the counts; the rows of subscriptions the push
 * service rejects as gone are deleted. Other failures are counted and logged by status code only.
 */
export async function sendDigest(db: SupabaseClient, messages: DigestMessage[]): Promise<SendResult> {
  const { data, error } = await db.from("push_subscriptions").select("id, endpoint, keys");
  if (error) throw error;
  const subs = (data ?? []) as SubscriptionRow[];
  const result: SendResult = { sent: 0, failed: 0, subscriptions: subs.length, dropped: 0 };
  if (subs.length === 0 || messages.length === 0) return result;

  configureVapid();
  const gone: string[] = [];
  for (const sub of subs) {
    const target = { endpoint: sub.endpoint, keys: sub.keys };
    for (const message of messages) {
      const payload = JSON.stringify({ title: message.title, body: message.body, tag: message.tag, url: message.url });
      try {
        await webpush.sendNotification(target, payload, { TTL: TTL_SECONDS, urgency: "normal" });
        result.sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status !== undefined && GONE.has(status)) {
          gone.push(sub.id);
          break; // the other messages cannot reach this subscription either
        }
        result.failed += 1;
        // 403 is the push service refusing the VAPID signature: the subscription was made with another
        // key pair (the keys were regenerated, or VAPID_PUBLIC_KEY and VITE_VAPID_PUBLIC_KEY differ).
        // The row is kept, since a key misconfiguration on the server would otherwise wipe every good one.
        const hint = status === 403 ? " (VAPID key does not match this subscription)" : "";
        console.error(`push failed: status ${status ?? "none"}${hint}, ${(err as Error).message ?? "unknown error"}`);
      }
    }
  }
  if (gone.length > 0) {
    const { error: delErr } = await db.from("push_subscriptions").delete().in("id", gone);
    if (delErr) throw delErr;
    result.dropped = gone.length;
  }
  return result;
}
