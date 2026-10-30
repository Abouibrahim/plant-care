import { useEffect, useState } from "react";
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
import { api } from "../lib/api";
import { addDays, localIsoDate, toLocalDate } from "../lib/dates";
import { DUE_NOW, summarize, withBatches, type Batch, type BatchPlant } from "../lib/batches";
import { completeTask, completeTasks, countDoneSince, listDueTasks, reopenTask, reopenTasks, skipTask, skipTasks, snoozeTask } from "../lib/db";
import {
  buzz,
  checkIn,
  clearsTheDay,
  dayPhase,
  doneAllIds,
  doneAllRepeatsBatch,
  dueNow,
  greetingFor,
  isLate,
  prefersReducedMotion,
  sortByDue,
  weekdayDate,
} from "../lib/today";
import { expansionChanged, SITES, TASK_TYPES, type Site, type TaskType, type TaskWithPlant } from "../types";
import { BatchCard, type BatchAction } from "./today/BatchCard";
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
    const raw = JSON.parse(sessionStorage.getItem(LEFT_OUT_KEY) ?? "null") as { day?: unknown; ids?: unknown } | null;
    if (raw && typeof raw.day === "string" && Array.isArray(raw.ids)) {
      return { day: raw.day, ids: new Set(raw.ids.filter((id): id is string => typeof id === "string")) };
    }
  } catch {
    // storage blocked or unreadable: nothing unticked
  }
  return { day: "", ids: new Set() };
}

