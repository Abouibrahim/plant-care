import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { t } from "../i18n";
import { getPlant, insertPhoto, listPhotos, photoPath, updatePlant, uploadPhoto } from "../lib/db";
import { prepareImage } from "../lib/image";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { PhotoImg } from "../components/PhotoImg";
import { RecordForm, type RecordValues } from "../components/RecordForm";
import { CalendarSection, GuildUsesSection, HealthSection, NeedsSection } from "../components/profile";
import type { Photo, PlantWithSpecies } from "../types";

type TabKey = keyof typeof t.plant.tabs;
const TABS: TabKey[] = ["needs", "calendar", "health", "guild", "journal"];

interface Loaded {
  id: string;
  plant: PlantWithSpecies | null;
  photos: Photo[];
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

/** Full months between a YYYY-MM-DD date and today. */
function monthsSince(iso: string, today: Date = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  return Math.max(0, months);
}

/** YYYY-MM-DD as a local date string, without a timezone shift. */
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString();
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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<TabKey>("needs");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const error = loadError?.id === id ? loadError.message : null;
  const current = loaded?.id === id ? loaded : null;
  const loading = !error && current === null;
  const plant = current?.plant ?? null;
  const photos = current?.photos ?? [];

  function retry() {
    setLoadError(null);
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
    } catch (err) {
      setActionError(message(err));
    } finally {
      setSaving(false);
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
      const takenAt = prepared.takenAt ? new Date(prepared.takenAt) : new Date();
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
          <Link to="/plants" className="btn small">
            {t.common.back}
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
  const ageMonths = plant.planted_on ? monthsSince(plant.planted_on) : null;
  const busy = saving || uploading;

  return (
    <div className="screen">
      <div className="hero">
        <PhotoImg path={newest?.storage_path} alt={plant.tag} />
      </div>

      <div className="screen-header">
        <Link to="/plants" className="btn small">
          {t.common.back}
        </Link>
        <h1>{plant.tag}</h1>
      </div>

      <p>
        {t.plant.quantity(plant.quantity)} · {t.site[plant.site]}
        {plant.zone && ` · ${plant.zone}`}
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

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button type="button" className="small" onClick={() => setEditing((v) => !v)} disabled={busy}>
          {editing ? t.common.cancel : t.plant.editRecord}
        </button>
        <button type="button" className="small" onClick={() => fileRef.current?.click()} disabled={busy}>
          {t.plant.addJournalPhoto}
        </button>
        <Link to={`/species/${species.id}`} className="btn small">
          {t.plant.profileLink}
        </Link>
        <button type="button" className="small" disabled>
          {t.plant.diagnose}
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
          <p className="muted small">{t.plant.tasksLater}</p>
          <CalendarSection species={species} plantedOn={plant.planted_on} />
        </>
      )}
      {tab === "health" && <HealthSection species={species} />}
      {tab === "guild" && <GuildUsesSection species={species} />}
      {tab === "journal" && <Journal photos={photos} tag={plant.tag} />}
    </div>
  );
}

function Journal({ photos, tag }: { photos: Photo[]; tag: string }) {
  if (photos.length === 0) {
    return <p className="center muted">{t.plant.journalEmpty}</p>;
  }
  return (
    <div>
      {photos.map((photo) => {
        const kindLabel = t.plant.photoKinds[photo.kind];
        const top = photo.kind === "identify" ? topCandidateName(photo.ai_result) : null;
        const pillClass = photo.kind === "problem" ? "pill warn" : photo.kind === "identify" ? "pill accent" : "pill";
        return (
          <div className="card row" key={photo.id}>
            <PhotoImg path={photo.storage_path} alt={`${tag} · ${kindLabel}`} className="photo thumb" />
            <div className="grow">
              <div>{new Date(photo.taken_at).toLocaleDateString()}</div>
              <span className={pillClass}>{kindLabel}</span>
              {top && <div className="muted small italic">{top}</div>}
              {photo.note && <div className="small">{photo.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
