import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  CircleUser,
  CloudSun,
  Download,
  Info,
  Languages,
  LogOut,
  MapPin,
  Plus,
  Smartphone,
  Sprout,
  X,
  type LucideIcon,
} from "lucide-react";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { SiteLabel } from "../components/TypeIcon";
import { lang, LANGS, storeLang, t, type Lang } from "../i18n";
import { useAuth } from "../lib/auth-context";
import { localIsoDate } from "../lib/dates";
import {
  emptyZones,
  listWeather,
  loadWeatherSettings,
  loadZones,
  recentZones,
  saveWeatherSettings,
  saveZones,
  SettingsUnavailable,
  WeatherUnavailable,
} from "../lib/db";
import { exportPlantsCsv, exportTasksCsv, type ExportResult } from "../lib/export";
import { disablePush, enablePush, getPushState, PushError, type PushState } from "../lib/push";
import { TOWN } from "../lib/weather";
import { RAIN_SKIP_CHOICES, SITES, type Site, type WeatherDay, type WeatherSettings, type ZoneLists } from "../types";
import { APP_VERSION } from "../version";

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

/** A card heading: the section's icon on a tinted tile, the title, and anything at the right end. */
function CardHead({ icon: Icon, tone = "", title, children }: { icon: LucideIcon; tone?: string; title: string; children?: ReactNode }) {
  return (
    <div className="card-head">
      <span className={`head-icon ${tone}`} aria-hidden>
        <Icon size={22} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Turn the digest on or off on this phone, with the reason when it cannot be turned on. */
function RemindersCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = t.settings.reminders;

  useEffect(() => {
    let active = true;
    getPushState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState("unsupported");
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    if (busy || state === null) return;
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await disablePush() : await enablePush({ denied: s.denied, failed: s.failed }));
    } catch (err) {
      if (err instanceof PushError) setState(err.state);
      setError(`${state === "on" ? s.stopFailed : s.failed}: ${message(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const label: Record<PushState, string> = {
    on: s.on,
    off: s.off,
    blocked: s.blocked,
    unsupported: s.unsupported,
    "no-key": s.noKey,
  };
  const hint: Record<PushState, string> = {
    on: s.onHint,
    off: s.offHint,
    blocked: s.blockedHint,
    unsupported: s.unsupportedHint,
    "no-key": s.noKeyHint,
  };
  const pill = state === "on" ? "ok" : state === "off" ? "" : state === "blocked" ? "danger" : "warn";
  const canToggle = state === "on" || state === "off";

  return (
    <div className="card">
      <CardHead icon={Bell} tone="sun" title={s.title}>
        {state && <span className={`pill ${pill}`}>{label[state]}</span>}
      </CardHead>
      <p className="small">{s.body}</p>
      {state === null ? (
        <Spinner label={t.common.loading} />
      ) : (
        <>
          <p className="muted small">{hint[state]}</p>
          {error && <Banner kind="error">{error}</Banner>}
          {canToggle && (
            <button type="button" className={`block ${state === "on" ? "" : "primary"}`} onClick={() => void toggle()} disabled={busy}>
              {busy ? <Spinner label={s.working} /> : state === "on" ? s.turnOff : s.turnOn}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * English or French. `t` is a constant imported by every screen, so the choice is stored and the
 * app reloaded; the service worker serves the shell from its cache, so this works offline too.
 */
function LanguageCard() {
  const s = t.settings.language;
  const [error, setError] = useState<string | null>(null);

  function choose(next: Lang) {
    if (next === lang) return;
    if (!storeLang(next)) {
      setError(s.saveFailed);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="card">
      <CardHead icon={Languages} tone="water" title={s.title} />
      <p className="small">{s.body}</p>
      <div className="segmented" role="radiogroup" aria-label={s.title}>
        {LANGS.map((l) => (
          <button
            type="button"
            key={l}
            role="radio"
            lang={l}
            aria-checked={lang === l}
            className={lang === l ? "active" : ""}
            onClick={() => choose(l)}
          >
            {s.names[l]}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ marginTop: 10 }}>
          <Banner kind="error">{error}</Banner>
        </div>
      )}
    </div>
  );
}

const Z = t.settings.zones;

/**
 * The zone lists of the two sites, saved as one row of the settings table on every change. Zones
 * used on plants but not listed yet are offered as one-tap additions. Without the table (the ★ SQL
 * of PHASE5.md not run yet) the card shows the instruction instead of the lists.
 */
/** Weather (Phase 8): the rain skip and its threshold, the point the forecast is read for, the last fetch. */
function WeatherSettingsCard() {
  const W = t.weather;
  const [settings, setSettings] = useState<WeatherSettings | null>(null);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [latest, setLatest] = useState<WeatherDay | null | undefined>(undefined);
  const [weatherMissing, setWeatherMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadWeatherSettings()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof SettingsUnavailable) setSettingsMissing(true);
        else setError(message(err));
      });
    const today = localIsoDate();
    listWeather(today, today)
      .then((rows) => {
        if (active) setLatest(rows[0] ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        // A failed read says nothing about what is stored: show neither the point nor "not yet".
        if (err instanceof WeatherUnavailable) setWeatherMissing(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function change(next: WeatherSettings) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await saveWeatherSettings(next));
    } catch (err) {
      setError(`${W.saveFailed}: ${message(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const town = latest && latest.lat === TOWN.lat && latest.lng === TOWN.lng;
  return (
    <div className="card">
      <CardHead icon={CloudSun} tone="water" title={W.settingsTitle} />
      {weatherMissing && <Banner kind="warn">{W.unavailable}</Banner>}
      {settingsMissing && <Banner kind="warn">{t.settings.zones.missingTable}</Banner>}
      {settings && (
        <div className="stack">
          <div className="field">
            <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
              {W.rainSkipLabel}
            </span>
            <div className="segmented" role="radiogroup" aria-label={W.rainSkipLabel}>
              {[true, false].map((on) => (
                <button
                  type="button"
                  key={String(on)}
                  role="radio"
                  aria-checked={settings.rain_skip === on}
                  className={settings.rain_skip === on ? "active" : ""}
                  disabled={saving}
                  onClick={() => void change({ ...settings, rain_skip: on })}
                >
                  {on ? W.on : W.off}
                </button>
              ))}
            </div>
          </div>
          {settings.rain_skip && (
            <div className="field">
              <span className="small muted" style={{ display: "block", marginBottom: 4 }}>
                {W.thresholdLabel}
              </span>
              <div className="chips" role="group" aria-label={W.thresholdLabel}>
                {RAIN_SKIP_CHOICES.map((mm) => (
                  <button
                    type="button"
                    key={mm}
                    className={`chip ${settings.rain_mm === mm ? "active" : ""}`}
                    aria-pressed={settings.rain_mm === mm}
                    disabled={saving}
                    onClick={() => void change({ ...settings, rain_mm: mm })}
                  >
                    {mm} mm
                  </button>
                ))}
              </div>
              <p className="small" style={{ margin: 0 }}>
                {W.rainSkipBody(settings.rain_mm)}
              </p>
            </div>
          )}
        </div>
      )}
      {error && <Banner kind="error">{error}</Banner>}
      {!weatherMissing && latest !== undefined && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {latest ? (
            <>
              {town || latest.lat === null || latest.lng === null ? W.pointTown : W.pointFarm(latest.lat, latest.lng)}{" "}
              {W.lastFetch(new Date(latest.fetched_at).toLocaleString())}
            </>
          ) : (
            W.never
          )}
        </p>
      )}
      <p className="small muted" style={{ margin: "4px 0 0" }}>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          {W.credit}
        </a>
      </p>
    </div>
  );
}

function ZonesCard() {
  const [zones, setZones] = useState<ZoneLists | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<ZoneLists>(emptyZones);
  const [drafts, setDrafts] = useState<Record<Site, string>>({ backyard: "", farm: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadZones()
      .then((lists) => {
        if (active) setZones(lists);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof SettingsUnavailable) setMissing(true);
        else setError(`${Z.loadFailed}: ${message(err)}`);
      });
    Promise.all(SITES.map((site) => recentZones(site)))
      .then((lists) => {
        if (!active) return;
        const next = emptyZones();
        SITES.forEach((site, i) => {
          next[site] = lists[i] ?? [];
        });
        setUsed(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function save(site: Site, list: string[]) {
    if (!zones || saving) return;
    setSaving(true);
    setError(null);
    try {
      setZones(await saveZones({ ...zones, [site]: list }));
    } catch (err) {
      setError(`${Z.saveFailed}: ${message(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function add(site: Site, raw: string) {
    if (!zones) return;
    const zone = raw.trim();
    if (!zone) return;
    if (zones[site].some((z) => z.toLowerCase() === zone.toLowerCase())) {
      setError(Z.duplicate);
      return;
    }
    setDrafts((d) => ({ ...d, [site]: "" }));
    void save(site, [...zones[site], zone]);
  }

  function submitDraft(e: FormEvent, site: Site) {
    e.preventDefault();
    add(site, drafts[site]);
  }

  return (
    <div className="card">
      <CardHead icon={MapPin} tone="soil" title={Z.title} />
      <p className="small">{Z.body}</p>
      {missing && <Banner kind="warn">{Z.missingTable}</Banner>}
      {!missing && zones === null && !error && <Spinner label={t.common.loading} />}
      {error && <Banner kind="error">{error}</Banner>}
      {zones &&
        SITES.map((site) => {
          const listed = zones[site];
          const suggestions = used[site].filter((z) => !listed.some((l) => l.toLowerCase() === z.toLowerCase()));
          return (
            <section key={site} className="stack" style={{ marginTop: 12, gap: 8 }}>
              <h3 style={{ margin: 0 }}>
                <SiteLabel site={site} size={18} />
              </h3>
              {listed.length === 0 ? (
                <span className="small muted">{Z.empty}</span>
              ) : (
                <ul className="list-plain" style={{ paddingLeft: 0, listStyle: "none" }}>
                  {listed.map((zone) => (
                    <li key={zone} className="row between" style={{ minHeight: "var(--tap)" }}>
                      <span className="grow">{zone}</span>
                      <button
                        type="button"
                        className="small"
                        disabled={saving}
                        aria-label={Z.remove(zone)}
                        onClick={() => void save(site, listed.filter((z) => z !== zone))}
                      >
                        <X size={16} aria-hidden />
                        {t.common.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {suggestions.length > 0 && (
                <div>
                  <span className="small muted">{Z.fromPlants}</span>
                  <div className="chips" style={{ marginTop: 6, marginBottom: 0 }}>
                    {suggestions.map((zone) => (
                      <button type="button" key={zone} className="chip" disabled={saving} onClick={() => add(site, zone)}>
                        <Plus size={16} aria-hidden />
                        {zone}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <form className="row" onSubmit={(e) => submitDraft(e, site)}>
                <input
                  className="grow"
                  value={drafts[site]}
                  placeholder={Z.placeholder}
                  aria-label={`${t.site[site]}: ${Z.placeholder}`}
                  autoComplete="off"
                  enterKeyHint="done"
                  disabled={saving}
                  onChange={(e) => setDrafts((d) => ({ ...d, [site]: e.target.value }))}
                />
                <button type="submit" className="small" disabled={saving || drafts[site].trim() === ""}>
                  <Plus size={16} aria-hidden />
                  {Z.add}
                </button>
              </form>
            </section>
          );
        })}
    </div>
  );
}

type ExportKind = "plants" | "tasks";

/** The two CSV downloads, with the row count and file name of the last one, or its error. */
function ExportCard() {
  const s = t.settings.export;
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [note, setNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function run(kind: ExportKind) {
    if (busy) return;
    setBusy(kind);
    setNote(null);
    try {
      const result: ExportResult = kind === "plants" ? await exportPlantsCsv() : await exportTasksCsv();
      setNote({ kind: "info", text: s.saved(result.rows, result.filename) });
    } catch (err) {
      setNote({ kind: "error", text: `${s.failed}: ${message(err)}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <CardHead icon={Download} tone="plum" title={s.title} />
      <p className="small">{s.body}</p>
      <div className="row" style={{ marginBottom: note ? 10 : 0 }}>
        <button type="button" className="grow" disabled={busy !== null} onClick={() => void run("plants")}>
          {busy === "plants" ? (
            <Spinner label={s.working} />
          ) : (
            <>
              <Download size={18} aria-hidden />
              {s.plants}
            </>
          )}
        </button>
        <button type="button" className="grow" disabled={busy !== null} onClick={() => void run("tasks")}>
          {busy === "tasks" ? (
            <Spinner label={s.working} />
          ) : (
            <>
              <Download size={18} aria-hidden />
              {s.tasks}
            </>
          )}
        </button>
      </div>
      {note && <Banner kind={note.kind}>{note.text}</Banner>}
    </div>
  );
}

export function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="screen">
      <h1>{t.settings.title}</h1>

      <RemindersCard />
      <WeatherSettingsCard />
      <LanguageCard />
      <ZonesCard />
      <ExportCard />

      <div className="card">
        <div className="card-head">
          <span className="head-icon" aria-hidden>
            <CircleUser size={22} />
          </span>
          <div className="grow">
            <p className="muted small" style={{ margin: 0 }}>
              {t.settings.signedInAs}
            </p>
            <p style={{ wordBreak: "break-all", margin: 0 }}>{session?.user.email ?? t.common.unknown}</p>
          </div>
        </div>
        <button type="button" className="danger block" onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={18} aria-hidden />
          {t.settings.signOut}
        </button>
      </div>

      <div className="card">
        <CardHead icon={Smartphone} tone="berry" title={t.settings.installTitle} />
        <p>{t.settings.installBody}</p>
      </div>

      <div className="card">
        <CardHead icon={Sprout} title={t.settings.phaseTitle} />
        <p>{t.settings.phaseBody}</p>
      </div>

      <div className="card row between">
        <span className="muted site-label">
          <Info size={18} aria-hidden />
          {t.settings.version}
        </span>
        <span>{APP_VERSION}</span>
      </div>
    </div>
  );
}
