// Calls to the Vercel functions. Every call carries the Supabase access token.
import { supabase } from "./supabase";
import { notifyTasksChanged } from "./db";
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
/** How often the app asks whether a profile whose reply was lost has been stored. */
const LOOKUP_EVERY_MS = 10_000;

export interface ProfileOptions {
  /** Called once the reply is lost and the app starts asking for the stored profile. */
  onReconnecting?: () => void;
  /** Stops the asking (Start over, another choice, the screen left). */
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
 * A new profile takes Claude a minute or more, and the function stores it even when the phone loses
 * the reply meanwhile (a dropped mobile connection, a switch between Wi-Fi and mobile data). So a
 * lost reply is not a failed profile: the app asks for the stored row (lookup_only, no Claude call)
 * at once and then every LOOKUP_EVERY_MS until that function must have stopped, rather than paying
 * for the profile twice. When nothing arrives, the original error stands.
 */
async function profile(req: ProfileRequest, opts: ProfileOptions = {}): Promise<ProfileApiResponse> {
  const sentAt = Date.now();
  try {
    return await callApi<ProfileApiResponse>("profile", req);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 0 || req.regenerate_species_id) throw err;
    opts.onReconnecting?.();
    const deadline = sentAt + FUNCTION_MAX_MS;
    for (;;) {
      if (opts.signal?.aborted) throw err;
      try {
        return await callApi<ProfileApiResponse>("profile", { ...req, lookup_only: true }, EXPAND_TIMEOUT_MS);
      } catch (lookupErr) {
        // 404: not stored yet; 0: still no connection. Any other answer is the one to show.
        if (!(lookupErr instanceof ApiError) || (lookupErr.status !== 404 && lookupErr.status !== 0)) throw lookupErr;
      }
      if (Date.now() >= deadline || !(await pause(LOOKUP_EVERY_MS, opts.signal))) throw err;
    }
  }
}

export const api = {
  identify: (req: IdentifyRequest) => callApi<IdentifyResponse>("identify", req),
  /** Looks for the stored profile when the reply is lost on the way (see `profile`). */
  profile: (req: ProfileRequest, opts?: ProfileOptions) => profile(req, opts),
  /** A problem photo read against the plant's context; the app saves the photo and the result afterwards. */
  diagnose: (req: DiagnoseRequest) => callApi<DiagnoseResponse>("diagnose", req),
  /** A free question about one plant, with the earlier exchanges of the conversation; the app saves the answer. */
  ask: (req: AskRequest) => callApi<AskResponse>("ask", req),
  /** Before planting: the species read against the sites and what grows there; the app saves the check. */
  check: (req: CheckRequest) => callApi<CheckResponse>("check", req),
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
