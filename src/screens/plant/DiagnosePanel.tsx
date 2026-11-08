// The diagnosis flow as a full-screen panel over the Plant screen: photo → note → send → result.
// After Claude answers, the photo is saved as a problem photo (ai_result = the diagnosis, its
// usage and the note) and the re-photograph reminder is written. Reopened with `existing` (from the
// journal or the Health tab) it shows the stored diagnosis with the state of its rows.
import { useEffect, useRef, useState } from "react";
import { Banner } from "../../components/Banner";
import { PhotoImg } from "../../components/PhotoImg";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import { api, ApiError, LostReplyError } from "../../lib/api";
import { addDays, localIsoDate } from "../../lib/dates";
import { insertPhoto, insertRephotoTask, listDiagnosisTasks, newId, photoPath, removePhotoObject, uploadPhoto, uploadThumbnail } from "../../lib/db";
import { problemResult, rephotoDays, rephotoTask } from "../../lib/diagnosis";
import { isNetworkFailure } from "../../lib/errors";
import { prepareImage, type PreparedImage } from "../../lib/image";
import { useBackClose } from "../../lib/useBackClose";
import {
  isRefusal,
  type DiagnoseResponse,
  type Diagnosis,
  type Photo,
  type PlantWithSpecies,
  type ProblemAiResult,
  type Task,
  type Usage,
} from "../../types";
import { PhotoButton } from "../capture/PhotoButton";
import { X } from "lucide-react";
import { DiagnosisCard } from "./DiagnosisCard";

type Phase = "idle" | "preparing" | "sending" | "result";
const MAX_NOTE = 500;

/**
 * A diagnosis's photo as planned before the call (Phase 14): its row id, its storage path, its time
 * taken, and the upload that runs beside the call. The route writes the photos row under the same id
 * once Claude has answered; the app's save finishes or repeats the upload and upserts the row.
 */
interface Planned {
  id: string;
  path: string;
  takenAt: string;
  uploaded: boolean;
  upload: Promise<boolean> | null;
}

interface Props {
  plant: PlantWithSpecies;
  /** The plant's photos, so a new storage key never collides with one already stored. */
  photos: Photo[];
  /** A saved diagnosis to reopen; omitted, a new one starts. */
  existing?: Photo | null;
  /** After the photo or a task row was written: the screen reloads photos, tasks and the journal. */
  onChanged: () => void;
  onClose: () => void;
}

function describeError(err: unknown): string {
  if (err instanceof LostReplyError) return t.errors.answerLost;
  if (err instanceof ApiError) {
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 0) return t.errors.network;
    if (err.status === 413) return t.errors.tooLarge;
    return err.message || t.errors.generic;
  }
  if (isNetworkFailure(err)) return t.errors.network;
  if (err instanceof Error && err.message) return err.message;
  return t.errors.generic;
}

