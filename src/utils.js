// Shared helpers. Auth, chat history, and order history are backed by Supabase;
// the early-access email capture (admin/demo) stays in localStorage since it's
// not tied to a real account.
import {
  supabase,
  terminateAccountSession,
  ACCOUNT_TERMINATED_KEY,
  ACCOUNT_TERMINATED_MESSAGE,
} from "./supabaseClient";

// Re-export so components can pull the termination helpers from utils (the
// app's single helper module) without reaching into supabaseClient directly.
export {
  terminateAccountSession,
  ACCOUNT_TERMINATED_KEY,
  ACCOUNT_TERMINATED_MESSAGE,
};

const STORAGE_KEY = "fetchit_signups";

// Pragmatic email check: non-empty local part, @, domain with a dot.
export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// Early-access / admin signup list (demo only — localStorage, no account).
// ---------------------------------------------------------------------------
export function getSignups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Persists { email, plan, timestamp } and returns the updated list.
export function saveSignup({ email, plan }) {
  const signups = getSignups();
  signups.push({
    email: email.trim(),
    plan,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(signups));
  return signups;
}

export function clearSignups() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Auth — real Supabase auth (email + password, with email verification).
// ---------------------------------------------------------------------------

// Create an account. With email confirmation enabled, the returned data has no
// session until the user clicks the link in their email. The confirmation link
// redirects back to the app's origin, where detectSessionInUrl signs them in.
export async function signUp(email, password) {
  return supabase.auth.signUp({
    email: email.trim(),
    password,
    // Confirmation link returns to /terms (the TOS agreement step), which leads
    // to /plans. detectSessionInUrl signs them in on arrival.
    options: { emailRedirectTo: `${window.location.origin}/terms` },
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// ---------------------------------------------------------------------------
// Instant account termination (admin-deleted user).
// A user deleted from the Supabase dashboard keeps a valid JWT for up to ~1h, so
// they'd stay "logged in". We detect that two ways and both call
// terminateAccountSession() (defined in supabaseClient.js): the
// check-account-status edge function (polled by App.js's AccountStatusWatcher on
// load / every 60s / on focus) and a 401 from any data/function call (the guarded
// fetch in supabaseClient.js + guardAuthError() below in each data wrapper).
// ---------------------------------------------------------------------------

// Ask the edge function whether the signed-in user still exists in auth.users.
// Returns true (active) when logged out or on any transient/unknown error — we
// only return false on an explicit { active: false } / 401 so a glitch never
// locks legitimate users out (the App.js watcher only acts on a definitive false).
export async function checkAccountStatus() {
  const { data: sessData } = await supabase.auth.getSession();
  const token = sessData?.session?.access_token;
  if (!token) return true; // not logged in — nothing to verify
  try {
    const { data, error } = await supabase.functions.invoke(
      "check-account-status",
    );
    if (error) {
      const status = (error.context && error.context.status) || error.status;
      if (status === 401) return false; // token/user no longer valid
      return true; // network/transient — fail open
    }
    return data?.active !== false;
  } catch {
    return true; // fail open
  }
}

// Convenience: check + terminate. Used by the global watcher. Returns the
// active boolean so callers can branch if needed.
export async function enforceAccountStatus() {
  const active = await checkAccountStatus();
  if (!active) terminateAccountSession();
  return active;
}

// Inspect a Supabase error; if it signals the JWT/user is no longer valid (a 401
// or a "user not found" / JWT error), the account was almost certainly deleted
// server-side → terminate the session. Returns true if it handled (terminated).
// Called from the data wrappers below as a belt-and-suspenders to the global
// guarded fetch in supabaseClient.js.
export function guardAuthError(error) {
  if (!error) return false;
  const status = error.status || error.code;
  const msg = (error.message || "").toLowerCase();
  const isAuthFailure =
    status === 401 ||
    status === "401" ||
    status === "PGRST301" || // PostgREST: JWT expired / invalid
    /\bjwt\b|not authenticated|user(_|\s).*not.*found|user not found|invalid token/.test(
      msg,
    );
  if (isAuthFailure) {
    terminateAccountSession();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Google OAuth. The same provider sign-in backs both "Sign up with Google" and
// "Log in with Google" — Supabase auto-creates the account on first sign-in, so
// we can't ask it to "sign up only" vs "log in only". Instead we:
//   1. stash the user's INTENT (signup | login) before redirecting to Google,
//      and read it back in the /auth/callback handler after the round-trip;
//   2. track a `fetchit_registered` flag in user_metadata that WE set the first
//      time someone completes the Google signup step. That flag — not mere
//      existence in auth.users — is our source of truth for "has an account",
//      so a brand-new account auto-created by an accidental "Log in with Google"
//      stays un-registered (no deadlock: a later signup still proceeds).
// AuthCallback (src/components/AuthCallback.js) routes on { intent, registered }.
// ---------------------------------------------------------------------------
export const OAUTH_INTENT_KEY = "fetchit_oauth_intent";
export const OAUTH_ERROR_KEY = "fetchit_oauth_error";

// Kick off Google OAuth. `intent` is "signup" | "login"; it's stashed so the
// callback knows which flow to run. Returns Supabase's { data, error } (an error
// means the redirect couldn't even start).
export async function signInWithGoogle(intent) {
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, intent);
  } catch {
    /* sessionStorage unavailable — callback falls back to "login" */
  }
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // Always let the user choose which Google account to use.
      queryParams: { prompt: "select_account" },
    },
  });
}

// Has this user completed FetchIt's Google signup before? Reads the flag we set
// (not raw existence in auth.users) — see the note above.
export function isRegistered(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  return !!meta.fetchit_registered;
}

// Mark the signed-in user as a fully-registered FetchIt account (set once, when
// a new Google signup is accepted). Future logins read this via isRegistered().
export async function markRegistered() {
  return supabase.auth.updateUser({ data: { fetchit_registered: true } });
}

// ---------------------------------------------------------------------------
// Auth provider detection + reauthentication. Google-only users have no
// password, so any password-gated area (Cards & Address wall, account deletion,
// change password) must branch on the provider. Detect it from the user's
// `identities` (the authoritative list of linked providers), falling back to
// `app_metadata.provider`. See the reusable <ReauthGate> component.
// ---------------------------------------------------------------------------

// The providers this user can authenticate with, e.g. ["email"], ["google"], or
// ["email","google"] (a linked account). Reads identities; falls back to the
// app_metadata provider, then "email".
export function userProviders(session) {
  const user = session && session.user;
  if (!user) return [];
  const ids = Array.isArray(user.identities) ? user.identities : [];
  const provs = ids.map((i) => i.provider).filter(Boolean);
  if (provs.length) return provs;
  const meta = user.app_metadata && user.app_metadata.provider;
  return meta ? [meta] : ["email"];
}

// True if the user has a password (an "email" identity) and can confirm with it.
export function hasPasswordIdentity(session) {
  return userProviders(session).includes("email");
}

// True for Google-only users (no password) — they reauthenticate via Google,
// and cannot change a password (there isn't one).
export function isGoogleUser(session) {
  const provs = userProviders(session);
  return provs.includes("google") && !provs.includes("email");
}

const REAUTH_KEY = "fetchit_reauth";

// Did THIS page load actually arrive with a fresh OAuth response? Captured
// SYNCHRONOUSLY at module load because Supabase's detectSessionInUrl strips the
// auth params from the URL moments later (same trick as App.js's URL_RETURN —
// module evaluation is synchronous, the strip is a later microtask). A genuine
// Google reauth return carries an implicit-flow access/refresh token in the
// hash, or a PKCE `code` in the query; a cancelled attempt (user closes the
// Google prompt and navigates back) carries none of these (often an `error`).
// This is the guard that stops a stale `purpose` marker from being replayed.
const OAUTH_RETURN_PRESENT = (() => {
  if (typeof window === "undefined" || !window.location) return false;
  try {
    const hash = new URLSearchParams(
      (window.location.hash || "").replace(/^#/, "")
    );
    const search = new URLSearchParams(window.location.search || "");
    return Boolean(
      hash.get("access_token") ||
        hash.get("refresh_token") ||
        search.get("code")
    );
  } catch {
    return false;
  }
})();

// Start a Google reauthentication: stash the gate's `purpose`, then run the
// OAuth flow with the account chooser forced. The browser redirects to Google
// and back to `returnTo` (the gated page itself, NOT /auth/callback), where
// consumeReauthResult() detects the return. Returns Supabase's { data, error }
// (an error means the redirect couldn't even start).
export async function startGoogleReauth(purpose, returnTo) {
  try {
    sessionStorage.setItem(REAUTH_KEY, purpose);
  } catch {
    /* sessionStorage unavailable */
  }
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  const path =
    returnTo || (typeof window !== "undefined" ? window.location.pathname : "/");
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}${path}`,
      queryParams: { prompt: "select_account" },
    },
  });
}

// On return from a Google reauth redirect: true exactly once, for the matching
// purpose (clears the marker). The gated page calls this on mount to resume.
// Password reauth is synchronous and never sets this.
//
// HARDENED: the marker alone isn't enough — we also require that this page load
// actually carried a fresh Google OAuth response (OAUTH_RETURN_PRESENT). A user
// who cancels at Google and navigates back manually still has the stale marker
// but NO auth params, so they're rejected and the marker is cleared (so it can't
// be replayed). This closes the "cancel → back button → bypass the wall" hole.
export function consumeReauthResult(purpose) {
  try {
    if (sessionStorage.getItem(REAUTH_KEY) !== purpose) return false;
    // Stale/replayed marker without a real OAuth return → reject and clear it.
    if (!OAUTH_RETURN_PRESENT) {
      sessionStorage.removeItem(REAUTH_KEY);
      return false;
    }
    sessionStorage.removeItem(REAUTH_KEY);
    return true;
  } catch {
    return false;
  }
}

// Login email second factor (real OTP). After the password is verified we sign
// the user out, then `sendLoginOtp` emails a 6-digit code (no user creation) and
// `verifyLoginOtp` validates it with type 'email' — wrong codes are rejected by
// Supabase, and a correct code establishes the session. (signInWithOtp uses the
// Magic Link template; see CLAUDE.md "Email templates".)
export async function sendLoginOtp(email) {
  return supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  });
}
export async function verifyLoginOtp(email, token) {
  return supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
}

// The current session (or null). Async — reads from Supabase storage.
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Display name, stored in user_metadata as { first_name, last_name }.
export function getName(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  return { firstName: meta.first_name || "", lastName: meta.last_name || "" };
}

export async function saveName(firstName, lastName) {
  return supabase.auth.updateUser({
    data: { first_name: firstName.trim(), last_name: lastName.trim() },
  });
}

// Email-confirmed password change (step 1 of 2).
// We first re-authenticate with the current password (Supabase's updateUser
// doesn't verify it), then email a confirmation link. The password is NOT
// changed yet — clicking the link opens a recovery session on /account where
// the new password is actually set (see applyNewPassword). Nothing sensitive is
// persisted across the email round-trip.
export async function requestPasswordChange(currentPassword) {
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (!email) return { error: { message: "You're not signed in." }, email: null };
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (reauthError) {
    return { error: { message: "Current password is incorrect." }, email };
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account`,
  });
  return { error, email };
}

