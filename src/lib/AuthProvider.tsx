import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { describeError, isNetworkFailure, phoneOnline } from "./errors";
import { supabase, supabaseConfigured } from "./supabase";
import { AuthContext, type AuthState } from "./auth-context";

/** auth-js names a refresh that failed on the network so; the server's own refusal has another name and signs out. */
function couldNotReach(error: AuthError | null): boolean {
  return error !== null && (error.name === "AuthRetryableFetchError" || isNetworkFailure(error));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Offline from the start (airplane mode at the farm), the shell shows on the phone's copy at once,
  // while the stored sign-in is read; with a token that has run out, auth-js tries the refresh for up
  // to 30 s before giving up (Phase 14). A session read from storage then takes over.
  const [offline, setOffline] = useState(!phoneOnline());
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      // A stored sign-in whose hourly token ran out and could not be refreshed for lack of a connection
      // (the morning at the farm): the shell still shows, on the phone's copy (Phase 14).
      setOffline(data.session === null && couldNotReach(error));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      // A session back, or a sign-out (a refresh the server refused included): the offline shell ends,
      // and without a session the Login screen shows.
      if (next || event === "SIGNED_OUT") setOffline(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      configured: supabaseConfigured,
      offline,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        // The server's own words for a refused sign-in; the app's for no connection.
        return error ? describeError(error) : null;
      },
      async signOut() {
        // Local scope clears the stored session without a server round-trip; one user, one device.
        // Offline with an expired token the call can still fail, so the app state is cleared regardless
        // and the Login screen shows; a stale token left in storage cannot be refreshed anyway.
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setSession(null);
        setOffline(false);
      },
    }),
    [session, loading, offline],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
