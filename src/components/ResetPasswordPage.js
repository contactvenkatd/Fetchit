import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import Toast from "./Toast";
import { useAuth } from "../AuthContext";
import { applyNewPassword } from "../utils";
import "./ResetPasswordPage.css";

// Read the Supabase auth params synchronously at module load — detectSessionInUrl
// strips them from the URL shortly after. A valid reset link carries
// type=recovery; an expired/used one comes back with an error_code instead.
const RESET_URL = (() => {
  if (typeof window === "undefined") return { type: null, error: null };
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    return {
      type: hash.get("type") || search.get("type") || null,
      error:
        hash.get("error_code") ||
        hash.get("error") ||
        search.get("error_code") ||
        search.get("error") ||
        null,
    };
  } catch {
    return { type: null, error: null };
  }
})();
const CAME_VIA_RECOVERY = RESET_URL.type === "recovery";
const LINK_EXPIRED = !!RESET_URL.error;

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: "", level: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.max(1, Math.min(4, s));
  const meta = [
    { label: "Weak", level: "weak" },
    { label: "Fair", level: "fair" },
    { label: "Good", level: "good" },
    { label: "Strong", level: "strong" },
  ][score - 1];
  return { score, ...meta };
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Reverse-protect: only people arriving via a reset link belong here. A normal
  // visit goes to /chat (logged in) or /login (logged out).
  useEffect(() => {
    if (loading || LINK_EXPIRED || CAME_VIA_RECOVERY) return;
    navigate(session ? "/chat" : "/login", { replace: true });
  }, [loading, session, navigate]);

  // After a successful reset the recovery session is now a full session — head
  // to the chat after a beat.
  useEffect(() => {
    if (!done) return undefined;
    const id = setTimeout(() => navigate("/chat", { replace: true }), 2000);
    return () => clearTimeout(id);
  }, [done, navigate]);

  if (loading) return null;

  if (LINK_EXPIRED || (CAME_VIA_RECOVERY && !session)) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <h1>This link has expired</h1>
          <p className="auth-sub">
            Password reset links are single-use and time-limited.{" "}
            <Link to="/login">Request a new one</Link>.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (!CAME_VIA_RECOVERY) return null; // redirecting via the effect above

  if (done) {
    return (
      <AuthLayout>
        <div className="auth-card rp-success">
          <div className="rp-success-dog" aria-hidden="true">
            🐕
          </div>
          <h1>Password updated! 🐕</h1>
          <p className="auth-sub">You&apos;re all set — taking you to your chat…</p>
        </div>
        <Toast visible message="Password updated! You're all set 🐕" />
      </AuthLayout>
    );
  }

  const strength = passwordStrength(newPw);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPw.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPw !== confirmPw) {
      setError("Passwords don't match");
      return;
    }
    setSaving(true);
    const { error: err } = await applyNewPassword(newPw);
    setSaving(false);
    if (err) {
      setError(err.message || "Couldn't update your password.");
      return;
    }
    setDone(true);
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Set your new password</h1>
        <p className="auth-sub">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="rp-new">New password</label>
            <div className="pw-wrap">
              <input
                id="rp-new"
                type={show ? "text" : "password"}
                placeholder="At least 8 characters"
                value={newPw}
                onChange={(e) => {
                  setNewPw(e.target.value);
                  if (error) setError("");
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            {newPw && (
              <div className="rp-strength" aria-hidden="true">
                <div className="rp-bars">
                  {[1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={`rp-bar${
                        i <= strength.score ? ` filled ${strength.level}` : ""
                      }`}
                    />
                  ))}
                </div>
                <span className={`rp-label ${strength.level}`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="rp-confirm">Confirm new password</label>
            <input
              id="rp-confirm"
              type={show ? "text" : "password"}
              placeholder="Re-enter new password"
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                if (error) setError("");
              }}
              autoComplete="new-password"
              aria-invalid={!!error}
              aria-describedby={error ? "rp-error" : undefined}
            />
          </div>

          {error && (
            <p className="field-error" id="rp-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn auth-btn rp-submit-btn"
            disabled={saving}
          >
            {saving ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
