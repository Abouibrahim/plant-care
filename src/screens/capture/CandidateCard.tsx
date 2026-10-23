import { ConfidenceBar } from "../../components/ConfidenceBar";
import { t } from "../../i18n";
import type { Candidate } from "../../types";

interface Props {
  candidate: Candidate;
  /** The top candidate: highlighted card and a primary Confirm button. */
  primary: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}

export function CandidateCard({ candidate: c, primary, disabled = false, onConfirm }: Props) {
  const names = c.common_names;
  return (
    <div className={primary ? "card selected" : "card"}>
      <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{names.en || c.scientific_name}</div>
      <div>
        <span className="italic">{c.scientific_name}</span>
        {c.cultivar && (
          <span className="muted small">
            {" "}
            · {t.capture.cultivar} ‘{c.cultivar}’
          </span>
        )}
      </div>
      {(names.fr || names.ar) && (
        <div className="row between wrap small" style={{ marginTop: 4 }}>
          <span>{names.fr}</span>
          <span>
            <span className="arabic">{names.ar}</span>
            {names.ar_latin && <span className="muted"> {names.ar_latin}</span>}
          </span>
        </div>
      )}
      <div style={{ margin: "8px 0" }}>
        <ConfidenceBar value={c.confidence} />
      </div>
      {c.evidence && <p className="muted small">{c.evidence}</p>}
      <button type="button" className={primary ? "primary block" : "block"} disabled={disabled} onClick={onConfirm}>
        {t.capture.confirmThis}
      </button>
    </div>
  );
}
