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
    options: { emailRedirectTo: window.location.origin },
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

export async function signOut() {
  return supabase.auth.signOut();
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

// Email-confirmed account deletion (step 2): email a confirmation link that
// returns to /account?type=deletion. Identity is proven by clicking the link;
// the actual delete only happens after the in-app confirmation modals call
// deleteAccount(). Used for both the initial send and the "Resend email" button.
//
// We use a magic link (signInWithOtp) rather than resetPasswordForEmail so this
// email uses Supabase's separate "Magic Link" template — the password-change
// flow already owns the "Reset Password" template, so this keeps the two emails
// independently brandable. `shouldCreateUser: false` means it only ever mails an
// existing account.
export async function sendAccountDeletionEmail() {
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (!email) return { error: { message: "You're not signed in." }, email: null };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}/account?type=deletion`,
    },
  });
  return { error, email };
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

// Record the chosen plan on the user's metadata (and the demo signups list).
export async function finalizePlan(plan) {
  await supabase.auth.updateUser({ data: { plan } });
  const session = await getSession();
  const email = session && session.user && session.user.email;
  if (email) saveSignup({ email, plan });
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
