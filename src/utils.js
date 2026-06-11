// Shared helpers. Auth, chat history, and order history are backed by Supabase;
// the early-access email capture (admin/demo) stays in localStorage since it's
// not tied to a real account.
import { supabase } from "./supabaseClient";

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
    // Confirmation link returns to /plans, where the just-verified (plan-less)
    // user picks a plan. detectSessionInUrl signs them in on arrival.
    options: { emailRedirectTo: `${window.location.origin}/plans` },
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

export async function signOut() {
  return supabase.auth.signOut();
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
  const rank = { Free: 0, Plus: 1, Pro: 2, Max: 3 };

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

// Normalize any plan label to the canonical capitalized name.
export function planKey(plan) {
  const p = (plan == null ? "" : String(plan)).trim().toLowerCase();
  if (p === "plus") return "Plus";
  if (p === "pro") return "Pro";
  if (p === "max") return "Max";
  return "Free";
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
export function getPlan(session) {
  const meta = (session && session.user && session.user.user_metadata) || {};
  const at = cancelAtMs(meta);
  if (at !== null && Date.now() >= at) return "Free";
  return planKey(meta.plan);
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
  return { error: null };
}

// Per-session token budgets. Free = 65k; the rest are multiples of Free.
export const TOKEN_LIMITS = {
  Free: 65000,
  Plus: 130000, // 2x Free
  Pro: 325000, // 5x Free
  Max: 1625000, // 25x Free
};

export function tokenLimit(plan) {
  return TOKEN_LIMITS[planKey(plan)];
}

// Usage window length — every plan resets every 5 hours.
export const SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;

// What to suggest when a plan hits its limit: the next tier up and how much more
// usage it gives versus Free. Max is the top tier (no upgrade).
export const NEXT_PLAN = {
  Free: { plan: "Plus", multiplier: "2x" },
  Plus: { plan: "Pro", multiplier: "5x" },
  Pro: { plan: "Max", multiplier: "25x" },
  Max: null,
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
    console.error("saveChat failed:", error.message);
    return null;
  }
  return mapChat(data);
}

export async function deleteChat(chatId) {
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) console.error("deleteChat failed:", error.message);
}

// ---------------------------------------------------------------------------
// Order history — Supabase "orders" table, scoped to the user via RLS.
// Rows: { id, user_id, product_name, price, status, created_at }.
// ---------------------------------------------------------------------------
export async function saveOrder({ productName, price, status = "completed" }) {
  const { error } = await supabase
    .from("orders")
    .insert({ product_name: productName, price, status });
  if (error) console.error("saveOrder failed:", error.message);
}
