// Calls to the Vercel functions. Every call carries the Supabase access token. A Claude call whose
// reply is lost on the way is not a failed call: the routes store their row before they reply (Phase
// 14, and /api/profile since 0.8.2), so the app looks for the stored row instead of paying twice.
import { supabase } from "./supabase";
import { getCheck, getPhoto, getQuestion, notifyTasksChanged } from "./db";
import { problemResult } from "./diagnosis";
import { isNetworkFailure } from "./errors";
import {
  expansionChanged,
  type AskRequest,
  type AskResponse,
  type CheckRequest,
  type CheckResponse,
  type DiagnoseRequest,
  type DiagnoseResponse,
  type ExpandRequest,
  type ExpandResponse,
  type IdentifyRequest,
  type IdentifyResponse,
  type ProfileApiResponse,
  type ProfileRequest,
  type PushSubscribeResponse,
  type PushSubscriptionJson,
  type WeatherResponse,
} from "../types";

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

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * An error sent after the 200: a long Claude call sends its status before its body (api/_http.ts
 * keepAlive), so a failure after that comes as `{ error, status }` in the body.
 */
function errorInBody(json: unknown): { status: number; error: string } | null {
  const j = json as { error?: unknown; status?: unknown } | null;
  if (j && typeof j.error === "string" && typeof j.status === "number" && j.status >= 400) {
    return { status: j.status, error: j.error };
  }
  return null;
}

export async function callApi<T>(path: string, body: unknown, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not signed in");

  // The functions budget their own time (api/_claude.ts); this only stops a dead connection hanging.
  // It runs until the body is in, since a long call sends its 200 early and its body last.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await fetch(`/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  } finally {
    clearTimeout(timer);
  }

  const json = parseJson(text);
  const late = res.ok ? errorInBody(json) : null;
  if (!res.ok || late) {
    const status = late?.status ?? res.status;
    if (status === 401) {
      // The token is not accepted any more: drop the local session so the Login screen shows.
      await supabase.auth.signOut({ scope: "local" });
    }
    const message = late?.error ?? (json as { error?: string } | null)?.error ?? (text || res.statusText);
    throw new ApiError(status, message);
  }
  // Only the keep-alive's spaces, or a body cut short: the reply was lost on the way.
  if (json === null) throw new ApiError(0, "The reply was cut off");
  return json as T;
}

const REQUEST_TIMEOUT_MS = 300_000;
/** Calls that make no Claude call: a cold start plus a few queries is well under this. */
const EXPAND_TIMEOUT_MS = 30_000;
/** vercel.json's maxDuration: by then a function writing a profile has stored it or stopped. */
const FUNCTION_MAX_MS = 300_000;
/** How often the app asks whether a call whose reply was lost has stored its row. */
const LOOKUP_EVERY_MS = 10_000;
/** One read of the table during the asking is given this long; on a weak signal a hung read must not stall the loop. */
const LOOKUP_TIMEOUT_MS = 10_000;

export interface RecoverOptions {
  /** Called once the reply is lost and the app starts asking for the stored row. */
  onReconnecting?: () => void;
  /** Stops the asking (Start over, another choice, the screen or the panel left). */
  signal?: AbortSignal;
}

/** Waits `ms`; false when the signal aborts first. */
function pause(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A Claude call takes up to a few minutes, and the function finishes and stores its row even when
 * the phone loses the reply meanwhile (a dropped mobile connection, a switch between Wi-Fi and
 * mobile data). So a lost reply (status 0) is not a failed call: `lookup` is asked for the stored
 * row at once and then every LOOKUP_EVERY_MS until the function must have stopped. It answers null
 * while there is nothing yet; a network failure keeps the asking going; a route's own answer (a 403)
 * is shown; any other error ends it with the original failure (a table that does not exist: the
 * route could not have written either). Without a lookup the failure stands at once. When nothing
 * arrives in time, a LostReplyError says so.
 */
async function withRecovery<T>(call: () => Promise<T>, lookup: (() => Promise<T | null>) | null, opts: RecoverOptions = {}): Promise<T> {
  const sentAt = Date.now();
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 0 || !lookup) throw err;
    opts.onReconnecting?.();
    const deadline = sentAt + FUNCTION_MAX_MS;
    for (;;) {
      if (opts.signal?.aborted) throw err;
      try {
        const found = await lookup();
        if (found !== null) return found;
      } catch (lookupErr) {
        if (lookupErr instanceof ApiError && lookupErr.status !== 0) throw lookupErr;
        if (!(lookupErr instanceof ApiError) && !isNetworkFailure(lookupErr)) throw err;
      }
      if (Date.now() >= deadline) throw new LostReplyError(err);
      // Stopped (the panel left): the loss itself stands, since the row may still arrive without us.
      if (!(await pause(LOOKUP_EVERY_MS, opts.signal))) throw err;
    }
  }
}

