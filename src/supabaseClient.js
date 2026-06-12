// Supabase client — single shared instance for the whole app.
// Auth sessions persist in localStorage and are auto-refreshed; the email
// confirmation link is detected on page load via detectSessionInUrl.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fpphpncruohjlppqhfep.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_j_SnlL8-OiV_ha4pWL1lHw_AQCmalXg";

// ---------------------------------------------------------------------------
// Instant account termination (admin-deleted user).
// When an admin deletes a user from the Supabase dashboard, that user's JWT
// stays valid for up to ~1 hour, so they'd otherwise stay logged in. The app
// detects this two ways — the check-account-status edge function (polled in
// App.js) and a 401 from any data/function call (the guarded fetch below) — and
// both funnel into terminateAccountSession(): hard sign-out, wipe storage, and
// bounce to /login with a message.
// (These live here, not in utils.js, so the guarded fetch can use them without a
//  circular import — utils.js imports from this module.)
// ---------------------------------------------------------------------------
export const ACCOUNT_TERMINATED_KEY = "fetchit_account_terminated";
export const ACCOUNT_TERMINATED_MESSAGE =
  "Your account has been terminated. Please contact support if you believe this is an error.";

let terminating = false; // guard: run the teardown once even if many calls 401

export function terminateAccountSession() {
  if (terminating) return;
  terminating = true;
  // Best-effort local sign-out (clears the sb-* session keys). Fire-and-forget —
  // we wipe storage right after regardless of whether the network call lands.
  try {
    supabase.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  // Set AFTER clearing so the message survives to the login screen.
  try {
    sessionStorage.setItem(ACCOUNT_TERMINATED_KEY, "1");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    } else {
      window.location.reload();
    }
  }
}

// Is there a Supabase auth session in storage (an `sb-*-auth-token` key)? Used
// to scope the 401 interceptor so anonymous 401s don't trigger a termination.
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

// Wrap fetch so a 401 from PostgREST (/rest/v1/) or an Edge Function
// (/functions/v1/) — while we believe we're logged in — instantly terminates the
// session. The /auth/v1/ endpoints are EXCLUDED: 400/401/403 are normal there
// during sign-in / OTP / reauth and must not nuke the session.
const guardedFetch = (input, init) =>
  fetch(input, init).then((res) => {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (url && res.status === 401 && !url.includes("/auth/v1/")) {
        const isData =
          url.includes("/rest/v1/") || url.includes("/functions/v1/");
        if (isData && hasStoredSession()) terminateAccountSession();
      }
    } catch {
      /* ignore */
    }
    return res;
  });

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: guardedFetch },
});
