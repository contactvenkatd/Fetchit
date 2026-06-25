import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ChatMockup from "./components/ChatMockup";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import SocialProof from "./components/SocialProof";
import Pricing from "./components/Pricing";
import FAQ from "./components/FAQ";
import Footer from "./components/Footer";
import Reveal from "./components/Reveal";
import Toast from "./components/Toast";
import Modal from "./components/Modal";
import SignupPage from "./components/SignupPage";
import LoginPage from "./components/LoginPage";
import PlansPage from "./components/PlansPage";
import TermsAgreementPage from "./components/TermsAgreementPage";
import TosPage from "./components/TosPage";
import PrivacyPolicyPage from "./components/PrivacyPolicyPage";
import CheckoutPage from "./components/CheckoutPage";
import DeliveryPaymentPage from "./components/DeliveryPaymentPage";
import OnboardingPage from "./components/OnboardingPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import ChatPage from "./components/ChatPage";
import AccountPage from "./components/AccountPage";
import CardsAddressPage from "./components/CardsAddressPage";
import FamilySharingPage from "./components/FamilySharingPage";
import JoinFamilyRedirectPage from "./components/JoinFamilyRedirectPage";
import OrdersAnalytics from "./components/OrdersAnalytics";
import WishlistPage from "./components/WishlistPage";
import AutoReorderPage from "./components/AutoReorderPage";
import AuthCallback from "./components/AuthCallback";
import { AuthProvider, useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import {
  saveSignup,
  setPendingPlan,
  finalizePlan,
  hasPlan,
  planKey,
  getPlan,
  familyOwnerLabel,
  SELF_LEFT_KEY,
  enforceAccountStatus,
} from "./utils";

const TOAST_MESSAGE = "FetchIt is on it! We'll be in touch soon.";

// Captured synchronously at module load — Supabase's detectSessionInUrl strips
// the auth params from the URL shortly after, so we read them first. Our own
// `?type=deletion` lives in the query string; Supabase's recovery type lands in
// the hash, so we read them separately and let deletion take priority.
const URL_RETURN = (() => {
  if (typeof window === "undefined")
    return { delete: false, authType: null, path: "/" };
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    return {
      delete: search.get("type") === "deletion",
      authType: hash.get("type") || search.get("type") || null,
      path: window.location.pathname,
    };
  } catch {
    return { delete: false, authType: null, path: "/" };
  }
})();

// Handle Supabase redirects back from a confirmation link, then clean the URL:
// - type=recovery / email_change → finish the in-app password change
// The forgot-password reset link also uses type=recovery but lands on
// /reset-password, which owns its flow — leave it alone.
// (Account deletion no longer routes through here: its email is a plain
// /account?type=deletion&token=… link that AccountPage verifies on arrival.)
function RecoveryHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (URL_RETURN.path === "/reset-password") return;
    if (URL_RETURN.authType === "recovery" || URL_RETURN.authType === "email_change") {
      sessionStorage.setItem("fetchit_pw_recovery", "1");
      navigate("/account", { replace: true });
    }
  }, [navigate]);
  return null;
}

// Global watcher: detect when a family member was removed by the owner (their
// plan flips max_family → Free server-side) and show a one-time modal. The
// member's local session doesn't update on its own, so we refreshSession() on
// page load + tab focus/visibility (only while they're max_family) to pull the
// fresh metadata, then compare against the last-known RAW plan.
//   - RAW plan (planKey(metadata.plan)) is used, NOT getPlan() — so a *scheduled*
//     disband (plan stays max_family, getPlan goes Free via family_disband_at) is
//     NOT mistaken for a removal; that path finalizes itself via leaveFamily().
//   - A self-initiated leave sets SELF_LEFT_KEY (utils.leaveFamily) → suppressed.
//   - All baselines are keyed by USER ID (`fetchit_last_plan_<uid>` etc.) so they
//     never cross users and DON'T need clearing on logout — a member removed while
//     logged out still sees the modal on their next fresh sign-in (their persisted
//     baseline is max_family, but the fresh session reports Free → transition).
//   - `fetchit_plan_changed_<uid>` persists the pending modal so it shows once and
//     survives a reload until the user dismisses it.
const lastPlanKey = (uid) => `fetchit_last_plan_${uid}`;
const lastOwnerKey = (uid) => `fetchit_last_owner_${uid}`;
const planChangedKey = (uid) => `fetchit_plan_changed_${uid}`;
const ls = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

