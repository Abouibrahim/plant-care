// Reading a failure the same way everywhere (Phase 14): a request that never got an answer. The
// browser throws a TypeError with its own wording ("Failed to fetch", "NetworkError when attempting
// to fetch resource", "Load failed"), and supabase-js hands that message back inside its error, so
// src/lib/db.ts rethrows it as a plain Error with the same text. A request cut by its bound
// (AbortSignal.timeout: "TimeoutError: signal timed out") or aborted reads the same way: the write
// may or may not have landed, and the caller treats it as it treats a lost connection. Only the
// wording counts: a bare TypeError is a programming error, never "no connection".
const NO_ANSWER = /failed to fetch|network ?error|load failed|timed out|timeouterror|aborted|aborterror/i;

export function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return NO_ANSWER.test(err.message) || NO_ANSWER.test(err.name);
}

/** What the phone says of its connection; true when it cannot tell (an old browser, a test). */
export function phoneOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
