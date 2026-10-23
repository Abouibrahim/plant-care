// Calls to the Vercel functions. Every call carries the Supabase access token.
import { supabase } from "./supabase";
import type { IdentifyRequest, IdentifyResponse, ProfileApiResponse, ProfileRequest } from "../types";

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

export async function callApi<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not signed in");

  // The functions budget their own time (api/_claude.ts); this only stops a dead connection hanging.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

export const api = {
  identify: (req: IdentifyRequest) => callApi<IdentifyResponse>("identify", req),
  profile: (req: ProfileRequest) => callApi<ProfileApiResponse>("profile", req),
};
