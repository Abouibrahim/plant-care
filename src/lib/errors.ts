// Reading a failure the same way everywhere (Phase 14, Phase 15). A request that never got an answer:
// the browser throws a TypeError with its own wording ("Failed to fetch", "NetworkError when attempting
// to fetch resource", "Load failed"), and supabase-js hands that message back inside its error, so
// src/lib/db.ts rethrows it as a plain Error with the same text. A request cut by its bound
// (AbortSignal.timeout: "TimeoutError: signal timed out") or aborted reads the same way: the write may
// or may not have landed, and the caller treats it as it treats a lost connection. Only the message
// counts: a bare TypeError is a programming error, never "no connection", and an error's name is not
// read (a push service refusing a subscription throws an AbortError that is not a lost connection;
// supabase-js writes the name into the message anyway). "Load failed" is Safari's whole phrase, so
// "The photo upload failed" does not match it. `describeError` turns any
// failure into the sentence a screen shows, so the browser's own wording never reaches the grower.
import { t } from "../i18n";

/** A function's answer that was not a success (src/lib/api.ts): its HTTP status, 0 when no answer came. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * A reply lost on the way whose stored row never appeared in time: the call may have been declined
 * (a refusal is not stored) or lost, and asking again is a new call. Status 0, like the loss itself.
 */
export class LostReplyError extends ApiError {
  constructor(cause: ApiError) {
    super(0, cause.message);
    this.name = "LostReplyError";
  }
}

const NO_ANSWER = /failed to fetch|network ?error|\bload failed|timed out|timeouterror|aborted|aborterror/i;

export function isNetworkFailure(err: unknown): boolean {
  return err instanceof Error && NO_ANSWER.test(err.message);
}

/** What the phone says of its connection; true when it cannot tell (an old browser, a test). */
export function phoneOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * What a screen says of a failure, in the app's words (Phase 15): a lost reply looked for in vain, a
 * sign-in the server no longer accepts, no connection, a photo too large; otherwise the message the
 * function or the database gave, as written (the functions' texts are English literals); otherwise a
 * generic line.
 */
export function describeError(err: unknown): string {
  if (err instanceof LostReplyError) return t.errors.answerLost;
  if (err instanceof ApiError) {
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 0) return t.errors.network;
    if (err.status === 413) return t.errors.tooLarge;
    return err.message || t.errors.generic;
  }
  if (isNetworkFailure(err)) return t.errors.network;
  if (err instanceof Error && err.message) return err.message;
  return t.errors.generic;
}
