// Form for one care rule of a species profile: new (rule null) or existing. The caller persists the
// whole care_calendar; this form only validates and hands back the rule.
import { useState, type FormEvent } from "react";
import { Banner } from "../../components/Banner";
import { t } from "../../i18n";
import { TASK_TYPES, type CareRule, type TaskType } from "../../types";
import { MonthPicker } from "./MonthPicker";

const AGES: CareRule["age"][] = ["establishment", "mature", "any"];

/** Numbers are kept as text while typing so a field can be emptied before a new value is entered. */
interface Draft {
  type: TaskType;
  months: number[];
  every_days: string;
  litres: string;
  age: CareRule["age"];
  lead_days: string;
  title: string;
  instruction: string;
}

function toDraft(rule: CareRule | null): Draft {
  if (!rule) return { type: "water", months: [], every_days: "", litres: "", age: "any", lead_days: "0", title: "", instruction: "" };
  return {
    type: rule.type,
    months: [...rule.months],
    every_days: rule.every_days > 0 ? String(rule.every_days) : "",
    litres: rule.litres > 0 ? String(rule.litres) : "",
    age: rule.age,
    lead_days: String(rule.lead_days),
    title: rule.title,
    instruction: rule.instruction,
  };
}

/** A whole number of days, 0 when blank or not a number. */
function days(text: string): number {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Litres may be fractional; a comma works as the decimal mark. */
function litres(text: string): number {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
}

/** What the expansion keys tasks on (rule_key without the sorting): two rules alike here would share their tasks. */
function sameKey(a: Pick<CareRule, "type" | "months" | "age">, b: Pick<CareRule, "type" | "months" | "age">): boolean {
  const months = (m: number[]) => [...m].sort((x, y) => x - y).join("-");
  return a.type === b.type && a.age === b.age && months(a.months) === months(b.months);
}

interface Props {
  rule: CareRule | null;
  /** The other rules of the calendar, for the duplicate check. */
  siblings: CareRule[];
  saving: boolean;
  error: string | null;
  onSave(next: CareRule): void;
  onDelete?: () => void;
  onCancel(): void;
}

export function RuleEditor({ rule, siblings, saving, error, onSave, onDelete, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(rule));
  const [problem, setProblem] = useState<string | null>(null);
  const water = draft.type === "water";
  const F = t.species.fields;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const title = draft.title.trim();
    const every = water ? days(draft.every_days) : 0;
    if (!title) return setProblem(t.species.titleRequired);
    if (draft.months.length === 0) return setProblem(t.species.monthsRequired);
    if (water && every === 0) return setProblem(t.species.everyDaysRequired);
    // A sibling that already shared the rule's own key (a pair Claude wrote before duplicates were folded) does not block: this edit is how the pair gets separated.
    if (siblings.some((other) => sameKey(other, draft) && !(rule && sameKey(other, rule)))) return setProblem(t.species.duplicateRule);
    setProblem(null);
    onSave({
      type: draft.type,
      months: [...draft.months].sort((a, b) => a - b),
      every_days: every,
      litres: water ? litres(draft.litres) : 0,
      age: draft.age,
      lead_days: days(draft.lead_days),
      title,
      instruction: draft.instruction.trim(),
    });
  }

  const heading = rule ? t.species.editRule : t.species.newRule;

  return (
    <form onSubmit={submit} className="stack" aria-label={heading}>
      <h3 style={{ margin: 0 }}>{heading}</h3>

      <div className="field-row">
        <label className="field">
          <span>{F.type}</span>
          <select value={draft.type} disabled={saving} onChange={(e) => set("type", e.target.value as TaskType)}>
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.enums.task_type[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{F.age}</span>
          <select value={draft.age} disabled={saving} onChange={(e) => set("age", e.target.value as CareRule["age"])}>
            {AGES.map((age) => (
              <option key={age} value={age}>
                {t.enums.age[age]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <MonthPicker label={t.common.months} value={draft.months} onChange={(months) => set("months", months)} disabled={saving} />

      {water && (
        <div className="field-row">
          <label className="field">
            <span>{t.species.ruleForm.everyDays}</span>
            <input type="number" inputMode="numeric" min={1} value={draft.every_days} disabled={saving} onChange={(e) => set("every_days", e.target.value)} />
          </label>
          <label className="field">
            <span>{t.species.ruleForm.litres}</span>
            <input type="number" inputMode="decimal" min={0} step="any" value={draft.litres} disabled={saving} onChange={(e) => set("litres", e.target.value)} />
          </label>
        </div>
      )}

      <label className="field">
        <span>{t.species.ruleForm.leadDays}</span>
        <input type="number" inputMode="numeric" min={0} value={draft.lead_days} disabled={saving} onChange={(e) => set("lead_days", e.target.value)} />
      </label>

      <label className="field">
        <span>{F.title}</span>
        <input value={draft.title} disabled={saving} autoComplete="off" onChange={(e) => set("title", e.target.value)} />
      </label>

      <label className="field">
        <span>{F.instruction}</span>
        <textarea rows={3} value={draft.instruction} disabled={saving} onChange={(e) => set("instruction", e.target.value)} />
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
          {t.species.deleteRule}
        </button>
      )}
    </form>
  );
}
