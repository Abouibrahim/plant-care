import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { TaskCard, type TaskAction } from "../components/TaskCard";
import { t } from "../i18n";
import { api } from "../lib/api";
import { addDays, localIsoDate, toLocalDate } from "../lib/dates";
import { completeTask, listDueTasks, skipTask, snoozeTask } from "../lib/db";
import { expansionChanged, TASK_TYPES, type Site, type TaskWithPlant } from "../types";

/** Today plus the coming week. */
const WEEK_DAYS = 7;
/** Farm first, then Backyard, as the Today row of the spec says. */
const SITE_ORDER: Site[] = ["farm", "backyard"];
/** The expansion runs once per app session when Today first opens; Refresh runs it again. */
let expandedThisSession = false;

interface Loaded {
  today: string;
  tasks: TaskWithPlant[];
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

function longDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : iso;
}

/** Earliest due first (so overdue leads), then the calendar's type order, then the title. */
function sortTasks(tasks: TaskWithPlant[]): TaskWithPlant[] {
  return [...tasks].sort(
    (a, b) =>
      a.due_on.localeCompare(b.due_on) ||
      TASK_TYPES.indexOf(a.type) - TASK_TYPES.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

export function TodayScreen() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const today = localIsoDate();
    listDueTasks(addDays(today, WEEK_DAYS))
      .then((tasks) => {
        if (!active) return;
        setLoaded({ today, tasks });
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

  async function act(task: TaskWithPlant, action: TaskAction) {
    if (busyId || !loaded) return;
    setBusyId(task.id);
    setError(null);
    setRefreshNote(null);
    try {
      if (action.kind === "done") await completeTask(task.id);
      else if (action.kind === "skip") await skipTask(task.id, action.reason);
      else await snoozeTask(task, action.days, loaded.today);
      setLoaded((prev) => (prev ? { ...prev, tasks: prev.tasks.filter((x) => x.id !== task.id) } : prev));
      // A short snooze lands inside the week: fetch again so the moved task shows on its new day.
      if (action.kind === "snooze" && action.days < WEEK_DAYS) reload();
    } catch (err) {
      setError(`${t.today.actionFailed}: ${message(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  const today = loaded?.today ?? localIsoDate();
  const tasks = loaded?.tasks ?? [];
  const overdue = tasks.filter((x) => x.due_on < today).length;
  const groups = SITE_ORDER.map((site) => ({
    site,
    tasks: sortTasks(tasks.filter((x) => x.plant?.site === site)),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>{t.today.title}</h1>
        <button type="button" className="small" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? <Spinner label={t.today.refreshing} /> : t.today.refresh}
        </button>
      </div>
      <p className="muted small">
        {longDate(today)}
        {loaded && ` · ${t.today.summary(tasks.length, overdue)}`}
      </p>

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
      ) : groups.length === 0 ? (
        loaded && (
          <div className="card">
            <p>{t.today.empty}</p>
            <p className="muted small">{t.today.emptyHint}</p>
            <Link to="/capture" className="btn primary block">
              {t.today.capture}
            </Link>
          </div>
        )
      ) : (
        groups.map((g) => (
          <section key={g.site} className="section">
            <h2>
              {t.site[g.site]} <span className="count">· {t.today.taskCount(g.tasks.length)}</span>
            </h2>
            {g.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                today={today}
                plant={task.plant}
                busy={busyId === task.id}
                onAct={(action) => void act(task, action)}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