function PlanChangeWatcher() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [removed, setRemoved] = useState(null); // { owner, key } | null
  const lastRefreshRef = useRef(0);
  const bootRef = useRef(false); // one-time page-load refresh for a family member
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Detect the max_family → Free downgrade as the session settles / refreshes.
  // Baselines + the pending modal are keyed by user id, so nothing is cleared on
  // logout and a removal that happened while away is caught on next sign-in.
  useEffect(() => {
    if (loading) return;
    if (!session) {
      setRemoved(null); // hide the modal when logged out (keep the keyed baseline)
      return;
    }
    const uid = session.user.id;
    const meta = session.user.user_metadata || {};
    const rawPlan = planKey(meta.plan); // raw metadata plan, not effective getPlan
    const changedKey = planChangedKey(uid);

    // Restore a pending modal persisted for THIS user (reload / re-login).
    const pending = ls.get(changedKey);
    if (pending) {
      try {
        const parsed = JSON.parse(pending);
        setRemoved((r) => r || { owner: parsed.owner, key: changedKey });
      } catch {
        ls.del(changedKey);
      }
    }

    const lastPlan = ls.get(lastPlanKey(uid));
    ls.set(lastPlanKey(uid), rawPlan);
    if (rawPlan === "max_family") ls.set(lastOwnerKey(uid), familyOwnerLabel(session));

    // First sighting of a family-member session this mount → pull fresh metadata
    // once (the cached JWT may pre-date a removal that happened while away).
    if (rawPlan === "max_family" && !bootRef.current) {
      bootRef.current = true;
      const now = Date.now();
      if (now - lastRefreshRef.current >= 5000) {
        lastRefreshRef.current = now;
        supabase.auth.refreshSession();
      }
    }

    if (lastPlan === "max_family" && rawPlan === "Free") {
      let selfLeft = false;
      try {
        selfLeft = sessionStorage.getItem(SELF_LEFT_KEY) === "1";
      } catch {
        /* ignore */
      }
      if (selfLeft) {
        try {
          sessionStorage.removeItem(SELF_LEFT_KEY);
        } catch {
          /* ignore */
        }
      } else {
        const owner = ls.get(lastOwnerKey(uid)) || "your family plan owner";
        ls.set(changedKey, JSON.stringify({ owner }));
        setRemoved({ owner, key: changedKey });
      }
    }
  }, [session, loading]);

  // Pull fresh metadata on load + tab focus/visibility (only while max_family),
  // so a removal done elsewhere is detected. Subscribes once; reads the live
  // session via a ref. Throttled to once per 5s.
  useEffect(() => {
    const maybeRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const s = sessionRef.current;
      if (!s || getPlan(s) !== "max_family") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < 5000) return;
      lastRefreshRef.current = now;
      supabase.auth.refreshSession();
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, []);

  const dismiss = () => {
    if (removed && removed.key) ls.del(removed.key);
    setRemoved(null);
  };
  const choosePlan = () => {
    dismiss();
    navigate("/plans", { state: { manage: true } });
  };

  if (!removed) return null;
  return (
    <div className="plan-modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby="plan-removed-title">
      <div className="plan-modal">
        <div className="plan-modal-icon" aria-hidden="true">🐕</div>
        <h2 id="plan-removed-title">You&apos;ve been removed from the family plan</h2>
        <p>
          You have been removed from <strong>{removed.owner}</strong>&apos;s family
          plan. Your account has been moved to the Free plan. Would you like to
          choose a new plan?
        </p>
        <div className="plan-modal-actions">
          <button type="button" className="btn btn-primary" onClick={choosePlan}>
            Choose a Plan
          </button>
          <button type="button" className="plan-modal-secondary" onClick={dismiss}>
            Stay on Free
          </button>
        </div>
      </div>
    </div>
  );
}

// Global account-status watcher. An admin deleting a user from the Supabase
// dashboard leaves that user's JWT valid for up to ~1h, so they'd stay logged
// in. This polls the check-account-status edge function — on page load, every
// 60s, and on every tab focus/visibility regain — and terminates the session
// (hard sign-out, clear storage, redirect to /login with a message) the moment
// the user no longer exists. Only runs while logged in; enforceAccountStatus()
// fails open on transient errors so a network blip never logs anyone out.
function AccountStatusWatcher() {
  const { session, loading } = useAuth();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (loading || !session) return undefined;

    let cancelled = false;
    const check = () => {
      if (cancelled || !sessionRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden")
        return;
      enforceAccountStatus();
    };

    check(); // on page load / whenever a session appears
    const interval = setInterval(check, 60000); // every 60s while open
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [session, loading]);

  return null;
}

// Route a pricing-card click based on login state. Free skips payment.
export async function routePlanSelection(plan, navigate, session) {
  const loggedIn = !!session;
  if (plan.name === "Free") {
    if (loggedIn) {
      await finalizePlan("Free", null, "explicit-free-selection");
      navigate("/chat");
    } else {
      setPendingPlan({ name: "Free" });
      navigate("/login");
    }
    return;
  }
  if (loggedIn) {
    navigate("/checkout", { state: { plan } });
  } else {
    setPendingPlan(plan);
    navigate("/login");
  }
}