function keepLeftOut(value: LeftOut) {
  keptLeftOut = value;
  try {
    sessionStorage.setItem(LEFT_OUT_KEY, JSON.stringify({ day: value.day, ids: [...value.ids] }));
  } catch {
    // storage blocked: kept for this session in memory only
  }
}

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
  /**
   * The set a Done-all or a batch closed, which Undo reopens together from the status it was given;
   * for a batch, also the plants that were unticked, which Undo leaves unticked again.
   */
  undoAll?: { ids: string[]; status: "done" | "skipped"; leftOut: string[] };
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
  /**
   * Plants unticked in a zone batch (their task ids), for the day they were unticked: kept here and
   * for the session, not in the card, so a reload of the list (Refresh, the 06:05 read) or a visit to
   * a plant's page does not tick them again, and left behind at midnight with the day's batches.
   */
  const [leftOut, setLeftOut] = useState<LeftOut>(readLeftOut);
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    keepLeftOut(leftOut);
  }, [leftOut]);
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

  /** Saves the action while the card ticks and folds away, then drops it and offers Undo. */
  async function act(task: TaskWithPlant, action: TaskAction) {
    if (!loaded || leaving[task.id]) return;
    setError(null);
    setRefreshNote(null);
    setLeaving((prev) => ({ ...prev, [task.id]: action.kind }));
    if (action.kind === "done") buzz(18);
    const lastOfDay = clearsTheDay(loaded.tasks, [task.id], action.kind, loaded.today, (id) => !!leaving[id]);
    try {
      const save: Promise<boolean | string> =
        action.kind === "done"
          ? completeTask(task.id, action.note)
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

  /**
   * Done or Skip for a set in one update: a site's waterings late or due today (Done-all), or the
   * plants still ticked in a zone batch. The cards tick (or slide) and fold together, the round moves
   * by the number done, and one toast offers Undo for the set. A watering closed meanwhile from
   * another screen (or by the morning rain skip) is left out, as a single Done leaves it out. After a
   * batch's own action its unticked plants are ticked again: they come back as a smaller batch.
   */
  async function actAll(ids: string[], action: BatchAction, batch?: Batch<TaskWithPlant>) {
    if (!loaded || ids.length === 0 || ids.some((id) => leaving[id])) return;
    setError(null);
    setRefreshNote(null);
    setLeaving((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, action.kind as ActionKind])) }));
    if (action.kind === "done") buzz(18);
    const lastOfDay = clearsTheDay(loaded.tasks, ids, action.kind, loaded.today, (id) => !!leaving[id]);
    try {
      const save = action.kind === "done" ? completeTasks(ids) : skipTasks(ids, action.reason);
      const [, closed] = await Promise.all([sleep(prefersReducedMotion() ? 0 : LEAVE_MS), save]);
      // Every id sent leaves the list: the ones not returned were not pending any more either.
      const sent = new Set(ids);
      // The batch's plants not sent were the unticked ones: an Undo unticks them again.
      const keptOut = batch ? batch.tasks.map((x) => x.id).filter((id) => !sent.has(id)) : [];
      const done = action.kind === "done" ? closed.length : 0;
      setLoaded((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((x) => !sent.has(x.id)), doneToday: prev.doneToday + done } : prev));
      if (batch) forget(batch.tasks.map((x) => x.id));
      if (closed.length === 0) {
        setRefreshNote(t.today.alreadyClosed);
        reload();
        return;
      }
      let text: string;
      if (batch) {
        const gone = new Set(closed);
        const plants = summarize(batch.tasks.filter((x) => gone.has(x.id)), loaded.today).plants;
        text = t.today.toastBatch(action.kind === "done", batch.zone, plants, batch.day === DUE_NOW ? "" : weekdayDate(batch.day));
      } else {
        text = t.today.toastDoneAll(closed.length);
      }
      setToast({
        id: nextToastId(),
        kind: action.kind,
        message: text,
        undoAll: { ids: closed, status: action.kind === "done" ? "done" : "skipped", leftOut: keptOut },
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
      setError(`${t.today.actionFailed}: ${message(err)}`);
    } finally {
      setLeaving((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    }
  }

  /** Ticks or unticks a plant of a batch (all its waterings there), for the day on screen. */
  function toggleLeftOut(plant: BatchPlant) {
    const day = loaded?.today ?? localIsoDate();
    setLeftOut((prev) => {
      const next = new Set(prev.day === day ? prev.ids : []);
      const out = plant.task_ids.every((id) => next.has(id));
      for (const id of plant.task_ids) {
        if (out) next.delete(id);
        else next.add(id);
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

  async function undo() {
    const task = toast?.undo;
    const all = toast?.undoAll;
    if ((!task && !all) || undoing) return;
    setUndoing(true);
    try {
      const reopened = all ? (await reopenTasks(all.ids, all.status)).length > 0 : task ? await reopenTask(task.id) : false;
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
  const tasks = loaded?.tasks ?? [];
  const left = leftOut.day === today ? leftOut.ids : NONE_LEFT_OUT;
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
      {loaded && <WeatherCard today={today} hour={hour} tasks={loaded.tasks} reloadKey={attempt} />}

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
              groups.map((g) => {
                // A zone's waterings due together share one card (Phase 11).
                const items = withBatches(g.tasks, today);
                // Waterings late or due today at this site, less the plants unticked in a batch and the
                // tasks on their way out: two or more, and the heading offers to close them together,
                // unless one batch already holds them all and its Done says the same.
                const waterings = doneAllIds(g.tasks, today, (id) => left.has(id) || !!leaving[id]);
                const showDoneAll = waterings.length > 0 && !doneAllRepeatsBatch(waterings, items);
                return (
                  <section key={g.site} className="section">
                    <div className="site-head">
                      <h2 className="site-heading">
                        <SiteLabel site={g.site} size={20} />
                        <span className="count">{t.today.taskCount(g.tasks.length)}</span>
                      </h2>
                      {showDoneAll && (
                        <button type="button" className="small done-all" onClick={() => void actAll(waterings, { kind: "done" })}>
                          <Check size={18} strokeWidth={2.5} aria-hidden />
                          {t.today.doneAll(waterings.length)}
                        </button>
                      )}
                    </div>
                    {items.map((item) =>
                      item.kind === "batch" ? (
                        <BatchCard
                          key={`batch:${item.batch.key}`}
                          batch={item.batch}
                          today={today}
                          leaving={leaving}
                          left={left}
                          onToggle={toggleLeftOut}
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
                      ),
                    )}
                  </section>
                );
              })
            )}
          </>
        )
      )}

      {toast && (
        <Toast
          key={toast.id}
          kind={toast.kind}
          message={toast.message}
          onUndo={toast.undo || toast.undoAll ? () => void undo() : undefined}
          undoing={undoing}
        />
      )}
      {celebrate && <LeafFall />}
    </div>
  );
}
