import { t } from "../../i18n";

/** Twelve small cells, Jan..Dec, highlighted where the month (1..12) is listed. */
export function MonthGrid({ months }: { months: number[] }) {
  const on = new Set(months);
  const names = t.enums.months.filter((_, i) => on.has(i + 1)).join(", ");
  return (
    <div className="month-grid" role="img" aria-label={`${t.common.months}: ${names || t.common.none}`}>
      {t.enums.monthsShort.map((label, i) => (
        <span key={label} className={on.has(i + 1) ? "on" : ""}>
          {label}
        </span>
      ))}
    </div>
  );
}
