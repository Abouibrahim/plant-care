// Capture: photo → identify → confirm (or type a name) → profile + record form → save.
// One small state machine; every Claude call goes through api.ts, every row through db.ts.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Banner } from "../components/Banner";
import { LOW_CONFIDENCE } from "../components/ConfidenceBar";
import { emptyRecord, RecordForm, type RecordValues } from "../components/RecordForm";
import { Spinner } from "../components/Spinner";
import { t } from "../i18n";
import { api, ApiError } from "../lib/api";
import { deleteSpeciesIfUnused, insertPhoto, insertPlant, photoPath, updatePlant, uploadPhoto } from "../lib/db";
import { prepareImage, type PreparedImage } from "../lib/image";
import {
  isRefusal,
  SITES,
  type Candidate,
  type IdentifyResponse,
  type IdentifyResult,
  type Plant,
  type ProfileRequest,
  type Site,
} from "../types";
import { CandidateCard } from "./capture/CandidateCard";
import { PhotoButton } from "./capture/PhotoButton";
import { ProfileStatus, type ProfileState } from "./capture/ProfileStatus";

type Phase = "idle" | "preparing" | "identifying" | "result" | "confirmed" | "saving";

type Choice = { kind: "candidate"; candidate: Candidate } | { kind: "typed"; name: string };

/** What a failed save already managed to write, so a retry never inserts a second plant. */
interface SaveProgress {
  plant: Plant | null;
  uploaded: Map<number, { path: string; takenAt: string }>;
  rows: Set<number>;
}

const SITE_KEY = "plantcare.site";

function readSite(): Site {
  try {
    const v = localStorage.getItem(SITE_KEY);
    return v === "backyard" || v === "farm" ? v : "farm";
  } catch {
    return "farm";
  }
}

function writeSite(site: Site) {
  try {
    localStorage.setItem(SITE_KEY, site);
  } catch {
    // private mode or storage blocked: the toggle still works for this visit
  }
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 0) return t.errors.network;
    if (err.status === 413) return t.errors.tooLarge;
    return err.message || t.errors.generic;
  }
  if (err instanceof Error && err.message) return err.message;
  return t.errors.generic;
}

class UploadFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadFailure";
  }
}

function freshProgress(): SaveProgress {
  return { plant: null, uploaded: new Map(), rows: new Set() };
}

function isUnknown(c: Candidate): boolean {
  return c.scientific_name.trim().toLowerCase() === "unknown";
}

function choiceLabel(choice: Choice): string {
  if (choice.kind === "typed") return choice.name;
  return choice.candidate.common_names.en || choice.candidate.scientific_name;
}

