import { useEffect, useId, useState, type FormEvent } from "react";
import { t } from "../i18n";
import { recentZones } from "../lib/db";
import { PLANT_SOURCES, SITES, type PlantInsert, type PlantSource, type Site } from "../types";

/** The user-editable part of a plant row; species_id is attached by the caller. */
export type RecordValues = Omit<PlantInsert, "species_id">;

// eslint-disable-next-line react-refresh/only-export-components -- a tiny helper that belongs with the form
export function emptyRecord(site: Site = "farm"): RecordValues {
  return { tag: "", quantity: 1, site, zone: "", lat: null, lng: null, planted_on: null, source: "existing", rootstock: "" };
}

interface Props {
  initial: RecordValues;
  onChange?: (values: RecordValues) => void;
  onSubmit: (values: RecordValues) => void | Promise<void>;
  submitLabel: string;
  submitting?: boolean;
  /** When false the submit button is disabled with no error (e.g. while the profile is still being written). */
  canSubmit?: boolean;
  /** Extra content rendered just above the submit button (status lines, errors). */
  children?: React.ReactNode;
}

export function RecordForm({ initial, onChange, onSubmit, submitLabel, submitting = false, canSubmit = true, children }: Props) {
  const [values, setValues] = useState<RecordValues>(initial);
  const [zones, setZones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const zoneListId = useId();

  useEffect(() => {
    let active = true;
    recentZones(values.site)
      .then((z) => active && setZones(z))
      .catch(() => active && setZones([]));
    return () => {
      active = false;
    };
  }, [values.site]);

  function update(patch: Partial<RecordValues>) {
    setValues((prev) => {
      const next = { ...prev, ...patch };
      onChange?.(next);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.tag.trim()) {
      setError(t.record.tagRequired);
      return;
    }
    setError(null);
    await onSubmit({ ...values, tag: values.tag.trim(), zone: values.zone.trim(), rootstock: values.rootstock.trim() });
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>{t.record.tag}</span>
        <input value={values.tag} onChange={(e) => update({ tag: e.target.value })} placeholder={t.record.tagPlaceholder} autoComplete="off" />
      </label>

      <div className="field-row">
        <label className="field">
          <span>{t.record.quantity}</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={values.quantity}
            onChange={(e) => update({ quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="field">
          <span>{t.record.plantedOn}</span>
          <input type="date" value={values.planted_on ?? ""} onChange={(e) => update({ planted_on: e.target.value || null })} />
        </label>
      </div>

      <div className="field">
        <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
          {t.record.site}
        </span>
        <div className="segmented" role="radiogroup" aria-label={t.record.site}>
          {SITES.map((s) => (
            <button
              type="button"
              key={s}
              role="radio"
              aria-checked={values.site === s}
              className={values.site === s ? "active" : ""}
              onClick={() => update({ site: s })}
            >
              {t.site[s]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>{t.record.zone}</span>
        <input value={values.zone} list={zoneListId} onChange={(e) => update({ zone: e.target.value })} placeholder={t.record.zonePlaceholder} autoComplete="off" />
        <datalist id={zoneListId}>
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>

      <div className="field-row">
        <label className="field">
          <span>{t.record.source}</span>
          <select value={values.source} onChange={(e) => update({ source: e.target.value as PlantSource })}>
            {PLANT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t.record.sources[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            {t.record.rootstock} ({t.common.optional})
          </span>
          <input value={values.rootstock} onChange={(e) => update({ rootstock: e.target.value })} autoComplete="off" />
        </label>
      </div>

      <div className="field row between">
        <span className="small muted">
          {t.record.gps}:{" "}
          {values.lat !== null && values.lng !== null ? `${values.lat.toFixed(5)}, ${values.lng.toFixed(5)}` : t.record.gpsNone}
        </span>
        {values.lat !== null && (
          <button type="button" className="link small" onClick={() => update({ lat: null, lng: null })}>
            {t.record.gpsClear}
          </button>
        )}
      </div>

      {children}
      {error && <div className="banner error">{error}</div>}

      <button type="submit" className="primary block big" disabled={submitting || !canSubmit}>
        {submitting ? t.record.saving : submitLabel}
      </button>
    </form>
  );
}
