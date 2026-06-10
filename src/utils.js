// Shared helpers for the email signup flow.

const STORAGE_KEY = "fetchit_signups";

// Pragmatic email check: non-empty local part, @, domain with a dot.
export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
// Mock auth / onboarding (all client-side via localStorage).
// ---------------------------------------------------------------------------
// Accounts are stored permanently in a registry keyed by email so a user can
// close the browser, return, and sign back in. The session is separate and is
// the only thing cleared on sign-out — accounts persist.
const ACCOUNTS_KEY = "fetchit_accounts"; // { [email]: { email, password, plan, createdAt } }
const SESSION_KEY = "fetchit_session"; // active login: { email, plan }
const PENDING_PLAN_KEY = "fetchit_pending_plan"; // plan clicked before logging in
const CHATS_KEY = "fetchit_chats"; // { [email]: [ { id, title, createdAt, messages } ] }

const readJSON = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

function getAccounts() {
  return readJSON(ACCOUNTS_KEY) || {};
}
function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getAccount(email) {
  return getAccounts()[(email || "").trim()] || null;
}
export function getSession() {
  return readJSON(SESSION_KEY);
}
export function isLoggedIn() {
  return !!getSession();
}
// Sign out: clears the session only — the account stays saved.
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// The account for the active session (or null).
export function getUser() {
  const session = getSession();
  return session ? getAccount(session.email) : null;
}

// Create/persist the mock account and start a session. Password stored in plain
// text — this is a client-side mock only, never do this for real.
export function createUser(email, password) {
  const e = email.trim();
  const accounts = getAccounts();
  const existing = accounts[e];
  const account = existing
    ? { ...existing, password } // re-registering keeps plan/createdAt
    : { email: e, password, plan: null, createdAt: new Date().toISOString() };
  accounts[e] = account;
  saveAccounts(accounts);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: e, plan: account.plan || null })
  );
  return account;
}

// Check credentials against the saved account.
export function authenticate(email, password) {
  const acc = getAccount(email);
  return !!(acc && acc.password === password);
}

// Restore the full session (including saved plan) for a known account.
export function startSession(email) {
  const acc = getAccount(email);
  if (!acc) return null;
  const session = { email: acc.email, plan: acc.plan || null };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// A plan the user picked while logged out, to resume after they sign in.
export function setPendingPlan(plan) {
  localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify(plan));
}
export function getPendingPlan() {
  return readJSON(PENDING_PLAN_KEY);
}
export function clearPendingPlan() {
  localStorage.removeItem(PENDING_PLAN_KEY);
}

// Lock in the chosen plan (Free pick or after checkout) and record it for admin.
export function finalizePlan(plan) {
  const session = getSession();
  if (!session) return;
  const accounts = getAccounts();
  if (accounts[session.email]) {
    accounts[session.email] = { ...accounts[session.email], plan };
    saveAccounts(accounts);
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email: session.email, plan })
  );
  saveSignup({ email: session.email, plan });
}

// ---------------------------------------------------------------------------
// Chat history — scoped per user email so accounts never see each other's chats.
// ---------------------------------------------------------------------------
function getAllChats() {
  return readJSON(CHATS_KEY) || {};
}

export function getChats(email) {
  if (!email) return [];
  const all = getAllChats();
  return Array.isArray(all[email]) ? all[email] : [];
}

// Upsert a chat session { id, title, createdAt, messages } by id (newest first).
export function saveChat(email, chat) {
  if (!email || !chat || !chat.id) return getChats(email);
  const all = getAllChats();
  const list = Array.isArray(all[email]) ? all[email] : [];
  const idx = list.findIndex((c) => c.id === chat.id);
  if (idx >= 0) list[idx] = chat;
  else list.unshift(chat);
  all[email] = list;
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
  return list;
}

export function deleteChat(email, chatId) {
  const all = getAllChats();
  all[email] = getChats(email).filter((c) => c.id !== chatId);
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
  return all[email];
}

export function clearChats(email) {
  const all = getAllChats();
  delete all[email];
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}
