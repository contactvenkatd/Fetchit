import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import GoogleButton from "./GoogleButton";
import Turnstile from "./Turnstile";
import {
  isValidEmail,
  signUp,
  sendSignupOtp,
  verifySignupOtp,
  signInWithGoogle,
  OAUTH_ERROR_KEY,
} from "../utils";
import "./SignupPage.css";

const OTP_LEN = 8;
const RESEND_COOLDOWN = 60; // seconds

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const emailRef = useRef(null);
  const turnstileRef = useRef(null);

  // OTP verification sub-state (shown after signUp succeeds).
  const [otpSent, setOtpSent] = useState(false);
  const [digits, setDigits] = useState(() => Array(OTP_LEN).fill(""));
  const [otpError, setOtpError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const boxRefs = useRef([]);
  // Guards the auto-submit so a correct code is only verified once.
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  // Returned from /auth/callback after Google OAuth found an existing account.
  useEffect(() => {
    if (sessionStorage.getItem(OAUTH_ERROR_KEY) === "signup_exists") {
      sessionStorage.removeItem(OAUTH_ERROR_KEY);
      setErrors({ googleExists: true });
    }
  }, []);

  // Resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Focus the first OTP box when the verification screen appears.
  useEffect(() => {
    if (otpSent && boxRefs.current[0]) boxRefs.current[0].focus();
  }, [otpSent]);

  const handleGoogle = async () => {
    setErrors({});
    setGoogleBusy(true);
    const { error } = await signInWithGoogle("signup");
    // On success the browser redirects to Google; we only get here on failure.
    if (error) {
      setGoogleBusy(false);
      setErrors({ form: error.message || "Couldn't start Google sign-in." });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!isValidEmail(email)) next.email = "Please enter a valid email";
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // Cloudflare Turnstile token (state, set by the widget's callback). Fall back
    // to forcing a solve if it hasn't produced one yet.
    let token = turnstileToken;
    if (!token && turnstileRef.current) {
      token = await turnstileRef.current.refresh();
    }
    if (!token) {
      setErrors({ form: "Please complete the bot challenge below." });
      return;
    }

    setSubmitting(true);
    const { data, error } = await signUp(email, password, token);
    if (error) {
      setSubmitting(false);
      // Email already has an account → friendly "log in instead" message with a
      // link, rather than Supabase's generic error text.
      const alreadyExists =
        error.code === "user_already_exists" ||
        (error.message || "").toLowerCase().includes("already registered");
      setErrors(alreadyExists ? { exists: true } : { form: error.message });
      return;
    }
    // With email confirmation on, Supabase obfuscates a re-signup of an existing
    // email: it returns a success-shaped response (no error) with a fake user
    // that has an EMPTY identities array and no session — to avoid leaking which
    // emails are registered. Treat that as "already exists" too.
    const obfuscatedExisting =
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0;
    if (obfuscatedExisting) {
      setSubmitting(false);
      setErrors({ exists: true });
      return;
    }
    // If a session came back immediately (email confirmation off), skip to plans.
    if (data.session) {
      setSubmitting(false);
      navigate("/plans");
      return;
    }
    // Email verification on: send an 8-digit OTP and show the code-entry screen.
    // The signUp call above consumed the first Turnstile token, so mint a fresh
    // one for this second CAPTCHA-protected call.
    const otpToken = turnstileRef.current
      ? await turnstileRef.current.refresh()
      : "";
    const { error: otpError } = await sendSignupOtp(email, otpToken);
    setSubmitting(false);
    if (otpError) {
      setErrors({ form: otpError.message || "Couldn't send the verification code." });
      return;
    }
    setDigits(Array(OTP_LEN).fill(""));
    setOtpError("");
    setCooldown(RESEND_COOLDOWN);
    setOtpSent(true);
  };

  // Verify the entered code. Confirming it establishes a session, so hold
  // RedirectIfAuthed until we navigate to /terms.
  const verifyCode = async (codeStr) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setOtpError("");
    sessionStorage.setItem("fetchit_signup_pending", "1");
    const { error } = await verifySignupOtp(email, codeStr);
    if (error) {
      sessionStorage.removeItem("fetchit_signup_pending");
      verifyingRef.current = false;
      setVerifying(false);
      setDigits(Array(OTP_LEN).fill(""));
      setOtpError("That code didn't work — check your email and try again.");
      if (boxRefs.current[0]) boxRefs.current[0].focus();
      return;
    }
    sessionStorage.removeItem("fetchit_signup_pending");
    navigate("/terms");
  };

  const handleDigitChange = (idx, raw) => {
    const val = raw.replace(/\D/g, "");
    if (otpError) setOtpError("");
    if (!val) {
      setDigits((d) => {
        const nextDigits = [...d];
        nextDigits[idx] = "";
        return nextDigits;
      });
      return;
    }
    setDigits((d) => {
      const nextDigits = [...d];
      // Support multi-char input (paste / fast typing) by spilling into boxes.
      let cursor = idx;
      for (const ch of val) {
        if (cursor >= OTP_LEN) break;
        nextDigits[cursor] = ch;
        cursor += 1;
      }
      const focusAt = Math.min(cursor, OTP_LEN - 1);
      if (boxRefs.current[focusAt]) boxRefs.current[focusAt].focus();
      // Auto-submit once every box is filled.
      if (nextDigits.every((c) => c !== "")) {
        verifyCode(nextDigits.join(""));
      }
      return nextDigits;
    });
  };

  const handleDigitKeyDown = (idx, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      setDigits((d) => {
        const nextDigits = [...d];
        if (nextDigits[idx]) {
          nextDigits[idx] = "";
        } else if (idx > 0) {
          nextDigits[idx - 1] = "";
          if (boxRefs.current[idx - 1]) boxRefs.current[idx - 1].focus();
        }
        return nextDigits;
      });
    } else if (e.key === "ArrowLeft" && idx > 0) {
      boxRefs.current[idx - 1] && boxRefs.current[idx - 1].focus();
    } else if (e.key === "ArrowRight" && idx < OTP_LEN - 1) {
      boxRefs.current[idx + 1] && boxRefs.current[idx + 1].focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setOtpError("");
    // Mint a fresh Turnstile token from the widget on this screen.
    const token = turnstileRef.current
      ? await turnstileRef.current.refresh()
      : "";
    const { error } = await sendSignupOtp(email, token);
    if (error) {
      setOtpError(error.message || "Couldn't resend the code.");
      return;
    }
    setDigits(Array(OTP_LEN).fill(""));
    setCooldown(RESEND_COOLDOWN);
    if (boxRefs.current[0]) boxRefs.current[0].focus();
  };

  const handleBackToSignup = () => {
    setOtpSent(false);
    setOtpError("");
    setDigits(Array(OTP_LEN).fill(""));
    setCooldown(0);
    verifyingRef.current = false;
    setVerifying(false);
  };

  if (otpSent) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <button
            type="button"
            className="back-link"
            onClick={handleBackToSignup}
          >
            ← Back
          </button>
          <h1>Check Your Email</h1>
          <p className="auth-sub">
            We sent an 8-digit code to <strong>{email}</strong>. Enter it below
            to verify your account.
          </p>

          <div
            className="otp-boxes"
            role="group"
            aria-label="8-digit verification code"
          >
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  boxRefs.current[idx] = el;
                }}
                className={`otp-box${otpError ? " otp-box-error" : ""}`}
                type="text"
                inputMode="numeric"
                autoComplete={idx === 0 ? "one-time-code" : "off"}
                maxLength={OTP_LEN}
                value={digit}
                disabled={verifying}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                onFocus={(e) => e.target.select()}
                aria-label={`Digit ${idx + 1}`}
                aria-invalid={!!otpError}
              />
            ))}
          </div>

          {verifying && (
            <p className="otp-status" role="status">
              Verifying…
            </p>
          )}
          {otpError && (
            <p className="field-error otp-error-msg" role="alert">
              {otpError}
            </p>
          )}

          <Turnstile ref={turnstileRef} onToken={setTurnstileToken} />

          <button
            type="button"
            className="otp-resend-link"
            onClick={handleResend}
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
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
        <h1>Create your account</h1>
        <p className="auth-sub">Start shopping smarter with FetchIt.</p>

        <GoogleButton onClick={handleGoogle} disabled={googleBusy} />

        {errors.googleExists && (
          <p className="field-error" role="alert">
            An account already exists with this Google account.{" "}
            <Link to="/login">Please log in instead.</Link>
          </p>
        )}

        <div className="auth-divider">or</div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="su-email">Email address</label>
            <input
              id="su-email"
              ref={emailRef}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email || errors.exists)
                  setErrors((p) => ({ ...p, email: undefined, exists: undefined }));
              }}
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "su-email-err" : undefined}
            />
            {errors.email && (
              <p className="field-error" id="su-email-err" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="su-password">Password</label>
            <div className="pw-wrap">
              <input
                id="su-password"
                type={show ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password)
                    setErrors((p) => ({ ...p, password: undefined }));
                }}
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "su-pw-err" : undefined}
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
            {errors.password && (
              <p className="field-error" id="su-pw-err" role="alert">
                {errors.password}
              </p>
            )}
          </div>

          {errors.exists && (
            <p className="field-error" role="alert">
              An account with this email already exists.{" "}
              <Link to="/login">Please log in instead.</Link>
            </p>
          )}

          {errors.form && (
            <p className="field-error" role="alert">
              {errors.form}
            </p>
          )}

          <Turnstile ref={turnstileRef} onToken={setTurnstileToken} />

          <button
            type="submit"
            className="btn btn-primary auth-btn"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create Account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default SignupPage;
