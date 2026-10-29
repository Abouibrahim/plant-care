// Tree tags (Phase 9): a sheet of QR tags on A4, 4 × 5 at 40 × 50 mm, for the plants the Plants
// screen showed (its site filter and search come in the address) or for one plant (`ids`). Each QR
// code holds the app's /t/<code> link; pointing the phone's camera at it opens the plant. A tap on a
// tag leaves it out of the print. Loaded lazily with the QR encoder.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Printer } from "lucide-react";
import { correction, generate } from "lean-qr";
import { toSvgPath } from "lean-qr/extras/svg";
import { lang, t } from "../i18n";
import { listPlants } from "../lib/db";
import { formatTagCode, tagCode, tagUrl } from "../lib/map";
import { matchesQuery } from "../lib/plantSearch";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { SITES, type PlantWithSpecies, type Site } from "../types";

/** Modules of white around the code, as the QR standard asks, so a scanner finds its edge. */
const QUIET_ZONE = 4;

function QrCode({ text, label }: { text: string; label: string }) {
  // Correction Q: about a quarter of the code can be dirty or scratched and it still reads.
  const code = useMemo(() => generate(text, { minCorrectionLevel: correction.Q }), [text]);
  const side = code.size + 2 * QUIET_ZONE;
  return (
    <svg className="qr" viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${side} ${side}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={side} height={side} fill="#fff" />
      <path d={toSvgPath(code)} fill="#000" />
    </svg>
  );
}

function commonName(plant: PlantWithSpecies): string {
  const names = plant.species?.common_names;
  return (lang === "fr" ? names?.fr || names?.en : names?.en) ?? plant.species?.scientific_name ?? "";
}

export default function TagsScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [plants, setPlants] = useState<PlantWithSpecies[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    listPlants()
      .then((rows) => {
        if (active) setPlants(rows);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t.errors.generic);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const ids = params.get("ids")?.split(",").filter(Boolean) ?? null;
  const siteParam = params.get("site");
  const site = siteParam && (SITES as string[]).includes(siteParam) ? (siteParam as Site) : null;
  const q = (params.get("q") ?? "").trim().toLowerCase();
  // The order of the Plants list (newest first) would scatter a row of trees; tags print by site, zone and tag.
  const chosen = (plants ?? [])
    .filter((p) => (ids ? ids.includes(p.id) : (site === null || p.site === site) && matchesQuery(p, q)))
    .sort((a, b) => a.site.localeCompare(b.site) || a.zone.localeCompare(b.zone) || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const printing = chosen.filter((p) => !skipped.has(p.id));
  const origin = window.location.origin;

  function toggle(id: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function print() {
    // The QR codes are drawn already; the fonts must be too, or the first tags print in a fallback face.
    await document.fonts.ready.catch(() => undefined);
    requestAnimationFrame(() => window.print());
  }

  function back() {
    // Back to where the sheet was opened from (the plant or the list); a tag link opened cold has no history.
    if (window.history.length > 1) navigate(-1);
    else navigate("/plants");
  }

  return (
    <div className="screen tags-screen">
      <div className="screen-header no-print">
        <button type="button" className="btn icon-btn" onClick={back} aria-label={t.common.back}>
          <ChevronLeft size={24} aria-hidden />
        </button>
        <h1>{t.tags.title}</h1>
        <button type="button" className="primary small" onClick={() => void print()} disabled={printing.length === 0}>
          <Printer size={18} aria-hidden />
          {t.tags.print}
        </button>
      </div>

      {error && (
        <Banner kind="error">
          <div className="row between wrap">
            <span className="grow">{error}</span>
            <button
              type="button"
              className="link small"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              {t.common.retry}
            </button>
          </div>
        </Banner>
      )}

      {plants === null && !error ? (
        <div className="center">
          <Spinner label={t.common.loading} />
        </div>
      ) : plants !== null && chosen.length === 0 ? (
        <p className="center muted">
          {t.tags.none} <Link to="/plants">{t.tags.toPlants}</Link>
        </p>
      ) : plants !== null ? (
        <>
          <div className="no-print">
            <p className="small" style={{ marginTop: 0 }}>
              {t.tags.summary(printing.length, skipped.size)}
            </p>
            <p className="small muted">{t.tags.hint}</p>
          </div>
          <div className="tag-sheet">
            <div className="calibration">
              <span className="calibration-bar" aria-hidden />
              <span>{t.tags.calibration}</span>
            </div>
            <div className="tag-grid">
              {chosen.map((p) => {
                const code = tagCode(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    className={`tree-tag ${skipped.has(p.id) ? "skipped" : ""}`}
                    // Pressed means printed; the name stays the same whichever way it is toggled.
                    aria-pressed={!skipped.has(p.id)}
                    aria-label={t.tags.tagOf(p.tag)}
                    onClick={() => toggle(p.id)}
                  >
                    <QrCode text={tagUrl(origin, p.id)} label={p.tag} />
                    <span className="tree-tag-name">{p.tag}</span>
                    <span className="tree-tag-species">{commonName(p)}</span>
                    <span className="tree-tag-place">
                      {t.site[p.site]}
                      {p.zone.trim() ? ` · ${p.zone}` : ""}
                    </span>
                    <span className="tree-tag-code">{formatTagCode(code)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
