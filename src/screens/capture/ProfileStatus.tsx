import { Banner } from "../../components/Banner";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import type { ProfileResponse } from "../../types";

/** Where the species-profile request stands while the record form is open. */
export type ProfileState =
  /** reconnecting: the reply was lost and the app is asking whether the profile was stored. */
  | { status: "pending"; reconnecting?: boolean }
  | { status: "ready"; response: ProfileResponse }
  | { status: "failed"; message: string };

export function ProfileStatus({ state, onRetry }: { state: ProfileState; onRetry: () => void }) {
  if (state.status === "pending") {
    return <Spinner label={state.reconnecting ? t.record.profileReconnecting : t.record.profileWriting} />;
  }
  if (state.status === "ready") {
    const r = state.response;
    return (
      <div>
        <Banner kind="info">{r.created ? t.record.profileReady : t.record.profileExisting}</Banner>
        <p className="muted small">{t.capture.usage(r.input_tokens, r.output_tokens)}</p>
      </div>
    );
  }
  return (
    <Banner kind="error">
      <div>
        {t.record.profileFailed}: {state.message}
      </div>
      <button type="button" className="small" style={{ marginTop: 8 }} onClick={onRetry}>
        {t.record.retryProfile}
      </button>
    </Banner>
  );
}
