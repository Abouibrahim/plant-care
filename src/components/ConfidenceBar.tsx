import { t } from "../i18n";

export const LOW_CONFIDENCE = 0.6;

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="row" aria-label={`${t.capture.confidence} ${pct}%`}>
      <div className={`confidence grow ${value < LOW_CONFIDENCE ? "low" : ""}`}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted" style={{ minWidth: 40, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}
