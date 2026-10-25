// Service-role Supabase client for the Vercel functions, plus the bearer-token check
// every route except /api/daily must run first. Never log key values.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "./_http.js";

export class ConfigError extends Error {
  constructor(name: string) {
    super(`Server is not configured: ${name} is missing`);
    this.name = "ConfigError";
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(name);
  return value;
}

let client: SupabaseClient | undefined;

/** Service-role client: bypasses RLS, so it must only run server-side. */
export function serviceClient(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export function bearerToken(req: VercelRequest): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** A signed-in account that is not the owner's: the route answers 403, which the app shows without signing out. */
export class NotOwnerError extends Error {
  constructor() {
    super("This account is not the owner of this app");
    this.name = "NotOwnerError";
  }
}

/** auth-js error classes that are a verdict on the token, as opposed to a failure of Supabase Auth itself. */
const TOKEN_VERDICTS = new Set(["AuthApiError", "AuthInvalidJwtError", "AuthSessionMissingError", "AuthInvalidCredentialsError"]);

/**
 * Whether getUser rejected the token (expired, malformed, revoked: a 4xx verdict from GoTrue). Anything
 * else is a fault of Supabase Auth or the network (AuthRetryableFetchError with status 0 or 5xx, an
 * AuthUnknownError for a non-JSON reply, a 429) and must not read as "signed out".
 */
export function isTokenRejected(error: { name?: string; status?: number }): boolean {
  const status = error.status ?? 0;
  return TOKEN_VERDICTS.has(error.name ?? "") && status >= 400 && status < 500 && status !== 429;
}

/**
 * Resolves the user behind the Authorization header: null when the token is missing or rejected, so
 * the route answers 401. OWNER_USER_ID (the id of Mohamed's user under Authentication → Users) is
 * required, since every table policy trusts any signed-in account and the anon key ships in the app:
 * without the check, an account created through the Auth API could spend the Claude key. Another
 * account throws NotOwnerError (403) rather than 401, and an upstream fault throws as it is (502 or
 * 500): the phone drops its session on a 401 only, and neither case is one.
 */
export async function verifyUser(req: VercelRequest): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const owner = requireEnv("OWNER_USER_ID");
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error) {
    if (isTokenRejected(error)) return null;
    throw error;
  }
  if (!data.user) return null;
  if (data.user.id !== owner) throw new NotOwnerError();
  return data.user;
}

export function sendError(res: VercelResponse, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/** Maps thrown errors to a response without leaking configuration values. */
export function handleError(res: VercelResponse, err: unknown): void {
  if (err instanceof ConfigError) {
    sendError(res, 500, err.message);
    return;
  }
  if (err instanceof NotOwnerError) {
    sendError(res, 403, err.message);
    return;
  }
  const e = err as { status?: number; message?: string; name?: string };
  if (typeof e?.status === "number" && e.status >= 400 && e.status < 600) {
    // Upstream API error (Claude or Supabase): pass the status through as 502 with the message.
    sendError(res, 502, `${e.name ?? "Upstream error"}: ${e.message ?? "request failed"}`);
    return;
  }
  console.error(err);
  sendError(res, 500, e?.message ?? "Internal error");
}
