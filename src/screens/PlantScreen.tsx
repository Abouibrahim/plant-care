import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpen, ChevronLeft, ImagePlus, MapPin, MessageCircleQuestionMark, Pencil, Stethoscope, Trash2, X } from "lucide-react";
import { t } from "../i18n";
import { api } from "../lib/api";
import { storedAnswer } from "../lib/ask";
import { ageInMonths, localIsoDate, toLocalDate } from "../lib/dates";
import {
  completeTask,
  deletePlant,
  getPlant,
  insertPhoto,
  listJournal,
  listPhotos,
  listPlantTasks,
  listQuestions,
  photoPath,
  skipTask,
  snoozeTask,
  updatePlant,
  uploadPhoto,
} from "../lib/db";
import { problemResult, URGENCY_PILL } from "../lib/diagnosis";
import { prepareImage } from "../lib/image";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { PhotoImg } from "../components/PhotoImg";
import { RecordForm, type RecordValues } from "../components/RecordForm";
import { TaskCard, type TaskAction } from "../components/TaskCard";
import { SiteLabel, TypePill } from "../components/TypeIcon";
import { CalendarSection, GuildUsesSection, HealthSection, NeedsSection } from "../components/profile";
import { AskPanel } from "./plant/AskPanel";
import { DiagnosePanel } from "./plant/DiagnosePanel";
import { PastDiagnoses } from "./plant/PastDiagnoses";
import type { JournalEntry, Photo, PhotoKind, PlantWithSpecies, Question, Task, TaskStatus, TaskType } from "../types";

/** The diagnosis panel: a new diagnosis, or a saved one reopened from the journal or the Health tab. */
type DiagnoseState = { kind: "new" } | { kind: "open"; photo: Photo } | null;

/** The Ask Claude panel: a new conversation (threadId null), or a saved one reopened from the journal. */
type AskState = { threadId: string | null } | null;

type TabKey = keyof typeof t.plant.tabs;
const TABS: TabKey[] = ["needs", "calendar", "health", "guild", "journal"];

interface Loaded {
  id: string;
  plant: PlantWithSpecies | null;
  photos: Photo[];
}

