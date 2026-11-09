import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Camera, Check, RefreshCw } from "lucide-react";
import { Banner } from "../components/Banner";
import { GardenScene } from "../components/GardenScene";
import { LeafFall } from "../components/LeafFall";
import { Spinner } from "../components/Spinner";
import { TaskCard, type TaskAction } from "../components/TaskCard";
import { Toast, type ToastKind } from "../components/Toast";
import { SiteLabel } from "../components/TypeIcon";
import { t } from "../i18n";
import { byActivity, splitNow } from "../lib/activities";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { addDays, localIsoDate, toLocalDate } from "../lib/dates";
import { DUE_NOW, summarize, withBatches, type Batch, type ListItem } from "../lib/batches";
import {
  completeTask,
  completeTasks,
  countDoneSince,
  listDueTasks,
  loadDailyRecord,
  notifyTasksChanged,
  reopenTask,
  reopenTasks,
  skipTask,
  skipTasks,
  snoozeTask,
} from "../lib/db";
import { isNetworkFailure, phoneOnline } from "../lib/errors";
import { handoutText } from "../lib/handout";
import {
  applyQueue,
  closedSoFar,
  enqueue,
  forgetAction,
  keepToday,
  readQueue,
  recallToday,
  removeAction,
  sendingNow,
  sendQueue,
  sentIds,
  WRITE_TIMEOUT_MS,
  type NewAction,
  type QueuedAction,
  type SendReport,
} from "../lib/offline";
import { nextRecordCheck, RECORD_CHECK_FROM, recordChanged } from "../lib/record";
import { shareText } from "../lib/share";
import {
  buzz,
  checkIn,
  clearsTheDay,
  dayPhase,
  doneAllIds,
  doneAllRepeatsBatch,
  dueNow,
  foldKey,
  greetingFor,
  isFolded,
  isLate,
  NO_FOLDS,
  parseFolds,
  parseLeftOut,
  prefersReducedMotion,
  sectionFacts,
  settleFolds,
  sortByDue,
  toggleFold,
  undoClearsNote,
  weekdayDate,
  type BatchAction,
  type Folds,
} from "../lib/today";
import { expansionChanged, SITES, TASK_TYPES, type Site, type TaskType, type TaskWithPlant } from "../types";
import { ActivitySection, type ShareFlash } from "./today/ActivitySection";
import { BatchCard } from "./today/BatchCard";
import { RoundCard } from "./today/RoundCard";
import { WeatherCard } from "./today/WeatherCard";
import { WeekStrip, type WeekDay } from "./today/WeekStrip";

/** Today plus the next six days: the week strip and the list. */
const WEEK_DAYS = 7;
/** Farm first, then Backyard, as the Today row of the spec says. */
const SITE_ORDER: Site[] = ["farm", "backyard"];
/** The expansion runs once per app session when Today first opens; Refresh runs it again. */
let expandedThisSession = false;
/** Time a card takes to tick and fold away before it leaves the list (matches the CSS). */
const LEAVE_MS = 800;
const TOAST_MS = 5000;
const CELEBRATE_MS = 2600;
const SITE_KEY = "plantcare.todaySite";

type SiteFilter = "all" | Site;
type ActionKind = TaskAction["kind"];

const NONE_LEFT_OUT: ReadonlySet<string> = new Set();

interface LeftOut {
  /** The day the plants were unticked; another day's are left behind. */
  day: string;
  ids: ReadonlySet<string>;
}

const LEFT_OUT_KEY = "plantcare.leftOut";

/**
 * Plants unticked in a zone batch, kept for the app session, as `expandedThisSession` is: the
 * chevron to a plant's page and the tab bar unmount Today, and its state would go with it. A copy
 * in sessionStorage survives Android discarding the page in the background.
 */
let keptLeftOut: LeftOut | null = null;

function readLeftOut(): LeftOut {
  if (keptLeftOut) return keptLeftOut;
  try {
    return parseLeftOut(sessionStorage.getItem(LEFT_OUT_KEY));
  } catch {
    // storage blocked: nothing unticked
    return { day: "", ids: new Set() };
  }
}

function keepLeftOut(value: LeftOut) {
  keptLeftOut = value;
  try {
    sessionStorage.setItem(LEFT_OUT_KEY, JSON.stringify({ day: value.day, ids: [...value.ids] }));
  } catch {
    // storage blocked: kept for this session in memory only
  }
}

const FOLDS_KEY = "plantcare.folded";

/** The kinds of work folded on Today, kept for the app session and the day as the ticks are, with a copy in sessionStorage. */
let keptFolds: Folds | null = null;

function readFolds(): Folds {
  if (keptFolds) return keptFolds;
  try {
    return parseFolds(sessionStorage.getItem(FOLDS_KEY));
  } catch {
    // storage blocked: nothing folded
    return NO_FOLDS;
  }
}

function keepFolds(value: Folds) {
  keptFolds = value;
  try {
    sessionStorage.setItem(FOLDS_KEY, JSON.stringify(value));
  } catch {
    // storage blocked: kept for this session in memory only
  }
}

/** What public/push-sw.js posts to the open app on every push, so Today reads the morning run's result. */
const PUSH_MESSAGE = "plantcare:push";
/** The run sends its notifications one after another, its data already final: one read for the burst. */
const PUSH_QUIET_MS = 10_000;
/** A second tap on a share button this soon after the first opens no second sheet. */
const SHARE_TAP_MS = 1000;
/** How long a share button shows that the list was copied, or could not be. */
const SHARE_FLASH_MS = 2500;

