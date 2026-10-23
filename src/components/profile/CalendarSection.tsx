import { t } from "../../i18n";
import type { CareRule, SpeciesProfile, TaskType } from "../../types";
import { MonthGrid } from "./MonthGrid";

const ORDER: TaskType[] = ["water", "prune", "feed", "mulch", "harvest", "scout", "propagate", "protect"];
/** Below this age a plant is in establishment; from it on it is mature. */
const ESTABLISHMENT_MONTHS = 24;

/** Whole months between a YYYY-MM-DD planting date and today; null when unknown or unreadable. */
function ageInMonths(plantedOn: string | null, today: Date): number | null {
  if (!plantedOn) return null;
  const [y, m, d] = plantedOn.split("-").map(Number);
  if (!y || !m || !d) return null;
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  return Math.max(0, months);
}

function ruleApplies(rule: CareRule, ageMonths: number | null): boolean {
  if (rule.age === "any") return true;
  const stage = ageMonths !== null && ageMonths < ESTABLISHMENT_MONTHS ? "establishment" : "mature";
  return rule.age === stage;
}

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
  const age = plantedOn === undefined ? undefined : ageInMonths(plantedOn, new Date());
  const ordered = [...rules].sort((a, b) => firstMonth(a) - firstMonth(b) || ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

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
      <p className="muted small">{t.plant.tasksLater}</p>
    </section>
  );
}
