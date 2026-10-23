import { t } from "../../i18n";
import type { Pest, SpeciesProfile } from "../../types";
import { MonthGrid } from "./MonthGrid";

function firstMonth(pest: Pest): number {
  return pest.months.length > 0 ? Math.min(...pest.months) : 13;
}

/** Pests sorted by their first month, each with symptoms, organic treatment and prevention. */
export function HealthSection({ species }: { species: SpeciesProfile }) {
  const pests = [...(species.pests ?? [])].sort((a, b) => firstMonth(a) - firstMonth(b));
  return (
    <section className="section">
      <h2>{t.species.sections.pests}</h2>
      {pests.length === 0 && <p className="muted">{t.common.none}</p>}
      {pests.map((pest, i) => (
        <div key={`${pest.name_en}:${i}`} className="card">
          <h3 style={{ marginBottom: 0 }}>{pest.name_en}</h3>
          {pest.name_fr && <div className="muted small">{pest.name_fr}</div>}
          <MonthGrid months={pest.months} />
          <dl className="kv">
            <dt>{t.species.fields.symptoms}</dt>
            <dd>{pest.symptoms}</dd>
            <dt>{t.species.fields.organic_treatment}</dt>
            <dd>{pest.organic_treatment}</dd>
            <dt>{t.species.fields.prevention}</dt>
            <dd>{pest.prevention}</dd>
          </dl>
        </div>
      ))}
    </section>
  );
}
