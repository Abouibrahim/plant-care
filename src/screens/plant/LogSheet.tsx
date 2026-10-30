// The manual care log (the review of 2026-10-30, 6.1): a full-screen sheet over the Plant screen
// where the grower records care done without a reminder (a feed, a pruning, a mulch), or sets a
// one-off reminder ("stake it on Friday"). Either is a task row keyed `manual:<uuid>`, so the
// journal lists it, Ask reads it as the last time that kind of task was done, and the expansion
// leaves it alone.
import { useEffect, useState, type FormEvent } from "react";
import { Bell, Check, X } from "lucide-react";
import { Banner } from "../../components/Banner";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import { addDays, localIsoDate } from "../../lib/dates";
import { insertManualTask } from "../../lib/db";
import { TASK_ICONS } from "../../lib/icons";
import { useBackClose } from "../../lib/useBackClose";
import { MANUAL_MAX_TITLE_CHARS, TASK_MAX_NOTE_CHARS, TASK_TYPES, type PlantWithSpecies, type Task, type TaskType } from "../../types";

type When = "done" | "remind";

interface Props {
  plant: PlantWithSpecies;
  /** After the row was written: the screen reloads its tasks and journal and shows the right tab. */
  onSaved: (task: Task) => void;
  onClose: () => void;
}

function describeError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

export function LogSheet({ plant, onSaved, onClose }: Props) {
  const [type, setType] = useState<TaskType | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState<When>("done");
  const today = localIsoDate();
  const [remindOn, setRemindOn] = useState(() => addDays(today, 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = t.log;

  useBackClose(onClose, saving);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const reminder = when === "remind";
  const ready = type !== null && title.trim() !== "" && (!reminder || /^\d{4}-\d{2}-\d{2}$/.test(remindOn));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!ready || saving || type === null) return;
    setSaving(true);
    setError(null);
    try {
      const row = await insertManualTask({
        plant_id: plant.id,
        type,
        title: title.slice(0, MANUAL_MAX_TITLE_CHARS),
        note: note.slice(0, TASK_MAX_NOTE_CHARS),
        todayIso: today,
        remind_on: reminder ? remindOn : null,
      });
      onSaved(row);
      onClose();
    } catch (err) {
      setError(`${s.failed}: ${describeError(err)}`);
      setSaving(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="screen">
        <div className="screen-header">
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label={t.common.close}>
            <X size={22} aria-hidden />
          </button>
          <h1>{s.title}</h1>
        </div>
        <p className="muted small">
          {plant.tag} · {plant.species.common_names.en || plant.species.scientific_name}
        </p>
        <p className="muted small">{s.intro}</p>

        <form onSubmit={(e) => void save(e)} className="card">
          <div className="field">
            <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
              {s.type}
            </span>
            <div className="chips type-chips" role="radiogroup" aria-label={s.type}>
              {TASK_TYPES.map((x) => {
                const Icon = TASK_ICONS[x];
                return (
                  <button
                    type="button"
                    key={x}
                    role="radio"
                    aria-checked={type === x}
                    className={`chip t-${x} ${type === x ? "active" : ""}`}
                    onClick={() => setType(x)}
                    disabled={saving}
                  >
                    <Icon size={18} strokeWidth={2} aria-hidden />
                    {t.enums.task_type[x]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
              {s.when}
            </span>
            <div className="segmented when-switch" role="radiogroup" aria-label={s.when}>
              <button type="button" role="radio" aria-checked={!reminder} className={reminder ? "" : "active"} onClick={() => setWhen("done")} disabled={saving}>
                {s.doneToday}
              </button>
              <button type="button" role="radio" aria-checked={reminder} className={reminder ? "active" : ""} onClick={() => setWhen("remind")} disabled={saving}>
                {s.remind}
              </button>
            </div>
          </div>

          {reminder && (
            <label className="field">
              <span>{s.remindOn}</span>
              <input type="date" value={remindOn} min={today} onChange={(e) => setRemindOn(e.target.value)} disabled={saving} required />
            </label>
          )}

          <label className="field">
            <span>{reminder ? s.whatReminder : s.what}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={reminder ? s.whatReminderPlaceholder : s.whatPlaceholder}
              maxLength={MANUAL_MAX_TITLE_CHARS}
              disabled={saving}
              required
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>{s.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={s.notePlaceholder} maxLength={TASK_MAX_NOTE_CHARS} disabled={saving} enterKeyHint="done" />
          </label>

          {error && <Banner kind="error">{error}</Banner>}

          <button type="submit" className="primary block" disabled={!ready || saving}>
            {saving ? <Spinner /> : reminder ? <Bell size={20} aria-hidden /> : <Check size={20} strokeWidth={2.5} aria-hidden />}
            {saving ? t.common.saving : reminder ? s.saveReminder : s.save}
          </button>
        </form>
      </div>
    </div>
  );
}