/** Tasks and the journal load after the plant; a failure there leaves the rest of the screen usable. */
interface Extras {
  id: string;
  tasks: Task[];
  journal: JournalEntry[];
  /** The answers behind the journal's question entries; empty when they cannot be read. */
  questions: Question[];
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

/** YYYY-MM-DD as a local date string, without a timezone shift. */
function formatIsoDate(iso: string): string {
  return toLocalDate(iso)?.toLocaleDateString() ?? iso;
}

/** The top candidate scientific name stored in an identify photo's ai_result. */
function topCandidateName(ai: unknown): string | null {
  if (!ai || typeof ai !== "object") return null;
  const candidates = (ai as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const name = (candidates[0] as { scientific_name?: unknown }).scientific_name;
  return typeof name === "string" && name ? name : null;
}

export function PlantScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<TabKey>("needs");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [extrasError, setExtrasError] = useState<{ id: string; message: string } | null>(null);
  const [extrasKey, setExtrasKey] = useState(0);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [diagnose, setDiagnose] = useState<DiagnoseState>(null);
  const [ask, setAsk] = useState<AskState>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([getPlant(id), listPhotos(id)])
      .then(([plant, photos]) => {
        if (!active) return;
        setLoaded({ id, plant, photos });
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (active) setLoadError({ id, message: message(err) });
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    // The questions only add the answer previews to the journal's question entries (which carry
    // their thread id themselves), so a failure there costs the previews, not the tasks and the journal.
    const questionsLoad = listQuestions(id).catch((): Question[] => []);
    Promise.all([listPlantTasks(id), listJournal(id), questionsLoad])
      .then(([tasks, journal, questions]) => {
        if (!active) return;
        setExtras({ id, tasks, journal, questions });
        setExtrasError(null);
      })
      .catch((err: unknown) => {
        if (active) setExtrasError({ id, message: message(err) });
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey, extrasKey]);

  const error = loadError?.id === id ? loadError.message : null;
  const current = loaded?.id === id ? loaded : null;
  const loading = !error && current === null;
  const plant = current?.plant ?? null;
  const photos = current?.photos ?? [];
  const tasks = extras?.id === id ? extras.tasks : null;
  const journal = extras?.id === id ? extras.journal : null;
  const questions = extras?.id === id ? extras.questions : [];
  const extrasMessage = extrasError?.id === id ? extrasError.message : null;

  function retry() {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }

  function reloadExtras() {
    setExtrasKey((k) => k + 1);
  }

  /** After a diagnosis wrote a photo or a task: photos, tasks and the journal again. */
  function reloadAll() {
    setReloadKey((k) => k + 1);
  }

  async function saveRecord(values: RecordValues) {
    if (!plant) return;
    setSaving(true);
    setActionError(null);
    try {
      await updatePlant(plant.id, values);
      const fresh = await getPlant(plant.id);
      setLoaded((prev) => (prev && prev.id === plant.id ? { ...prev, plant: fresh } : prev));
      setEditing(false);
      // A new planting date can change the plant's stage, so the tasks are expanded again.
      void api
        .expand({ plant_id: plant.id })
        .catch(() => undefined)
        .then(reloadExtras);
    } catch (err) {
      setActionError(message(err));
    } finally {
      setSaving(false);
    }
  }

  async function actOnTask(task: Task, action: TaskAction) {
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    setActionError(null);
    try {
      if (action.kind === "done") await completeTask(task.id);
      else if (action.kind === "skip") await skipTask(task.id, action.reason);
      else await snoozeTask(task, action.days, localIsoDate());
      reloadExtras();
    } catch (err) {
      setActionError(`${t.today.actionFailed}: ${message(err)}`);
    } finally {
      setBusyTaskId(null);
    }
  }

  /** A dead tree or a wrong identification: the plant goes, with its photos, tasks and questions. */
  async function remove() {
    if (!plant || busy) return;
    if (!window.confirm(t.plant.deleteConfirm(plant.tag))) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deletePlant(plant.id);
      navigate("/plants", { replace: true });
    } catch (err) {
      setActionError(`${t.plant.deleteFailed}: ${message(err)}`);
      setDeleting(false);
    }
  }

  async function addJournalPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !plant) return;
    setUploading(true);
    setActionError(null);
    try {
      const prepared = await prepareImage(file);
      URL.revokeObjectURL(prepared.previewUrl);
      let takenAt = prepared.takenAt ? new Date(prepared.takenAt) : new Date();
      if (Number.isNaN(takenAt.getTime())) takenAt = new Date();
      // Storage keys are timestamps: step past any photo of this plant already stored at that millisecond.
      const existing = new Set((loaded?.photos ?? []).map((p) => p.storage_path));
      while (existing.has(photoPath(plant.id, takenAt))) takenAt = new Date(takenAt.getTime() + 1);
      const storage_path = photoPath(plant.id, takenAt);
      await uploadPhoto(storage_path, prepared.blob);
      await insertPhoto({
        plant_id: plant.id,
        taken_at: takenAt.toISOString(),
        storage_path,
        kind: "journal",
        ai_result: null,
        note: "",
      });
      const fresh = await listPhotos(plant.id);
      setLoaded((prev) => (prev && prev.id === plant.id ? { ...prev, photos: fresh } : prev));
      reloadExtras();
      setTab("journal");
    } catch (err) {
      setActionError(message(err));
    } finally {
      setUploading(false);
    }
  }

