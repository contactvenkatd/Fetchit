import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
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
import ChatPage from "./components/ChatPage";
import {
  saveSignup,
  getSession,
  setPendingPlan,
  finalizePlan,
} from "./utils";

const TOAST_MESSAGE = "Fetchit is on it! We'll be in touch soon.";

// Route a pricing-card click based on login state. Free skips payment.
export function routePlanSelection(plan, navigate) {
  const loggedIn = !!getSession();
  if (plan.name === "Free") {
    if (loggedIn) {
      finalizePlan("Free");
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
  const [toastVisible, setToastVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback(() => {
    setToastVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastVisible(false), 3000);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

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
      routePlanSelection(plan, navigate);
    },
    [navigate]
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
      <Toast visible={toastVisible} message={TOAST_MESSAGE} />
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
// goes straight to the chat. Reads localStorage synchronously, so it also
// applies after closing and reopening the tab.
function RedirectIfAuthed({ children }) {
  if (getSession()) return <Navigate to="/chat" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
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
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/chat" element={<ChatPage />} />
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
  );
}

export default App;
