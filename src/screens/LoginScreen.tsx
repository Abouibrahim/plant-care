import { useState, type FormEvent } from "react";
import { LogIn, Sprout } from "lucide-react";
import { Banner } from "../components/Banner";
import { GardenScene } from "../components/GardenScene";
import { t } from "../i18n";
import { useAuth } from "../lib/auth-context";
import { dayPhase } from "../lib/today";

const inputStyle = { minHeight: 56, fontSize: "1.05rem" } as const;

/** Shown by App when there is no session or Supabase is not configured; not inside Layout. */
export function LoginScreen() {
  const { configured, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase] = useState(() => dayPhase(new Date().getHours()));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const message = await signIn(email.trim(), password);
      if (message) setError(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="screen">
      <header className={`today-hero ${phase}`}>
        <div className="row" style={{ gap: 10 }}>
          <span className="head-icon" aria-hidden>
            <Sprout size={24} />
          </span>
          <span style={{ fontWeight: 700 }}>{t.app.name}</span>
        </div>
        <h1 style={{ marginTop: 18 }}>{t.login.title}</h1>
        <GardenScene phase={phase} />
      </header>

      {!configured ? (
        <Banner kind="warn">{t.login.notConfigured}</Banner>
      ) : (
        <form onSubmit={submit} className="card">
          <label className="field">
            <span>{t.login.email}</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              style={inputStyle}
            />
          </label>

          <label className="field">
            <span>{t.login.password}</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              style={inputStyle}
            />
          </label>

          {error && (
            <Banner kind="error">
              {t.login.failed}: {error}
            </Banner>
          )}

          <button type="submit" className="primary block big" disabled={pending}>
            {!pending && <LogIn size={22} aria-hidden />}
            {pending ? t.login.signingIn : t.login.submit}
          </button>
        </form>
      )}
    </div>
  );
}
