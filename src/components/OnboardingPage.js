import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import { getName, saveName } from "../utils";
import "./OnboardingPage.css";

// Post-plan name collection. Protected: only reachable while signed in (the
// signup flow lands here after a plan is chosen). Names are optional — "Skip
// for now" goes straight to chat; they can also be set later in /account.
function OnboardingPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const existing = getName(session);

  const [firstName, setFirstName] = useState(existing.firstName);
  const [lastName, setLastName] = useState(existing.lastName);
  const [saving, setSaving] = useState(false);

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await saveName(firstName, lastName);
    setSaving(false);
    navigate("/chat");
  };

  return (
    <AuthLayout>
      <div className="auth-card onboarding-card">
        <h1>One last thing! 🐕</h1>
        <p className="auth-sub">What should Fetchit call you?</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="onboarding-row">
            <div className="auth-field">
              <label htmlFor="ob-first">First name</label>
              <input
                id="ob-first"
                type="text"
                placeholder="Alex"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="ob-last">Last name</label>
              <input
                id="ob-last"
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
            className="btn btn-primary auth-btn"
            disabled={saving}
          >
            {saving ? "Saving…" : "Let's Go!"}
          </button>
        </form>

        <button
          type="button"
          className="onboarding-skip"
          onClick={() => navigate("/chat")}
        >
          Skip for now
        </button>
      </div>
    </AuthLayout>
  );
}

export default OnboardingPage;