// Forgot-password: email a reset link that returns to /reset-password. Uses the
// same "Reset Password" template as the in-app password change; the flows are
// told apart by the redirectTo path (/reset-password vs /account).
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return { error };
}

// Re-send the confirmation link (the "Resend email" button).
export async function resendPasswordChangeEmail() {
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (!email) return { error: { message: "You're not signed in." } };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account`,
  });
  return { error };
}

// Step 2 of 2: set the new password inside the recovery session that the email
// link established. Called from the "Finish your password change" form.
export async function applyNewPassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

// Verify the signed-in user's password (re-auth). Used to confirm identity
// before starting the account-deletion email flow.
export async function verifyPassword(password) {
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (!email) return { error: { message: "You're not signed in." } };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: { message: "Incorrect password" } };
  return { error: null };
}

// One-time deletion token. The session requirement (the link only works while
// signed in) is the real auth gate; the token proves the user got the email.
const makeDeleteToken = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
        .toString(36)
        .slice(2)}`;
const DELETE_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Email-confirmed account deletion (step 2): mint a one-time token (stored in
// user_metadata with a 1h expiry) and send a custom confirmation email via the
// send-email edge function (Resend/Mailtrap) — its OWN template, decoupled from
// Supabase's Magic Link template (which login OTP now owns). The email links to
// /account?type=deletion&token=<token>; AccountPage verifies the token (while
// signed in) before the deletion modals open. Used for the initial send + the
// "Resend email" button (each call rotates the token).
export async function sendAccountDeletionEmail() {
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (!email) return { error: { message: "You're not signed in." }, email: null };

  const token = makeDeleteToken();
  const expires = new Date(Date.now() + DELETE_TOKEN_TTL_MS).toISOString();
  const { error: metaError } = await supabase.auth.updateUser({
    data: { delete_token: token, delete_token_expires: expires },
  });
  if (metaError) return { error: { message: metaError.message }, email };

  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  const { error } = await supabase.functions.invoke("send-email", {
    body: { type: "deletion_confirm", token, appOrigin: origin },
  });
  if (error) {
    let message = error.message || "Couldn't send the confirmation email.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep generic */
    }
    return { error: { message }, email };
  }
  return { error: null, email };
}

// Verify a deletion token from the email link against the signed-in user's
// metadata: must match and not be expired. Pure — no network.
export function verifyDeleteToken(session, token) {
  if (!token) return false;
  const meta = (session && session.user && session.user.user_metadata) || {};
  if (!meta.delete_token || meta.delete_token !== token) return false;
  const exp = meta.delete_token_expires
    ? new Date(meta.delete_token_expires).getTime()
    : 0;
  return Number.isFinite(exp) && Date.now() < exp;
}

// Consume the deletion token (one-time use) once a valid link opens the modals.
export async function clearDeleteToken() {
  return supabase.auth.updateUser({
    data: { delete_token: null, delete_token_expires: null },
  });
}

// Delete the signed-in user via the delete_user() RPC (see supabase/schema.sql).
// Deleting the auth.users row cascades to that user's chats and orders.
export async function deleteAccount() {
  const { error } = await supabase.rpc("delete_user");
  if (error) return { error };
  // Tear the session down locally. `scope: "local"` skips the network logout —
  // the user no longer exists, so a global sign-out would just fail — and clears
  // the session synchronously so no stale auth lingers to cause a redirect flash.
  await supabase.auth.signOut({ scope: "local" });
  try {
    [
      "fetchit_pending_plan",
      "fetchit_pw_recovery",
      "fetchit_delete_intent",
      "fetchit_reset_recovery",
    ].forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    // Belt and suspenders: drop any Supabase auth token still in storage.
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-") && k.includes("-auth-token"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore storage access errors */
  }
  return { error: null };
}

// Fire-and-forget branded email for a plan event ("purchase" | "cancellation" |
// "reactivation") via the send-email edge function. Never throws and isn't
// awaited by callers — email is a nice-to-have and must not break the plan
// action or delay navigation. The recipient is set server-side from the JWT.
export async function sendPlanEmail(payload) {
  // TEMP DEBUG (remove once email is confirmed working) ----------------------
  console.log("[send-email] sendPlanEmail() called with payload:", payload);
  try {
    const origin =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const body = { appOrigin: origin, ...payload };
    console.log("[send-email] invoking edge function 'send-email' with body:", body);

    const { data, error } = await supabase.functions.invoke("send-email", {
      body,
    });

    console.log("[send-email] invoke() returned →", { data, error });

    if (error) {
      // invoke() only gives a generic "non-2xx status code" message; the REAL
      // server error is in error.context (the Response). Read it so we can see
      // the actual cause (e.g. "Email is not configured.", an SMTP failure, or
      // "Not authenticated.").
      let detail = error.message;
      try {
        if (error.context && typeof error.context.json === "function") {
          const serverBody = await error.context.json();
          detail = serverBody?.error || JSON.stringify(serverBody);
        }
      } catch (parseErr) {
        console.warn("[send-email] couldn't parse server error body:", parseErr);
      }
      console.error(
        "[send-email] ❌ FAILED:",
        error.name || "Error",
        "→",
        detail
      );
      return { error: { message: detail } };
    }

    console.log("[send-email] ✅ SUCCESS — server response:", data);
    return { data };
  } catch (e) {
    // Network-level / unexpected throw (function unreachable, CORS, etc.).
    console.error("[send-email] ❌ threw before/while invoking:", e);
    return { error: { message: (e && e.message) || String(e) } };
  }
  // -------------------------------------------------------------------------
}

// Record the chosen plan on the user's metadata (and the demo signups list).
// Normalizes the plan name, sets family_members (Max includes up to 5), and for
// paid plans stamps the billing period + start date so we can show the next
// billing date on the account page (no backend round-trip needed).
export async function finalizePlan(plan, billing) {
  const key = planKey(plan); // Free | Plus | Pro | Max
  const paid = key !== "Free";
  await supabase.auth.updateUser({
    data: {
      plan: key,
      // Max includes family sharing (up to 5 members); 0 on every other plan.
      family_members: key === "Max" ? 5 : 0,
      // Billing period + start (cleared on Free) — drives nextBillingDate().
      plan_billing: paid ? (billing === "annual" ? "annual" : "monthly") : null,
      plan_started_at: paid ? new Date().toISOString() : null,
      // Activating any plan clears a prior scheduled cancellation.
      plan_cancels_at: null,
    },
  });
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (email) saveSignup({ email, plan: key });
  // NB: confirmation emails are NOT sent here. CheckoutPage sends the right one
  // (purchase / upgrade-welcome / downgrade / billing_change) after payment, so
  // it has the full before→after context. finalizePlan only writes metadata.
}

// Classify a desired plan/billing relative to the user's current subscription —
// drives both the /plans button labels and the post-payment Stripe + email
// actions. Returns { type, fromPlan, fromBilling }:
//   current        — same plan AND same billing (no-op)
//   purchase       — user has no paid plan yet (first paid plan)
//   upgrade        — moving to a higher tier
//   downgrade      — moving to a lower tier (or any paid → Free)
//   billing_change — same plan, switching monthly ⇄ annual
export function detectPlanChange(session, newPlan, newBilling) {
  const current = getPlan(session); // effective plan (Free if lapsed)
  const currentBilling = getPlanBilling(session);
  const paid = hasPlan(session) && current !== "Free";
  const rank = { Free: 0, Plus: 1, Pro: 2, Max: 3, max_family: 3 };

  if (newPlan === "Free") {
    if (paid) return { type: "downgrade", fromPlan: current, fromBilling: currentBilling };
    // Not paid: "current" only if they're explicitly on Free already; a brand-new
    // user with no plan yet can still pick it (treated as a first selection).
    return hasPlan(session)
      ? { type: "current", fromPlan: "Free", fromBilling: null }
      : { type: "purchase", fromPlan: null, fromBilling: null };
  }
  if (!paid) return { type: "purchase", fromPlan: null, fromBilling: null };
  if (current === newPlan) {
    return currentBilling === newBilling
      ? { type: "current", fromPlan: current, fromBilling: currentBilling }
      : { type: "billing_change", fromPlan: current, fromBilling: currentBilling };
  }
  return {
    type: rank[newPlan] > rank[current] ? "upgrade" : "downgrade",
    fromPlan: current,
    fromBilling: currentBilling,
  };
}

// Cancel the user's existing Stripe subscription(s) during a plan change, via
// the cancel-subscription edge function. Pass exceptSubscriptionId = the NEW
// subscription so it isn't cancelled, and atPeriodEnd to choose immediate
// (upgrade / billing switch) vs end-of-period (downgrade) cancellation. No
// metadata or email side effects (unlike cancelSubscription).
export async function cancelStripeSubscriptions({
  exceptSubscriptionId = null,
  atPeriodEnd = true,
} = {}) {
  const { data, error } = await supabase.functions.invoke("cancel-subscription", {
    body: { exceptSubscriptionId, atPeriodEnd },
  });
  if (error) {
    let message = error.message || "Could not update your old subscription.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep generic */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  return { data };
}

// ---------------------------------------------------------------------------
// Plans, token limits & usage sessions (INTERNAL — never surfaced to users).
// Each plan gets a per-session token budget that resets every 5 hours. Usage is
// tracked in the Supabase `sessions` table (one row per 5h window, scoped per
// user by RLS). Token counts and limits are deliberately invisible in the UI —
// when a window is exhausted the user only sees a friendly "limit reached"
// message with the reset countdown and an upgrade nudge.
// ---------------------------------------------------------------------------

// Normalize any plan label to the canonical key. "max_family" is a real Max
// subscriber's invited family member — same usage limits as Max, but no
// subscription of their own (covered by the owner) and no family-sharing/invite
// powers. It stays lowercase to mark it apart from the paid "Max" tier.
export function planKey(plan) {
  const p = (plan == null ? "" : String(plan)).trim().toLowerCase();
  if (p === "plus") return "Plus";
  if (p === "pro") return "Pro";
  if (p === "max") return "Max";
  if (p === "max_family") return "max_family";
  return "Free";
}

// A Max OWNER (real paid Max subscriber) — can use family sharing / invite.
export function isMaxOwner(session) {
  return getPlan(session) === "Max";
}

// A family MEMBER on someone else's Max plan — Max-level access, no invite power.
export function isFamilyMember(session) {
  return getPlan(session) === "max_family";
}

// Friendly plan name for display (the raw key "max_family" → "Max (Family)").
export function planDisplayName(plan) {
  const key = planKey(plan);
  return key === "max_family" ? "Max (Family)" : key;
}

// Scheduled-cancellation timestamp (ms since epoch) from metadata, or null.
function cancelAtMs(meta) {
  if (!meta || !meta.plan_cancels_at) return null;
  const t = new Date(meta.plan_cancels_at).getTime();
  return Number.isNaN(t) ? null : t;
}

// Has the user picked a plan yet? Reads the RAW metadata flag (not getPlan,
// which defaults to "Free") so a freshly-verified user with no plan is
// distinguishable from someone who chose Free. Drives the /plans gate.
export function hasPlan(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  return !!meta.plan;
}

// The signed-in user's current (effective) plan, normalized. A scheduled
// cancellation keeps the paid plan until plan_cancels_at — only once that date
// passes does the user become Free. This is the single source of truth, so
// token limits, the account card, and /plans all honor the grace period.
//
// A family member (max_family) similarly keeps access until family_disband_at
// (set when their owner cancels Max); after that date getPlan returns Free —
// the lazy-disband cutoff. The actual metadata/membership cleanup happens on the
// member's next app use (familyDisbandDue → leaveFamily).
export function getPlan(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  const at = cancelAtMs(meta);
  if (at !== null && Date.now() >= at) return "Free";
  const key = planKey(meta.plan);
  if (key === "max_family" && familyDisbandAtMs(meta) !== null) {
    if (Date.now() >= familyDisbandAtMs(meta)) return "Free";
  }
  return key;
}

// family_disband_at (ms since epoch) from a member's metadata, or null.
function familyDisbandAtMs(meta) {
  if (!meta || !meta.family_disband_at) return null;
  const t = new Date(meta.family_disband_at).getTime();
  return Number.isNaN(t) ? null : t;
}

// True when a family member's owner has cancelled and the disband date has
// passed — the member should be finalized (downgraded + membership removed) on
// their next app use. (getPlan already reports Free; this drives the cleanup.)
export function familyDisbandDue(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  if (planKey(meta.plan) !== "max_family") return false;
  const at = familyDisbandAtMs(meta);
  return at !== null && Date.now() >= at;
}

// The scheduled family-disband Date for a member (access ends then), or null.
export function familyDisbandAt(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  const at = familyDisbandAtMs(meta);
  return at === null ? null : new Date(at);
}

// The owner of a family member's plan, for display ("name or email").
export function familyOwnerLabel(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  return meta.family_owner_name || meta.family_owner_email || "the plan owner";
}

// True when a cancellation is scheduled but the access period hasn't ended yet
// (the user still has their paid plan until plan_cancels_at).
export function isCanceled(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  const at = cancelAtMs(meta);
  return at !== null && Date.now() < at;
}

// The scheduled cancellation date (Date) or null.
export function planCancelsAt(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  const at = cancelAtMs(meta);
  return at === null ? null : new Date(at);
}

// The user's billing period ("monthly" | "annual"), from metadata.
export function getPlanBilling(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  return meta.plan_billing === "annual" ? "annual" : "monthly";
}

// Friendly, token-free usage descriptor for the account page (limits stay
// internal — we only ever describe usage relative to Free).
export const PLAN_USAGE_LABEL = {
  Free: "Base usage",
  Plus: "Up to 2× Free usage",
  Pro: "Up to 5× Free usage",
  Max: "Up to 25× Free usage",
  max_family: "Up to 25× Free usage", // same as Max
};
export function planUsageLabel(plan) {
  return PLAN_USAGE_LABEL[planKey(plan)];
}

// Approximate next billing date for a paid plan: roll the stored start date
// forward by the billing interval until it lands in the future. Returns a Date,
// or null on Free / when we have no start stamp. (Approximate by design — it
// avoids a Stripe round-trip; the real renewal lives in Stripe.)
export function nextBillingDate(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  if (planKey(meta.plan) === "Free" || !meta.plan_started_at) return null;
  const start = new Date(meta.plan_started_at);
  if (Number.isNaN(start.getTime())) return null;
  const annual = meta.plan_billing === "annual";
  const d = new Date(start);
  const now = Date.now();
  let guard = 0;
  while (d.getTime() <= now && guard < 1200) {
    if (annual) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    guard += 1;
  }
  return d;
}

// Cancel the user's paid subscription at period end. Calls the
// cancel-subscription edge function (sets cancel_at_period_end on their Stripe
// subscription), then records plan_cancels_at = the period end. The plan itself
// is NOT downgraded now — getPlan() keeps returning the paid plan until that
// date passes, so the user keeps full access (matching the policy text).
// Pass { suppressEmail: true } when the caller sends its own email (e.g. the
// /plans "Downgrade to Free" flow sends a `downgrade` email instead).
export async function cancelSubscription({ suppressEmail = false } = {}) {
  const { data, error } = await supabase.functions.invoke(
    "cancel-subscription",
    { body: {} }
  );
  if (error) {
    let message = error.message || "Could not cancel your subscription.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  // Prefer Stripe's authoritative period end; fall back to our computed renewal.
  const session = await getSession();
  let cancelsAt = null;
  if (data && typeof data.periodEnd === "number") {
    cancelsAt = new Date(data.periodEnd * 1000);
  } else {
    cancelsAt = nextBillingDate(session);
  }
  // Capture the plan being cancelled before metadata changes (session is still
  // pre-cancellation here, so getPlan returns the active paid plan).
  const canceledPlan = getPlan(session);
  const { error: metaError } = await supabase.auth.updateUser({
    data: { plan_cancels_at: cancelsAt ? cancelsAt.toISOString() : null },
  });
  if (metaError) return { error: { message: metaError.message } };
  if (!suppressEmail) {
    sendPlanEmail({
      type: "cancellation",
      plan: canceledPlan,
      dateISO: cancelsAt ? cancelsAt.toISOString() : null,
    });
  }
  // Cancelling Max → SCHEDULE the family disband for the period end. Members keep
  // their max_family access until then (and are emailed that it ends on that
  // date), then get lazily downgraded to Free on their next app use.
  if (canceledPlan === "Max") {
    scheduleFamilyDisband(cancelsAt ? cancelsAt.toISOString() : null);
  }
  return { error: null, cancelsAt, canceledPlan };
}

// Undo a scheduled cancellation. Calls the reactivate-subscription edge function
// (clears cancel_at_period_end in Stripe), then removes plan_cancels_at so the
// plan is fully active again.
export async function reactivateSubscription() {
  const { data, error } = await supabase.functions.invoke(
    "reactivate-subscription",
    { body: {} }
  );
  if (error) {
    let message = error.message || "Could not reactivate your subscription.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  // Read plan + renewal date while plan_cancels_at is still set (so getPlan
  // returns the paid plan, not Free) for the confirmation email.
  const session = await getSession();
  const reactivatedPlan = getPlan(session);
  const nextBill = nextBillingDate(session);
  const { error: metaError } = await supabase.auth.updateUser({
    data: { plan_cancels_at: null },
  });
  if (metaError) return { error: { message: metaError.message } };
  sendPlanEmail({
    type: "reactivation",
    plan: reactivatedPlan,
    dateISO: nextBill ? nextBill.toISOString() : null,
  });
  // Reactivating Max → call off the scheduled family disband (members stay).
  if (reactivatedPlan === "Max") unscheduleFamilyDisband();
  return { error: null };
}

// Per-session token budgets — the per-5-hour-window cap. These values are the
// authoritative numbers from the FetchIt Terms of Service (Section 6, "Usage
// Limits and Token Allocation"); the TOS is the legal source of truth, so this
// table MUST stay in sync with /tos (src/components/TosPage.js).
export const TOKEN_LIMITS = {
  Free: 50000,
  Plus: 130000,
  Pro: 325000,
  Max: 1625000,
  max_family: 1625000, // family members get Max-level limits
};

export function tokenLimit(plan) {
  return TOKEN_LIMITS[planKey(plan)];
}

// Weekly token caps, also from the TOS (Section 6). Kept in sync with /tos and
// ENFORCED via the `weekly_usage` table alongside the 5-hour `sessions` window
// (see ChatPage `consumeOrBlock`).
export const WEEKLY_TOKEN_LIMITS = {
  Free: 100000,
  Plus: 355000,
  Pro: 1811000,
  Max: 9579000,
  max_family: 9579000, // family members get Max-level limits
};

export function weeklyTokenLimit(plan) {
  return WEEKLY_TOKEN_LIMITS[planKey(plan)];
}

// Usage window length — every plan resets every 5 hours.
export const SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;
// Weekly window length, for the TOS weekly cap (see WEEKLY_TOKEN_LIMITS).
export const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// What to suggest when a plan hits its limit: the next tier up and how much more
// usage it gives versus Free. Max is the top tier (no upgrade).
export const NEXT_PLAN = {
  Free: { plan: "Plus", multiplier: "2x" },
  Plus: { plan: "Pro", multiplier: "5x" },
  Pro: { plan: "Max", multiplier: "25x" },
  Max: null,
  max_family: null, // already at Max-level; nothing to upgrade to
};

// Rough token estimate for the mock chat (~4 chars/token). Good enough for a
// demo usage meter — there's no real model to count against.
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
}

// Human countdown to when a window resets, e.g. "2 hours 14 minutes".
export function formatResetIn(sessionStart) {
  const resetAt = new Date(sessionStart).getTime() + SESSION_WINDOW_MS;
  const ms = Math.max(0, resetAt - Date.now());
  const totalMin = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const text = `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${
    minutes === 1 ? "" : "s"
  }`;
  return { hours, minutes, text };
}

const mapSession = (row) => ({
  id: row.id,
  plan: row.plan,
  tokensUsed: Number(row.tokens_used) || 0,
  sessionStart: row.session_start,
});

export function isSessionExpired(sess) {
  if (!sess) return true;
  return Date.now() - new Date(sess.sessionStart).getTime() >= SESSION_WINDOW_MS;
}

// The user's active (non-expired) usage window, or null. Reads the newest row.
export async function getActiveSession() {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("session_start", { ascending: false })
    .limit(1);
  if (error) {
    console.error("getActiveSession failed:", error.message);
    return null;
  }
  const row = data && data[0];
  if (!row) return null;
  const sess = mapSession(row);
  return isSessionExpired(sess) ? null : sess;
}

// The active window, starting a fresh one if none is active / it expired.
// Returns null only on a DB error (callers fail open so chat still works).
export async function getOrCreateSession(plan) {
  const active = await getActiveSession();
  if (active) return active;
  const { data, error } = await supabase
    .from("sessions")
    .insert({ plan: planKey(plan), tokens_used: 0 })
    .select()
    .single();
  if (error) {
    console.error("getOrCreateSession failed:", error.message);
    return null;
  }
  return mapSession(data);
}

// Add tokens to a window and return the new running total.
export async function addSessionTokens(sessionId, currentUsed, tokens) {
  const total = (Number(currentUsed) || 0) + (Number(tokens) || 0);
  const { error } = await supabase
    .from("sessions")
    .update({ tokens_used: total })
    .eq("id", sessionId);
  if (error) console.error("addSessionTokens failed:", error.message);
  return total;
}

// ---------------------------------------------------------------------------
// Weekly usage window (TOS §6 weekly cap). One row per week in the Supabase
// `weekly_usage` table; the week resets every Monday at 12:00 AM LOCAL time.
// Enforced alongside the 5-hour `sessions` window — a send is blocked if EITHER
// window is exhausted. Same fail-open behaviour: a DB error (e.g. table not yet
// migrated) returns null and the caller doesn't block.
// ---------------------------------------------------------------------------

// Start of the current week: this week's Monday at 00:00 local time (ms since
// epoch). Same Monday-anchored calc as the analytics "weekly" period.
export function weekStartMs() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight today
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow); // back to Monday
  return d.getTime();
}

// The next reset moment — next Monday 00:00 local (a Date).
export function nextWeeklyReset() {
  return new Date(weekStartMs() + WEEK_WINDOW_MS);
}

const mapWeekly = (row) => ({
  id: row.id,
  plan: row.plan,
  tokensUsed: Number(row.tokens_used) || 0,
  weekStart: row.week_start,
});

// True once the stored row belongs to an earlier week (i.e. Monday has passed).
export function isWeekExpired(week) {
  if (!week) return true;
  return new Date(week.weekStart).getTime() !== weekStartMs();
}

// The user's active (current-week) usage row, or null. Reads the newest row.
export async function getActiveWeeklyUsage() {
  const { data, error } = await supabase
    .from("weekly_usage")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(1);
  if (error) {
    console.error("getActiveWeeklyUsage failed:", error.message);
    return null;
  }
  const row = data && data[0];
  if (!row) return null;
  const week = mapWeekly(row);
  return isWeekExpired(week) ? null : week;
}

// The active weekly row, creating a fresh one (the weekly reset) if none exists
// for the current week. Returns null only on a DB error (callers fail open).
export async function getOrCreateWeeklyUsage(plan) {
  const active = await getActiveWeeklyUsage();
  if (active) return active;
  const weekStart = new Date(weekStartMs()).toISOString();
  const { data, error } = await supabase
    .from("weekly_usage")
    .insert({ plan: planKey(plan), tokens_used: 0, week_start: weekStart })
    .select()
    .single();
  if (error) {
    console.error("getOrCreateWeeklyUsage failed:", error.message);
    return null;
  }
  return mapWeekly(data);
}

// Add tokens to the weekly row and return the new running total.
export async function addWeeklyTokens(weeklyId, currentUsed, tokens) {
  const total = (Number(currentUsed) || 0) + (Number(tokens) || 0);
  const { error } = await supabase
    .from("weekly_usage")
    .update({ tokens_used: total })
    .eq("id", weeklyId);
  if (error) console.error("addWeeklyTokens failed:", error.message);
  return total;
}

// ---------------------------------------------------------------------------
// Stripe — real subscriptions via the `create-subscription` Edge Function.
// The secret key lives only in that function (server-side); the browser just
// confirms the PaymentIntent it returns. See supabase/functions/.
// ---------------------------------------------------------------------------

// Ask the edge function to reuse-or-create the user's Stripe customer and start
// an incomplete subscription for `plan` (billing: "monthly" | "annual").
// Returns { clientSecret, subscriptionId, customerId } or { error }.
export async function createSubscription({ plan, billing }) {
  const { data, error } = await supabase.functions.invoke(
    "create-subscription",
    { body: { plan, billing } }
  );
  if (error) {
    // Surface the function's JSON error message when present.
    let message = error.message || "Could not start your subscription.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  return { data };
}

// Ask the edge function to reuse-or-create the user's Stripe customer and start
// a SetupIntent (save a card for future off-session charges, NO charge now).
// Returns { clientSecret, customerId } or { error }. Confirm it in the browser
// with stripe.confirmCardSetup(clientSecret, { payment_method: { card, … } }).
export async function createSetupIntent() {
  const { data, error } = await supabase.functions.invoke("create-setup-intent", {
    body: {},
  });
  if (error) {
    let message = error.message || "Could not start card setup.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  return { data };
}

// After confirmCardSetup succeeds, hand the resulting payment_method id to the
// edge function: it sets the card as the customer's default and returns the
// NON-sensitive card metadata { brand, last4, expMonth, expYear } for display.
export async function saveCard(paymentMethodId) {
  const { data, error } = await supabase.functions.invoke("save-card", {
    body: { paymentMethodId },
  });
  if (error) {
    let message = error.message || "Could not save your card.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  return { data };
}

// ---------------------------------------------------------------------------
// Profiles — Supabase "profiles" table (shipping address + Stripe pointers +
// display-only card metadata), one row per user, scoped via RLS. user_id is the
// table's primary key and defaults to auth.uid(), so the client never sends it.
// ---------------------------------------------------------------------------
const mapProfile = (row) =>
  row
    ? {
        fullName: row.full_name || "",
        addressLine1: row.address_line1 || "",
        addressLine2: row.address_line2 || "",
        city: row.city || "",
        state: row.state || "",
        zip: row.zip || "",
        country: row.country || "United States",
        stripeCustomerId: row.stripe_customer_id || null,
        stripePaymentMethodId: row.stripe_payment_method_id || null,
        cardBrand: row.card_brand || null,
        cardLast4: row.card_last4 || null,
        cardExpMonth: row.card_exp_month || null,
        cardExpYear: row.card_exp_year || null,
        tosAccepted: !!row.tos_accepted,
        tosAcceptedAt: row.tos_accepted_at || null,
      }
    : null;

// The signed-in user's profile row, or null if they haven't saved one yet.
export async function getProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle();
  if (error) {
    guardAuthError(error);
    console.error("getProfile failed:", error.message);
    return null;
  }
  return mapProfile(data);
}

// Upsert the caller's profile. Accepts a partial of camelCase fields and writes
// only the snake_case columns present, plus updated_at. user_id is filled by the
// table's auth.uid() default and is the upsert conflict target.
export async function saveProfile(fields) {
  const map = {
    fullName: "full_name",
    addressLine1: "address_line1",
    addressLine2: "address_line2",
    city: "city",
    state: "state",
    zip: "zip",
    country: "country",
    stripeCustomerId: "stripe_customer_id",
    stripePaymentMethodId: "stripe_payment_method_id",
    cardBrand: "card_brand",
    cardLast4: "card_last4",
    cardExpMonth: "card_exp_month",
    cardExpYear: "card_exp_year",
    tosAccepted: "tos_accepted",
    tosAcceptedAt: "tos_accepted_at",
  };
  const row = { updated_at: new Date().toISOString() };
  for (const [camel, snake] of Object.entries(map)) {
    if (fields[camel] !== undefined) row[snake] = fields[camel];
  }
  const { error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    guardAuthError(error);
    console.error("saveProfile failed:", error.message);
    return { error: { message: error.message } };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Family sharing (Max plan). An owner invites up to 4 people; the cross-user
// parts (sending the email to an arbitrary invitee, reading/accepting an invite
// by token as a different/logged-out user, downgrading a removed member) run in
// the family-* Edge Functions with the service role. The owner's own reads of
// their invites/members are plain RLS-scoped queries below.
// ---------------------------------------------------------------------------
export const MAX_FAMILY_SLOTS = 4;

// A family-invite token, persisted across the signup/login round-trip so a user
// who follows a join link and then creates an account / signs in still accepts
// the right invite afterwards.
const FAMILY_INVITE_KEY = "fetchit_family_invite";
export function setFamilyInviteToken(token) {
  try {
    localStorage.setItem(FAMILY_INVITE_KEY, token);
  } catch {
    /* ignore */
  }
}
export function getFamilyInviteToken() {
  try {
    return localStorage.getItem(FAMILY_INVITE_KEY);
  } catch {
    return null;
  }
}
export function clearFamilyInviteToken() {
  try {
    localStorage.removeItem(FAMILY_INVITE_KEY);
  } catch {
    /* ignore */
  }
}

// Unwrap an edge-function call to { data } | { error: { message } }.
async function invokeFamily(fn, body, fallbackMsg) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message || fallbackMsg;
    try {
      const b = await error.context?.json?.();
      if (b?.error) message = b.error;
    } catch {
      /* keep generic */
    }
    return { error: { message } };
  }
  if (data?.error) return { error: { message: data.error } };
  return { data };
}

// Owner: read this user's slots (their non-declined invites, member emails
// resolved from the accepted ones). Returns up to MAX_FAMILY_SLOTS entries:
// { id, email, status } where status is "pending" | "accepted".
export async function getFamilyData() {
  const { data, error } = await supabase
    .from("family_invites")
    .select("id, invitee_email, status, created_at")
    .neq("status", "declined")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getFamilyData failed:", error.message);
    return [];
  }
  return (data || [])
    .slice(0, MAX_FAMILY_SLOTS)
    .map((r) => ({ id: r.id, email: r.invitee_email, status: r.status }));
}

// Owner: create + email an invite (server-side; verifies Max + the 4-slot cap).
export async function sendFamilyInvite(email) {
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  return invokeFamily(
    "send-family-invite",
    { email: String(email || "").trim(), appOrigin: origin },
    "Couldn't send the invite."
  );
}

// App origin for email logo URLs (absolute) — empty during SSR/tests.
const originForEmail = () =>
  typeof window !== "undefined" && window.location ? window.location.origin : "";

// Owner: remove a slot — revoke a pending invite or remove an accepted member
// (downgrades that member to Free). `inviteId` identifies the slot.
export async function removeFamilyMember(inviteId) {
  return invokeFamily(
    "family-manage",
    { action: "remove", inviteId, appOrigin: originForEmail() },
    "Couldn't remove the member."
  );
}

// Owner: disband the whole family IMMEDIATELY (downgrade + notify all members).
// Used on a plan CHANGE off Max (the owner switches to a lower tier now).
export async function disbandFamily() {
  return invokeFamily(
    "family-manage",
    { action: "disband", appOrigin: originForEmail() },
    "Couldn't disband the family."
  );
}

// Owner: SCHEDULE the family disband for the owner's period end. Members keep
// max_family access until `disbandAtISO` (mirrored onto their metadata as
// family_disband_at), and are emailed that access ends then. Used on Max
// CANCELLATION (the owner keeps Max until the period ends, so members do too).
export async function scheduleFamilyDisband(disbandAtISO) {
  return invokeFamily(
    "family-manage",
    { action: "schedule", disbandAt: disbandAtISO, appOrigin: originForEmail() },
    "Couldn't schedule the family change."
  );
}

// Owner: undo a scheduled disband (the owner reactivated their Max plan).
export async function unscheduleFamilyDisband() {
  return invokeFamily("family-manage", { action: "unschedule" }, "Couldn't update the family.");
}

// Member: leave the family — removes their membership and sets their plan to
// Free. Used by the "Leave Family" button AND the lazy finalize once a scheduled
// disband date has passed. Refreshes the session so getPlan() reflects Free.
// Sets SELF_LEFT_KEY first so PlanChangeWatcher doesn't mistake this self-
// initiated max_family→Free downgrade for being removed by the owner.
export const SELF_LEFT_KEY = "fetchit_left_family";
export async function leaveFamily() {
  const res = await invokeFamily("family-manage", { action: "leave" }, "Couldn't leave the family.");
  if (!res.error) {
    try {
      sessionStorage.setItem(SELF_LEFT_KEY, "1");
    } catch {
      /* ignore */
    }
    await supabase.auth.refreshSession();
  }
  return res;
}

// Join flow: validate a token (public — works logged out). Returns
// { ownerName, inviteeEmail, status } or { error }.
export async function validateFamilyInvite(token) {
  return invokeFamily("family-invite", { action: "validate", token }, "Invalid invite.");
}

// Join flow: accept (must be logged in). Creates the membership, sets the
// caller's plan to max_family, marks the invite accepted. On success we refresh
// the local session so getPlan() immediately reflects the new max_family plan
// (the admin metadata write doesn't auto-propagate to this client otherwise).
export async function acceptFamilyInvite(token) {
  const res = await invokeFamily(
    "family-invite",
    { action: "accept", token },
    "Couldn't accept the invite."
  );
  if (!res.error) await supabase.auth.refreshSession();
  return res;
}

// Join flow: decline the invite.
export async function declineFamilyInvite(token) {
  return invokeFamily("family-invite", { action: "decline", token }, "Couldn't decline the invite.");
}

// Accept a pending family invite stashed during a join-link signup/login, if
// any. Returns { accepted } — callers route to /chat regardless (a failed accept
// just leaves them on Free). Used by the login paths AND onboarding completion.
export async function maybeAcceptPendingInvite() {
  const token = getFamilyInviteToken();
  if (!token) return { accepted: false };
  const res = await acceptFamilyInvite(token);
  clearFamilyInviteToken();
  return { accepted: !res.error, error: res.error };
}

// ---------------------------------------------------------------------------
// Pending plan — a plan clicked while logged out, resumed after sign-in.
// Transient UI state, kept in localStorage.
// ---------------------------------------------------------------------------
const PENDING_PLAN_KEY = "fetchit_pending_plan";

export function setPendingPlan(plan) {
  localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify(plan));
}
export function getPendingPlan() {
  try {
    const raw = localStorage.getItem(PENDING_PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function clearPendingPlan() {
  localStorage.removeItem(PENDING_PLAN_KEY);
}

// ---------------------------------------------------------------------------
// Chat history — Supabase "chats" table, scoped to the user via RLS.
// Rows: { id, user_id, title, messages (jsonb), created_at }.
// ---------------------------------------------------------------------------
const mapChat = (row) => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  messages: Array.isArray(row.messages) ? row.messages : [],
});

export async function getChats() {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    guardAuthError(error);
    console.error("getChats failed:", error.message);
    return [];
  }
  return (data || []).map(mapChat);
}

// Upsert a chat by id. user_id is filled in by the table's auth.uid() default.
export async function saveChat(chat) {
  if (!chat || !chat.id) return null;
  const { data, error } = await supabase
    .from("chats")
    .upsert({ id: chat.id, title: chat.title, messages: chat.messages })
    .select()
    .single();
  if (error) {
    guardAuthError(error);
    console.error("saveChat failed:", error.message);
    return null;
  }
  return mapChat(data);
}

export async function deleteChat(chatId) {
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) {
    guardAuthError(error);
    console.error("deleteChat failed:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Order history — Supabase "orders" table, scoped to the user via RLS.
// Rows: { id, user_id, product_name, product_image, retailer, order_price,
//         service_fee, zinc_order_id, status, created_at }.
// ---------------------------------------------------------------------------

// FetchIt's service fee — what we charge on top of the retailer's price for
// doing the checkout (demo only; no real money changes hands):
//   under $20      → flat $2.00
//   $20 and over   → $1.00 + 5% of the order price
export const SERVICE_FEE_FLAT = 2.0; // orders under the threshold
export const SERVICE_FEE_THRESHOLD = 20;
export const SERVICE_FEE_BASE = 1.0; // base for orders at/over the threshold
export const SERVICE_FEE_RATE = 0.05; // + this share of the order price

// Parse a price like "$34.99" / 34.99 → 34.99 (number), or null if unparseable.
function parsePrice(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function serviceFeeFor(price) {
  const amount = parsePrice(price);
  if (amount == null) return null;
  const fee =
    amount < SERVICE_FEE_THRESHOLD
      ? SERVICE_FEE_FLAT
      : SERVICE_FEE_BASE + amount * SERVICE_FEE_RATE;
  return Math.round(fee * 100) / 100;
}

export async function saveOrder({
  productName,
  price,
  productImage = null,
  retailer = null,
  category = null,
  zincOrderId = null,
  status = "completed",
}) {
  const orderPrice = parsePrice(price);
  const { error } = await supabase.from("orders").insert({
    product_name: productName,
    product_image: productImage,
    retailer,
    // Product category from Zinc's response (mocked in the demo) — powers the
    // category breakdown on the Orders & Analytics page.
    category,
    order_price: orderPrice,
    service_fee: serviceFeeFor(price),
    zinc_order_id: zincOrderId,
    status,
  });
  if (error) {
    guardAuthError(error);
    console.error("saveOrder failed:", error.message);
  }
}

const mapOrder = (row) => ({
  id: row.id,
  productName: row.product_name,
  productImage: row.product_image,
  retailer: row.retailer,
  category: row.category,
  // Fall back to the legacy text `price` column for rows saved before the
  // schema gained order_price (older installs).
  orderPrice:
    row.order_price != null ? Number(row.order_price) : parsePrice(row.price),
  serviceFee: row.service_fee != null ? Number(row.service_fee) : null,
  zincOrderId: row.zinc_order_id,
  status: row.status,
  createdAt: row.created_at,
});

export async function getOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    guardAuthError(error);
    console.error("getOrders failed:", error.message);
    return [];
  }
  return (data || []).map(mapOrder);
}

// ---------------------------------------------------------------------------
// Spend analytics (Orders & Analytics page). All client-side over the orders
// list. "Spend" for an order = order_price only (the service fee is excluded).
// Periods are CALENDAR-based (local time): weekly = since this Monday, monthly =
// since the 1st, yearly = since Jan 1; lifetime = all time.
// ---------------------------------------------------------------------------
export const SPEND_PERIODS = [
  { key: "lifetime", label: "Lifetime" },
  { key: "yearly", label: "Yearly" },
  { key: "monthly", label: "Monthly" },
  { key: "weekly", label: "Weekly" },
];

function orderSpend(o) {
  return Number(o.orderPrice) || 0;
}

// Inclusive start-of-period timestamp (ms, local time). Lifetime → -Infinity.
function periodStart(periodKey) {
  const now = new Date();
  const y = now.getFullYear();
  switch (periodKey) {
    case "weekly": {
      // Midnight at the start of the most recent Monday (Mon=0 … Sun=6).
      const start = new Date(y, now.getMonth(), now.getDate());
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow);
      return start.getTime();
    }
    case "monthly":
      return new Date(y, now.getMonth(), 1).getTime();
    case "yearly":
      return new Date(y, 0, 1).getTime();
    case "lifetime":
    default:
      return -Infinity;
  }
}

function withinPeriod(o, periodKey) {
  if (periodKey === "lifetime") return true;
  const t = new Date(o.createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= periodStart(periodKey);
}

// Total spend per period → { lifetime, yearly, monthly, weekly } (numbers).
export function spendSummary(orders) {
  const out = {};
  for (const p of SPEND_PERIODS) {
    out[p.key] = (orders || []).reduce(
      (sum, o) => sum + (withinPeriod(o, p.key) ? orderSpend(o) : 0),
      0
    );
  }
  return out;
}

// Category totals within a period, sorted high→low: [{ category, total }, …].
export function categoryBreakdown(orders, periodKey) {
  const period =
    SPEND_PERIODS.find((p) => p.key === periodKey) || SPEND_PERIODS[0];
  const totals = new Map();
  for (const o of orders || []) {
    if (!withinPeriod(o, period.key)) continue;
    const cat = o.category || "Uncategorized";
    totals.set(cat, (totals.get(cat) || 0) + orderSpend(o));
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}
