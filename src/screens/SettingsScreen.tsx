import { useState } from "react";
import { t } from "../i18n";
import { useAuth } from "../lib/auth-context";
import { APP_VERSION } from "../version";

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

      <div className="card">
        <h2>{t.settings.language}</h2>
        <p>{t.settings.languageNote}</p>
      </div>

      <div className="card row between">
        <span className="muted">{t.settings.version}</span>
        <span>{APP_VERSION}</span>
      </div>
    </div>
  );
}
