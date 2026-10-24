import { t } from "../../i18n";
import { ageInMonths, localIsoDate, ruleApplies } from "../../lib/dates";
import { TASK_TYPES, type CareRule, type SpeciesProfile } from "../../types";
import { MonthGrid } from "./MonthGrid";

/** First listed month, 13 when the rule names none, so unscheduled rules sort last. */
function firstMonth(rule: CareRule): number {
  return rule.months.length > 0 ? Math.min(...rule.months) : 13;
}

function RuleCard({ rule, applies }: { rule: CareRule; applies: boolean }) {
  return (
    <div className="card" style={applies ? undefined : { opacity: 0.5 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <strong className="grow">{rule.title}</strong>
        <span className="pill accent">{t.enums.task_type[rule.type]}</span>
      </div>
      <MonthGrid months={rule.months} />
      <div>
        <span className="pill">{t.enums.age[rule.age]}</span>
        {rule.type === "water" && rule.every_days > 0 && <span className="pill accent">{t.species.everyDays(rule.every_days)}</span>}
        {rule.type === "water" && rule.litres > 0 && <span className="pill accent">{t.species.litres(rule.litres)}</span>}
        {rule.lead_days > 0 && (
          <span className="pill">
            {t.species.fields.lead_days} {t.species.leadDays(rule.lead_days)}
          </span>
        )}
      </div>
      {rule.instruction && (
        <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
          {rule.instruction}
        </p>
      )}
      {!applies && (
        <p className="muted small italic" style={{ marginTop: 6, marginBottom: 0 }}>
          {t.species.ruleNotForAge}
        </p>
      )}
    </div>
  );
}

/**
 * Care rules listed by month (first month, then task type), each with its month grid and pills.
 * With plantedOn (null = mature) the rules that do not apply at the plant's age are dimmed.
 */
export function CalendarSection({ species, plantedOn }: { species: SpeciesProfile; plantedOn?: string | null }) {
  const rules = species.care_calendar ?? [];
  const age = plantedOn === undefined ? undefined : ageInMonths(plantedOn, localIsoDate());
  const ordered = [...rules].sort((a, b) => firstMonth(a) - firstMonth(b) || TASK_TYPES.indexOf(a.type) - TASK_TYPES.indexOf(b.type));

  return (
    <section className="section">
      <h2>{t.species.sections.calendar}</h2>
      {ordered.length === 0 && <p className="muted">{t.species.calendarEmpty}</p>}
      {ordered.map((rule, i) => (
        <RuleCard
          key={`${rule.type}:${rule.age}:${rule.months.join("-")}:${i}`}
          rule={rule}
          applies={age === undefined || ruleApplies(rule, age)}
        />
      ))}
    </section>
  );
}
