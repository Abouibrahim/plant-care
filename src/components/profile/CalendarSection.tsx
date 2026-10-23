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

function RuleCard({ rule, applies }: { rule: CareRule; applies: boolean }) {
  return (
    <div className="card" style={applies ? undefined : { opacity: 0.5 }}>
      <strong>{rule.title}</strong>
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
 * Care rules grouped by task type, each with its month grid and pills.
 * With plantedOn (null = mature) the rules that do not apply at the plant's age are dimmed.
 */
export function CalendarSection({ species, plantedOn }: { species: SpeciesProfile; plantedOn?: string | null }) {
  const rules = species.care_calendar ?? [];
  const age = plantedOn === undefined ? undefined : ageInMonths(plantedOn, new Date());
  const groups = ORDER.map((type) => ({ type, rules: rules.filter((r) => r.type === type) })).filter((g) => g.rules.length > 0);

  return (
    <section className="section">
      <h2>{t.species.sections.calendar}</h2>
      {groups.length === 0 && <p className="muted">{t.species.calendarEmpty}</p>}
      {groups.map((group) => (
        <div key={group.type}>
          <h3>{t.enums.task_type[group.type]}</h3>
          {group.rules.map((rule, i) => (
            <RuleCard key={`${rule.age}:${rule.months.join("-")}:${i}`} rule={rule} applies={age === undefined || ruleApplies(rule, age)} />
          ))}
        </div>
      ))}
      <p className="muted small">{t.plant.tasksLater}</p>
    </section>
  );
}
