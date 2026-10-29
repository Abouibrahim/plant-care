// A scanned tree tag (Phase 9): /t/<code> finds the plant whose id starts with the code and opens
// its page in place of this address, so Back does not land here again. A code no plant carries any
// more (a deleted plant) says so; two plants sharing a code, which is all but impossible, are listed.
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { QrCode } from "lucide-react";
import { t } from "../i18n";
import { findPlantsByTagCode } from "../lib/db";
import { parseTagCode } from "../lib/map";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { SiteLabel } from "../components/TypeIcon";
import type { Plant } from "../types";

type Found = Array<Pick<Plant, "id" | "tag" | "site">>;

export function TagRoute() {
  const { code: raw } = useParams<{ code: string }>();
  const code = parseTagCode(raw);
  const [found, setFound] = useState<{ code: string; plants: Found } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!code) return;
    let active = true;
    findPlantsByTagCode(code)
      .then((plants) => {
        if (!active) return;
        setFound({ code, plants });
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t.errors.generic);
      });
    return () => {
      active = false;
    };
  }, [code, attempt]);

  const plants = found && found.code === code ? found.plants : null;
  if (plants && plants.length === 1) return <Navigate to={`/plants/${plants[0].id}`} replace />;

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>{t.tagRoute.title}</h1>
      </div>
      {!code ? (
        <TagMessage text={t.tagRoute.invalid} />
      ) : error ? (
        <Banner kind="error">
          <div className="row between wrap">
            <span className="grow">{error}</span>
            <button type="button" className="link small" onClick={() => setAttempt((n) => n + 1)}>
              {t.common.retry}
            </button>
          </div>
        </Banner>
      ) : plants === null ? (
        <div className="center">
          <Spinner label={t.tagRoute.looking} />
        </div>
      ) : plants.length === 0 ? (
        <TagMessage text={t.tagRoute.notFound} />
      ) : (
        <>
          <p>{t.tagRoute.several}</p>
          {plants.map((p) => (
            <Link key={p.id} to={`/plants/${p.id}`} replace className="card tappable row between">
              <strong>{p.tag}</strong>
              <SiteLabel site={p.site} size={14} />
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

function TagMessage({ text }: { text: string }) {
  return (
    <div className="center muted empty-state">
      <span className="head-icon" aria-hidden>
        <QrCode size={24} />
      </span>
      <p>{text}</p>
      <Link to="/plants" className="btn small">
        {t.tagRoute.toPlants}
      </Link>
    </div>
  );
}
