import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import GoogleButton from "./GoogleButton";
import { supabase } from "../supabaseClient";
import {
  signIn,
  sendPasswordReset,
  isValidEmail,
  getSession,
  getPendingPlan,
  clearPendingPlan,
  finalizePlan,
  hasPlan,
  sendLoginOtp,
  verifyLoginOtp,
  signInWithGoogle,
  OAUTH_ERROR_KEY,
  getFamilyInviteToken,
  maybeAcceptPendingInvite,
  ACCOUNT_TERMINATED_KEY,
  ACCOUNT_TERMINATED_MESSAGE,
} from "../utils";
import "./LoginPage.css";

// Email second factor via real OTP: verify the password, sign out immediately
// (no session yet), email an 8-digit code (sendLoginOtp), and require the user to
// enter it (verifyLoginOtp → type 'email'). Wrong codes are rejected by Supabase;
// a correct code establishes the session. A `fetchit_login_pending` flag holds
// RedirectIfAuthed during the brief windows where a session exists (the password
// step and after verification) so /login doesn't bounce to /chat early.
function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // "login" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [noAccount, setNoAccount] = useState(false); // Google login, no account
  const [terminated, setTerminated] = useState(false); // account deleted by admin

  // Email-confirmation (reauthentication code) sub-state, after a valid password.
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpResent, setOtpResent] = useState(false);

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

  // Returned from /auth/callback after Google OAuth found no FetchIt account.
  useEffect(() => {
    if (sessionStorage.getItem(OAUTH_ERROR_KEY) === "login_noaccount") {
      sessionStorage.removeItem(OAUTH_ERROR_KEY);
      setNoAccount(true);
    }
  }, []);

  // Redirected here after an instant termination (admin deleted the account).
  useEffect(() => {
    if (sessionStorage.getItem(ACCOUNT_TERMINATED_KEY)) {
      sessionStorage.removeItem(ACCOUNT_TERMINATED_KEY);
      setTerminated(true);
    }
  }, []);

  const handleGoogle = async () => {
    setError("");
    setNoAccount(false);
    setGoogleBusy(true);
    const { error: oauthError } = await signInWithGoogle("login");
    // On success the browser redirects to Google; we only reach here on failure.
    if (oauthError) {
      setGoogleBusy(false);
      setError(oauthError.message || "Couldn't start Google sign-in.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    // signInWithPassword creates a session transiently; hold the /login auto-
    // redirect while we verify the password and sign back out.
    sessionStorage.setItem("fetchit_login_pending", "1");
    const { error: authError } = await signIn(email, password);
    if (authError) {
      sessionStorage.removeItem("fetchit_login_pending");
      setSubmitting(false);
      setError(
        /confirm/i.test(authError.message)
          ? "Please verify your email before signing in"
          : "Incorrect email or password"
      );
      return;
    }

    // Password is valid → sign back out (they're not in until the OTP checks
    // out), then email a real 8-digit code.
    await supabase.auth.signOut({ scope: "local" });
    const { error: otpError } = await sendLoginOtp(email);
    sessionStorage.removeItem("fetchit_login_pending"); // no session during entry
    setSubmitting(false);
    if (otpError) {
      setError(otpError.message || "Couldn't send the confirmation code.");
      return;
    }
    setOtpEmail(email.trim());
    setCode("");
    setOtpSent(true);
  };

  // Finish a verified login: route by pending plan / plan status. Keeps the
  // redirect flag set across awaits (a session now exists) and clears it only in
  // the synchronous step immediately before each navigate.
  const finishLogin = async (verifiedSession) => {
    const session = verifiedSession || (await getSession());
    // Logged in via a family join link → accept the invite (sets max_family) and
    // go straight to chat, bypassing plan routing.
    if (getFamilyInviteToken()) {
      await maybeAcceptPendingInvite();
      sessionStorage.removeItem("fetchit_login_pending");
      navigate("/chat");
      return;
    }
    const pending = getPendingPlan();
    if (pending) {
      clearPendingPlan();
      if (pending.name === "Free") {
        await finalizePlan("Free");
        sessionStorage.removeItem("fetchit_login_pending");
        navigate("/delivery-payment");
      } else {
        sessionStorage.removeItem("fetchit_login_pending");
        navigate("/checkout", { state: { plan: pending } });
      }
      return;
    }
    sessionStorage.removeItem("fetchit_login_pending");
    navigate(session && !hasPlan(session) ? "/plans" : "/chat");
  };

  // Enter the emailed 8-digit code → real verification via verifyOtp.
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{8}$/.test(code.trim())) {
      setError("Enter the 8-digit code from your email.");
      return;
    }
    setVerifying(true);
    // A correct code establishes a session — hold the redirect until we route.
    sessionStorage.setItem("fetchit_login_pending", "1");
    const { data, error: verifyError } = await verifyLoginOtp(otpEmail, code);
    setVerifying(false);
    if (verifyError) {
      sessionStorage.removeItem("fetchit_login_pending");
      setError("That code didn't work — check your email and try again.");
      return;
    }
    await finishLogin(data && data.session);
  };

  const handleResendCode = async () => {
    setError("");
    setOtpResent(false);
    setOtpResending(true);
    const { error: otpError } = await sendLoginOtp(otpEmail || email);
    setOtpResending(false);
    if (otpError) {
      setError(otpError.message || "Couldn't resend the code.");
      return;
    }
    setOtpResent(true);
  };

  // "Back to sign in" — no session exists during code entry, just reset the UI.
  const handleCancelCode = () => {
    sessionStorage.removeItem("fetchit_login_pending");
    setOtpSent(false);
    setOtpResent(false);
    setCode("");
    setError("");
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

  if (otpSent) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <h1>Check your email 🐕</h1>
          <p className="auth-sub">
            We sent an 8-digit confirmation code to <strong>{otpEmail}</strong>.
            Enter it below to finish signing in.
          </p>
          <form onSubmit={handleVerifyCode} noValidate>
            <div className="auth-field">
              <label htmlFor="li-code">Confirmation code</label>
              <input
                id="li-code"
                className="login-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="12345678"
                maxLength={8}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 8));
                  if (error) setError("");
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "li-code-err" : undefined}
              />
            </div>
            {otpResent && (
              <p className="login-otp-note" role="status">
                Code resent 🐕
              </p>
            )}
            {error && (
              <p className="field-error" id="li-code-err" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary auth-btn"
              disabled={verifying}
            >
              {verifying ? "Confirming…" : "Confirm & sign in"}
            </button>
          </form>
          <button
            type="button"
            className="login-resend-link"
            onClick={handleResendCode}
            disabled={otpResending}
          >
            {otpResending ? "Sending…" : "Resend code"}
          </button>
          <button
            type="button"
            className="reset-back-link"
            onClick={handleCancelCode}
          >
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

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

        {terminated && (
          <p className="field-error" role="alert">
            {ACCOUNT_TERMINATED_MESSAGE}
          </p>
        )}

        <GoogleButton onClick={handleGoogle} disabled={googleBusy} />

        {noAccount && (
          <p className="field-error" role="alert">
            No account found with this Google account.{" "}
            <Link to="/signup">Please sign up instead.</Link>
          </p>
        )}

        <div className="auth-divider">or</div>

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
