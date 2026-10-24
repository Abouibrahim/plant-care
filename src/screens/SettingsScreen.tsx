import { useEffect, useState } from "react";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { lang, LANGS, storeLang, t, type Lang } from "../i18n";
import { useAuth } from "../lib/auth-context";
import { disablePush, enablePush, getPushState, PushError, type PushState } from "../lib/push";
import { APP_VERSION } from "../version";

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.errors.generic;
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
      <div className="row between">
        <h2 style={{ margin: 0 }}>{s.title}</h2>
        {state && <span className={`pill ${pill}`}>{label[state]}</span>}
      </div>
      <p className="small" style={{ marginTop: 8 }}>
        {s.body}
      </p>
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
      <h2>{s.title}</h2>
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
      <LanguageCard />

      <div className="card">
        <p className="muted small">{t.settings.signedInAs}</p>
        <p style={{ wordBreak: "break-all" }}>{session?.user.email ?? t.common.unknown}</p>
        <button type="button" className="danger block" onClick={handleSignOut} disabled={signingOut}>
          {t.settings.signOut}
        </button>
      </div>

      <div className="card">
        <h2>{t.settings.installTitle}</h2>
        <p>{t.settings.installBody}</p>
      </div>

      <div className="card">
        <h2>{t.settings.phaseTitle}</h2>
        <p>{t.settings.phaseBody}</p>
      </div>

      <div className="card row between">
        <span className="muted">{t.settings.version}</span>
        <span>{APP_VERSION}</span>
      </div>
    </div>
  );
}
