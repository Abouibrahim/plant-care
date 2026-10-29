// Check before planting: a species, typed by name or already in the library, weighed by /api/check
// against the sites and the plants already recorded. A name not yet in the library goes through
// /api/profile first and stays in it as a species with no plant ("not planted yet"). The check is
// saved to planting_checks under an id made on the phone, even when the screen was left while
// Claude answered; a stored check (?check=) opens read-only with "Check again".
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { SiteLabel } from "../components/TypeIcon";
import { lang, t } from "../i18n";
import { api, ApiError } from "../lib/api";
import { storedCheck } from "../lib/check";
import { ChecksUnavailable, emptyZones, getCheck, getSpecies, insertCheck, loadZones, newId } from "../lib/db";
import {
  CHECK_MAX_NOTE_CHARS,
  CHECK_MAX_ZONE_CHARS,
  isRefusal,
  SITES,
  type PlantingCheckRow,
  type Site,
  type Species,
  type Usage,
  type ZoneLists,
} from "../types";
import { VerdictCard } from "./check/VerdictCard";

type Phase = "loading" | "form" | "profiling" | "checking" | "result";
type SaveState = "saving" | "saved" | "failed" | "unavailable";

/** The check on screen: one just made (with its save state) or one read back (save null). */
interface Shown {
  row: PlantingCheckRow;
  save: SaveState | null;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 0) return t.errors.network;
    return err.message || t.errors.generic;
  }
  if (err instanceof Error && err.message) return err.message;
  return t.errors.generic;
}

/** A check whose save failed or is still out gets one more try before it leaves the screen (the id makes it safe). */
function retryUnsaved(shown: Shown | null) {
  if (shown?.save === "failed" || shown?.save === "saving") void insertCheck(shown.row).catch(() => undefined);
}

function isSite(v: string | null): v is Site {
  return v === "farm" || v === "backyard";
}

function speciesLabel(s: Species): string {
  return s.common_names.en || s.scientific_name;
}

/** Keyed on the query string, so "Check this one" and "Check another plant" start from a clean screen. */
export function CheckRoute() {
  const { search } = useLocation();
  return <CheckScreen key={search} />;
}

function CheckScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const speciesId = params.get("species");
  const checkId = params.get("check");
  const siteParam = params.get("site");

  const [phase, setPhase] = useState<Phase>(speciesId ? "loading" : "form");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [name, setName] = useState(params.get("name") ?? "");
  // The binomial of an alternative opened with "Check this one": the profile is looked up by it
  // (free when the species is in the library) until the grower edits the name.
  const [scientific, setScientific] = useState(params.get("sci") ?? "");
  const [site, setSite] = useState<Site | null>(isSite(siteParam) ? siteParam : null);
  const [zone, setZone] = useState("");
  const [note, setNote] = useState((params.get("note") ?? "").slice(0, CHECK_MAX_NOTE_CHARS));
  const [zones, setZones] = useState<ZoneLists>(emptyZones);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ text: string; usage: Usage } | null>(null);
  /** A profile call that spent tokens: a new profile, or one written and then matched to a species already kept. */
  const [profileCall, setProfileCall] = useState<{ usage: Usage; created: boolean } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const mountedRef = useRef(true);
  // Stops the profile lookups after a lost reply when the screen is left.
  const leftRef = useRef(new AbortController());
  // The check on screen, for the one more save given to it when the screen is left unsaved.
  const shownRef = useRef<Shown | null>(null);

  useEffect(() => {
    shownRef.current = shown;
  });

  useEffect(() => {
    const mounted = mountedRef;
    const latest = shownRef;
    const left = leftRef;
    mounted.current = true;
    if (left.current.signal.aborted) left.current = new AbortController(); // remounted (StrictMode)
    return () => {
      mounted.current = false;
      left.current.abort();
      // Left with a save that failed: one more try on the way out, since the check was paid for.
      retryUnsaved(latest.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadZones()
      .then((z) => {
        if (active) setZones(z);
      })
      .catch(() => undefined); // without the Settings lists the zone is typed by hand
    if (speciesId) {
      Promise.all([getSpecies(speciesId), checkId ? getCheck(checkId) : Promise.resolve(null)])
        .then(([s, row]) => {
          if (!active) return;
          if (!s) {
            setLoadError(t.species.notFound);
            return;
          }
          setSpecies(s);
          const result = row ? storedCheck(row.result) : null;
          if (checkId && (!row || !result || row.species_id !== s.id)) {
            setLoadError(t.check.missing);
            return;
          }
          if (row && result) {
            setShown({ row: { ...row, result }, save: null });
            setSite(row.site);
            setZone(row.zone);
            setNote(row.note);
            setPhase("result");
          } else setPhase("form");
        })
        .catch((err: unknown) => {
          if (active) setLoadError(`${t.check.loadFailed}: ${describeError(err)}`);
        });
    }
    return () => {
      active = false;
    };
  }, [speciesId, checkId]);

  const busy = phase === "profiling" || phase === "checking";
  const zoneChips = site ? zones[site] : [];

  /** The save state of one check; a late answer for a check no longer on screen changes nothing. */
  function setSave(id: string, save: SaveState) {
    if (!mountedRef.current) return;
    setShown((prev) => (prev && prev.row.id === id ? { ...prev, save } : prev));
  }

  async function save(row: PlantingCheckRow) {
    setSave(row.id, "saving");
    try {
      await insertCheck(row);
      setSave(row.id, "saved");
    } catch (err) {
      const unavailable = err instanceof ChecksUnavailable;
      // Failed after the screen was left: one more try, as the clean-up gives a failed save.
      if (!mountedRef.current && !unavailable) void insertCheck(row).catch(() => undefined);
      setSave(row.id, unavailable ? "unavailable" : "failed");
    }
  }

  async function run(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    setRefusal(null);
    let target = species;
    try {
      if (!target) {
        const typed = name.replace(/\s+/g, " ").trim();
        if (!typed && !scientific) return;
        setPhase("profiling");
        const res = await api.profile(
          scientific ? { scientific_name: scientific, site: site ?? undefined } : { name: typed, site: site ?? undefined },
          { signal: leftRef.current.signal },
        );
        if (!mountedRef.current) return; // left: a new profile stays in the library, no check is run
        if (isRefusal(res)) {
          setRefusal({ text: `${t.check.profileRefusal}: ${res.refusal}`, usage: res });
          setPhase("form");
          return;
        }
        target = res.species;
        setSpecies(target);
        // A name that is not exactly a stored one is profiled, then matched to the species already kept
        // (created false, tokens spent): the usage shows either way.
        if (res.created || res.input_tokens + res.output_tokens > 0) setProfileCall({ usage: res, created: res.created });
      }

      setPhase("checking");
      const zoneSent = site ? zone.replace(/\s+/g, " ").trim() : "";
      const noteSent = note.replace(/\s+/g, " ").trim();
      const res = await api.check({ species_id: target.id, site: site ?? undefined, zone: zoneSent, note: noteSent, lang });
      if (isRefusal(res)) {
        if (mountedRef.current) {
          setRefusal({ text: `${t.check.refusal}: ${res.refusal}`, usage: res });
          setPhase("form");
        }
        return;
      }
      const result = storedCheck(res);
      if (!result) {
        if (mountedRef.current) {
          setError(`${t.check.failed}: ${t.errors.noData}`);
          setPhase("form");
        }
        return;
      }
      const row: PlantingCheckRow = {
        id: newId(),
        species_id: target.id,
        checked_at: new Date().toISOString(),
        site,
        zone: zoneSent,
        note: noteSent,
        result,
      };
      // Left while Claude was answering: the paid check is still kept.
      if (!mountedRef.current) {
        void insertCheck(row).catch(() => undefined);
        return;
      }
      setShown({ row, save: "saving" });
      setPhase("result");
      window.scrollTo({ top: 0 });
      void save(row);
    } catch (err) {
      if (mountedRef.current) {
        setError(`${t.check.failed}: ${describeError(err)}`);
        setPhase("form");
      }
    }
  }

  function checkAgain() {
    retryUnsaved(shown);
    setShown(null);
    setError(null);
    setRefusal(null);
    setPhase("form");
  }

  function checkAlternative(alternative: { name: string; scientific_name: string }) {
    const q = new URLSearchParams({ name: alternative.name });
    if (alternative.scientific_name) q.set("sci", alternative.scientific_name);
    if (site) q.set("site", site);
    if (note.trim()) q.set("note", note.trim());
    navigate(`/check?${q.toString()}`);
  }

  function another() {
    if (params.toString()) {
      navigate("/check");
      return;
    }
    // Already on the bare route: the key does not change, so reset by hand.
    setSpecies(null);
    setName("");
    setScientific("");
    setProfileCall(null);
    checkAgain();
  }

  const backTo = speciesId ? `/species/${speciesId}` : species ? `/species/${species.id}` : "/species";

  return (
    <div className="screen">
      <div className="screen-header">
        <Link to={backTo} className="btn icon-btn" aria-label={t.common.back}>
          <ChevronLeft size={24} aria-hidden />
        </Link>
        <h1>{t.check.title}</h1>
      </div>

      {phase === "loading" && !loadError && <Spinner label={t.check.loading} />}
      {loadError && (
        <>
          <Banner kind="error">{loadError}</Banner>
          <Link to="/species" className="btn block">
            {t.common.back}
          </Link>
        </>
      )}

      {!loadError && species && (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{t.check.checking(speciesLabel(species))}</div>
          <div className="italic muted small">
            {species.scientific_name}
            {species.cultivar && ` ‘${species.cultivar}’`}
          </div>
          {profileCall && (
            <div className="small muted" style={{ marginTop: 4 }}>
              {profileCall.created ? t.check.profileWritten : t.check.profileMatched} ·{" "}
              {t.capture.usage(profileCall.usage.input_tokens, profileCall.usage.output_tokens)}
            </div>
          )}
        </div>
      )}

      {!loadError && phase !== "loading" && phase !== "result" && (
        <form className="stack" onSubmit={(e) => void run(e)}>
          {!species && <p>{t.check.intro}</p>}
          {!species && (
            <label className="field">
              <span>{t.check.nameLabel}</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setScientific("");
                }}
                placeholder={t.check.namePlaceholder}
                autoComplete="off"
                autoCapitalize="none"
                disabled={busy}
              />
            </label>
          )}

          <div className="field">
            <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
              {t.check.siteLabel}
            </span>
            <div className="segmented" role="radiogroup" aria-label={t.check.siteLabel}>
              {SITES.map((s) => (
                <button type="button" key={s} role="radio" aria-checked={site === s} className={site === s ? "active" : ""} disabled={busy} onClick={() => setSite(s)}>
                  <SiteLabel site={s} size={18} />
                </button>
              ))}
              <button type="button" role="radio" aria-checked={site === null} className={site === null ? "active" : ""} disabled={busy} onClick={() => setSite(null)}>
                {t.check.undecided}
              </button>
            </div>
          </div>

          {site && (
            <label className="field">
              <span>
                {t.check.zoneLabel} ({t.common.optional})
              </span>
              {zoneChips.length > 0 && (
                <div className="chips" style={{ marginBottom: 6 }}>
                  {zoneChips.map((z) => (
                    <button type="button" key={z} className={`chip ${zone === z ? "active" : ""}`} disabled={busy} onClick={() => setZone(zone === z ? "" : z)}>
                      {z}
                    </button>
                  ))}
                </div>
              )}
              <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder={t.check.zonePlaceholder} maxLength={CHECK_MAX_ZONE_CHARS} disabled={busy} />
            </label>
          )}

          <label className="field">
            <span>
              {t.check.noteLabel} ({t.common.optional})
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.check.notePlaceholder} maxLength={CHECK_MAX_NOTE_CHARS} disabled={busy} />
          </label>

          {phase === "profiling" && <Spinner label={t.check.profiling} />}
          {phase === "checking" && <Spinner label={t.check.running} />}
          {error && <Banner kind="error">{error}</Banner>}
          {refusal && (
            <Banner kind="error">
              <div>{refusal.text}</div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                {t.capture.usage(refusal.usage.input_tokens, refusal.usage.output_tokens)}
              </p>
            </Banner>
          )}

          <button type="submit" className="primary block" disabled={busy || (!species && !name.trim() && !scientific)}>
            {t.check.run}
          </button>
        </form>
      )}

      {!loadError && phase === "result" && shown && species && (
        <>
          <VerdictCard
            check={shown.row.result}
            site={shown.row.site}
            zone={shown.row.zone}
            note={shown.row.note}
            checkedAt={shown.row.checked_at}
            onAlternative={checkAlternative}
          />
          {shown.save === "saving" && <p className="small muted">{t.check.saving}</p>}
          {shown.save === "failed" && (
            <Banner kind="warn">
              <div className="row between wrap">
                <span className="grow">{t.check.saveFailed}</span>
                <button type="button" className="small" onClick={() => void save(shown.row)}>
                  {t.check.saveAgain}
                </button>
              </div>
            </Banner>
          )}
          {shown.save === "unavailable" && <Banner kind="warn">{t.check.unavailable}</Banner>}
          {shown.row.result.verdict !== "avoid" && <p className="small muted">{t.check.whenPlanted}</p>}

          <div className="stack">
            <button type="button" className="block" onClick={checkAgain}>
              {t.check.again}
            </button>
            <Link to={`/species/${species.id}`} className="btn block">
              {t.check.openProfile}
            </Link>
            <button type="button" className="link block" onClick={another}>
              {t.check.another}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
