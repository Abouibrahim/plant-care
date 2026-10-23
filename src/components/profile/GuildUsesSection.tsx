import { t } from "../../i18n";
import type { SpeciesProfile } from "../../types";
import { ToxicityBadges } from "./ToxicityBadges";

function Items({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="muted">{t.common.none}</span>;
  return (
    <ul className="list-plain">
      {items.map((item, i) => (
        <li key={`${item}:${i}`}>{item}</li>
      ))}
    </ul>
  );
}

/** Companions (good, bad, root warnings), uses and the toxicity badges. */
export function GuildUsesSection({ species }: { species: SpeciesProfile }) {
  const { companions, uses, toxicity } = species;
  return (
    <div>
      <section className="section">
        <h2>{t.species.sections.companions}</h2>
        <dl className="kv">
          <dt>{t.species.fields.good}</dt>
          <dd>
            <Items items={companions.good} />
          </dd>
          <dt>{t.species.fields.bad}</dt>
          <dd>
            <Items items={companions.bad} />
          </dd>
          <dt>{t.species.fields.root_warnings}</dt>
          <dd>
            <Items items={companions.root_warnings} />
          </dd>
        </dl>
      </section>

      <section className="section">
        <h2>{t.species.sections.uses}</h2>
        <dl className="kv">
          <dt>{t.species.fields.edible_parts}</dt>
          <dd>{uses.edible_parts || t.common.none}</dd>
          <dt>{t.species.fields.preparation}</dt>
          <dd>{uses.preparation || t.common.none}</dd>
          <dt>{t.species.fields.storage}</dt>
          <dd>{uses.storage || t.common.none}</dd>
          <dt>{t.species.fields.harvest_cues}</dt>
          <dd>{uses.harvest_cues || t.common.none}</dd>
        </dl>
      </section>

      <section className="section">
        <h2>{t.species.sections.toxicity}</h2>
        <ToxicityBadges toxicity={toxicity} />
      </section>
    </div>
  );
}