  if (loading || error || !plant) {
    return (
      <div className="screen">
        <div className="screen-header">
          <Link to="/plants" className="btn icon-btn" aria-label={t.common.back}>
            <ChevronLeft size={24} aria-hidden />
          </Link>
          <h1>{t.plant.title}</h1>
        </div>
        {loading && (
          <div className="center">
            <Spinner label={t.common.loading} />
          </div>
        )}
        {error && (
          <>
            <Banner kind="error">{error}</Banner>
            <button type="button" className="small" onClick={retry}>
              {t.common.retry}
            </button>
          </>
        )}
        {!loading && !error && !plant && <p className="center muted">{t.plant.notFound}</p>}
      </div>
    );
  }

  const species = plant.species;
  const newest = photos[0] ?? null;
  const today = localIsoDate();
  const ageMonths = ageInMonths(plant.planted_on, today);
  const busy = saving || uploading || deleting;

  return (
    <div className="screen">
      <div className="hero">
        <PhotoImg path={newest?.storage_path} alt={plant.tag} />
        <Link to="/plants" className="btn icon-btn hero-back" aria-label={t.common.back}>
          <ChevronLeft size={24} aria-hidden />
        </Link>
      </div>

      <div className="screen-header">
        <h1>{plant.tag}</h1>
      </div>

      <p className="row wrap" style={{ gap: "4px 14px" }}>
        <span>{t.plant.quantity(plant.quantity)}</span>
        <SiteLabel site={plant.site} />
        {plant.zone && (
          <span className="site-label">
            <MapPin size={16} aria-hidden />
            {plant.zone}
          </span>
        )}
      </p>

      <div className="stack" style={{ gap: 2, marginBottom: 8 }}>
        <div>
          <strong>{species.common_names.en}</strong>
          {species.common_names.fr && <span className="muted"> · {species.common_names.fr}</span>}
        </div>
        {(species.common_names.ar || species.common_names.ar_latin) && (
          <div>
            {species.common_names.ar && <span className="arabic">{species.common_names.ar}</span>}
            {species.common_names.ar_latin && <span className="muted small"> {species.common_names.ar_latin}</span>}
          </div>
        )}
        <div>
          <span className="italic">{species.scientific_name}</span>
          {species.cultivar && <span> {"‘"}{species.cultivar}{"’"}</span>}
        </div>
        <div>
          <span className="pill">{t.enums.layer[species.layer]}</span>
          <span className="pill">{t.enums.plant_type[species.plant_type]}</span>
        </div>
      </div>

      <p className="muted small">
        {plant.planted_on && ageMonths !== null
          ? `${t.plant.plantedOn} ${formatIsoDate(plant.planted_on)} · ${t.plant.ageMonths(ageMonths)}`
          : t.plant.ageUnknown}
      </p>

      <div className="action-grid">
        <button type="button" className="small" onClick={() => setEditing((v) => !v)} disabled={busy}>
          {editing ? <X size={18} aria-hidden /> : <Pencil size={18} aria-hidden />}
          {editing ? t.common.cancel : t.plant.editRecord}
        </button>
        <button type="button" className="small" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImagePlus size={18} aria-hidden />
          {t.plant.addJournalPhoto}
        </button>
        <Link to={`/species/${species.id}`} className="btn small">
          <BookOpen size={18} aria-hidden />
          {t.plant.profileLink}
        </Link>
        <button type="button" className="small" onClick={() => setDiagnose({ kind: "new" })} disabled={busy}>
          <Stethoscope size={18} aria-hidden />
          {t.plant.diagnose}
        </button>
        <button type="button" className="small span-2" onClick={() => setAsk({ threadId: null })} disabled={busy}>
          <MessageCircleQuestionMark size={18} aria-hidden />
          {t.plant.ask}
        </button>
        {uploading && <Spinner />}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={addJournalPhoto}
        aria-label={t.plant.addJournalPhoto}
      />

      {actionError && <Banner kind="error">{actionError}</Banner>}

      {editing && (
        <div className="card">
          <h2>{t.record.title}</h2>
          <RecordForm
            initial={{
              tag: plant.tag,
              quantity: plant.quantity,
              site: plant.site,
              zone: plant.zone,
              lat: plant.lat,
              lng: plant.lng,
              planted_on: plant.planted_on,
              source: plant.source,
              rootstock: plant.rootstock,
            }}
            onSubmit={saveRecord}
            submitLabel={t.common.save}
            submitting={saving}
          />
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((key) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t.plant.tabs[key]}
          </button>
        ))}
      </div>