function Previews({ images, compact }: { images: PreparedImage[]; compact: boolean }) {
  if (compact) {
    return (
      <div className="row" style={{ marginBottom: 12 }}>
        {images.map((img, i) => (
          <img key={img.previewUrl} className="photo thumb" src={img.previewUrl} alt={t.capture.photoLabel(i + 1)} />
        ))}
      </div>
    );
  }
  if (images.length === 1) {
    return <img className="photo" src={images[0].previewUrl} alt={t.capture.photoLabel(1)} style={{ marginBottom: 12 }} />;
  }
  return (
    <div className="row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
      {images.map((img, i) => (
        <figure key={img.previewUrl} className="grow" style={{ margin: 0 }}>
          <img className="photo" src={img.previewUrl} alt={t.capture.photoLabel(i + 1)} />
          <figcaption className="small muted" style={{ textAlign: "center", marginTop: 4 }}>
            {t.capture.photoLabel(i + 1)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function CaptureScreen() {
  const navigate = useNavigate();
  const [site, setSite] = useState<Site>(readSite);
  const [phase, setPhase] = useState<Phase>("idle");
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [response, setResponse] = useState<IdentifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [profile, setProfile] = useState<ProfileState>({ status: "pending" });
  const [profileReq, setProfileReq] = useState<ProfileRequest | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [plantSaved, setPlantSaved] = useState(false);

  // Bumped by Start over so that in-flight work from the previous attempt is ignored.
  const runRef = useRef(0);
  // Bumped per profile request so a retry or "pick another" ignores the earlier answer.
  const profileSeqRef = useRef(0);
  // Every preview object URL created on this screen; revoked on reset, save and unmount.
  const urlsRef = useRef(new Set<string>());
  const saveRef = useRef<SaveProgress>(freshProgress());
  // Species rows this capture created that no plant uses yet. They are deleted only when the
  // capture is abandoned (Start over, leaving the screen): a profile request of this capture may
  // still be answered with one of them, so deleting earlier could leave the form with a dead id.
  const createdRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    const urls = urlsRef.current;
    const run = runRef;
    const seq = profileSeqRef;
    const created = createdRef.current;
    const mounted = mountedRef;
    mounted.current = true;
    return () => {
      // Drop every in-flight result (including a late navigate from save) once the screen is gone.
      mounted.current = false;
      run.current += 1;
      seq.current += 1;
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
      for (const id of created) void deleteSpeciesIfUnused(id).catch(() => undefined);
      created.clear();
    };
  }, []);

  const refusal = response && isRefusal(response) ? response.refusal : null;
  const result: IdentifyResult | null = response && !isRefusal(response) ? response : null;
  const sorted = useMemo(
    () => (result ? [...result.candidates].sort((a, b) => b.confidence - a.confidence) : []),
    [result],
  );
  const top: Candidate | null = sorted.length > 0 ? sorted[0] : null;
  const unknown = result !== null && (top === null || isUnknown(top));
  // An "unknown" entry below a real candidate is advice, not something to confirm.
  const known = useMemo(() => sorted.filter((c) => !isUnknown(c)), [sorted]);
  const lowConfidence = result !== null && !unknown && top !== null && top.confidence < LOW_CONFIDENCE && images.length === 1;
  const busy = phase === "preparing" || phase === "identifying" || phase === "saving";
  const firstGps = images.length > 0 ? images[0].gps : null;

  // ---- helpers ---------------------------------------------------------------

  function changeSite(s: Site) {
    setSite(s);
    writeSite(s);
  }

  function revokeAll() {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current.clear();
  }

  /** Deletes the species rows this capture created that no plant ended up using. */
  function discardCreatedSpecies() {
    for (const id of createdRef.current) void deleteSpeciesIfUnused(id).catch(() => undefined);
    createdRef.current.clear();
  }

  function startOver() {
    runRef.current += 1;
    profileSeqRef.current += 1;
    discardCreatedSpecies();
    revokeAll();
    saveRef.current = freshProgress();
    setImages([]);
    setResponse(null);
    setError(null);
    setTypedName("");
    setChoice(null);
    setProfile({ status: "pending" });
    setProfileReq(null);
    setSaveError(null);
    setPlantSaved(false);
    setPhase("idle");
  }

  /** Resize and read EXIF; null on failure or when the attempt was reset meanwhile. */
  async function prepare(file: File, run: number): Promise<PreparedImage | null> {
    setPhase("preparing");
    setError(null);
    try {
      const img = await prepareImage(file);
      if (runRef.current !== run) {
        URL.revokeObjectURL(img.previewUrl);
        return null;
      }
      urlsRef.current.add(img.previewUrl);
      return img;
    } catch (err) {
      if (runRef.current === run) setError(`${t.capture.noCamera}: ${describeError(err)}`);
      return null;
    }
  }

  /** Calls /api/identify; true when a response was stored. */
  async function identify(imgs: PreparedImage[], run: number): Promise<boolean> {
    setPhase("identifying");
    setError(null);
    try {
      const res = await api.identify({ images: imgs.map((i) => i.payload), site });
      if (runRef.current !== run) return false;
      setResponse(res);
      setPhase("result");
      return true;
    } catch (err) {
      if (runRef.current === run) setError(describeError(err));
      return false;
    }
  }

  async function onFirstPhoto(file: File) {
    const run = runRef.current;
    const img = await prepare(file, run);
    if (!img) {
      if (runRef.current === run) setPhase("idle");
      return;
    }
    setImages([img]);
    const ok = await identify([img], run);
    if (!ok && runRef.current === run) setPhase("idle"); // the preview stays, with Retry
  }

  async function onSecondPhoto(file: File) {
    const run = runRef.current;
    const img = await prepare(file, run);
    if (!img) {
      if (runRef.current === run) setPhase("result");
      return;
    }
    const both = [...images, img];
    setImages(both);
    const ok = await identify(both, run);
    if (!ok && runRef.current === run) {
      // Keep the stored result consistent with the photos that produced it.
      urlsRef.current.delete(img.previewUrl);
      URL.revokeObjectURL(img.previewUrl);
      setImages(images);
      setPhase("result");
    }
  }

  async function retryIdentify() {
    const run = runRef.current;
    const ok = await identify(images, run);
    if (!ok && runRef.current === run) setPhase("idle");
  }

  function startProfile(req: ProfileRequest) {
    const run = runRef.current;
    const seq = profileSeqRef.current + 1;
    profileSeqRef.current = seq;
    setProfileReq(req);
    setProfile({ status: "pending" });
    api.profile(req).then(
      (res) => {
        const stale = runRef.current !== run || profileSeqRef.current !== seq;
        if (!isRefusal(res) && res.created) {
          if (runRef.current === run) {
            // Still this capture (even after Pick another): keep it until the capture ends.
            createdRef.current.add(res.species.id);
          } else if (mountedRef.current) {
            // Start over already drained the set: nothing of this capture will use the row.
            void deleteSpeciesIfUnused(res.species.id).catch(() => undefined);
          }
          // After unmount the row is left alone; the species screen offers Delete for unused profiles.
        }
        if (stale) return;
        setProfile(isRefusal(res) ? { status: "failed", message: res.refusal } : { status: "ready", response: res });
      },
      (err: unknown) => {
        if (runRef.current !== run || profileSeqRef.current !== seq) return;
        setProfile({ status: "failed", message: describeError(err) });
      },
    );
  }

  function confirm(next: Choice) {
    const req: ProfileRequest =
      next.kind === "candidate"
        ? {
            scientific_name: next.candidate.scientific_name,
            cultivar: next.candidate.cultivar,
            common_names: next.candidate.common_names,
            site,
          }
        : { name: next.name, site };
    setChoice(next);
    setError(null);
    setSaveError(null);
    setPhase("confirmed");
    startProfile(req);
  }

  function submitTypedName(e: FormEvent) {
    e.preventDefault();
    const name = typedName.trim();
    if (name) confirm({ kind: "typed", name });
  }

  function pickAnother() {
    profileSeqRef.current += 1; // drop the in-flight profile answer; created rows stay until the capture ends
    setChoice(null);
    setProfileReq(null);
    setProfile({ status: "pending" });
    setSaveError(null);
    setPhase("result");
  }

  function initialRecord(c: Choice): RecordValues {
    return {
      ...emptyRecord(site),
      tag: choiceLabel(c),
      lat: firstGps ? firstGps.lat : null,
      lng: firstGps ? firstGps.lng : null,
    };
  }

  async function save(values: RecordValues) {
    if (profile.status !== "ready" || !response) return;
    const species = profile.response.species;
    const run = runRef.current;
    const progress = saveRef.current;
    setPhase("saving");
    setSaveError(null);
    try {
      const row = { ...values, species_id: species.id };
      const plant = progress.plant ? await updatePlant(progress.plant.id, row) : await insertPlant(row);
      progress.plant = plant;
      createdRef.current.delete(species.id); // in use now; any other row created here is still an orphan
      setPlantSaved(true);

      // Storage paths are keyed by timestamp: keep them distinct even for a burst of photos.
      const used = new Set<number>();
      for (const u of progress.uploaded.values()) used.add(new Date(u.takenAt).getTime());

      for (let i = 0; i < images.length; i++) {
        if (progress.rows.has(i)) continue;
        const img = images[i];
        let up = progress.uploaded.get(i);
        if (!up) {
          let when = img.takenAt ? new Date(img.takenAt) : new Date();
          if (Number.isNaN(when.getTime())) when = new Date();
          while (used.has(when.getTime())) when = new Date(when.getTime() + 1);
          used.add(when.getTime());
          const path = photoPath(plant.id, when);
          try {
            await uploadPhoto(path, img.blob);
          } catch (err) {
            throw new UploadFailure(describeError(err));
          }
          up = { path, takenAt: when.toISOString() };
          progress.uploaded.set(i, up);
        }
        await insertPhoto({
          plant_id: plant.id,
          taken_at: up.takenAt,
          storage_path: up.path,
          kind: "identify",
          ai_result: response,
          note: "",
        });
        progress.rows.add(i);
      }

      if (runRef.current !== run) return;
      revokeAll();
      navigate(species.confirmed ? `/plants/${plant.id}` : `/species/${species.id}?plant=${plant.id}`);
    } catch (err) {
      if (runRef.current !== run) return;
      setSaveError(err instanceof UploadFailure ? `${t.record.uploadFailed}: ${err.message}` : describeError(err));
      setPhase("confirmed");
    }
  }

  // ---- render ----------------------------------------------------------------

  const inForm = phase === "confirmed" || phase === "saving";
  const usageLine = response ? (
    <p className="small muted">{t.capture.usage(response.input_tokens, response.output_tokens)}</p>
  ) : null;

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>{t.capture.title}</h1>
      </div>

      {!inForm && (
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
            {t.capture.siteLabel}
          </span>
          <div className="segmented" role="radiogroup" aria-label={t.capture.siteLabel}>
            {SITES.map((s) => (
              <button
                type="button"
                key={s}
                role="radio"
                aria-checked={site === s}
                className={site === s ? "active" : ""}
                disabled={busy}
                onClick={() => changeSite(s)}
              >
                {t.site[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "idle" && images.length === 0 && (
        <div className="stack">
          <PhotoButton label={t.capture.takePhoto} camera className="primary block big" onFile={onFirstPhoto} />
          <PhotoButton label={t.capture.pickPhoto} camera={false} className="block big" onFile={onFirstPhoto} />
        </div>
      )}

      {images.length > 0 && <Previews images={images} compact={inForm} />}

      {phase === "preparing" && <Spinner label={t.capture.preparing} />}
      {phase === "identifying" && <Spinner label={t.capture.identifying} />}
      {(phase === "preparing" || phase === "identifying") && (
        <button type="button" className="link block" style={{ marginTop: 8 }} onClick={startOver}>
          {t.capture.startOver}
        </button>
      )}

      {error && <Banner kind="error">{error}</Banner>}

      {phase === "idle" && images.length > 0 && (
        <div className="row">
          <button type="button" className="primary grow" onClick={retryIdentify}>
            {t.common.retry}
          </button>
          <button type="button" className="grow" onClick={startOver}>
            {t.capture.startOver}
          </button>
        </div>
      )}

      {phase === "result" && refusal !== null && (
        <>
          <Banner kind="error">
            <div>{t.capture.refusal}</div>
            <p className="small" style={{ margin: "6px 0 0" }}>
              {refusal}
            </p>
          </Banner>
          {usageLine}
          <button type="button" className="block" onClick={startOver}>
            {t.capture.startOver}
          </button>
        </>
      )}

      {phase === "result" && result !== null && (
        <>
          {unknown ? (
            <div className="card">
              <h2>{t.capture.unknownTitle}</h2>
              <p>{t.capture.unknownBody}</p>
              {top !== null && top.evidence && <p className="muted small">{top.evidence}</p>}
              {result.photo_advice && <p className="small">{result.photo_advice}</p>}
              <button type="button" className="block" onClick={startOver}>
                {t.capture.startOver}
              </button>
            </div>
          ) : (
            <>
              {lowConfidence && (
                <Banner kind="warn">
                  <p>
                    {t.capture.lowConfidence} {result.photo_advice}
                  </p>
                  <PhotoButton label={t.capture.addSecondPhoto} camera className="block" onFile={onSecondPhoto} />
                </Banner>
              )}
              {images.length === 2 && <p className="small muted">{t.capture.secondPhotoAdded}</p>}

              <h2>{t.capture.candidates}</h2>
              {known.map((c, i) => (
                <CandidateCard
                  key={`${i}-${c.scientific_name}-${c.cultivar}`}
                  candidate={c}
                  primary={i === 0}
                  onConfirm={() => confirm({ kind: "candidate", candidate: c })}
                />
              ))}

              <div className="row wrap" style={{ marginBottom: 12 }}>
                <span className="small muted">{t.capture.growsAs}</span>
                <span>
                  <span className="pill">{t.enums.plant_type[result.plant_type]}</span>
                  <span className="pill">{t.enums.lifecycle[result.lifecycle]}</span>
                  {result.foliage !== "not_applicable" && <span className="pill">{t.enums.foliage[result.foliage]}</span>}
                  <span className="pill">{t.enums.layer[result.layer]}</span>
                </span>
              </div>
            </>
          )}

          <form className="card stack" onSubmit={submitTypedName}>
            <h3 style={{ margin: 0 }}>{t.capture.typeName}</h3>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={t.capture.typeNamePlaceholder}
              autoComplete="off"
              autoCapitalize="none"
            />
            <button type="submit" className="block" disabled={!typedName.trim()}>
              {t.capture.useTypedName}
            </button>
          </form>

          {usageLine}
          {!unknown && (
            <button type="button" className="link block" onClick={startOver}>
              {t.capture.startOver}
            </button>
          )}
        </>
      )}

      {inForm && choice !== null && (
        <>
          <div className="card">
            <div className="small muted">{t.capture.confirmedAs}</div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{choiceLabel(choice)}</div>
            {choice.kind === "candidate" && (
              <div className="italic muted small">
                {choice.candidate.scientific_name}
                {choice.candidate.cultivar && ` · ${t.capture.cultivar} ‘${choice.candidate.cultivar}’`}
              </div>
            )}
            {phase === "confirmed" && !plantSaved && (
              <button type="button" className="link small" style={{ marginTop: 4 }} onClick={pickAnother}>
                {t.capture.changeChoice}
              </button>
            )}
          </div>

          <p className="small muted">{firstGps ? t.capture.gpsFound : t.capture.gpsMissing}</p>

          <RecordForm
            initial={initialRecord(choice)}
            onSubmit={save}
            submitLabel={t.record.savePlant}
            submitting={phase === "saving"}
            canSubmit={profile.status === "ready"}
          >
            <ProfileStatus state={profile} onRetry={() => profileReq && startProfile(profileReq)} />
            {saveError && <Banner kind="error">{saveError}</Banner>}
          </RecordForm>

          <div style={{ marginTop: 12 }}>{usageLine}</div>
          {phase === "confirmed" && !plantSaved && (
            <button type="button" className="link block" onClick={startOver}>
              {t.capture.startOver}
            </button>
          )}
        </>
      )}
    </div>
  );
}
