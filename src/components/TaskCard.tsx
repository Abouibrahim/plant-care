import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, CalendarCheck, CalendarDays, Check, Clock, MapPin, TriangleAlert, X } from "lucide-react";
import { t } from "../i18n";
import { toLocalDate } from "../lib/dates";
import { Spinner } from "./Spinner";
import { TypeTile } from "./TypeIcon";
import type { Task } from "../types";

export type TaskAction = { kind: "done" } | { kind: "skip"; reason: string } | { kind: "snooze"; days: number };

const SNOOZE_DAYS = [1, 3, 7];
const MAX_REASON = 200;

type DueState = "overdue" | "open" | "today" | "upcoming";

function shortDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : iso;
}

function weekdayDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : iso;
}

/**
 * "Open since 1 Oct · until 31 Dec" for a window that has started, "Overdue · 21 Oct" for a missed
 * watering, "Today", or the day of the week for the coming days. Past windows say so.
 */
function dueLabel(task: Task, today: string): { text: string; state: DueState } {
  const end = task.window_end;
  if (end !== null && end < today) return { text: t.today.windowEnded(shortDate(end)), state: "overdue" };
  let text: string;
  let state: DueState;
  if (task.due_on < today) {
    text = end !== null ? t.today.openSince(shortDate(task.due_on)) : `${t.today.overdue} · ${shortDate(task.due_on)}`;
    state = end !== null ? "open" : "overdue";
  } else if (task.due_on === today) {
    text = t.today.dueToday;
    state = "today";
  } else {
    text = weekdayDate(task.due_on);
    state = "upcoming";
  }
  if (end !== null) text += ` · ${t.today.until(shortDate(end))}`;
  return { text, state };
}

const DUE_ICONS = { overdue: TriangleAlert, open: Clock, today: CalendarCheck, upcoming: CalendarDays };

/** Eight specks thrown out from the tile when a task is ticked. */
function Burst() {
  return (
    <span className="burst" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 45}deg)` }} />
      ))}
    </span>
  );
}

interface Props {
  task: Task;
  /** YYYY-MM-DD on the phone. */
  today: string;
  /** When given, the card shows the plant's tag and its body links to the plant. */
  plant?: { id: string; tag: string; zone: string } | null;
  busy?: boolean;
  /** Set while the action is being saved: the card ticks (done) or slides (skip, snooze), then folds away. */
  leaving?: TaskAction["kind"] | null;
  onAct: (action: TaskAction) => void;
}

/** One task with Done, Skip (inline reason) and Snooze (1, 3 or 7 days). */
export function TaskCard({ task, today, plant, busy = false, leaving = null, onAct }: Props) {
  const [mode, setMode] = useState<"idle" | "skip" | "snooze">("idle");
  const [reason, setReason] = useState("");
  const due = dueLabel(task, today);
  const DueIcon = DUE_ICONS[due.state];
  const locked = busy || leaving !== null;

  function submitSkip(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    onAct({ kind: "skip", reason: reason.slice(0, MAX_REASON) });
    setMode("idle");
  }

  function snooze(days: number) {
    if (locked) return;
    onAct({ kind: "snooze", days });
    setMode("idle");
  }

  const body = (
    <>
      <div className="task-head">
        <span className="task-tile">
          {leaving === "done" ? (
            <span className="type-tile ticked" style={{ width: 44, height: 44 }} aria-hidden>
              <Check size={24} strokeWidth={3} />
            </span>
          ) : (
            <TypeTile type={task.type} />
          )}
          {leaving === "done" && <Burst />}
        </span>
        <div className="grow">
          <div className={`task-type t-${task.type}`}>{t.enums.task_type[task.type]}</div>
          <div className="task-title">{task.title}</div>
          {plant && (
            <div className="task-meta">
              <span className="tag">{plant.tag}</span>
              {plant.zone.trim() !== "" && (
                <span className="site-label">
                  <MapPin size={14} aria-hidden />
                  {plant.zone}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={`task-due ${due.state}`}>
        <DueIcon size={16} aria-hidden />
        {due.text}
      </div>
      {task.instruction && <p className="task-instruction">{task.instruction}</p>}
    </>
  );

  return (
    <div className={`task-wrap ${leaving ? `leaving ${leaving}` : ""}`}>
      <div className="task-clip">
        <div className={`card task ${due.state}`}>
          {plant ? (
            <Link to={`/plants/${plant.id}`} className="task-body">
              {body}
            </Link>
          ) : (
            <div className="task-body">{body}</div>
          )}

          {mode === "idle" && (
            <div className="task-actions">
              <button type="button" className="primary small" disabled={locked} onClick={() => onAct({ kind: "done" })}>
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    <Check size={18} strokeWidth={2.5} aria-hidden />
                    {t.today.done}
                  </>
                )}
              </button>
              <button type="button" className="small" disabled={locked} onClick={() => setMode("skip")}>
                <X size={18} aria-hidden />
                {t.today.skip}
              </button>
              <button type="button" className="small" disabled={locked} onClick={() => setMode("snooze")}>
                <AlarmClock size={18} aria-hidden />
                {t.today.snooze}
              </button>
            </div>
          )}

          {mode === "skip" && (
            <form className="task-sub skip" onSubmit={submitSkip}>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.today.skipReason}
                aria-label={t.today.skipReason}
                maxLength={MAX_REASON}
                autoFocus
                enterKeyHint="done"
              />
              <button type="submit" className="small" disabled={locked}>
                {t.today.skipConfirm}
              </button>
              <button type="button" className="small icon-btn" onClick={() => setMode("idle")} aria-label={t.common.cancel}>
                <X size={18} aria-hidden />
              </button>
            </form>
          )}

          {mode === "snooze" && (
            <div className="task-sub snooze" role="group" aria-label={t.today.snooze}>
              {SNOOZE_DAYS.map((days) => (
                <button key={days} type="button" className="small" disabled={locked} onClick={() => snooze(days)}>
                  {t.today.snoozeDays(days)}
                </button>
              ))}
              <button type="button" className="small icon-btn" onClick={() => setMode("idle")} aria-label={t.common.cancel}>
                <X size={18} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