      {tab === "needs" && <NeedsSection species={species} />}
      {tab === "calendar" && (
        <>
          <section className="section">
            <h2>{t.plant.nextTasks}</h2>
            {extrasMessage && <Banner kind="error">{extrasMessage}</Banner>}
            {tasks === null && !extrasMessage && <Spinner label={t.common.loading} />}
            {tasks !== null && tasks.length === 0 && <p className="muted">{t.plant.noTasks}</p>}
            {tasks?.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                today={today}
                busy={busyTaskId === task.id}
                onAct={(action) => void actOnTask(task, action)}
              />
            ))}
            {tasks !== null && tasks.length > 0 && <p className="muted small">{t.plant.moreTasksHint}</p>}
          </section>
          <CalendarSection species={species} plantedOn={plant.planted_on} />
        </>
      )}
      {tab === "health" && (
        <>
          <HealthSection species={species} />
          <PastDiagnoses photos={photos} onOpen={(photo) => setDiagnose({ kind: "open", photo })} />
        </>
      )}
      {tab === "guild" && <GuildUsesSection species={species} />}
      {tab === "journal" && (
        <>
          {extrasMessage && <Banner kind="error">{extrasMessage}</Banner>}
          {journal === null && !extrasMessage && (
            <div className="center">
              <Spinner label={t.common.loading} />
            </div>
          )}
          {journal !== null && (
            <Journal
              entries={journal}
              photos={photos}
              questions={questions}
              tag={plant.tag}
              onOpenDiagnosis={(photo) => setDiagnose({ kind: "open", photo })}
              onOpenThread={(threadId) => setAsk({ threadId })}
            />
          )}
        </>
      )}

      <div className="card stack" style={{ marginTop: 24 }}>
        <button type="button" className="danger block" disabled={busy} onClick={() => void remove()}>
          <Trash2 size={18} aria-hidden />
          {deleting ? t.common.saving : t.plant.delete}
        </button>
        <span className="small muted">{t.plant.deleteNote}</span>
      </div>

      {diagnose && (
        <DiagnosePanel
          plant={plant}
          photos={photos}
          existing={diagnose.kind === "open" ? diagnose.photo : null}
          onChanged={reloadAll}
          onClose={() => setDiagnose(null)}
        />
      )}
      {ask && <AskPanel plant={plant} threadId={ask.threadId} onChanged={reloadExtras} onClose={() => setAsk(null)} />}
    </div>
  );
}

const PHOTO_KINDS = new Set<string>(["identify", "journal", "problem"]);
const TASK_STATUS_PILL: Record<TaskStatus, string> = { pending: "pill", done: "pill ok", skipped: "pill warn", snoozed: "pill" };

interface PhotoEntryProps {
  entry: JournalEntry;
  photo: Photo | undefined;
  tag: string;
  onOpenDiagnosis: (photo: Photo) => void;
}

