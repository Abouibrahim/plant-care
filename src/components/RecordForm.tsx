import { useEffect, useId, useState, type FormEvent } from "react";
import { t } from "../i18n";
import { SiteLabel } from "./TypeIcon";
import { emptyZones, loadZones, recentZones } from "../lib/db";
import { PLANT_SOURCES, SITES, type PlantInsert, type PlantSource, type Site, type ZoneLists } from "../types";

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
  // The quantity is typed as text so the field can be emptied before a new number is entered.
  const [quantityText, setQuantityText] = useState(String(initial.quantity));
  const [zones, setZones] = useState<string[]>([]);
  const [zoneLists, setZoneLists] = useState<ZoneLists>(emptyZones);
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

  // The zone lists kept in Settings, read once; without the settings table (SQL not run yet) there are none.
  useEffect(() => {
    let active = true;
    loadZones()
      .then((lists) => active && setZoneLists(lists))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
    // The field may be empty when the keyboard's Go key submits before a blur: read what is typed.
    const typed = parseInt(quantityText, 10);
    const quantity = typed >= 1 ? typed : 1;
    setQuantityText(String(quantity));
    await onSubmit({ ...values, quantity, tag: values.tag.trim(), zone: values.zone.trim(), rootstock: values.rootstock.trim() });
  }

  // The site's listed zones come first, as chips and in the suggestion list; the recent values from plants follow.
  const listed = zoneLists[values.site];
  const suggestions = [...listed, ...zones.filter((z) => !listed.some((l) => l.toLowerCase() === z.toLowerCase()))];

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
            value={quantityText}
            onChange={(e) => {
              setQuantityText(e.target.value);
              const n = parseInt(e.target.value, 10);
              if (n >= 1) update({ quantity: n });
            }}
            onBlur={() => {
              const n = parseInt(quantityText, 10);
              const quantity = n >= 1 ? n : 1;
              setQuantityText(String(quantity));
              update({ quantity });
            }}
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
              <SiteLabel site={s} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
          {t.record.zone}
        </span>
        {listed.length > 0 && (
          <div className="chips" role="group" aria-label={t.record.zoneList} style={{ marginBottom: 8 }}>
            {listed.map((z) => {
              const chosen = values.zone.trim().toLowerCase() === z.toLowerCase();
              return (
                <button type="button" key={z} className={`chip ${chosen ? "active" : ""}`} aria-pressed={chosen} onClick={() => update({ zone: z })}>
                  {z}
                </button>
              );
            })}
          </div>
        )}
        <input
          value={values.zone}
          list={zoneListId}
          aria-label={t.record.zone}
          onChange={(e) => update({ zone: e.target.value })}
          placeholder={t.record.zonePlaceholder}
          autoComplete="off"
        />
        <datalist id={zoneListId}>
          {suggestions.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </div>

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
