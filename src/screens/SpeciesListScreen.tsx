import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CircleCheck, ClipboardCheck, Leaf, Sprout, TriangleAlert } from "lucide-react";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { t } from "../i18n";
import { VERDICT_PILL } from "../lib/check";
import { latestChecks, listSpecies, speciesPlantCounts } from "../lib/db";
import type { CheckSummary, Species } from "../types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; species: Species[]; counts: Map<string, number>; checks: Map<string, CheckSummary> };

type Filter = "all" | "planted" | "notPlanted";
const FILTERS: Filter[] = ["all", "planted", "notPlanted"];

export function SpeciesListScreen() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    // The verdicts only dress the cards: without the planting_checks table (or on a failed read) none show.
    const checks = latestChecks().catch(() => new Map<string, CheckSummary>());
    Promise.all([listSpecies(), speciesPlantCounts(), checks])
      .then(([species, counts, latest]) => {
        if (active) setState({ kind: "ready", species, counts, checks: latest });
      })
      .catch((err: unknown) => {
        if (active) setState({ kind: "error", message: err instanceof Error ? err.message : t.errors.generic });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }

  const counts = state.kind === "ready" ? state.counts : new Map<string, number>();
  const all = state.kind === "ready" ? state.species : [];
  const planted = all.filter((s) => (counts.get(s.id) ?? 0) > 0);
  const lists: Record<Filter, Species[]> = { all, planted, notPlanted: all.filter((s) => (counts.get(s.id) ?? 0) === 0) };
  const shown = lists[filter];

  return (
    <div className="screen">
      <h1>{t.species.title}</h1>

      <Link to="/check" className="btn primary block" style={{ marginBottom: 12 }}>
        <ClipboardCheck size={18} aria-hidden />
        {t.check.open}
      </Link>

      {state.kind === "loading" && <Spinner label={t.common.loading} />}

      {state.kind === "error" && (
        <Banner kind="error">
          <div className="row between wrap">
            <span className="grow">{state.message}</span>
            <button type="button" className="small" onClick={retry}>
              {t.common.retry}
            </button>
          </div>
        </Banner>
      )}

      {state.kind === "ready" && state.species.length === 0 && (
        <div className="center muted empty-state">
          <span className="head-icon" aria-hidden>
            <BookOpen size={24} />
          </span>
          <p>{t.species.libraryEmpty}</p>
        </div>
      )}

      {state.kind === "ready" && state.species.length > 0 && (
        <>
          <div className="chips" role="group" aria-label={t.species.title}>
            {FILTERS.map((f) => (
              <button type="button" key={f} className={`chip ${filter === f ? "active" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t.check.filters[f]}
                <span className="chip-count">{lists[f].length}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="center muted">{t.check.filteredEmpty}</p>}
          {shown.map((s) => (
            <SpeciesCard key={s.id} species={s} count={counts.get(s.id) ?? 0} check={state.checks.get(s.id) ?? null} />
          ))}
        </>
      )}
    </div>
  );
}

function SpeciesCard({ species, count, check }: { species: Species; count: number; check: CheckSummary | null }) {
  const name = species.common_names.en || species.scientific_name;
  const verdict = check?.verdict;
  return (
    <Link to={`/species/${species.id}`} className="card tappable row" style={{ alignItems: "flex-start" }}>
      <span className="head-icon" aria-hidden>
        <Leaf size={22} />
      </span>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div className="muted">
          <span className="italic">{species.scientific_name}</span>
          {species.cultivar && <span>{` '${species.cultivar}'`}</span>}
        </div>
        {species.common_names.ar && (
          <div>
            <span className="arabic">{species.common_names.ar}</span>
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          <span className="pill">
            <Sprout size={14} aria-hidden />
            {count > 0 ? t.species.plantsUsing(count) : t.check.notPlantedPill}
          </span>
          {verdict && (
            <span className={VERDICT_PILL[verdict]}>
              <ClipboardCheck size={14} aria-hidden />
              {t.check.verdicts[verdict]}
            </span>
          )}
          <span className={`pill ${species.confirmed ? "ok" : "warn"}`}>
            {species.confirmed ? <CircleCheck size={14} aria-hidden /> : <TriangleAlert size={14} aria-hidden />}
            {species.confirmed ? t.species.confirmed : t.species.unconfirmed}
          </span>
        </div>
      </div>
    </Link>
  );
}