function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState(TOAST_MESSAGE);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message = TOAST_MESSAGE) => {
    setToastMessage(message);
    setToastVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastVisible(false), 3000);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Flash message set by another page before redirecting here (e.g. after
  // account deletion). Wait until the session is actually cleared before showing
  // it and removing the flag — that flag also holds RedirectIfAuthed on this page
  // while a stale session drains, so clearing it early could re-trigger a bounce.
  useEffect(() => {
    if (session) return;
    const flash = sessionStorage.getItem("fetchit_flash");
    if (flash) {
      sessionStorage.removeItem("fetchit_flash");
      showToast(flash);
    }
  }, [session, showToast]);

  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleSeeHow = useCallback(() => {
    scrollToSection("how");
  }, [scrollToSection]);

  // Landing pricing button: route by login state (skip /plans).
  const handlePricingSelect = useCallback(
    (plan) => {
      routePlanSelection(plan, navigate, session);
    },
    [navigate, session]
  );

  // Chat demo input: open the early-access email modal.
  const handleDemoSignup = useCallback(() => {
    setSelectedPlan({ name: "Early Access", priceLabel: "Free" });
  }, []);

  const closeModal = useCallback(() => setSelectedPlan(null), []);

  const confirmSignup = useCallback(
    (email) => {
      if (selectedPlan) saveSignup({ email, plan: selectedPlan.name });
      setSelectedPlan(null);
      showToast();
    },
    [selectedPlan, showToast]
  );

  return (
    <div className="app">
      <Navbar onNavigate={scrollToSection} />
      <main>
        <Hero onSeeHow={handleSeeHow} />
        <Reveal>
          <ChatMockup onRequestSignup={handleDemoSignup} />
        </Reveal>
        <Reveal>
          <HowItWorks />
        </Reveal>
        <Reveal>
          <Features />
        </Reveal>
        <Reveal>
          <SocialProof />
        </Reveal>
        <Reveal>
          <Pricing onSelect={handlePricingSelect} />
        </Reveal>
        <Reveal>
          <FAQ />
        </Reveal>
      </main>
      <Footer onNavigate={scrollToSection} />
      <Toast visible={toastVisible} message={toastMessage} />
      <Modal
        open={!!selectedPlan}
        plan={selectedPlan || { name: "", priceLabel: "" }}
        onConfirm={confirmSignup}
        onClose={closeModal}
      />
    </div>
  );
}

// Auto-login: a signed-in user skips the landing / login / signup pages and
// goes straight to the chat. Waits for the async session check to resolve so it
// also applies after closing and reopening the tab.
function RedirectIfAuthed({ children }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  // After an account deletion a flash is queued and the session is being torn
  // down. Don't bounce to /chat on a momentarily-stale session — render the
  // landing page so the flow ends cleanly (no logged-in/out flicker).
  const deletionPending = sessionStorage.getItem("fetchit_flash");
  // While a login is mid-email-confirmation, the password sign-in transiently
  // creates a session before we drop it — don't bounce to /chat in that window.
  const loginPending = sessionStorage.getItem("fetchit_login_pending");
  // While a signup is mid-OTP-verification, confirming the code establishes a
  // session before we navigate to /terms — don't bounce to /chat in that window.
  const signupPending = sessionStorage.getItem("fetchit_signup_pending");
  // A rejected Google OAuth (signup-exists / login-no-account) is signing the
  // just-created session out while routing back to /signup or /login to show the
  // message — don't bounce to /chat before that error renders.
  const oauthError = sessionStorage.getItem("fetchit_oauth_error");
  if (session && !deletionPending && !loginPending && !signupPending && !oauthError) {
    return <Navigate to="/chat" replace />;
  }
  return children;
}

// Gate for /plans:
//   - not logged in            → /login
//   - logged in, no plan yet   → show /plans (the post-verification step)
//   - logged in, already has a plan → /chat …unless this is an intentional plan
//     change (navigated with state.manage, e.g. /account's "Upgrade/Manage Plan"),
//     which is allowed through so the upgrade/downgrade UI stays reachable.
function PlansGate({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  const manage = location.state && location.state.manage;
  if (hasPlan(session) && !manage) return <Navigate to="/chat" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RecoveryHandler />
        <AccountStatusWatcher />
        <PlanChangeWatcher />
        <Routes>
        <Route
          path="/"
          element={
            <RedirectIfAuthed>
              <Landing />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthed>
              <SignupPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/plans"
          element={
            <PlansGate>
              <PlansPage />
            </PlansGate>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/terms" element={<TermsAgreementPage />} />
        <Route path="/tos" element={<TosPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/delivery-payment" element={<DeliveryPaymentPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/cards-address" element={<CardsAddressPage />} />
        <Route path="/family-sharing" element={<FamilySharingPage />} />
        <Route path="/join-family" element={<JoinFamilyRedirectPage />} />
        <Route path="/orders" element={<OrdersAnalytics />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/auto-reorder" element={<AutoReorderPage />} />
        <Route
          path="*"
          element={
            <RedirectIfAuthed>
              <Landing />
            </RedirectIfAuthed>
          }
        />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
