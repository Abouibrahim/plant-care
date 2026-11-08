import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  CircleUser,
  CloudSun,
  Coins,
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
import { lang, LANGS, storedLang, storeLang, t, type Lang } from "../i18n";
import { useAuth } from "../lib/auth-context";
import { localIsoDate, toLocalDate } from "../lib/dates";
import {
  emptyZones,
  listWeather,
  loadDailyRecord,
  loadDailyStart,
  loadLang,
  loadUsage,
  loadWeatherSettings,
  loadZones,
  recentZones,
  saveLang,
  saveWeatherSettings,
  saveZones,
  SettingsUnavailable,
  WeatherUnavailable,
} from "../lib/db";
import { exportPlantsCsv, exportTasksCsv, type ExportResult } from "../lib/export";
import { syncLangWithServer } from "../lib/langSync";
import { disablePush, enablePush, getPushState, PushError, type PushState } from "../lib/push";
import { runState } from "../lib/record";
import { estimateCost, formatDollars, monthOf, previousMonth, PRICES_PER_MILLION } from "../lib/usage";
import { TOWN } from "../lib/weather";
import {
  RAIN_SKIP_CHOICES,
  SITES,
  USAGE_ROUTES,
  type DailyRecord,
  type DailyStart,
  type Site,
  type UsageLedger,
  type WeatherDay,
  type WeatherSettings,
  type ZoneLists,
} from "../types";

import { APP_VERSION } from "../version";

/** A write to the settings table that hangs this long is given up, so the screen never waits on it. */
const SETTING_WRITE_TIMEOUT_MS = 5_000;

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
 * app reloaded; the service worker serves the shell from its cache, so this works offline too. The
 * choice also goes to the settings table (Phase 14), where the morning run reads it for the
 * notifications and the notes it writes; without a connection that write fails and the server
 * keeps the language it had.
 */
function LanguageCard() {
  const s = t.settings.language;
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  /** The language the server holds: null when no choice has reached it, undefined while unknown or unreadable. */
  const [server, setServer] = useState<Lang | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    // After the start-up write (src/lib/langSync.ts), so the line does not read the row that write
    // is about to replace.
    syncLangWithServer()
      .then(() => loadLang())
      .then((value) => {
        if (active) setServer(value);
      })
      .catch(() => {
        // Offline or no settings table: the line stays out.
      });
    return () => {
      active = false;
    };
  }, []);

  async function choose(next: Lang) {
    if (next === lang || switching) return;
    if (!storeLang(next)) {
      setError(s.saveFailed);
      return;
    }
    setSwitching(true);
    // The row for the server, bounded so the switch still works offline; a write that is cut or fails
    // is made again at the next app start (src/lib/langSync.ts).
    await Promise.race([saveLang(next).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, SETTING_WRITE_TIMEOUT_MS))]);
    window.location.reload();
  }

  // Without a choice on this phone the screens follow its language, and the server writes in the
  // language a choice made elsewhere gave it, English until then.
  const serverLine =
    server === undefined ? null : storedLang() === null ? (server ? s.server(s.names[server]) : s.serverDefault) : server === lang ? s.server(s.names[server]) : s.notSynced;

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
            disabled={switching}
            onClick={() => void choose(l)}
          >
            {s.names[l]}
          </button>
        ))}
      </div>
      {serverLine && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {serverLine}
        </p>
      )}
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
/** "Tue 4 Nov, 06:41" in the phone's language. */
function runTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** One run as the Settings card tells it: when, what it did, and the phones it reached, or why it stopped. */
function describeRun(record: DailyRecord): string {
  const W = t.weather;
  if (record.error) return W.lastRunFailed(runTime(record.at), record.error);
  const what = [
    W.runCounts(record.created, record.skipped, record.removed + record.expired + record.superseded),
    record.subscriptions > 0 ? W.runPushes(record.pushes_sent, record.pushes_failed, record.subscriptions) : W.runNoPhones,
    record.weather_error ? (record.weather_error.startsWith("rain skip:") ? W.runRainSkipError : W.runWeatherError) : "",
    record.digest_error ?? "",
  ]
    .filter(Boolean)
    .join(", ");
  return W.lastRun(runTime(record.at), what);
}

/**
 * The morning run's line (Phase 14): the day's run and what it did, a start without an end, or
 * nothing yet today with the last run; a warning once the run should have come and has not.
 */
