import type { ReactNode } from "react";
import { t } from "../../i18n";
import type { Pest, SpeciesProfile } from "../../types";
import { MonthGrid } from "./MonthGrid";
import { orderPests } from "./order";

/** One pest or disease: names, month grid, symptoms, treatment and prevention. `actions` sits at the bottom. */
export function PestCard({ pest, actions }: { pest: Pest; actions?: ReactNode }) {
  return (
    <div className="card">
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
      {actions && <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>{actions}</div>}
    </div>
  );
}

/** Pests sorted by their first month, each with symptoms, organic treatment and prevention. */
export function HealthSection({ species }: { species: SpeciesProfile }) {
  const pests = species.pests ?? [];
  return (
    <section className="section">
      <h2>{t.species.sections.pests}</h2>
      {pests.length === 0 && <p className="muted">{t.common.none}</p>}
      {orderPests(pests).map((i) => (
        <PestCard key={i} pest={pests[i]} />
      ))}
    </section>
  );
}
