import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import { saveProfile, getFamilyInviteToken } from "../utils";
import "./TermsAgreementPage.css";

// Key points surfaced before the user agrees (a summary — NOT the full TOS).
const KEY_POINTS = [
  "We charge a service fee on every order",
  "Your shopping data may be used to train AI models",
  "You must be 18 or older to use FetchIt",
  "Orders are placed through third-party retailers",
];

// Onboarding TOS agreement step: after email verification, before /plans.
// Protected (no session → /login). The user does NOT need to scroll — the full
// Terms open in a new tab via the link; agreement is a single checkbox.
function TermsAgreementPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) return null;

  const handleContinue = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    // Record acceptance on the profile (creates the row if it doesn't exist
    // yet). Best-effort — a DB hiccup shouldn't trap the user in onboarding.
    await saveProfile({
      tosAccepted: true,
      tosAcceptedAt: new Date().toISOString(),
    });
    // A user signing up via a family invite skips plan selection entirely (no
    // subscription needed) and goes straight to address collection.
    navigate(getFamilyInviteToken() ? "/delivery-payment" : "/plans");
  };

  return (
    <AuthLayout>
      <div className="auth-card tos-agree-card">
        <h1>Before we get started</h1>
        <p className="auth-sub">
          A few key things to know about using FetchIt:
        </p>

        <ul className="tos-points">
          {KEY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <a
          className="tos-read-link"
          href="/tos"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read full Terms of Service ↗
        </a>

        <label className="tos-agree-check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I have read and agree to the Terms of Service and Privacy Policy
          </span>
        </label>

        <button
          type="button"
          className="btn btn-primary auth-btn"
          onClick={handleContinue}
          disabled={!agreed || saving}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </AuthLayout>
  );
}

export default TermsAgreementPage;
