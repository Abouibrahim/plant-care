// Form for one pest or disease of a species profile: new (pest null) or existing. The caller
// persists the whole pests list; this form only validates and hands back the entry.
import { useState, type FormEvent } from "react";
import { Banner } from "../../components/Banner";
import { t } from "../../i18n";
import type { Pest } from "../../types";
import { MonthPicker } from "./MonthPicker";

function toDraft(pest: Pest | null): Pest {
  return pest
    ? { ...pest, months: [...pest.months] }
    : { name_en: "", name_fr: "", months: [], symptoms: "", organic_treatment: "", prevention: "" };
}

interface Props {
  pest: Pest | null;
  saving: boolean;
  error: string | null;
  onSave(next: Pest): void;
  onDelete?: () => void;
  onCancel(): void;
}

export function PestEditor({ pest, saving, error, onSave, onDelete, onCancel }: Props) {
  const [draft, setDraft] = useState<Pest>(() => toDraft(pest));
  const [problem, setProblem] = useState<string | null>(null);
  const F = t.species.fields;

  function set<K extends keyof Pest>(key: K, value: Pest[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name_en = draft.name_en.trim();
    if (!name_en) return setProblem(t.species.nameRequired);
    setProblem(null);
    onSave({
      name_en,
      name_fr: draft.name_fr.trim(),
      months: [...draft.months].sort((a, b) => a - b),
      symptoms: draft.symptoms.trim(),
      organic_treatment: draft.organic_treatment.trim(),
      prevention: draft.prevention.trim(),
    });
  }

  const heading = pest ? t.species.editPest : t.species.newPest;

  return (
    <form onSubmit={submit} className="stack" aria-label={heading}>
      <h3 style={{ margin: 0 }}>{heading}</h3>

      <div className="field-row">
        <label className="field">
          <span>{F.name_en}</span>
          <input value={draft.name_en} disabled={saving} autoComplete="off" onChange={(e) => set("name_en", e.target.value)} />
        </label>
        <label className="field">
          <span>{F.name_fr}</span>
          <input value={draft.name_fr} disabled={saving} autoComplete="off" lang="fr" onChange={(e) => set("name_fr", e.target.value)} />
        </label>
      </div>

      <MonthPicker label={t.common.months} value={draft.months} onChange={(months) => set("months", months)} disabled={saving} />

      <label className="field">
        <span>{F.symptoms}</span>
        <textarea rows={3} value={draft.symptoms} disabled={saving} onChange={(e) => set("symptoms", e.target.value)} />
      </label>
      <label className="field">
        <span>{F.organic_treatment}</span>
        <textarea rows={3} value={draft.organic_treatment} disabled={saving} onChange={(e) => set("organic_treatment", e.target.value)} />
      </label>
      <label className="field">
        <span>{F.prevention}</span>
        <textarea rows={3} value={draft.prevention} disabled={saving} onChange={(e) => set("prevention", e.target.value)} />
      </label>

      {(problem || error) && <Banner kind="error">{problem ?? error}</Banner>}

      <div className="row">
        <button type="submit" className="primary grow" disabled={saving}>
          {saving ? t.common.saving : t.common.save}
        </button>
        <button type="button" className="grow" onClick={onCancel} disabled={saving}>
          {t.common.cancel}
        </button>
      </div>
      {onDelete && (
        <button type="button" className="danger block" disabled={saving} onClick={onDelete}>
          {t.species.deletePest}
        </button>
      )}
    </form>
  );
}
