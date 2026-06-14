// Auth context — exposes the live Supabase session to the whole app.
// Supabase auth is async, so we resolve the initial session once and then keep
// it in sync via onAuthStateChange (sign-in, sign-out, token refresh, and the
// email-confirmation redirect all flow through here).
//
// Persistence: the session is stored in localStorage (persistSession +
// autoRefreshToken in supabaseClient.js), so it survives tab close, browser
// restart, and device restart — the user stays logged in until they explicitly
// sign out, the account is deleted, or the session is terminated. On load we
// restore the cached session immediately (fast first paint), THEN do a one-time
// background refreshSession() so the freshest user_metadata (plan, billing,
// family status) is pulled even if it changed server-side while the tab was
// closed. The refresh emits TOKEN_REFRESHED through onAuthStateChange, which
// updates `session` in place; it fails open (a transient/network error never
// clears a valid cached session — only a definitively revoked/expired refresh
// token logs the user out, which is the intended behavior).
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext({ session: null, loading: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      // Health check: if a session was restored, pull the latest server-side
      // user_metadata once on load. onAuthStateChange (TOKEN_REFRESHED) carries
      // the refreshed session back into state. Swallow errors — refreshSession
      // does not drop a valid local session on a transient failure, and a truly
      // expired/revoked refresh token surfaces as a SIGNED_OUT event instead.
      if (data.session) {
        supabase.auth.refreshSession().catch(() => {
          /* fail open — keep the restored session */
        });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
