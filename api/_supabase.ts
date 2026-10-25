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

/**
 * A failure of Supabase Auth itself (unreachable, 5xx, rate-limited) rather than a verdict on the
 * token. auth-js wraps the first two as AuthRetryableFetchError (status 0 or 502 to 504).
 */
function isAuthFault(error: { name?: string; status?: number }): boolean {
  const status = error.status ?? 0;
  return error.name === "AuthRetryableFetchError" || status === 429 || status >= 500;
}

/**
 * Resolves the user behind the Authorization header: null when the token is missing, rejected or
 * belongs to anyone but the owner. OWNER_USER_ID (the id of Mohamed's user under Authentication →
 * Users) is required, since every table policy and every route trust any signed-in account and the
 * anon key ships in the app: without the check, an account created through the Auth API could spend
 * the Claude key. An upstream fault throws instead of returning null, so the route answers 502 or
 * 500 rather than 401, which would make the phone drop its session.
 */
export async function verifyUser(req: VercelRequest): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const owner = requireEnv("OWNER_USER_ID");
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error) {
    if (isAuthFault(error)) throw error;
    return null;
  }
  if (!data.user || data.user.id !== owner) return null;
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
  const e = err as { status?: number; message?: string; name?: string };
  if (typeof e?.status === "number" && e.status >= 400 && e.status < 600) {
    // Upstream API error (Claude or Supabase): pass the status through as 502 with the message.
    sendError(res, 502, `${e.name ?? "Upstream error"}: ${e.message ?? "request failed"}`);
    return;
  }
  console.error(err);
  sendError(res, 500, e?.message ?? "Internal error");
}