export function DiagnosePanel({ plant, photos, existing = null, onChanged, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>(existing ? "result" : "idle");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<DiagnoseResponse | null>(null);
  const [saved, setSaved] = useState<Photo | null>(existing);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksKey, setTasksKey] = useState(0);
  /** The reply was lost on the way and the app is looking for the row the route stored (Phase 14). */
  const [reconnecting, setReconnecting] = useState(false);
  const mountedRef = useRef(true);
  // Stops the looking for a lost reply when the panel is left.
  // Preview object URLs made here; revoked when the panel closes.
  const urlsRef = useRef(new Set<string>());
  // The photo's plan, kept from the first attempt so Save again writes the same object and the same
  // row (and so one re-photograph reminder) instead of a path Storage refuses or a second row.
  const plannedRef = useRef<Planned | null>(null);

  useEffect(() => {
    const urls = urlsRef.current;
    const mounted = mountedRef;
    mounted.current = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      // Left while the app was looking for a lost reply: the looking goes on, and the diagnosis, when it
      // arrives, is saved with its reminder and the Health tab told (onChanged), so nothing is paid twice.
      mounted.current = false;
      document.body.style.overflow = previous;
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    let active = true;
    listDiagnosisTasks(plant.id)
      .then((rows) => {
        if (active) setTasks(rows);
      })
      .catch(() => {
        if (active) setTasks([]);
      });
    return () => {
      active = false;
    };
  }, [saved, plant.id, tasksKey]);

  const stored = existing ? problemResult(existing.ai_result) : null;
  const fresh = response && !isRefusal(response) ? response : null;
  const refusal = response && isRefusal(response) ? response.refusal : null;
  // Close and the back gesture wait while a call runs or the photo is being saved, but not while the
  // app only looks for a lost reply: the row, if any, reaches the journal without the panel.
  const busy = phase === "preparing" || (phase === "sending" && !reconnecting) || saving;
  const speciesName = plant.species.common_names.en || plant.species.scientific_name;
  // A fresh diagnosis whose save failed exists only on this screen: Close asks before losing it.
  const unsaved = fresh !== null && saved === null && !saving;
  function close(): boolean {
    if (unsaved && !window.confirm(t.diagnose.closeUnsaved)) return false;
    onClose();
    return true;
  }

  // The back gesture closes the sheet like the Close button, and like it waits while a call runs.
  useBackClose(close, busy);

  function tasksChanged() {
    setTasksKey((k) => k + 1);
    onChanged();
  }

  async function onPhoto(file: File) {
    setPhase("preparing");
    setError(null);
    try {
      const img = await prepareImage(file);
      if (!mountedRef.current) {
        URL.revokeObjectURL(img.previewUrl);
        return;
      }
      urlsRef.current.add(img.previewUrl);
      setImage(img);
    } catch (err) {
      if (mountedRef.current) setError(`${t.capture.noCamera}: ${describeError(err)}`);
    } finally {
      if (mountedRef.current) setPhase("idle");
    }
  }

  /** The row id, the storage path and the time of a new diagnosis's photo: a timestamp key stepped past any photo of this plant already stored at that millisecond. */
  function plan(img: PreparedImage): Planned {
    let takenAt = img.takenAt ? new Date(img.takenAt) : new Date();
    if (Number.isNaN(takenAt.getTime())) takenAt = new Date();
    const used = new Set(photos.map((p) => p.storage_path));
    while (used.has(photoPath(plant.id, takenAt))) takenAt = new Date(takenAt.getTime() + 1);
    return { id: newId(), path: photoPath(plant.id, takenAt), takenAt: takenAt.toISOString(), uploaded: false, upload: null };
  }

  /** Uploads the photo and its thumbnail over the planned path (the object may be there from an earlier attempt); true when both are stored. */
  function upload(planned: Planned, img: PreparedImage): Promise<boolean> {
    return Promise.all([uploadPhoto(planned.path, img.blob, true), uploadThumbnail(planned.path, img.thumb, true)]).then(
      () => {
        planned.uploaded = true;
        return true;
      },
      () => false,
    );
  }

  /** Removes the object a call that declined or failed left in Storage, once its upload has settled; best effort. */
  async function discard(planned: Planned): Promise<void> {
    await planned.upload;
    if (planned.uploaded) await removePhotoObject(planned.path);
  }

  async function send() {
    if (!image || phase === "sending") return;
    setPhase("sending");
    setError(null);
    setReconnecting(false);
    // A new diagnosis: its photo gets a fresh path and row id, whatever an earlier attempt planned. The
    // upload runs beside the call, not before it, so a weak link is not crossed twice in a row and a
    // failed upload does not stop a diagnosis that would succeed: the save finishes it. The route
    // writes the row under the planned id once Claude has answered, so a reply lost on the way is
    // found again instead of paid for twice.
    const planned = plan(image);
    planned.upload = upload(planned, image);
    plannedRef.current = planned;
    const grower = note.trim();
    try {
      const res = await api.diagnose(
        { plant_id: plant.id, images: [image.payload], note: grower || undefined, photo: { id: planned.id, storage_path: planned.path, taken_at: planned.takenAt } },
        {
          onReconnecting: () => {
            if (mountedRef.current) setReconnecting(true);
          },
        },
      );
      // The answer is paid for: save it before asking whether the panel is still there, so a diagnosis
      // that arrives after the sheet was left still reaches the journal with its reminder. A refusal
      // is saved by neither side, so its object goes.
      if (isRefusal(res)) void discard(planned);
      else void save(image, res, grower);
      if (!mountedRef.current) return;
      setResponse(res);
      setPhase("result");
    } catch (err) {
      // An answered failure, or a reply lost for good (no row in time): no row points at the object,
      // so it goes. A reply lost while the looking could not go on (the table refused the read) keeps it: the row may exist.
      const lostForNow = err instanceof ApiError && err.status === 0 && !(err instanceof LostReplyError);
      if (!lostForNow) void discard(planned);
      if (mountedRef.current) {
        setError(`${t.diagnose.failed}: ${describeError(err)}`);
        setPhase("idle");
      }
    } finally {
      if (mountedRef.current) setReconnecting(false);
    }
  }

  /** The upload, finished or repeated, then the photos row, then the follow-up reminder; the row carries the result. */
  async function save(img: PreparedImage, res: Diagnosis & Usage, grower: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const planned = (plannedRef.current ??= plan(img));
      if (!planned.uploaded) {
        // The upload that started beside the call, or a Save again over the path chosen before.
        const stored = planned.upload ? await planned.upload : false;
        if (!stored) {
          planned.upload = upload(planned, img);
          if (!(await planned.upload)) throw new Error(t.record.uploadFailed);
        }
      }
      const ai: ProblemAiResult = { ...res, note: grower };
      const row = await insertPhoto(
        {
          plant_id: plant.id,
          taken_at: planned.takenAt,
          storage_path: planned.path,
          kind: "problem",
          ai_result: ai,
          note: grower,
        },
        planned.id,
      );
      // The follow-up reminder; if this fails the card offers "Set the reminder".
      const days = rephotoDays(res);
      if (days > 0) {
        const { title, instruction } = rephotoTask(res, plant.tag);
        await insertRephotoTask({ plant_id: plant.id, photo_id: row.id, due_on: addDays(localIsoDate(), days), title, instruction }).catch(
          () => undefined,
        );
      }
      if (mountedRef.current) setSaved(row);
      onChanged();
    } catch (err) {
      if (mountedRef.current) setSaveError(describeError(err));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  const grower = note.trim();

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={t.diagnose.title}>
      <div className="screen">
        <div className="screen-header">
          <button type="button" className="icon-btn" onClick={close} disabled={busy} aria-label={t.common.close}>
            <X size={22} aria-hidden />
          </button>
          <h1>{t.diagnose.title}</h1>
        </div>
        <p className="muted small">
          {plant.tag} · {speciesName}
        </p>

        {existing ? (
          <>
            <PhotoImg path={existing.storage_path} alt={`${plant.tag} · ${t.plant.photoKinds.problem}`} />
            <p className="small muted" style={{ margin: "8px 0" }}>
              {t.diagnose.diagnosedOn(new Date(existing.taken_at).toLocaleDateString())}
              {stored?.note && <> · “{stored.note}”</>}
            </p>
            {stored ? (
              <DiagnosisCard plant={plant} diagnosis={stored} usage={stored} photoId={existing.id} tasks={tasks} onChanged={tasksChanged} />
            ) : (
              <Banner kind="warn">{t.diagnose.pastEmpty}</Banner>
            )}
          </>
        ) : (
          <>
            {phase !== "result" && !image && (
              <>
                <p>{t.diagnose.intro(speciesName)}</p>
                <div className="stack">
                  <PhotoButton label={t.diagnose.takePhoto} camera className="primary block big" disabled={busy} onFile={(f) => void onPhoto(f)} />
                  <PhotoButton label={t.diagnose.pickPhoto} camera={false} className="block big" disabled={busy} onFile={(f) => void onPhoto(f)} />
                </div>
              </>
            )}

            {image && phase !== "result" && <img className="photo" src={image.previewUrl} alt={t.capture.photoLabel(1)} style={{ marginBottom: 12 }} />}
            {image && phase === "result" && (
              <div className="row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
                <img className="photo thumb" src={image.previewUrl} alt={t.capture.photoLabel(1)} />
                {grower && <p className="small grow">“{grower}”</p>}
              </div>
            )}

            {phase === "preparing" && <Spinner label={t.diagnose.preparing} />}
            {phase === "sending" && !reconnecting && <Spinner label={t.diagnose.sending} />}
            {reconnecting && <Banner kind="info">{t.diagnose.reconnecting}</Banner>}
            {error && <Banner kind="error">{error}</Banner>}

            {image && phase === "idle" && (
              <>
                <label className="field">
                  <span>
                    {t.diagnose.noteLabel} ({t.common.optional})
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t.diagnose.notePlaceholder}
                    maxLength={MAX_NOTE}
                    rows={3}
                  />
                </label>
                <div className="row">
                  <button type="button" className="primary grow" onClick={() => void send()}>
                    {t.diagnose.send}
                  </button>
                  <PhotoButton label={t.diagnose.anotherPhoto} camera className="grow" onFile={(f) => void onPhoto(f)} />
                </div>
              </>
            )}

            {phase === "result" && refusal !== null && (
              <>
                <Banner kind="error">
                  <div>{t.diagnose.refusal}</div>
                  <p className="small" style={{ margin: "6px 0 0" }}>
                    {refusal}
                  </p>
                </Banner>
                {response && <p className="small muted">{t.capture.usage(response.input_tokens, response.output_tokens)}</p>}
                <button type="button" className="block" onClick={close}>
                  {t.common.close}
                </button>
              </>
            )}

            {phase === "result" && fresh !== null && (
              <>
                {saving && <Spinner label={t.diagnose.saving} />}
                {saveError && (
                  <Banner kind="error">
                    <div>
                      {t.diagnose.saveFailed}: {saveError}
                    </div>
                    <button type="button" className="small" style={{ marginTop: 8 }} onClick={() => image && void save(image, fresh, grower)}>
                      {t.diagnose.saveAgain}
                    </button>
                  </Banner>
                )}
                <DiagnosisCard plant={plant} diagnosis={fresh} usage={fresh} photoId={saved?.id ?? null} tasks={tasks} onChanged={tasksChanged} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