interface Loaded {
  today: string;
  /** When the list was read (ms). */
  at: number;
  tasks: TaskWithPlant[];
  /** Tasks marked done since midnight on the phone. */
  doneToday: number;
  /**
   * The morning run's record as it stood when the list was read (Phase 14): a later look that finds
   * another stamp, or a record for today where there was none, reads the list again. Null when there
   * was no record; `recordReadable` false when the row could not be read at all (no settings table,
   * offline), in which case the first look of the day reads the list anyway.
   */
  record: { at: string; today: string } | null;
  recordReadable: boolean;
  /**
   * Set when the list is the copy kept on the phone (Phase 14): shown at once before the fresh read,
   * and left on screen when the read fails, with "Shown as of …" naming when it was read.
   */
  kept: { readAt: number; readDay: string } | null;
}

interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
  /** The task Undo reopens; absent for a snooze. */
  undo?: TaskWithPlant;
  /**
   * The set a Done-all or a batch closed, which Undo reopens together from the status it was given,
   * clearing the note a Skip or a batch's "Done with a note" wrote; for a batch, also the plants that
   * were unticked, which Undo leaves unticked again.
   */
  undoAll?: { ids: string[]; status: "done" | "skipped"; clearNote: boolean; leftOut: string[] };
  /**
   * An action kept on the phone (Phase 14): Undo takes it out of the queue while it waits, or, once it
   * was sent, reopens what it closed, as the online Undo does.
   */
  queued?: { id: string; status: "done" | "skipped"; clearNote: boolean; leftOut: string[] };
}

function message(err: unknown): string {
  if (isNetworkFailure(err)) return t.errors.network;
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

/** Thrown before a write when the phone says it is offline: the action goes to the queue without a try. */
class OfflineNow extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineNow";
  }
}

/** Whether a failed write means no connection, so the action is kept on the phone instead. */
function noConnection(err: unknown): boolean {
  return err instanceof OfflineNow || isNetworkFailure(err);
}

/** The list kept on the phone as Today shows it before the fresh read lands, or when it fails (Phase 14). */
function keptLoaded(today: string): Loaded | null {
  const copy = recallToday(today);
  if (!copy) return null;
  return { today, at: copy.readAt, tasks: copy.tasks, doneToday: copy.doneToday, record: null, recordReadable: false, kept: { readAt: copy.readAt, readDay: copy.readDay } };
}

/** "07:12", or "Mon 07:12" when the copy was read on another day. */
function keptTime(kept: { readAt: number; readDay: string }, today: string): string {
  const d = new Date(kept.readAt);
  return kept.readDay === today
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function longDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : iso;
}

/** Midnight on the phone, as an ISO timestamp, for the done-today count. */
function startOfDay(iso: string): string {
  const d = toLocalDate(iso) ?? new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** The tasks of one strip day; overdue tasks and open windows belong to today. */
function onDay(tasks: TaskWithPlant[], iso: string, today: string): TaskWithPlant[] {
  return tasks.filter((x) => (iso === today ? x.due_on <= today : x.due_on === iso));
}

/** Most frequent type of a day's tasks, ties broken by the calendar's type order. */
function mainType(tasks: TaskWithPlant[]): TaskType | null {
  let best: TaskType | null = null;
  let bestCount = 0;
  for (const type of TASK_TYPES) {
    const n = tasks.filter((x) => x.type === type).length;
    if (n > bestCount) {
      best = type;
      bestCount = n;
    }
  }
  return best;
}

function buildWeek(tasks: TaskWithPlant[], today: string): WeekDay[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const iso = addDays(today, i);
    const own = onDay(tasks, iso, today);
    return { iso, count: own.length, main: mainType(own), overdue: i === 0 && own.some((x) => isLate(x, today)) };
  });
}

function readSite(): SiteFilter {
  try {
    const stored = localStorage.getItem(SITE_KEY);
    if (stored && (SITES as string[]).includes(stored)) return stored as Site;
  } catch {
    // storage blocked or unavailable: all sites
  }
  return "all";
}

