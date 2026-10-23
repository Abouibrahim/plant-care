import { createClient } from "@supabase/supabase-js";

// A blank value (an unfilled .env.local) counts as missing, like an unset variable.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || undefined;

/** False until Mohamed sets the two VITE_ keys; the Login screen explains what is missing. */
export const supabaseConfigured = Boolean(url && anonKey);

/** Browser client with the anon key; RLS and the user's session protect the data. */
export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const PHOTOS_BUCKET = "photos";
