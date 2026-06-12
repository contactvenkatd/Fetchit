import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import {
  OAUTH_INTENT_KEY,
  OAUTH_ERROR_KEY,
  isRegistered,
  getFamilyInviteToken,
  maybeAcceptPendingInvite,
} from "../utils";

// Landing route after a Google OAuth round-trip (redirectTo = /auth/callback).
// Supabase's detectSessionInUrl establishes the session from the URL hash; once
// useAuth() reflects it we dispatch on { intent, registered }:
//
//   SIGN UP:  already registered → error "account already exists" → /signup
//             new                → /terms (TOS step → /plans → checkout if paid →
//                                  onboarding → chat). The account is marked
//                                  registered only when onboarding completes
//                                  (OnboardingPage), NOT here — so abandoning
//                                  mid-onboarding leaves it un-registered.
//   LOG IN:   already registered → /chat
//             new (no account)   → error "no account found" → /login
//
// The "error" branches sign the just-created/again session out and stash a flag
// in sessionStorage that the signup/login page reads to show the message.
function AuthCallback() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (loading || handled.current) return undefined;

    // The OAuth hash may take a tick to resolve into a session. If it hasn't yet,
    // wait briefly; the effect re-runs when useAuth() picks the session up.
    if (!session) {
      const t = setTimeout(() => {
        if (handled.current) return;
        handled.current = true;
        const intent = sessionStorage.getItem(OAUTH_INTENT_KEY);
        sessionStorage.removeItem(OAUTH_INTENT_KEY);
        // No session after waiting → OAuth was cancelled or failed.
        navigate(intent === "signup" ? "/signup" : "/login", { replace: true });
      }, 2500);
      return () => clearTimeout(t);
    }

    handled.current = true;
    const intent = sessionStorage.getItem(OAUTH_INTENT_KEY) || "login";
    sessionStorage.removeItem(OAUTH_INTENT_KEY);
    const registered = isRegistered(session);

    (async () => {
      if (intent === "signup") {
        if (registered) {
          // Already has a FetchIt account → don't start a second signup.
          sessionStorage.setItem(OAUTH_ERROR_KEY, "signup_exists");
          await supabase.auth.signOut({ scope: "local" });
          navigate("/signup", { replace: true });
        } else {
          // Brand-new account → start onboarding at the TOS step (/terms → /plans
          // → …). It's marked registered only after the onboarding name step
          // (OnboardingPage), so abandoning before then leaves it un-registered.
          navigate("/terms", { replace: true });
        }
      } else {
        if (registered) {
          // Logged in via a family join link → accept the invite first.
          if (getFamilyInviteToken()) await maybeAcceptPendingInvite();
          navigate("/chat", { replace: true });
        } else {
          // OAuth auto-created an account, but they never signed up → reject it.
          sessionStorage.setItem(OAUTH_ERROR_KEY, "login_noaccount");
          await supabase.auth.signOut({ scope: "local" });
          navigate("/login", { replace: true });
        }
      }
    })();

    return undefined;
  }, [loading, session, navigate]);

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Just a sec 🐕</h1>
        <p className="auth-sub">Finishing your Google sign-in…</p>
      </div>
    </AuthLayout>
  );
}

export default AuthCallback;
