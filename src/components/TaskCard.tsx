import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Check, X } from "lucide-react";
import { t } from "../i18n";
import { toLocalDate } from "../lib/dates";
import { Spinner } from "./Spinner";
import { TypePill } from "./TypeIcon";
import type { Task } from "../types";

export type TaskAction = { kind: "done" } | { kind: "skip"; reason: string } | { kind: "snooze"; days: number };

const SNOOZE_DAYS = [1, 3, 7];
const MAX_REASON = 200;

type DueState = "overdue" | "today" | "upcoming";

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
    state = "overdue";
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

interface Props {
  task: Task;
  /** YYYY-MM-DD on the phone. */
  today: string;
  /** When given, the card shows the plant's tag and its body links to the plant. */
  plant?: { id: string; tag: string; zone: string } | null;
  busy?: boolean;
  onAct: (action: TaskAction) => void;
}

/** One task with Done, Skip (inline reason) and Snooze (1, 3 or 7 days). */
export function TaskCard({ task, today, plant, busy = false, onAct }: Props) {
  const [mode, setMode] = useState<"idle" | "skip" | "snooze">("idle");
  const [reason, setReason] = useState("");
  const due = dueLabel(task, today);
  const stateClass = due.state === "overdue" ? "overdue" : due.state === "today" ? "due-today" : "";

  function submitSkip(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onAct({ kind: "skip", reason: reason.slice(0, MAX_REASON) });
    setMode("idle");
  }

  function snooze(days: number) {
    if (busy) return;
    onAct({ kind: "snooze", days });
    setMode("idle");
  }

  const body = (
    <>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <strong className="grow">{task.title}</strong>
        <TypePill type={task.type} />
      </div>
      {plant && (
        <div className="small">
          <span className="pill">{plant.tag}</span>
          {plant.zone.trim() !== "" && <span className="muted">{plant.zone}</span>}
        </div>
      )}
      <div className={`small ${due.state === "overdue" ? "warn-text" : "muted"}`}>{due.text}</div>
      {task.instruction && (
        <p className="small" style={{ margin: "6px 0 0" }}>
          {task.instruction}
        </p>
      )}
    </>
  );

  return (
    <div className={`card task ${stateClass}`}>
      {plant ? (
        <Link to={`/plants/${plant.id}`} className="task-body">
          {body}
        </Link>
      ) : (
        <div className="task-body">{body}</div>
      )}

      {mode === "idle" && (
        <div className="task-actions">
          <button type="button" className="primary small" disabled={busy} onClick={() => onAct({ kind: "done" })}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                <Check size={18} strokeWidth={2.5} aria-hidden />
                {t.today.done}
              </>
            )}
          </button>
          <button type="button" className="small" disabled={busy} onClick={() => setMode("skip")}>
            <X size={18} aria-hidden />
            {t.today.skip}
          </button>
          <button type="button" className="small" disabled={busy} onClick={() => setMode("snooze")}>
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
          <button type="submit" className="small" disabled={busy}>
            {t.today.skipConfirm}
          </button>
          <button type="button" className="small" onClick={() => setMode("idle")}>
            {t.common.cancel}
          </button>
        </form>
      )}

      {mode === "snooze" && (
        <div className="task-sub snooze" role="group" aria-label={t.today.snooze}>
          {SNOOZE_DAYS.map((days) => (
            <button key={days} type="button" className="small" disabled={busy} onClick={() => snooze(days)}>
              {t.today.snoozeDays(days)}
            </button>
          ))}
          <button type="button" className="small" onClick={() => setMode("idle")}>
            {t.common.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
