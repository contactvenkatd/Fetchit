import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import { getName, saveName } from "../utils";
import "./OnboardingPage.css";

function OnboardingPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const existing = getName(session);
  const [firstName, setFirstName] = useState(existing.firstName);
  const [lastName, setLastName] = useState(existing.lastName);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef(null);

  // Protected: must be signed in (after the async session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (firstRef.current) firstRef.current.focus();
  }, []);

  if (loading || !session) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await saveName(firstName, lastName);
    navigate("/chat", { replace: true });
  };

  const handleSkip = () => navigate("/chat", { replace: true });

  return (
    <AuthLayout>
      <div className="auth-card onb-card">
        <h1>One last thing! 🐕</h1>
        <p className="auth-sub">What should Fetchit call you?</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="onb-row">
            <div className="auth-field">
              <label htmlFor="onb-first">First name</label>
              <input
                id="onb-first"
                ref={firstRef}
                type="text"
                placeholder="Alex"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="onb-last">Last name</label>
              <input
                id="onb-last"
                type="text"
                placeholder="Johnson"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn onb-btn"
            disabled={saving}
          >
            {saving ? "Saving…" : "Let's Go!"}
          </button>
        </form>

        <button type="button" className="onb-skip" onClick={handleSkip}>
          Skip for now
        </button>
      </div>
    </AuthLayout>
  );
}

export default OnboardingPage;
