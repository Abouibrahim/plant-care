import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export interface AuthState {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  /**
   * No session, but a sign-in in storage that the server could not refresh for lack of a connection
   * (Phase 14): the shell shows on the phone's own copy of the data, and writes wait for the session,
   * which comes back with the signal. A refresh the server refuses still signs out.
   */
  offline: boolean;
  /** Resolves to an error message, or null on success. */
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