function writeSite(filter: SiteFilter) {
  try {
    localStorage.setItem(SITE_KEY, filter);
  } catch {
    // storage blocked: the filter still applies for this visit
  }
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** A fresh key per toast, so a second toast restarts its timer and its entrance. */
let toastCount = 0;
function nextToastId(): number {
  toastCount += 1;
  return toastCount;
}

export function TodayScreen() {
  const { session } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(() => keptLoaded(localIsoDate()));
  const [error, setError] = useState<string | null>(null);
  /** The actions kept on the phone, applied to whatever list is shown; read again after each change to the queue. */
  const [queue, setQueue] = useState<QueuedAction[]>(readQueue);
  const [sendReport, setSendReport] = useState<SendReport | null>(null);
  const mountedRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Record<string, ActionKind>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [site, setSite] = useState<SiteFilter>(readSite);
  const [day, setDay] = useState<string | null>(null);
  /**
   * Plants unticked in a zone batch (their task ids), for the day they were unticked: kept here and
   * for the session, not in the card, so a reload of the list (Refresh, the 06:05 read) or a visit to
   * a plant's page does not tick them again, and left behind at midnight with the day's batches.
   */
  const [leftOut, setLeftOut] = useState<LeftOut>(readLeftOut);
  /** The kinds of work folded for the day, per site, kind and view, kept like the ticks. */
  const [folds, setFolds] = useState<Folds>(readFolds);
  /** A share button that shows, for a moment, that its list was copied or could not be. */
  const [shareFlash, setShareFlash] = useState<{ key: string; flash: ShareFlash } | null>(null);
  /**
   * The latest share, so a late answer from an earlier sheet changes nothing (Chrome on Android does
   * not always say when a share ends, and lets the next one start), and a short pause after each, so
   * a double tap opens one sheet.
   */
  const shareSeq = useRef(0);
  const shareCooling = useRef(false);
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    keepLeftOut(leftOut);
  }, [leftOut]);
  useEffect(() => {
    keepFolds(folds);
  }, [folds]);
  useEffect(() => {
    if (!shareFlash) return;
    const timer = window.setTimeout(() => setShareFlash(null), SHARE_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [shareFlash]);
  const [streak, setStreak] = useState(() => checkIn(localIsoDate()));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * What a round of sending leaves: the queue as it stands, the report for the banner, a note for the
   * actions the grower had overtaken from another screen, and a fresh read when something landed.
   */
  function afterSend(report: SendReport) {
    if (!mountedRef.current) return;
    setQueue(readQueue());
    setSendReport(report);
    // The rows a round closed leave the list on screen at once, and the Dones among them count, so
    // the cards do not come back from the list as read while the fresh read is on its way.
    if (report.closed.length > 0) {
      const closed = new Set(report.closed);
      const done = new Set(report.done);
      setLoaded((prev) =>
        prev ? { ...prev, tasks: prev.tasks.filter((x) => !closed.has(x.id)), doneToday: prev.doneToday + prev.tasks.filter((x) => done.has(x.id)).length } : prev,
      );
    }
    if (report.leftOut.length > 0) setRefreshNote(t.today.queueNotApplied(report.leftOut.length));
    else if (report.sent > 0) setRefreshNote(t.today.queueSent(report.sent));
    // A fresh read once something landed: an action sent, rows written by a round that then stopped,
    // or rows found closed elsewhere.
    if (report.sent > 0 || report.closed.length > 0 || report.leftOut.length > 0) setAttempt((n) => n + 1);
  }
  const afterSendRef = useRef(afterSend);
  useEffect(() => {
    afterSendRef.current = afterSend;
  });

  /** The round this mount already waits on, so a second trigger (online, the foreground) does not report it twice. */
  const roundRef = useRef<Promise<SendReport> | null>(null);
  /** Sends the actions kept on the phone, when there are any; one round at a time (src/lib/offline.ts). */
  function sendPending() {
    const round = sendingNow() ?? (readQueue().length > 0 ? sendQueue() : null);
    if (!round || roundRef.current === round) return;
    roundRef.current = round;
    void round.then((report) => afterSendRef.current(report));
  }

  useEffect(() => {
    let active = true;
    const today = localIsoDate();
    // No session yet (the shell on the phone's copy, Phase 14): a read would go out under the anon key
    // and come back empty. The copy recalled at mount stays until the session is back, which reads again.
    if (!session) return;
    // The actions kept on the phone go out beside the read, not before it: the queue is applied to
    // whatever list lands, so the order makes no difference to what is shown.
    sendPending();
    Promise.all([
      listDueTasks(addDays(today, WEEK_DAYS - 1)),
      countDoneSince(startOfDay(today)).catch(() => 0),
      loadDailyRecord()
        .then((r) => ({ readable: true, record: r ? { at: r.at, today: r.today } : null }))
        .catch(() => ({ readable: false, record: null })),
    ])
      .then(([tasks, doneToday, run]) => {
        if (!active) return;
        const at = Date.now();
        setLoaded({ today, tasks, doneToday, at, record: run.record, recordReadable: run.readable, kept: null });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(message(err));
        // The list on screen, fresh or kept, stays, and says when it was read; after midnight it is
        // re-dated to the new day, as a copy recalled at mount is.
        setLoaded((prev) => {
          if (prev && prev.today !== today) return keptLoaded(today) ?? { ...prev, today, kept: prev.kept ?? { readAt: prev.at, readDay: prev.today } };
          return prev ? { ...prev, kept: prev.kept ?? { readAt: prev.at, readDay: prev.today } } : prev;
        });
      });

    if (!expandedThisSession) {
      expandedThisSession = true;
      api
        .expand()
        .then((r) => {
          if (active && expansionChanged(r)) setAttempt((n) => n + 1);
        })
        .catch(() => {
          // Not fatal: the cron fills the table each morning, and Refresh tries again.
          expandedThisSession = false;
        });
    }
    return () => {
      active = false;
    };
  }, [attempt, session]);

  // The copy kept on the phone follows the list as shown, so a task done or skipped online does not
  // come back, late, when the copy is recalled without a connection (Phase 14). A list that is itself
  // the copy, or a failed read's, is kept under the day and time it was read.
  useEffect(() => {
    if (!loaded) return;
    const copyDay = loaded.kept?.readDay ?? loaded.today;
    keepToday({ today: copyDay, at: loaded.kept?.readAt ?? loaded.at, tasks: loaded.tasks, doneToday: copyDay === loaded.today ? loaded.doneToday : 0 });
  }, [loaded]);

  // The installed app sits in the background overnight and the morning push only brings it to the
  // front, so nothing remounts the screen: on every return to the foreground, and at the next
  // midnight, the clock is read again for the greeting, the scene and the streak, and when the date
  // turned the list, the round and the badge are fetched for the new day. The morning run can come
  // at any minute from 06:00 to 06:59 and leaves its record (Phase 14): from 06:05 the record is read
  // every five minutes while the screen is visible, until a record for the day has been seen or 07:15
  // has passed, and on each return to the foreground; a record that is not the one read with the list
  // means a run came after it, and the list, the weather and the badge are read again. Records are
  // compared by their stamps, never with the phone's clock.
  const loadedToday = loaded?.today ?? null;
  const loadedAt = loaded?.at ?? null;
  const seenRecordAt = loaded?.record?.at ?? null;
  const seenRecordToday = loaded?.record?.today ?? null;
  const recordReadable = loaded?.recordReadable ?? true;
  const [recordTick, setRecordTick] = useState(0);
  /** The day the fallback read ran, when the record could not be read at all. */
  const fallbackDay = useRef("");
  useEffect(() => {
    let active = true;
    const checkRecord = (now: Date, iso: string) => {
      if (loadedAt === null) return;
      loadDailyRecord()
        .then((record) => {
          if (active && recordChanged(seenRecordAt, record, iso)) setAttempt((n) => n + 1);
        })
        .catch(() => {
          // The record cannot be read (no settings table yet, or offline): once the cron's hour has
          // begun, the first look of the day reads the list anyway, as the fixed 06:05 read used to.
          const morning = new Date(now);
          morning.setHours(RECORD_CHECK_FROM.hour, RECORD_CHECK_FROM.minute, 0, 0);
          if (active && !recordReadable && now >= morning && fallbackDay.current !== iso) {
            fallbackDay.current = iso;
            setAttempt((n) => n + 1);
          }
        });
    };
    const tick = () => {
      const now = new Date();
      setHour(now.getHours());
      const iso = localIsoDate(now);
      // A check-in is a day Today was looked at: the midnight tick of a hidden page does not count.
      if (document.visibilityState === "visible") setStreak(checkIn(iso));
      if (loadedToday !== null && loadedToday !== iso) {
        setDay(null);
        setAttempt((n) => n + 1);
        return;
      }
      if (document.visibilityState === "visible") checkRecord(now, iso);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    // The next midnight, or the next look at the run's record if it comes first.
    const next = new Date();
    next.setHours(24, 0, 5, 0);
    const check = nextRecordCheck(new Date(), seenRecordToday !== null && seenRecordToday === localIsoDate());
    const at = check.getTime() < next.getTime() ? check : next;
    const timer = window.setTimeout(() => {
      tick();
      // Arms the next look; a reload re-arms it through the list's own stamps as well.
      setRecordTick((n) => n + 1);
    }, Math.max(1000, at.getTime() - Date.now()));
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, [loadedToday, loadedAt, seenRecordAt, seenRecordToday, recordReadable, recordTick]);

  // The morning run can come at any minute from 06:00 to 06:59, after a read at 06:05, and its rain
  // skip closes waterings: when its notifications reach the phone while Today is open (or in the
  // background), the service worker says so and the list, the weather and the badge are read again,
  // so a kind handed out after the notification does not carry a watering the rain skipped. The run
  // has written everything before its first notification, so the first message is read at once and
  // the rest of its burst adds nothing.
  useEffect(() => {
    const worker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!worker) return;
    let quietUntil = 0;
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type !== PUSH_MESSAGE) return;
      const now = Date.now();
      if (now < quietUntil) return;
      quietUntil = now + PUSH_QUIET_MS;
      setAttempt((n) => n + 1);
      notifyTasksChanged();
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, []);

  // The actions kept on the phone are sent again when the connection comes back and when the app
  // comes back to the foreground (the `online` event says an interface is up, not that data flows,
  // so the sending itself is bounded and keeps what fails). A connection lost or regained also
  // renders the screen again, so the banner says "Offline" as soon as the phone does.
  const [, setConnection] = useState(phoneOnline());
  const keptRef = useRef(false);
  useEffect(() => {
    keptRef.current = !!loaded?.kept;
  }, [loaded]);
  useEffect(() => {
    const onOnline = () => {
      setConnection(true);
      // Actions waiting go out, and their round reads the list again; a kept list with none waiting is read again here.
      if (readQueue().length > 0) sendPending();
      else if (keptRef.current) setAttempt((n) => n + 1);
    };
    const onOffline = () => setConnection(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") sendPending();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // While the screen stays open, the hour is read again on the hour, so the greeting and the weather
  // card's "(passed)" and "(now)" marks follow the clock; each new hour arms the next read.
  useEffect(() => {
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 1, 0);
    const timer = window.setTimeout(() => setHour(new Date().getHours()), Math.max(1000, next.getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [hour]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!celebrate) return;
    const timer = window.setTimeout(() => setCelebrate(false), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  function reload() {
    setAttempt((n) => n + 1);
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote(null);
    setError(null);
    try {
      const r = await api.expand();
      setRefreshNote(t.today.refreshed(r.created, r.removed, r.expired, r.superseded));
      reload();
    } catch (err) {
      setError(`${t.today.refreshFailed}: ${message(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  function chooseSite(next: SiteFilter) {
    setSite(next);
    writeSite(next);
  }

  /**
   * Keeps an action on the phone when there is no connection (Phase 14): the cards leave through the
   * queue applied to the list, the round counts a Done, and the toast says so, with an Undo.
   */
  function keepAction(entry: NewAction, text: string, leftOutIds: string[], lastOfDay: boolean) {
    const kept = enqueue(entry);
    if (!kept) {
      // The phone's storage refused the queue (full, or blocked): the card stays, and nothing is pretended.
      setError(t.today.keepFailed);
      return;
    }
    setQueue(readQueue());
    // The badge counts the kept copy less the actions waiting (src/components/Layout.tsx): counted again.
    notifyTasksChanged();
    setToast({
      id: nextToastId(),
      kind: entry.kind === "done" ? "done" : "skip",
      message: `${text} · ${t.today.savedOnPhone}`,
      queued: { id: kept.id, status: entry.kind === "done" ? "done" : "skipped", clearNote: entry.kind === "skip" || entry.note.trim() !== "", leftOut: leftOutIds },
    });
    if (lastOfDay) {
      setCelebrate(true);
      buzz([20, 80, 30]);
    }
  }

  /** Saves the action while the card ticks and folds away, then drops it and offers Undo. */
  async function act(task: TaskWithPlant, action: TaskAction) {
    if (!loaded || leaving[task.id]) return;
    setError(null);
    setRefreshNote(null);
    setLeaving((prev) => ({ ...prev, [task.id]: action.kind }));
    if (action.kind === "done") buzz(18);
    const lastOfDay = clearsTheDay(applied.tasks, [task.id], action.kind, loaded.today, (id) => !!leaving[id]);
    const tapped = new Date().toISOString();
    // The card ticks (or slides) for its moment whatever the write does, so a Done kept on the phone
    // looks like one that landed.
    const leave = sleep(prefersReducedMotion() ? 0 : LEAVE_MS);
    try {
      // Without a connection a Done or a Skip is kept on the phone at once; a write that hangs past
      // the bound is kept the same way. A snooze needs the connection, and says so.
      if (!phoneOnline()) {
        await leave;
        throw new OfflineNow();
      }
      // The tap's time goes on the row, as it does for an action kept on the phone: a write whose reply
      // is lost is then known again by that time when the action is sent (src/lib/offline.ts).
      const bound = { actedAt: tapped, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) };
      const save: Promise<boolean | string> =
        action.kind === "done"
          ? completeTask(task.id, action.note, bound)
          : action.kind === "skip"
            ? skipTask(task.id, action.reason, bound)
            : snoozeTask(task, action.days, localIsoDate(), bound.signal);
      // A write that fails at once still lets the card finish its tick before the toast or the message.
      const settled = save.catch(async (err: unknown) => {
        await leave;
        throw err;
      });
      const [, saved] = await Promise.all([leave, settled]);
      if (saved === false) {
        // Not pending any more: closed by the 06:00 rain skip or from another screen. Nothing changed
        // here, so no toast, no count and no Undo (which would reopen the closed task).
        setRefreshNote(t.today.alreadyClosed);
        reload();
        return;
      }
      const movedTo = typeof saved === "string" ? saved : null;
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.filter((x) => x.id !== task.id),
              doneToday: prev.doneToday + (action.kind === "done" ? 1 : 0),
            }
          : prev,
      );
      if (action.kind === "snooze") {
        setToast({ id: nextToastId(), kind: "snooze", message: t.today.toastSnoozed(longDate(movedTo ?? loaded.today)) });
        // Fetch again: the moved task may land inside the week, and a snoozed watering closes the
        // waterings it skips over.
        reload();
      } else {
        const text = action.kind === "done" ? t.today.toastDone(task.title) : t.today.toastSkipped(task.title);
        setToast({ id: nextToastId(), kind: action.kind, message: text, undo: task });
      }
      if (lastOfDay) {
        setCelebrate(true);
        buzz([20, 80, 30]);
      }
    } catch (err) {
      if (action.kind !== "snooze" && noConnection(err)) {
        const text = action.kind === "done" ? t.today.toastDone(task.title) : t.today.toastSkipped(task.title);
        keepAction(
          action.kind === "done"
            ? { kind: "done", ids: [task.id], single: true, note: action.note ?? "", at: tapped }
            : { kind: "skip", ids: [task.id], single: true, reason: action.reason, at: tapped },
          text,
          [],
          lastOfDay,
        );
      } else if (action.kind === "snooze" && noConnection(err)) {
        setError(t.today.snoozeOffline);
      } else {
        setError(`${t.today.actionFailed}: ${message(err)}`);
      }
    } finally {
      setLeaving((prev) => without(prev, task.id));
    }
  }

  /**
   * Done or Skip for a set in one update: a site's waterings late or due today (Done-all), or the
   * plants still ticked in a zone batch, a window batch's Done with its note. The cards tick (or
   * slide) and fold together, the round moves by the number done, and one toast, naming a window
   * batch's job, offers Undo for the set. A task closed meanwhile from another screen (or by the
   * morning rain skip) is left out, as a single Done leaves it out. After a batch's own action its
   * unticked plants are ticked again: they come back as a smaller batch.
   */
  async function actAll(ids: string[], action: BatchAction, batch?: Batch<TaskWithPlant>) {
    if (!loaded || ids.length === 0 || ids.some((id) => leaving[id])) return;
    setError(null);
    setRefreshNote(null);
    setLeaving((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, action.kind as ActionKind])) }));
    if (action.kind === "done") buzz(18);
    const lastOfDay = clearsTheDay(applied.tasks, ids, action.kind, loaded.today, (id) => !!leaving[id]);
    const tapped = new Date().toISOString();
    // The batch's plants not sent were the unticked ones: an Undo unticks them again.
    const sent = new Set(ids);
    const keptOut = batch ? batch.tasks.map((x) => x.id).filter((id) => !sent.has(id)) : [];
    const leave = sleep(prefersReducedMotion() ? 0 : LEAVE_MS);
    try {
      if (!phoneOnline()) {
        await leave;
        throw new OfflineNow();
      }
      const bound = { actedAt: tapped, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) };
      const save = action.kind === "done" ? completeTasks(ids, action.note, bound) : skipTasks(ids, action.reason, bound);
      const settled = save.catch(async (err: unknown) => {
        await leave;
        throw err;
      });
      const [, closed] = await Promise.all([leave, settled]);
      // Every id sent leaves the list: the ones not returned were not pending any more either.
      const done = action.kind === "done" ? closed.length : 0;
      setLoaded((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((x) => !sent.has(x.id)), doneToday: prev.doneToday + done } : prev));
      if (batch) forget(batch.tasks.map((x) => x.id));
      if (closed.length === 0) {
        setRefreshNote(ids.length > 1 ? t.today.setAlreadyClosed : t.today.alreadyClosed);
        reload();
        return;
      }
      let text: string;
      if (batch) {
        const gone = new Set(closed);
        const plants = summarize(batch.tasks.filter((x) => gone.has(x.id)), loaded.today).plants;
        text = t.today.toastBatch(action.kind === "done", batch.title ?? "", batch.zone, plants, batch.day === DUE_NOW ? "" : weekdayDate(batch.day));
      } else {
        text = t.today.toastDoneAll(closed.length);
      }
      setToast({
        id: nextToastId(),
        kind: action.kind,
        message: text,
        undoAll: {
          ids: closed,
          status: action.kind === "done" ? "done" : "skipped",
          clearNote: undoClearsNote(action),
          leftOut: keptOut,
        },
      });
      if (closed.length < ids.length) {
        // The rest were not pending any more: the list is read again to be sure of it.
        setRefreshNote(t.today.someAlreadyClosed);
        reload();
      }
      if (lastOfDay) {
        setCelebrate(true);
        buzz([20, 80, 30]);
      }
    } catch (err) {
      if (noConnection(err)) {
        if (batch) forget(batch.tasks.map((x) => x.id));
        const plants = batch ? summarize(batch.tasks.filter((x) => sent.has(x.id)), loaded.today).plants : 0;
        const text = batch
          ? t.today.toastBatch(action.kind === "done", batch.title ?? "", batch.zone, plants, batch.day === DUE_NOW ? "" : weekdayDate(batch.day))
          : t.today.toastDoneAll(ids.length);
        keepAction(
          action.kind === "done"
            ? { kind: "done", ids, single: false, note: action.note ?? "", at: tapped }
            : { kind: "skip", ids, single: false, reason: action.reason, at: tapped },
          text,
          keptOut,
          lastOfDay,
        );
      } else {
        setError(`${t.today.actionFailed}: ${message(err)}`);
      }
    } finally {
      setLeaving((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    }
  }

  /** Unticks (`out`) or ticks again tasks of a batch, a plant's or the whole batch's, for the day on screen. */
  function leaveOut(ids: string[], out: boolean) {
    const day = loaded?.today ?? localIsoDate();
    setLeftOut((prev) => {
      const next = new Set(prev.day === day ? prev.ids : []);
      for (const id of ids) {
        if (out) next.add(id);
        else next.delete(id);
      }
      return { day, ids: next };
    });
  }

  function forget(ids: string[]) {
    setLeftOut((prev) => {
      if (!ids.some((id) => prev.ids.has(id))) return prev;
      const next = new Set(prev.ids);
      for (const id of ids) next.delete(id);
      return { day: prev.day, ids: next };
    });
  }

  /**
   * Hands a kind's list to the share sheet; the text was built in the tap, so the sheet opens within
   * it. Shared or dismissed, nothing changes here. A copy (no share sheet), or a list neither shared
   * nor copied, shows for a moment on the button tapped, which may be far below the banners, and stays
   * said in the info banner: that leaves the last action's Undo toast in place, and it has no Retry,
   * which would read the list again rather than share it. No button waits for a sheet to close, since
   * Chrome on Android does not always say when it has.
   */
  async function shareSection(key: string, text: string) {
    if (shareCooling.current) return;
    shareCooling.current = true;
    window.setTimeout(() => {
      shareCooling.current = false;
    }, SHARE_TAP_MS);
    shareSeq.current += 1;
    const seq = shareSeq.current;
    setError(null);
    setRefreshNote(null);
    let flash: ShareFlash | null = null;
    try {
      if ((await shareText(text)) === "copied") flash = "copied";
    } catch {
      flash = "failed";
    }
    if (flash === null || seq !== shareSeq.current) return;
    setRefreshNote(flash === "copied" ? t.today.shareCopied : t.today.shareFailed);
    setShareFlash({ key, flash });
  }

  /**
   * Undo of an action kept on the phone: while it waits, it leaves the queue and the cards come back
   * from the list as read; once sent, or being sent, the ids it closed are reopened as the online
   * Undo reopens them; half written (a set whose rounds closed part of it so far), the rows closed
   * are reopened the same way and the rest leaves the queue. A send under way is waited for first,
   * so nothing is reopened or removed half-way.
   */
  async function undoKept(kept: NonNullable<ToastState["queued"]>) {
    const round = sendingNow();
    if (round) await round;
    const closed = sentIds(kept.id);
    if (closed) {
      const reopened = closed.length > 0 && (await reopenTasks(closed, kept.status, kept.clearNote)).length > 0;
      if (!reopened) setRefreshNote(t.today.undoNothing);
      reload();
    } else {
      // Not sent whole: the rest leaves the queue at once, and the rows the rounds so far closed go
      // back to pending as after a send. A reopen that fails leaves them in closedSoFar, so another
      // tap on the toast tries again (undo() shows the error and keeps the toast).
      const written = closedSoFar(kept.id);
      const removed = removeAction(kept.id);
      if (removed) {
        setQueue(readQueue());
        notifyTasksChanged();
      }
      if (written.length > 0) {
        const reopened = (await reopenTasks(written, kept.status, kept.clearNote)).length > 0;
        forgetAction(kept.id);
        if (!reopened) setRefreshNote(t.today.undoNothing);
        reload();
      } else if (!removed) {
        setRefreshNote(t.today.undoNothing);
      }
    }
    if (kept.leftOut.length > 0) {
      const day = loaded?.today ?? localIsoDate();
      const ids = kept.leftOut;
      setLeftOut((prev) => ({ day, ids: new Set([...(prev.day === day ? prev.ids : []), ...ids]) }));
    }
  }

  async function undo() {
    const task = toast?.undo;
    const all = toast?.undoAll;
    const kept = toast?.queued;
    if ((!task && !all && !kept) || undoing) return;
    setUndoing(true);
    try {
      if (kept) {
        await undoKept(kept);
        setToast(null);
        return;
      }
      const reopened = all ? (await reopenTasks(all.ids, all.status, all.clearNote)).length > 0 : task ? await reopenTask(task.id) : false;
      // Nothing reopened: the rows changed meanwhile (acted on again on another screen).
      if (!reopened) setRefreshNote(t.today.undoNothing);
      else if (all && all.leftOut.length > 0) {
        const day = loaded?.today ?? localIsoDate();
        const kept = all.leftOut;
        setLeftOut((prev) => ({ day, ids: new Set([...(prev.day === day ? prev.ids : []), ...kept]) }));
      }
      setToast(null);
      reload();
    } catch (err) {
      setError(`${t.today.undoFailed}: ${message(err)}`);
    } finally {
      setUndoing(false);
    }
  }

  const today = loaded?.today ?? localIsoDate();
  // The list as shown: the actions kept on the phone applied, whatever list landed (Phase 14).
  const applied = applyQueue(loaded?.tasks ?? [], loaded?.doneToday ?? 0, queue, loaded?.today ?? localIsoDate());
  const tasks = applied.tasks;
  const left = leftOut.day === today ? leftOut.ids : NONE_LEFT_OUT;
  // Late means a missed watering or an ended window; a window that is simply open is not late.
  const overdue = tasks.filter((x) => isLate(x, today)).length;
  // Today's round: what is late or due today. Open windows stay out, or the day could never clear.
  const dueToday = tasks.filter((x) => dueNow(x, today)).length;
  const doneToday = applied.doneToday;
  // Offline, or on the copy kept on the phone, or with actions waiting: one line says it all, with
  // Retry for the list and Send now for the actions; the error banner then stays out of the way.
  const offlineParts = [
    phoneOnline() ? "" : t.today.offline,
    loaded?.kept ? t.today.shownAsOf(keptTime(loaded.kept, today)) : "",
    queue.length > 0 ? t.today.queued(queue.length) : "",
    sendReport?.failed && queue.length > 0 && phoneOnline() ? t.today.queueFailed(isNetworkFailure(new Error(sendReport.failed)) ? t.errors.network : sendReport.failed) : "",
  ].filter(Boolean);

  const siteTasks = site === "all" ? tasks : tasks.filter((x) => x.plant?.site === site);
  const week = buildWeek(siteTasks, today);
  const dayTasks = day === null ? tasks : onDay(tasks, day, today);
  const shown = sortByDue(day === null ? siteTasks : onDay(siteTasks, day, today), today);
  const groups = SITE_ORDER.map((s) => ({ site: s, tasks: shown.filter((x) => x.plant?.site === s) })).filter((g) => g.tasks.length > 0);
  const siteCount = (s: SiteFilter) => (s === "all" ? dayTasks.length : dayTasks.filter((x) => x.plant?.site === s).length);
  // A kind's fold and list belong to the view: the week view and today's tile share one, and each
  // coming day chosen in the strip has its own.
  const view = day === null || day === today ? DUE_NOW : day;

  // Each site's list (Phase 13): its work due now by kind of task, then the coming days. The week view
  // keeps the coming days apart, under "Later this week"; a day chosen in the strip shows its own
  // tasks only, all by kind. A zone's waterings due together share one card (Phase 11), and so do the
  // plants of a zone that share a window job (Phase 12); the cards then go under their kind, in the
  // calendar's order, each kind keeping Today's order.
  const sites = groups.map((g) => {
    const { now, later } = day === null ? splitNow(g.tasks, today) : { now: g.tasks, later: [] };
    const items = withBatches(now, today);
    // Waterings late or due today at this site, less the plants unticked in a batch and the tasks on
    // their way out: two or more, and the Water section offers to close them together, unless one
    // batch already holds them all and its Done says the same.
    const waterings = doneAllIds(now, today, (id) => left.has(id) || !!leaving[id]);
    return {
      site: g.site,
      count: g.tasks.length,
      kinds: byActivity(items).map(({ type, items: mine }) => ({
        type,
        items: mine,
        facts: sectionFacts(mine, today, (id) => leaving[id] !== undefined),
        key: foldKey(g.site, type, view),
      })),
      waterings,
      showDoneAll: waterings.length > 0 && !doneAllRepeatsBatch(waterings, items),
      later,
      tail: withBatches(later, today),
    };
  });
  // A kind that new work opened stays open until a tap folds it again: its fold goes as it shows.
  const settled = settleFolds(folds, today, Object.fromEntries(sites.flatMap((s) => s.kinds.map((k) => [k.key, k.facts.live]))));
  if (settled !== folds) setFolds(settled);

  /** A card of the list: a zone batch (Phases 11 and 12) or a task of its own. */
  const card = (item: ListItem<TaskWithPlant>) =>
    item.kind === "batch" ? (
      <BatchCard
        key={`batch:${item.batch.key}`}
        batch={item.batch}
        today={today}
        leaving={leaving}
        left={left}
        onLeaveOut={leaveOut}
        onAct={(ids, action) => void actAll(ids, action, item.batch)}
      />
    ) : (
      <TaskCard
        key={item.task.id}
        task={item.task}
        today={today}
        plant={item.task.plant}
        leaving={leaving[item.task.id] ?? null}
        onAct={(action) => void act(item.task, action)}
      />
    );

  const phase = dayPhase(hour);

  return (
    <div className="screen today-screen">
      <header className={`today-hero ${phase}`}>
        <div className="row between">
          <span className="eyebrow">{longDate(today)}</span>
          <button
            type="button"
            className="icon-btn glass"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label={refreshing ? t.today.refreshing : t.today.refresh}
          >
            <RefreshCw size={20} className={refreshing ? "spin" : ""} aria-hidden />
          </button>
        </div>
        <h1>{t.today.greeting[greetingFor(hour)]}</h1>
        {loaded && (
          <p className="hero-chip">
            <CalendarDays size={16} aria-hidden />
            {t.today.summary(tasks.length, overdue)}
          </p>
        )}
        <GardenScene phase={phase} />
      </header>

      {loaded && <RoundCard done={doneToday} total={doneToday + dueToday} streak={streak} today={today} />}
      {loaded && <WeatherCard today={today} hour={hour} tasks={tasks} reloadKey={attempt} />}

      {offlineParts.length > 0 && (
        <Banner kind="warn">
          <div className="row between wrap">
            <span className="grow">{offlineParts.join(" · ")}</span>
            {loaded?.kept && (
              <button type="button" className="link small" onClick={reload}>
                {t.common.retry}
              </button>
            )}
            {queue.length > 0 && (
              <button type="button" className="link small" onClick={sendPending}>
                {t.today.sendNow}
              </button>
            )}
          </div>
        </Banner>
      )}
      {error && !loaded?.kept && (
        <Banner kind="error">
          <div className="row between wrap">
            <span className="grow">{error}</span>
            <button type="button" className="link small" onClick={reload}>
              {t.common.retry}
            </button>
          </div>
        </Banner>
      )}
      {refreshNote && <Banner kind="info">{refreshNote}</Banner>}

      {!loaded && !error ? (
        <div className="center">
          <Spinner label={t.common.loading} />
        </div>
      ) : (
        loaded && (
          <>
            <WeekStrip days={week} today={today} selected={day} onSelect={setDay} />

            {tasks.length > 0 && (
              <div className="chips scroll" role="group" aria-label={t.record.site}>
                {(["all", ...SITE_ORDER] as SiteFilter[]).map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`chip ${site === s ? "active" : ""}`}
                    aria-pressed={site === s}
                    onClick={() => chooseSite(s)}
                  >
                    {s === "all" ? t.common.all : <SiteLabel site={s} />}
                    <span className="chip-count">{siteCount(s)}</span>
                  </button>
                ))}
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="card empty-card">
                <p>{t.today.empty}</p>
                <p className="muted small">{t.today.emptyHint}</p>
                <Link to="/capture" className="btn primary block">
                  <Camera size={20} aria-hidden />
                  {t.today.capture}
                </Link>
              </div>
            ) : groups.length === 0 ? (
              <p className="center muted">{t.today.dayEmpty}</p>
            ) : (
              sites.map((s) => (
                <section key={s.site} className="section">
                  <h2 className="site-heading">
                    <SiteLabel site={s.site} size={20} />
                    <span className="count">{t.today.taskCount(s.count)}</span>
                  </h2>
                  {s.kinds.map((k) => (
                    <ActivitySection
                      key={k.type}
                      type={k.type}
                      tasks={k.facts.tasks}
                      late={k.facts.late}
                      // A task on its way out is neither kept by a fold nor counted against it.
                      folded={isFolded(folds, today, k.key, k.facts.live)}
                      leaving={k.facts.live.length === 0}
                      flash={shareFlash?.key === k.key ? shareFlash.flash : null}
                      onToggle={() => setFolds((prev) => toggleFold(prev, today, k.key, k.facts.live))}
                      onShare={() => void shareSection(k.key, handoutText({ type: k.type, site: s.site, day: view === DUE_NOW ? today : view, today, items: k.items }))}
                    >
                      {k.type === "water" && s.showDoneAll && (
                        <button type="button" className="small done-all" onClick={() => void actAll(s.waterings, { kind: "done" })}>
                          <Check size={18} strokeWidth={2.5} aria-hidden />
                          {t.today.doneAll(s.waterings.length)}
                        </button>
                      )}
                      {k.items.map(card)}
                    </ActivitySection>
                  ))}
                  {s.tail.length > 0 && (
                    <section className={`later ${s.later.every((x) => leaving[x.id] !== undefined) ? "leaving" : ""}`}>
                      <div className="activity-clip">
                        <h3 className="later-head">
                          <CalendarDays size={18} aria-hidden />
                          {t.today.later}
                          <span className="count">{t.today.taskCount(s.later.length)}</span>
                        </h3>
                        {s.tail.map(card)}
                      </div>
                    </section>
                  )}
                </section>
              ))
            )}
          </>
        )
      )}

      {toast && (
        <Toast
          key={toast.id}
          kind={toast.kind}
          message={toast.message}
          onUndo={toast.undo || toast.undoAll || toast.queued ? () => void undo() : undefined}
          undoing={undoing}
        />
      )}
      {celebrate && <LeafFall />}
    </div>
  );
}
