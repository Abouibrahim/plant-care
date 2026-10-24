import type { ReactNode } from "react";
import { t } from "../../i18n";
import { ageInMonths, localIsoDate, ruleApplies } from "../../lib/dates";
import type { CareRule, SpeciesProfile } from "../../types";
import { TypePill } from "../TypeIcon";
import { MonthGrid } from "./MonthGrid";
import { orderRules } from "./order";

/** One care rule: title and type, month grid, age and watering pills, instruction. `actions` sits under the pills. */
export function RuleCard({ rule, applies = true, actions }: { rule: CareRule; applies?: boolean; actions?: ReactNode }) {
  return (
    <div className="card" style={applies ? undefined : { opacity: 0.5 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <strong className="grow">{rule.title}</strong>
        <TypePill type={rule.type} />
      </div>
      <MonthGrid months={rule.months} />
      <div>
        <span className="pill">{t.enums.age[rule.age]}</span>
        {rule.type === "water" && rule.every_days > 0 && <span className="pill type-pill t-water">{t.species.everyDays(rule.every_days)}</span>}
        {rule.type === "water" && rule.litres > 0 && <span className="pill type-pill t-water">{t.species.litres(rule.litres)}</span>}
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
      {actions && <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>{actions}</div>}
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

  return (
    <section className="section">
      <h2>{t.species.sections.calendar}</h2>
      {rules.length === 0 && <p className="muted">{t.species.calendarEmpty}</p>}
      {orderRules(rules).map((i) => (
        <RuleCard key={i} rule={rules[i]} applies={age === undefined || ruleApplies(rules[i], age)} />
      ))}
    </section>
  );
}
