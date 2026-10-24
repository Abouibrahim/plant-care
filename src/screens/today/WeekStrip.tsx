// Seven days from today: the weekday, the date, the icon of the day's main task type and the count.
// Overdue tasks count on today. Tapping a day filters the list to it; tapping it again clears.
import { Leaf } from "lucide-react";
import { t } from "../../i18n";
import { toLocalDate } from "../../lib/dates";
import { TASK_ICONS } from "../../lib/icons";
import type { TaskType } from "../../types";

export interface WeekDay {
  /** YYYY-MM-DD */
  iso: string;
  count: number;
  /** The most frequent task type that day, null when nothing is due. */
  main: TaskType | null;
  overdue: boolean;
}

interface Props {
  days: WeekDay[];
  today: string;
  selected: string | null;
  onSelect: (iso: string | null) => void;
}

export function WeekStrip({ days, today, selected, onSelect }: Props) {
  return (
    <section className="card week">
      <div className="row between">
        <h2>{t.today.week}</h2>
        {selected !== null && (
          <button type="button" className="link small" onClick={() => onSelect(null)}>
            {t.today.showWeek}
          </button>
        )}
      </div>
      <div className="week-days" role="group" aria-label={t.today.week}>
        {days.map((day) => {
          const date = toLocalDate(day.iso);
          const weekday = date?.toLocaleDateString(undefined, { weekday: "short" }) ?? "";
          const Icon = day.main ? TASK_ICONS[day.main] : Leaf;
          const isSelected = selected === day.iso;
          return (
            <button
              type="button"
              key={day.iso}
              className={`week-day ${day.iso === today ? "today" : ""} ${isSelected ? "selected" : ""} ${day.count === 0 ? "free" : ""}`}
              aria-pressed={isSelected}
              aria-label={`${date?.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) ?? day.iso}: ${t.today.dayTasks(day.count)}`}
              onClick={() => onSelect(isSelected ? null : day.iso)}
            >
              <span className="dow">{weekday.replace(".", "")}</span>
              <span className="dnum">{date?.getDate() ?? ""}</span>
              <span className={`day-icon ${day.main ? `t-${day.main}` : ""}`}>
                <Icon size={18} strokeWidth={2} aria-hidden />
              </span>
              <span className="day-count">{day.count > 0 ? day.count : "·"}</span>
              {day.overdue && <span className="day-dot" aria-hidden />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
