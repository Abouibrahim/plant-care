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

export async function callApi<T>(path: string, body: unknown, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not signed in");

  // The functions budget their own time (api/_claude.ts); this only stops a dead connection hanging.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  const json = parseJson(text);
  if (!res.ok) {
    if (res.status === 401) {
      // The token is not accepted any more: drop the local session so the Login screen shows.
      await supabase.auth.signOut({ scope: "local" });
    }
    const message = (json as { error?: string } | null)?.error ?? (text || res.statusText);
    throw new ApiError(res.status, message);
  }
  return json as T;
}

const REQUEST_TIMEOUT_MS = 300_000;
/** The expansion makes no Claude call; a cold start plus three queries is well under this. */
const EXPAND_TIMEOUT_MS = 30_000;

export const api = {
  identify: (req: IdentifyRequest) => callApi<IdentifyResponse>("identify", req),
  profile: (req: ProfileRequest) => callApi<ProfileApiResponse>("profile", req),
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