/** A photo in the journal; an identification shows its top candidate, a problem photo its diagnosis. */
function PhotoEntry({ entry, photo, tag, onOpenDiagnosis }: PhotoEntryProps) {
  const kind = (PHOTO_KINDS.has(entry.subtype) ? entry.subtype : "journal") as PhotoKind;
  const kindLabel = t.plant.photoKinds[kind];
  const top = kind === "identify" ? topCandidateName(photo?.ai_result) : null;
  const diagnosis = kind === "problem" ? problemResult(photo?.ai_result) : null;
  const pillClass = kind === "problem" ? "pill warn" : kind === "identify" ? "pill accent" : "pill";
  return (
    <div className="card row" style={{ alignItems: "flex-start" }}>
      <PhotoImg path={entry.ref} alt={`${tag} · ${kindLabel}`} className="photo thumb" />
      <div className="grow">
        <div>{new Date(entry.at).toLocaleDateString()}</div>
        <span className={pillClass}>{kindLabel}</span>
        {diagnosis && <span className={URGENCY_PILL[diagnosis.urgency]}>{t.diagnose.urgency[diagnosis.urgency]}</span>}
        {top && <div className="muted small italic">{top}</div>}
        {diagnosis && <div className="small clamp-2">{diagnosis.summary}</div>}
        {entry.text && <div className={`small ${diagnosis ? "muted" : ""}`}>{entry.text}</div>}
        {diagnosis && photo && (
          <button type="button" className="link small" style={{ paddingLeft: 0 }} onClick={() => onOpenDiagnosis(photo)}>
            {t.diagnose.open}
          </button>
        )}
      </div>
    </div>
  );
}

function TaskEntry({ entry }: { entry: JournalEntry }) {
  const type = (entry.subtype in t.enums.task_type ? entry.subtype : null) as TaskType | null;
  const status = (entry.ref in TASK_STATUS_PILL ? entry.ref : "pending") as TaskStatus;
  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <div>{new Date(entry.at).toLocaleDateString()}</div>
          <div>{entry.text}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {type ? <TypePill type={type} /> : <span className="pill">{entry.subtype}</span>}
          <span className={TASK_STATUS_PILL[status]}>{t.enums.task_status[status]}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A question asked about the plant: the opening lines of the answer and the way back into the
 * conversation, whose id the journal row carries, so it opens even when the answers could not be read.
 */
function QuestionEntry({ entry, question, onOpenThread }: { entry: JournalEntry; question: Question | undefined; onOpenThread: (threadId: string) => void }) {
  const answer = question ? storedAnswer(question.answer) : null;
  const threadId = question?.thread_id ?? entry.subtype;
  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="grow">{new Date(entry.at).toLocaleDateString()}</div>
        <span className="pill accent">{t.ask.journalLabel}</span>
      </div>
      <div style={{ fontWeight: 600, margin: "4px 0" }}>{entry.text}</div>
      {answer && <div className="small muted answer-text clamp-3">{answer.answer}</div>}
      {threadId && (
        <button type="button" className="link small" style={{ paddingLeft: 0 }} onClick={() => onOpenThread(threadId)}>
          {t.ask.openConversation}
        </button>
      )}
    </div>
  );
}

interface JournalProps {
  entries: JournalEntry[];
  photos: Photo[];
  questions: Question[];
  tag: string;
  onOpenDiagnosis: (photo: Photo) => void;
  onOpenThread: (threadId: string) => void;
}

/**
 * Photos, acted tasks and questions from the `journal` view, newest first; photos keep their
 * identify candidate or diagnosis, questions the opening of their answer.
 */
function Journal({ entries, photos, questions, tag, onOpenDiagnosis, onOpenThread }: JournalProps) {
  if (entries.length === 0) {
    return <p className="center muted">{t.plant.journalEmpty}</p>;
  }
  const byPath = new Map(photos.map((p) => [p.storage_path, p]));
  const byId = new Map(questions.map((q) => [q.id, q]));
  return (
    <div>
      {entries.map((entry, i) => {
        const key = `${entry.kind}:${entry.ref}:${entry.at}:${i}`;
        if (entry.kind === "photo") {
          return <PhotoEntry key={key} entry={entry} photo={byPath.get(entry.ref)} tag={tag} onOpenDiagnosis={onOpenDiagnosis} />;
        }
        if (entry.kind === "question") {
          return <QuestionEntry key={key} entry={entry} question={byId.get(entry.ref)} onOpenThread={onOpenThread} />;
        }
        return <TaskEntry key={key} entry={entry} />;
      })}
    </div>
  );
}