function runLine(record: DailyRecord | null, start: DailyStart | null, now: Date): { text: string; warn: boolean } {
  const W = t.weather;
  const state = runState(record, start, localIsoDate(now), now);
  switch (state.kind) {
    case "never":
      return { text: W.noRunYet, warn: false };
    case "ran":
      return { text: describeRun(state.record), warn: state.record.error !== undefined };
    case "started":
      return {
        text: [state.unfinished ? W.runUnfinished(runTime(state.start.at)) : W.runStarted(runTime(state.start.at)), state.previous ? describeRun(state.previous) : ""].filter(Boolean).join(" "),
        warn: state.unfinished,
      };
    case "pending":
      return { text: [state.late ? W.runMissing : W.noRunToday, state.previous ? describeRun(state.previous) : ""].filter(Boolean).join(" "), warn: state.late };
  }
}

/** Weather (Phase 8): the rain skip and its threshold, the point the forecast is read for, the last fetch, and the morning run's record (Phase 14). */
function WeatherSettingsCard() {
  const W = t.weather;
  const [settings, setSettings] = useState<WeatherSettings | null>(null);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [latest, setLatest] = useState<WeatherDay | null | undefined>(undefined);
  const [weatherMissing, setWeatherMissing] = useState(false);
  const [run, setRun] = useState<{ record: DailyRecord | null; start: DailyStart | null } | undefined>(undefined);
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
    Promise.all([loadDailyRecord(), loadDailyStart()])
      .then(([record, start]) => {
        if (active) setRun({ record, start });
      })
      .catch(() => {
        // A failed read says nothing about the run, and without the settings table the instruction above says what to do: the line stays out.
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
      {run !== undefined &&
        !settingsMissing &&
        (() => {
          const line = runLine(run.record, run.start, new Date());
          return line.warn ? (
            <div style={{ marginTop: 8 }}>
              <Banner kind="warn">{line.text}</Banner>
            </div>
          ) : (
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {line.text}
            </p>
          );
        })()}
      <p className="small muted" style={{ margin: "4px 0 0" }}>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          {W.credit}
        </a>
      </p>
    </div>
  );
}

/** "November 2026" in the phone's language, from "2026-11". */
function monthLabel(month: string): string {
  const d = toLocalDate(`${month}-01`);
  const label = d ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : month;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The usage ledger (Phase 14, review 5.3): this month's Claude calls and last month's, with an
 * estimate at list prices (src/lib/usage.ts), read from the rows the functions keep.
 */
function UsageCard() {
  const U = t.settings.usage;
  const [months, setMonths] = useState<Array<{ month: string; ledger: UsageLedger | null }> | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const month = monthOf(localIsoDate());
    const before = previousMonth(month);
    Promise.all([loadUsage(month), loadUsage(before)])
      .then(([now, prev]) => {
        if (active) setMonths([{ month, ledger: now }, { month: before, ledger: prev }]);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof SettingsUnavailable) setMissing(true);
        else setError(`${U.loadFailed}: ${message(err)}`);
      });
    return () => {
      active = false;
    };
  }, [U.loadFailed]);

  const current = months?.[0]?.ledger ?? null;
  const byRoute = current
    ? USAGE_ROUTES.filter((route) => (current.by_route[route]?.calls ?? 0) > 0)
        .map((route) => `${current.by_route[route]?.calls ?? 0} ${U.routes[route]}`)
        .join(", ")
    : "";

  return (
    <div className="card">
      <CardHead icon={Coins} tone="sun" title={U.title} />
      <p className="small">{U.body}</p>
      {missing && <Banner kind="warn">{t.settings.zones.missingTable}</Banner>}
      {!missing && months === null && !error && <Spinner label={t.common.loading} />}
      {error && <Banner kind="error">{error}</Banner>}
      {months &&
        months.map(({ month, ledger }, i) => (
          <div key={month} style={{ marginTop: i === 0 ? 0 : 8 }}>
            <p style={{ margin: 0, fontWeight: i === 0 ? 600 : 400 }}>
              {ledger && ledger.calls > 0 ? U.month(monthLabel(month), ledger.calls, formatDollars(estimateCost(ledger))) : U.none(monthLabel(month))}
            </p>
            {i === 0 && ledger && ledger.calls > 0 && (
              <p className="small muted" style={{ margin: "2px 0 0" }}>
                {byRoute && <>{U.byRoute(byRoute)} · </>}
                {U.tokens(ledger.input + ledger.cache_read + ledger.cache_write, ledger.output)}
                {ledger.failed > 0 && <> · {U.failed(ledger.failed)}</>}
                {ledger.fallback > 0 && <> · {U.fallback(ledger.fallback)}</>}
              </p>
            )}
          </div>
        ))}
      {months && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {U.prices(
            formatDollars(PRICES_PER_MILLION.input),
            formatDollars(PRICES_PER_MILLION.output),
            formatDollars(PRICES_PER_MILLION.cache_read),
            formatDollars(PRICES_PER_MILLION.cache_write),
          )}
        </p>
      )}
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
      <UsageCard />

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
