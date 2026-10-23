import { t } from "../../i18n";
import type { SpeciesProfile, ToxicityLevel } from "../../types";

const PILL: Record<ToxicityLevel, string> = { none: "ok", mild: "accent", moderate: "warn", severe: "danger" };
const SUBJECTS = ["humans", "chickens", "goats", "dogs_cats"] as const;

/** Four pills (humans, chickens, goats, dogs and cats) coloured by level, plus the note. */
export function ToxicityBadges({ toxicity }: { toxicity: SpeciesProfile["toxicity"] }) {
  return (
    <div>
      <div>
        {SUBJECTS.map((subject) => (
          <span key={subject} className={`pill ${PILL[toxicity[subject]]}`}>
            {t.species.fields[subject]}: {t.enums.toxicity[toxicity[subject]]}
          </span>
        ))}
      </div>
      {toxicity.note && (
        <p className="small muted" style={{ marginTop: 6 }}>
          {toxicity.note}
        </p>
      )}
    </div>
  );
}
