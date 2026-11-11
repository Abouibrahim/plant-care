import { t } from "../../i18n";
import type { SpeciesProfile } from "../../types";
import { DerjaText } from "../derja";

const SITE_FIT_PILL: Record<SpeciesProfile["site_fit"]["rating"], string> = { good: "ok", acceptable: "warn", poor: "danger" };

/** Site fit, water, sun and heat, salinity and the climate note. */
export function NeedsSection({ species }: { species: SpeciesProfile }) {
  const { site_fit, water, sun, salinity_tolerance, climate_note } = species;
  return (
    <div>
      <section className="section">
        <h2>{t.species.sections.siteFit}</h2>
        <span className={`pill ${SITE_FIT_PILL[site_fit.rating]}`}>{t.enums.site_fit[site_fit.rating]}</span>
        {site_fit.note && <p style={{ marginTop: 6 }}><DerjaText text={site_fit.note} /></p>}
      </section>

      <section className="section">
        <h2>{t.species.sections.water}</h2>
        <dl className="kv">
          <dt>{t.species.fields.need}</dt>
          <dd>
            <span className="pill">{t.enums.level[water.need]}</span>
          </dd>
          <dt>{t.species.fields.drought_tolerance}</dt>
          <dd>
            <span className="pill">{t.enums.level[water.drought_tolerance]}</span>
          </dd>
          <dt>{t.species.fields.summary}</dt>
          <dd><DerjaText text={water.summary} /></dd>
          <dt>{t.species.fields.stress_signs}</dt>
          <dd><DerjaText text={water.stress_signs} /></dd>
          <dt>{t.species.fields.overwatering_signs}</dt>
          <dd><DerjaText text={water.overwatering_signs} /></dd>
        </dl>
      </section>

      <section className="section">
        <h2>{t.species.sections.sun}</h2>
        <dl className="kv">
          <dt>{t.species.fields.exposure}</dt>
          <dd>
            <span className="pill">{t.enums.exposure[sun.exposure]}</span>
          </dd>
          <dt>{t.species.fields.heat_tolerance}</dt>
          <dd>
            <span className="pill">{t.enums.level[sun.heat_tolerance]}</span>
          </dd>
          <dt>{t.species.fields.summer_shade_needed}</dt>
          <dd>{sun.summer_shade_needed ? t.common.yes : t.common.no}</dd>
          <dt>{t.species.fields.note}</dt>
          <dd><DerjaText text={sun.note} /></dd>
        </dl>
      </section>

      <section className="section">
        <h2>{t.species.sections.salinity}</h2>
        <span className="pill">{t.enums.salinity[salinity_tolerance.level]}</span>
        {salinity_tolerance.note && <p style={{ marginTop: 6 }}><DerjaText text={salinity_tolerance.note} /></p>}
      </section>

      <section className="section">
        <h2>{t.species.sections.climate}</h2>
        <p><DerjaText text={climate_note} /></p>
      </section>
    </div>
  );
}
