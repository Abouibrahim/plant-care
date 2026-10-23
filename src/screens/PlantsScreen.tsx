import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { latestPhotos, listPlants } from "../lib/db";
import { Banner } from "../components/Banner";
import { PhotoImg } from "../components/PhotoImg";
import { Spinner } from "../components/Spinner";
import { SITES, type Photo, type PlantWithSpecies, type Site } from "../types";

type Filter = "all" | Site;

const FILTER_KEY = "plantcare.plantsFilter";

function readFilter(): Filter {
  try {
    const stored = localStorage.getItem(FILTER_KEY);
    if (stored && (SITES as string[]).includes(stored)) return stored as Site;
  } catch {
    // storage blocked or unavailable: fall back to the default
  }
  return "all";
}

function writeFilter(filter: Filter) {
  try {
    localStorage.setItem(FILTER_KEY, filter);
  } catch {
    // storage blocked: the filter still applies for this visit
  }
}

/** Case-insensitive match against tag, zone, common names and scientific name; q is already lower-cased. */
function matchesQuery(plant: PlantWithSpecies, q: string): boolean {
  if (!q) return true;
  const names = plant.species?.common_names;
  const fields = [plant.tag, plant.zone, names?.en, names?.fr, names?.ar_latin, plant.species?.scientific_name];
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

export function PlantsScreen() {
  const [plants, setPlants] = useState<PlantWithSpecies[]>([]);
  const [photos, setPhotos] = useState<Map<string, Photo>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>(readFilter);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const rows = await listPlants();
      if (!active) return;
      setPlants(rows);
      setLoading(false);
      try {
        const map = await latestPhotos(rows.map((p) => p.id));
        if (active) setPhotos(map);
      } catch {
        // thumbnails are optional: the cards render without them
      }
    }
    load().catch((err: unknown) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : t.errors.generic);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  function chooseFilter(next: Filter) {
    setFilter(next);
    writeFilter(next);
  }

  const q = query.trim().toLowerCase();
  const visible = plants.filter((p) => (filter === "all" || p.site === filter) && matchesQuery(p, q));
  const filtering = filter !== "all" || q !== "";

  const filters: Array<{ value: Filter; label: string }> = [
    { value: "all", label: t.common.all },
    ...SITES.map((s) => ({ value: s, label: t.site[s] })),
  ];

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>{t.plants.title}</h1>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.plants.searchPlaceholder}
        aria-label={t.common.search}
        autoComplete="off"
        enterKeyHint="search"
        style={{ marginBottom: 12 }}
      />

      <div className="chips" role="group" aria-label={t.record.site}>
        {filters.map((f) => (
          <button
            type="button"
            key={f.value}
            className={`chip ${filter === f.value ? "active" : ""}`}
            aria-pressed={filter === f.value}
            onClick={() => chooseFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <Banner kind="error">
          <div className="row between wrap">
            <span className="grow">{error}</span>
            <button type="button" className="link small" onClick={retry}>
              {t.common.retry}
            </button>
          </div>
        </Banner>
      )}

      {loading ? (
        <div className="center">
          <Spinner label={t.common.loading} />
        </div>
      ) : plants.length === 0 ? (
        !error && <div className="center muted">{t.plants.empty}</div>
      ) : visible.length === 0 ? (
        <div className="center muted">{filtering ? t.plants.emptyFiltered : t.plants.empty}</div>
      ) : (
        <>
          <p className="muted small">{t.plants.count(visible.length)}</p>
          {visible.map((p) => (
            <Link key={p.id} to={`/plants/${p.id}`} className="card tappable row">
              <PhotoImg className="photo thumb" path={photos.get(p.id)?.storage_path} alt={p.tag} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {p.tag}
                  {p.quantity > 1 && <span className="muted"> ×{p.quantity}</span>}
                </div>
                <div>{p.species?.common_names.en}</div>
                <div className="italic muted small">{p.species?.scientific_name}</div>
                <div style={{ marginTop: 4 }}>
                  <span className="pill">{t.site[p.site]}</span>
                  {p.zone.trim() !== "" ? <span className="pill">{p.zone}</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
