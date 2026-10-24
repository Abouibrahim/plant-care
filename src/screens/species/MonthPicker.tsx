import { t } from "../../i18n";

interface Props {
  label: string;
  /** Selected months, 1..12. */
  value: number[];
  onChange(next: number[]): void;
  disabled?: boolean;
}

/** Twelve toggles, January to December, in two rows of six so each is a full tap target. */
export function MonthPicker({ label, value, onChange, disabled = false }: Props) {
  const on = new Set(value);

  function toggle(month: number) {
    const next = new Set(on);
    if (next.has(month)) next.delete(month);
    else next.add(month);
    onChange([...next].sort((a, b) => a - b));
  }

  return (
    <div className="field">
      <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <div className="month-picker" role="group" aria-label={label}>
        {t.enums.monthsShort.map((short, i) => {
          const month = i + 1;
          const active = on.has(month);
          return (
            <button
              type="button"
              key={month}
              className={active ? "on" : ""}
              aria-pressed={active}
              aria-label={t.enums.months[i]}
              disabled={disabled}
              onClick={() => toggle(month)}
            >
              {short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
