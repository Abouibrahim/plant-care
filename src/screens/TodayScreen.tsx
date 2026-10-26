import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Camera, RefreshCw } from "lucide-react";
import { Banner } from "../components/Banner";
import { GardenScene } from "../components/GardenScene";
import { LeafFall } from "../components/LeafFall";
import { Spinner } from "../components/Spinner";
import { TaskCard, type TaskAction } from "../components/TaskCard";
import { Toast, type ToastKind } from "../components/Toast";
import { SiteLabel } from "../components/TypeIcon";
import { t } from "../i18n";
import { api } from "../lib/api";
import { addDays, localIsoDate, toLocalDate } from "../lib/dates";
import { completeTask, countDoneSince, listDueTasks, reopenTask, skipTask, snoozeTask } from "../lib/db";
import { buzz, checkIn, dayPhase, dueNow, greetingFor, isLate, prefersReducedMotion, sortByDue } from "../lib/today";
import { expansionChanged, SITES, TASK_TYPES, type Site, type TaskType, type TaskWithPlant } from "../types";
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
/** The 06:00 run (cron at 05:00 UTC) plus a few minutes, local time in Tunis. */
const MORNING_RUN_HOUR = 6;
const MORNING_RUN_MINUTE = 5;

type SiteFilter = "all" | Site;
type ActionKind = TaskAction["kind"];

interface Loaded {
  today: string;
  /** When the list was read (ms), so a return after the 06:00 run reads it again. */
  at: number;
  tasks: TaskWithPlant[];
  /** Tasks marked done since midnight on the phone. */
  doneToday: number;
}

interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
  /** The task Undo reopens; absent for a snooze. */
  undo?: TaskWithPlant;
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Record<string, ActionKind>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [site, setSite] = useState<SiteFilter>(readSite);
  const [day, setDay] = useState<string | null>(null);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [streak, setStreak] = useState(() => checkIn(localIsoDate()));

  useEffect(() => {
    let active = true;
    const today = localIsoDate();
    Promise.all([listDueTasks(addDays(today, WEEK_DAYS - 1)), countDoneSince(startOfDay(today)).catch(() => 0)])
      .then(([tasks, doneToday]) => {
        if (!active) return;
        setLoaded({ today, tasks, doneToday, at: Date.now() });
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(message(err));
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
  }, [attempt]);

  // The installed app sits in the background overnight and the morning push only brings it to the
  // front, so nothing remounts the screen: on every return to the foreground, and at the next
  // midnight, the clock is read again for the greeting, the scene and the streak, and when the date
  // turned the list, the round and the badge are fetched for the new day.
  const loadedToday = loaded?.today ?? null;
  const loadedAt = loaded?.at ?? null;
  useEffect(() => {
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
      // Read before the 06:00 run on the same date: the run may have skipped waterings after rain
      // and fetched a new forecast since, so the list and the weather are read again.
      const morningRun = new Date(now);
      morningRun.setHours(MORNING_RUN_HOUR, MORNING_RUN_MINUTE, 0, 0);
      if (loadedAt !== null && loadedAt < morningRun.getTime() && now.getTime() >= morningRun.getTime()) {
        setAttempt((n) => n + 1);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    // The next midnight, or the next morning run if it comes first.
    const next = new Date();
    next.setHours(24, 0, 5, 0);
    const run = new Date();
    run.setHours(MORNING_RUN_HOUR, MORNING_RUN_MINUTE, 0, 0);
    const at = run.getTime() > Date.now() && run.getTime() < next.getTime() ? run : next;
    const timer = window.setTimeout(tick, Math.max(1000, at.getTime() - Date.now()));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, [loadedToday, loadedAt]);

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

  /** Saves the action while the card ticks and folds away, then drops it and offers Undo. */
  async function act(task: TaskWithPlant, action: TaskAction) {
    if (!loaded || leaving[task.id]) return;
    setError(null);
    setRefreshNote(null);
    setLeaving((prev) => ({ ...prev, [task.id]: action.kind }));
    if (action.kind === "done") buzz(18);
    // Whether this tick clears the day: nothing else late or due today that is not already on its
    // way out. Open windows do not count; they can stay open for months.
    const lastOfDay =
      action.kind === "done" &&
      dueNow(task, loaded.today) &&
      !loaded.tasks.some((x) => x.id !== task.id && dueNow(x, loaded.today) && !leaving[x.id]);
    try {
      const save: Promise<boolean | string> =
        action.kind === "done"
          ? completeTask(task.id)
          : action.kind === "skip"
            ? skipTask(task.id, action.reason)
            : snoozeTask(task, action.days, localIsoDate());
      const [, saved] = await Promise.all([sleep(prefersReducedMotion() ? 0 : LEAVE_MS), save]);
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
      setError(`${t.today.actionFailed}: ${message(err)}`);
    } finally {
      setLeaving((prev) => without(prev, task.id));
    }
  }

  async function undo() {
    const task = toast?.undo;
    if (!task || undoing) return;
    setUndoing(true);
    try {
      await reopenTask(task.id);
      setToast(null);
      reload();
    } catch (err) {
      setError(`${t.today.undoFailed}: ${message(err)}`);
    } finally {
      setUndoing(false);
    }
  }

  const today = loaded?.today ?? localIsoDate();
  const tasks = loaded?.tasks ?? [];
  // Late means a missed watering or an ended window; a window that is simply open is not late.
  const overdue = tasks.filter((x) => isLate(x, today)).length;
  // Today's round: what is late or due today. Open windows stay out, or the day could never clear.
  const dueToday = tasks.filter((x) => dueNow(x, today)).length;
  const doneToday = loaded?.doneToday ?? 0;

  const siteTasks = site === "all" ? tasks : tasks.filter((x) => x.plant?.site === site);
  const week = buildWeek(siteTasks, today);
  const dayTasks = day === null ? tasks : onDay(tasks, day, today);
  const shown = sortByDue(day === null ? siteTasks : onDay(siteTasks, day, today), today);
  const groups = SITE_ORDER.map((s) => ({ site: s, tasks: shown.filter((x) => x.plant?.site === s) })).filter((g) => g.tasks.length > 0);
  const siteCount = (s: SiteFilter) => (s === "all" ? dayTasks.length : dayTasks.filter((x) => x.plant?.site === s).length);

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
      {loaded && <WeatherCard today={today} hour={hour} reloadKey={attempt} />}

      {error && (
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
              groups.map((g) => (
                <section key={g.site} className="section">
                  <h2 className="site-heading">
                    <SiteLabel site={g.site} size={20} />
                    <span className="count">{t.today.taskCount(g.tasks.length)}</span>
                  </h2>
                  {g.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      today={today}
                      plant={task.plant}
                      leaving={leaving[task.id] ?? null}
                      onAct={(action) => void act(task, action)}
                    />
                  ))}
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
          onUndo={toast.undo ? () => void undo() : undefined}
          undoing={undoing}
        />
      )}
      {celebrate && <LeafFall />}
    </div>
  );
}
