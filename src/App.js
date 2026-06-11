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
import AdminPage from "./components/AdminPage";
import SignupPage from "./components/SignupPage";
import LoginPage from "./components/LoginPage";
import PlansPage from "./components/PlansPage";
import CheckoutPage from "./components/CheckoutPage";
import OnboardingPage from "./components/OnboardingPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import ChatPage from "./components/ChatPage";
import AccountPage from "./components/AccountPage";
import { AuthProvider, useAuth } from "./AuthContext";
import { saveSignup, setPendingPlan, finalizePlan, hasPlan } from "./utils";

const TOAST_MESSAGE = "Fetchit is on it! We'll be in touch soon.";

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

// Route a pricing-card click based on login state. Free skips payment.
export async function routePlanSelection(plan, navigate, session) {
  const loggedIn = !!session;
  if (plan.name === "Free") {
    if (loggedIn) {
      await finalizePlan("Free");
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
  if (session && !deletionPending && !loginPending) {
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
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
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
