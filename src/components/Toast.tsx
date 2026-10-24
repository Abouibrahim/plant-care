import { AlarmClock, CircleCheck, X, type LucideIcon } from "lucide-react";
import { t } from "../i18n";

export type ToastKind = "done" | "skip" | "snooze";

const ICONS: Record<ToastKind, LucideIcon> = { done: CircleCheck, skip: X, snooze: AlarmClock };

interface Props {
  kind: ToastKind;
  message: string;
  /** Shown as an Undo button when given. */
  onUndo?: () => void;
  undoing?: boolean;
}

/** A short note above the tab bar after a task is acted on; the screen that shows it hides it again. */
export function Toast({ kind, message, onUndo, undoing = false }: Props) {
  const Icon = ICONS[kind];
  return (
    <div className={`toast ${kind}`} role="status">
      <Icon size={20} aria-hidden />
      <span className="grow toast-text">{message}</span>
      {onUndo && (
        <button type="button" className="link small" onClick={onUndo} disabled={undoing}>
          {t.today.undo}
        </button>
      )}
    </div>
  );
}
