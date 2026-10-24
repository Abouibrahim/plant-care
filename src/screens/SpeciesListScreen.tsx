import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CircleCheck, Leaf, Sprout, TriangleAlert } from "lucide-react";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { t } from "../i18n";
import { listSpecies, speciesPlantCounts } from "../lib/db";
import type { Species } from "../types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; species: Species[]; counts: Map<string, number> };

export function SpeciesListScreen() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listSpecies(), speciesPlantCounts()])
      .then(([species, counts]) => {
        if (active) setState({ kind: "ready", species, counts });
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

  return (
    <div className="screen">
      <h1>{t.species.title}</h1>

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

      {state.kind === "ready" &&
        state.species.map((s) => <SpeciesCard key={s.id} species={s} count={state.counts.get(s.id) ?? 0} />)}
    </div>
  );
}

function SpeciesCard({ species, count }: { species: Species; count: number }) {
  const name = species.common_names.en || species.scientific_name;
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
            {t.species.plantsUsing(count)}
          </span>
          <span className={`pill ${species.confirmed ? "ok" : "warn"}`}>
            {species.confirmed ? <CircleCheck size={14} aria-hidden /> : <TriangleAlert size={14} aria-hidden />}
            {species.confirmed ? t.species.confirmed : t.species.unconfirmed}
          </span>
        </div>
      </div>
    </Link>
  );
}
