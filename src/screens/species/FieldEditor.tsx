// Inline editor for one edit target of the species profile.
// Each changed top-level key is saved with updateSpeciesField, which also records it in user_edits.
import { useState, type FormEvent } from "react";
import { Banner } from "../../components/Banner";
import { t } from "../../i18n";
import { updateSpeciesField } from "../../lib/db";
import type { Species, SpeciesProfile } from "../../types";
import {
  fieldId,
  fromRaw,
  readField,
  targetKeys,
  toRaw,
  type EditTarget,
  type FieldDef,
  type ProfileKey,
  type RawValue,
} from "./fields";

interface Props {
  species: Species;
  target: EditTarget;
  onSaved(next: Species): void;
  onCancel(): void;
}

type Draft = Record<string, RawValue>;

function initialDraft(species: Species, target: EditTarget): Draft {
  const draft: Draft = {};
  for (const f of target.fields) draft[fieldId(f)] = toRaw(f, readField(species, f));
  return draft;
}

/** The new value of one top-level key once the draft is applied, or undefined when nothing changed. */
function nextValue(species: Species, target: EditTarget, key: ProfileKey, draft: Draft): unknown {
  const fields = target.fields.filter((f) => f.key === key);
  const original: unknown = species[key];
  let value: unknown;
  if (fields.length === 1 && !fields[0].sub) {
    value = fromRaw(fields[0], draft[fieldId(fields[0])]);
  } else {
    const obj: Record<string, unknown> = { ...(original as Record<string, unknown>) };
    for (const f of fields) if (f.sub) obj[f.sub] = fromRaw(f, draft[fieldId(f)]);
    value = obj;
  }
  return JSON.stringify(value) === JSON.stringify(original) ? undefined : value;
}

function isComplete(target: EditTarget, draft: Draft): boolean {
  return target.fields.every((f) => !f.required || String(draft[fieldId(f)] ?? "").trim().length > 0);
}

function FieldControl({
  def,
  value,
  disabled,
  onChange,
}: {
  def: FieldDef;
  value: RawValue;
  disabled: boolean;
  onChange(next: RawValue): void;
}) {
  if (def.kind === "boolean") {
    return (
      <label className="row" style={{ minHeight: "var(--tap)", gap: 10 }}>
        <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>{def.label}</span>
      </label>
    );
  }

  const text = typeof value === "string" ? value : "";
  let control;
  if (def.kind === "enum") {
    const options = Object.keys(def.labels);
    if (text && !options.includes(text)) options.unshift(text);
    control = (
      <select value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {def.labels[o] ?? o}
          </option>
        ))}
      </select>
    );
  } else if (def.kind === "textarea" || def.kind === "list") {
    control = (
      <textarea
        value={text}
        disabled={disabled}
        rows={def.kind === "list" ? 4 : 3}
        onChange={(e) => onChange(e.target.value)}
        dir={def.rtl ? "rtl" : undefined}
      />
    );
  } else {
    control = (
      <input
        value={text}
        disabled={disabled}
        autoComplete="off"
        className={def.rtl ? "arabic" : undefined}
        dir={def.rtl ? "rtl" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <label className="field">
      <span>{def.label}</span>
      {control}
      {def.kind === "list" && <span className="small muted">{t.species.listSeparator}</span>}
    </label>
  );
}

export function FieldEditor({ species, target, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(species, target));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = isComplete(target, draft);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !complete) return;
    setSaving(true);
    setError(null);
    try {
      let current = species;
      for (const key of targetKeys(target)) {
        const value = nextValue(current, target, key, draft);
        if (value === undefined) continue;
        current = await updateSpeciesField(current, key, value as SpeciesProfile[typeof key]);
      }
      onSaved(current);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.errors.generic);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" aria-label={`${t.species.editing}: ${target.label}`}>
      <h3 style={{ margin: 0 }}>
        {t.species.editing}: {target.label}
      </h3>
      {target.fields.map((f) => {
        const id = fieldId(f);
        return (
          <FieldControl
            key={id}
            def={f}
            value={draft[id]}
            disabled={saving}
            onChange={(next) => setDraft((prev) => ({ ...prev, [id]: next }))}
          />
        );
      })}
      {error && <Banner kind="error">{error}</Banner>}
      <div className="row">
        <button type="submit" className="primary grow" disabled={saving || !complete}>
          {saving ? t.common.saving : t.common.save}
        </button>
        <button type="button" className="grow" onClick={onCancel} disabled={saving}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