/** The profile's lookup: the stored row through the route (lookup_only, no Claude call), 404 while there is none. */
function profileLookup(req: ProfileRequest): () => Promise<ProfileApiResponse | null> {
  return () =>
    callApi<ProfileApiResponse>("profile", { ...req, lookup_only: true }, EXPAND_TIMEOUT_MS).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    });
}

const lookupBound = () => AbortSignal.timeout(LOOKUP_TIMEOUT_MS);

export const api = {
  identify: (req: IdentifyRequest) => callApi<IdentifyResponse>("identify", req),
  /** Looks for the stored profile when the reply is lost on the way; not for a regeneration, which the route stores in place. */
  profile: (req: ProfileRequest, opts?: RecoverOptions) =>
    withRecovery(() => callApi<ProfileApiResponse>("profile", req), req.regenerate_species_id ? null : profileLookup(req), opts),
  /** A problem photo read against the plant's context; with the planned photo row, the route stores the diagnosis and a lost reply is found again. */
  diagnose: (req: DiagnoseRequest, opts?: RecoverOptions) => {
    const photoId = req.photo?.id;
    return withRecovery(
      () => callApi<DiagnoseResponse>("diagnose", req),
      photoId ? () => getPhoto(photoId, lookupBound()).then((row) => (row ? problemResult(row.ai_result) : null)) : null,
      opts,
    );
  },
  /** A free question about one plant, with the earlier exchanges; with the row's id, the route stores the answer and a lost reply is found again. */
  ask: (req: AskRequest, opts?: RecoverOptions) => {
    const rowId = req.id;
    return withRecovery(
      () => callApi<AskResponse>("ask", req),
      rowId ? () => getQuestion(rowId, lookupBound()).then((row) => (row ? (row.answer as AskResponse) : null)) : null,
      opts,
    );
  },
  /** Before planting: the species read against the sites and what grows there; with the row's id, the route stores the check and a lost reply is found again. */
  check: (req: CheckRequest, opts?: RecoverOptions) => {
    const rowId = req.id;
    return withRecovery(
      () => callApi<CheckResponse>("check", req),
      rowId ? () => getCheck(rowId, lookupBound()).then((row) => (row ? (row.result as CheckResponse) : null)) : null,
      opts,
    );
  },
  /** Expands the care rules into tasks now (one plant, or all) instead of waiting for the 06:00 cron. */
  expand: async (req: ExpandRequest = {}) => {
    const r = await callApi<ExpandResponse>("expand", req, EXPAND_TIMEOUT_MS);
    if (expansionChanged(r)) notifyTasksChanged();
    return r;
  },
  /** Fetches the forecast for the sites now and stores it (Today, when the stored one is missing or old). */
  weather: () => callApi<WeatherResponse>("weather", {}, EXPAND_TIMEOUT_MS),
  /** Stores this browser's push subscription for the daily digest. */
  pushSubscribe: (subscription: PushSubscriptionJson) =>
    callApi<PushSubscribeResponse>("push-subscribe", { subscription }, EXPAND_TIMEOUT_MS),
  /** Removes it again. */
  pushUnsubscribe: (endpoint: string) =>
    callApi<PushSubscribeResponse>("push-subscribe", { unsubscribe: true, endpoint }, EXPAND_TIMEOUT_MS),
};
