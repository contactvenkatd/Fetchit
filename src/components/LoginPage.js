import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import {
  signIn,
  sendPasswordReset,
  isValidEmail,
  getPendingPlan,
  clearPendingPlan,
  finalizePlan,
} from "../utils";
import "./LoginPage.css";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // "login" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot-password (reset) sub-state.
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const emailRef = useRef(null);
  const resetEmailRef = useRef(null);

  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const { error: authError } = await signIn(email, password);
    setSubmitting(false);
    if (authError) {
      setError(
        /confirm/i.test(authError.message)
          ? "Please verify your email before signing in"
          : "Incorrect email or password"
      );
      return;
    }

    // Resume a plan the user picked before logging in, if any.
    const pending = getPendingPlan();
    if (pending) {
      clearPendingPlan();
      if (pending.name === "Free") {
        await finalizePlan("Free");
        navigate("/chat");
      } else {
        navigate("/checkout", { state: { plan: pending } });
      }
      return;
    }
    navigate("/chat");
  };

  const openReset = () => {
    setResetEmail(email); // pre-fill with whatever they typed
    setResetError("");
    setResetSent(false);
    setMode("reset");
    setTimeout(() => resetEmailRef.current && resetEmailRef.current.focus(), 20);
  };

  const backToLogin = () => {
    setMode("login");
    setResetError("");
    setResetSent(false);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!isValidEmail(resetEmail)) {
      setResetError("Please enter a valid email");
      return;
    }
    setResetSending(true);
    const { error: resetErr } = await sendPasswordReset(resetEmail);
    setResetSending(false);
    if (resetErr) {
      setResetError(resetErr.message || "Couldn't send the reset link.");
      return;
    }
    setResetSent(true);
  };

  if (mode === "reset") {
    return (
      <AuthLayout>
        <div className="auth-card">
          {resetSent ? (
            <>
              <h1>Check your email 🐕</h1>
              <p className="auth-sub">
                We sent a reset link to <strong>{resetEmail}</strong>. Click it
                to set a new password.
              </p>
              <button
                type="button"
                className="reset-back-link"
                onClick={backToLogin}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1>Reset your password</h1>
              <p className="auth-sub">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              <form onSubmit={handleResetSubmit} noValidate>
                <div className="auth-field">
                  <label htmlFor="rp-email">Email address</label>
                  <input
                    id="rp-email"
                    ref={resetEmailRef}
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      if (resetError) setResetError("");
                    }}
                    autoComplete="email"
                    aria-invalid={!!resetError}
                    aria-describedby={resetError ? "rp-error" : undefined}
                  />
                  {resetError && (
                    <p className="field-error" id="rp-error" role="alert">
                      {resetError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn auth-btn login-yellow-btn"
                  disabled={resetSending}
                >
                  {resetSending ? "Sending…" : "Send reset link"}
                </button>
              </form>
              <button
                type="button"
                className="reset-back-link"
                onClick={backToLogin}
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <button
          type="button"
          className="back-link"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <h1>Welcome back</h1>
        <p className="auth-sub">Sign in to keep fetching.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="li-email">Email address</label>
            <input
              id="li-email"
              ref={emailRef}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              autoComplete="email"
              aria-invalid={!!error}
              aria-describedby={error ? "li-error" : undefined}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="li-password">Password</label>
            <div className="pw-wrap">
              <input
                id="li-password"
                type={show ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                autoComplete="current-password"
                aria-invalid={!!error}
                aria-describedby={error ? "li-error" : undefined}
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
            <button type="button" className="forgot-link" onClick={openReset}>
              Forgot password?
            </button>
          </div>

          {error && (
            <p className="field-error" id="li-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-btn"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default LoginPage;
