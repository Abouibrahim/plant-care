// The result of a planting check: the verdict and its summary first, then the eight factors, where
// and when to plant, what to buy, the first year's care and the better-suited alternatives.
import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";
import { t } from "../../i18n";
import { STATUS_PILL, VERDICT_PILL } from "../../lib/check";
import type { PlantingCheck, Site, Usage, Verdict } from "../../types";

const VERDICT_ICON: Record<Verdict, typeof CircleCheck> = { plant: CircleCheck, plant_with_care: TriangleAlert, avoid: OctagonX };

interface Props {
  check: PlantingCheck & Usage;
  /** The site and zone asked about; site null when none was chosen. */
  site: Site | null;
  zone: string;
  note: string;
  checkedAt: string;
  /** Opens a check of an alternative; omitted, the alternatives have no button. */
  onAlternative?: (alternative: { name: string; scientific_name: string }) => void;
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="answer-text" style={{ margin: 0 }}>
        {text}
      </p>
    </section>
  );
}

export function VerdictCard({ check, site, zone, note, checkedAt, onAlternative }: Props) {
  const Icon = VERDICT_ICON[check.verdict];
  const where = site ? `${t.site[site]}${zone ? ` · ${zone}` : ""}` : t.check.bothSites;
  return (
    <div>
      <div className="card">
        <div className="row between wrap" style={{ alignItems: "center", gap: 8 }}>
          <span className={`${VERDICT_PILL[check.verdict]} verdict-pill`}>
            <Icon size={18} aria-hidden />
            {t.check.verdicts[check.verdict]}
          </span>
          <span className="small muted">{t.check.bestSite[check.best_site]}</span>
        </div>
        {check.summary && <p style={{ fontWeight: 600, margin: "10px 0 6px" }}>{check.summary}</p>}
        <p className="small muted" style={{ margin: 0 }}>
          {where} · {t.check.checkedOn(new Date(checkedAt).toLocaleDateString())}
          {note && <> · “{note}”</>}
        </p>
      </div>

      {check.factors.length > 0 && (
        <section className="card">
          <h3>{t.check.factorsTitle}</h3>
          {check.factors.map((f) => (
            <div key={f.factor} className="factor">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <strong className="grow">{t.check.factors[f.factor]}</strong>
                <span className={STATUS_PILL[f.status]} style={{ flexShrink: 0 }}>
                  {t.check.statuses[f.status]}
                </span>
              </div>
              {f.note && (
                <p className="small" style={{ margin: "4px 0 0" }}>
                  {f.note}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <Section title={t.check.placement} text={check.placement} />
      <Section title={t.check.plantingTime} text={check.planting_time} />
      <Section title={t.check.buyingTips} text={check.buying_tips} />
      <Section title={t.check.firstYear} text={check.first_year} />

      {check.alternatives.length > 0 && (
        <section className="card">
          <h3>{t.check.alternatives}</h3>
          {check.alternatives.map((a) => (
            <div key={a.name} className="factor">
              <strong>{a.name}</strong>
              {a.scientific_name && <span className="italic muted small"> {a.scientific_name}</span>}
              {a.why && (
                <p className="small" style={{ margin: "4px 0 0" }}>
                  {a.why}
                </p>
              )}
              {onAlternative && (
                <button type="button" className="small" style={{ marginTop: 8 }} onClick={() => onAlternative(a)}>
                  {t.check.checkThisOne}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <p className="small muted">{t.capture.usage(check.input_tokens, check.output_tokens)}</p>
    </div>
  );
}
