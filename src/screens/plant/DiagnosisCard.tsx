import { useState, type FormEvent } from "react";
import { Banner } from "../../components/Banner";
import { ConfidenceBar } from "../../components/ConfidenceBar";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import { addDays, localIsoDate, toLocalDate } from "../../lib/dates";
import { diagnosisRuleKey, insertRephotoTask, insertTreatedTask, treatedRuleKey } from "../../lib/db";
import { isPestScout, rephotoDays, rephotoTask, shortCause, sortedCauses, topCause, URGENCY_PILL } from "../../lib/diagnosis";
import type { Diagnosis, Task, Usage } from "../../types";

const MAX_APPLIED = 200;

function shortDate(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : iso;
}

interface Props {
  plant: { id: string; tag: string };
  diagnosis: Diagnosis;
  usage: Usage | null;
  /** The saved photo row's id; null while the save is pending or failed. */
  photoId: string | null;
  /** The task rows of this diagnosis (treatments, the re-photograph), or null while they load. */
  tasks: Task[] | null;
  /** After a row was written here: the caller reloads the tasks and the journal. */
  onChanged: () => void;
}

/** A diagnosis as the grower reads it, with "Mark treated" and the state of the re-photograph reminder. */
export function DiagnosisCard({ plant, diagnosis, usage, photoId, tasks, onChanged }: Props) {
  const [mode, setMode] = useState<"idle" | "treat">("idle");
  const [applied, setApplied] = useState("");
  const [busy, setBusy] = useState<"treat" | "remind" | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const s = t.diagnose;

  const causes = sortedCauses(diagnosis);
  const top = topCause(diagnosis);
  const days = rephotoDays(diagnosis);
  const today = localIsoDate();

  const treatments = photoId && tasks ? tasks.filter((x) => x.rule_key === treatedRuleKey(photoId)) : [];
  const followUps = photoId && tasks ? tasks.filter((x) => x.rule_key === diagnosisRuleKey(photoId)) : [];
  const pendingFollowUp = followUps.find((x) => x.status === "pending") ?? null;
  const latestFollowUp = followUps[0] ?? null;

  async function logTreatment(e: FormEvent) {
    e.preventDefault();
    if (!photoId || busy) return;
    setBusy("treat");
    setNotice(null);
    try {
      const what = applied.trim().slice(0, MAX_APPLIED) || top?.cause || t.plant.photoKinds.problem;
      const row = await insertTreatedTask({
        plant_id: plant.id,
        photo_id: photoId,
        title: s.treatTitle(plant.tag, shortCause(top?.cause ?? "") || t.plant.photoKinds.problem),
        note: s.treatedNote(what),
        todayIso: today,
      });
      if (!row) setNotice({ kind: "info", text: s.treatedToday });
      setApplied("");
      setMode("idle");
      onChanged();
    } catch (err) {
      setNotice({ kind: "error", text: `${s.treatFailed}: ${err instanceof Error ? err.message : t.errors.generic}` });
    } finally {
      setBusy(null);
    }
  }

  async function setReminder() {
    if (!photoId || busy || days === 0) return;
    setBusy("remind");
    setNotice(null);
    try {
      const { title, instruction } = rephotoTask(diagnosis, plant.tag);
      await insertRephotoTask({ plant_id: plant.id, photo_id: photoId, due_on: addDays(today, days), title, instruction });
      onChanged();
    } catch (err) {
      setNotice({ kind: "error", text: `${s.reminderFailed}: ${err instanceof Error ? err.message : t.errors.generic}` });
    } finally {
      setBusy(null);
    }
  }

  let followUpState: string | null = null;
  if (pendingFollowUp) followUpState = s.reminderSet(shortDate(pendingFollowUp.due_on));
  else if (latestFollowUp?.status === "done") followUpState = s.reminderDone(shortDate(latestFollowUp.acted_at?.slice(0, 10) ?? latestFollowUp.due_on));
  else if (latestFollowUp?.status === "skipped") followUpState = s.reminderSkipped(shortDate(latestFollowUp.acted_at?.slice(0, 10) ?? latestFollowUp.due_on));

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <p className="grow" style={{ fontWeight: 600, margin: 0 }}>
            {diagnosis.summary}
          </p>
          <span className={URGENCY_PILL[diagnosis.urgency]} style={{ flexShrink: 0 }}>
            {s.urgency[diagnosis.urgency]}
          </span>
        </div>
      </div>

      <section className="card">
        <h3>{s.likelyCauses}</h3>
        {causes.length === 0 && <p className="muted">{t.common.none}</p>}
        {causes.map((c, i) => (
          <div key={`${c.cause}:${i}`} className="cause">
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <strong className="grow">{c.cause}</strong>
              <span className={c.kind === "pest" && isPestScout(c) ? "pill warn" : "pill"}>{s.kinds[c.kind]}</span>
            </div>
            <ConfidenceBar value={c.likelihood} />
            {c.evidence && (
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                {c.evidence}
              </p>
            )}
          </div>
        ))}
      </section>

      {diagnosis.checks_to_do.length > 0 && (
        <section className="card">
          <h3>{s.checks}</h3>
          <ol className="list-plain">
            {diagnosis.checks_to_do.map((check, i) => (
              <li key={i}>{check}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h3>{s.treatment}</h3>
        <p style={{ margin: 0 }}>{diagnosis.organic_treatment}</p>
      </section>

      <section className="card">
        <h3>{s.prevention}</h3>
        <p style={{ margin: 0 }}>{diagnosis.prevention}</p>
      </section>

      <section className="card">
        <h3>{s.followUp}</h3>
        <p>{days > 0 ? s.rephotograph(days, shortDate(addDays(today, days))) : s.noRephotograph}</p>
        {photoId && tasks === null && <Spinner label={t.common.loading} />}
        {photoId && tasks !== null && (
          <>
            {days > 0 && (
              <p className="small muted">
                {followUpState ?? s.reminderMissing}{" "}
                {!pendingFollowUp && latestFollowUp === null && (
                  <button type="button" className="link small" onClick={() => void setReminder()} disabled={busy !== null}>
                    {busy === "remind" ? <Spinner /> : s.setReminder}
                  </button>
                )}
              </p>
            )}
            {treatments.map((x) => (
              <div key={x.id} className="small">
                <span className="pill ok">{s.treatedOn(shortDate(x.acted_at?.slice(0, 10) ?? x.due_on))}</span>
                <span className="muted">{x.note}</span>
              </div>
            ))}
            {notice && <Banner kind={notice.kind}>{notice.text}</Banner>}
            {mode === "idle" && (
              <button type="button" className="primary block" style={{ marginTop: 8 }} onClick={() => setMode("treat")} disabled={busy !== null}>
                {busy === "treat" ? <Spinner /> : s.markTreated}
              </button>
            )}
            {mode === "treat" && (
              <form className="task-sub skip" onSubmit={(e) => void logTreatment(e)}>
                <input
                  value={applied}
                  onChange={(e) => setApplied(e.target.value)}
                  placeholder={s.appliedPlaceholder}
                  aria-label={s.appliedLabel}
                  maxLength={MAX_APPLIED}
                  autoFocus
                  enterKeyHint="done"
                />
                <button type="submit" className="primary small" disabled={busy !== null}>
                  {busy === "treat" ? <Spinner /> : s.logTreatment}
                </button>
                <button type="button" className="small" onClick={() => setMode("idle")} disabled={busy !== null}>
                  {t.common.cancel}
                </button>
              </form>
            )}
          </>
        )}
        {!photoId && <p className="small muted">{s.unsaved}</p>}
      </section>

      {usage && usage.input_tokens > 0 && <p className="small muted">{t.capture.usage(usage.input_tokens, usage.output_tokens)}</p>}
    </div>
  );
}
