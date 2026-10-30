import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapPin, MapPinOff, Printer, Search, Sprout, X } from "lucide-react";
import { t } from "../i18n";
import { localIsoDate } from "../lib/dates";
import { latestPhotos, listDueTasks, listPlants } from "../lib/db";
import { hasPosition } from "../lib/map";
import { matchesQuery } from "../lib/plantSearch";
import { Banner } from "../components/Banner";
import { PhotoImg } from "../components/PhotoImg";
import { Spinner } from "../components/Spinner";
import { SiteLabel } from "../components/TypeIcon";
import { SITES, type LatestPhoto, type PlantWithSpecies, type Site, type TaskWithPlant } from "../types";
import type { DueStatus } from "./map/PlantMap";

// Leaflet loads with the first map, not with the app.
const PlantMap = lazy(() => import("./map/PlantMap"));

type Filter = "all" | Site;
type View = "list" | "map";

const FILTER_KEY = "plantcare.plantsFilter";
const VIEW_KEY = "plantcare.plantsView";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
  } catch {
    // storage blocked or unavailable: fall back to the default
  }
  return fallback;
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice still applies for this visit
  }
}

export function PlantsScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // "Show on map" from a plant's page: the map, every site, centred on that plant.
  const focusId = params.get("focus");
  const [plants, setPlants] = useState<PlantWithSpecies[]>([]);
  const [photos, setPhotos] = useState<Map<string, LatestPhoto>>(() => new Map());
  // The tasks behind the pin colours, keyed by the day and the load they belong to; rows null when they failed.
  const [dueResult, setDueResult] = useState<{ key: string; rows: TaskWithPlant[] | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>(() => (focusId ? "all" : readStored<Filter>(FILTER_KEY, ["all", ...SITES], "all")));
  const [view, setView] = useState<View>(() => (focusId ? "map" : readStored<View>(VIEW_KEY, ["list", "map"], "list")));
  const [missingOnly, setMissingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const today = localIsoDate();

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

  const [dueAttempt, setDueAttempt] = useState(0);
  const dueKey = `${today}:${attempt}:${dueAttempt}`;
  useEffect(() => {
    if (view !== "map") return;
    let active = true;
    // What is due colours the pins; without it they show plain, the card says so, and the map still works.
    listDueTasks(today)
      .then((rows) => {
        if (active) setDueResult({ key: dueKey, rows });
      })
      .catch(() => {
        if (active) setDueResult({ key: dueKey, rows: null });
      });
    return () => {
      active = false;
    };
  }, [view, today, dueKey]);
  const dueStatus: DueStatus = dueResult?.key !== dueKey ? "loading" : dueResult.rows ? "ready" : "failed";
  const due = dueResult?.key === dueKey ? (dueResult.rows ?? []) : [];

  function retry() {
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  function chooseFilter(next: Filter) {
    setFilter(next);
    writeStored(FILTER_KEY, next);
  }

  function chooseView(next: View) {
    setView(next);
    writeStored(VIEW_KEY, next);
    // The "no position" list belongs to the list view; the map shows every plant the chips and search keep.
    if (next === "map") setMissingOnly(false);
  }

  function showMissing() {
    setMissingOnly(true);
    chooseView("list");
  }

  /** The tag sheet for what the list shows: the site and the search travel in the address, the "no position" list as ids. */
  function printTags() {
    const search = new URLSearchParams();
    if (filter !== "all") search.set("site", filter);
    if (query.trim()) search.set("q", query.trim());
    const ids = missingOnly ? visible.map((p) => p.id) : null;
    if (ids) search.set("ids", ids.join(","));
    const qs = search.toString();
    navigate(qs ? `/tags?${qs}` : "/tags");
  }

  const q = query.trim().toLowerCase();
  const shown = plants.filter((p) => (filter === "all" || p.site === filter) && matchesQuery(p, q));
  const visible = missingOnly ? shown.filter((p) => !hasPosition(p)) : shown;
  const filtering = filter !== "all" || q !== "" || missingOnly;

  const filters: Filter[] = ["all", ...SITES];

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>{t.plants.title}</h1>
        {plants.length > 0 && (
          <button type="button" className="icon-btn" onClick={printTags} aria-label={t.plants.printTags} title={t.plants.printTags}>
            <Printer size={22} aria-hidden />
          </button>
        )}
      </div>

      <div className="input-icon" style={{ marginBottom: 12 }}>
        <Search size={20} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.plants.searchPlaceholder}
          aria-label={t.common.search}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="chips" role="group" aria-label={t.record.site} style={{ marginBottom: 0 }}>
          {filters.map((f) => (
            <button
              type="button"
              key={f}
              className={`chip ${filter === f ? "active" : ""}`}
              aria-pressed={filter === f}
              onClick={() => chooseFilter(f)}
            >
              {f === "all" ? t.common.all : <SiteLabel site={f} />}
            </button>
          ))}
        </div>
        <div className="segmented view-switch" role="radiogroup" aria-label={t.plants.view}>
          {(["list", "map"] as const).map((v) => (
            <button type="button" key={v} role="radio" aria-checked={view === v} className={view === v ? "active" : ""} onClick={() => chooseView(v)}>
              {v === "list" ? t.plants.viewList : t.plants.viewMap}
            </button>
          ))}
        </div>
      </div>

      {missingOnly && view === "list" && (
        <div className="chips" style={{ marginTop: -4 }}>
          <button type="button" className="chip active" onClick={() => setMissingOnly(false)} aria-label={t.plants.noPositionClear}>
            <MapPinOff size={14} aria-hidden />
            {t.plants.noPosition}
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

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
        !error && (
          <div className="center muted empty-state">
            <span className="head-icon" aria-hidden>
              <Sprout size={24} />
            </span>
            <p>{t.plants.empty}</p>
          </div>
        )
      ) : view === "map" ? (
        <Suspense
          fallback={
            <div className="center">
              <Spinner label={t.map.loading} />
            </div>
          }
        >
          <PlantMap
            plants={shown}
            photos={photos}
            due={due}
            dueStatus={dueStatus}
            today={today}
            filtering={filter !== "all" || q !== ""}
            focusId={focusId}
            onShowMissing={showMissing}
            onRetryDue={() => setDueAttempt((n) => n + 1)}
          />
        </Suspense>
      ) : visible.length === 0 ? (
        <div className="center muted">{filtering ? t.plants.emptyFiltered : t.plants.empty}</div>
      ) : (
        <>
          <p className="muted small">{t.plants.count(visible.length)}</p>
          {visible.map((p) => (
            <Link key={p.id} to={`/plants/${p.id}`} className="card tappable row">
              <PhotoImg className="photo thumb" size="thumb" path={photos.get(p.id)?.storage_path} alt={p.tag} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {p.tag}
                  {p.quantity > 1 && <span className="muted"> ×{p.quantity}</span>}
                </div>
                <div>{p.species?.common_names.en}</div>
                <div className="italic muted small">{p.species?.scientific_name}</div>
                <div style={{ marginTop: 4 }}>
                  <span className="pill">
                    <SiteLabel site={p.site} size={14} />
                  </span>
                  {p.zone.trim() !== "" ? (
                    <span className="pill">
                      <MapPin size={14} aria-hidden />
                      {p.zone}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
