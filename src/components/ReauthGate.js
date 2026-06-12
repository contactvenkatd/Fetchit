import { useState } from "react";
import GoogleButton from "./GoogleButton";
import { useAuth } from "../AuthContext";
import { isGoogleUser, verifyPassword, startGoogleReauth } from "../utils";
import "./ReauthGate.css";

// Reusable identity-confirmation gate. Branches on the signed-in user's auth
// provider so password-gated areas work for BOTH kinds of account:
//   - Email/password users → password confirmation form (verifyPassword).
//   - Google OAuth users    → "Verify with Google" button (startGoogleReauth).
//
// The password path is synchronous: on success it calls `onVerified()`. The
// Google path is a redirect round-trip — it leaves the app and returns to the
// gated page, which must call `consumeReauthResult(purpose)` on mount and run
// the same post-verify action. So `purpose` MUST match what the page consumes,
// and `returnTo` is the page to come back to.
//
// Props: purpose, returnTo, onVerified, title?, description?, submitLabel?,
//        theme ("dark" | "light", default "dark").
function ReauthGate({
  purpose,
  returnTo,
  onVerified,
  title,
  description,
  submitLabel = "Continue",
  theme = "dark",
}) {
  const { session } = useAuth();
  const google = isGoogleUser(session);

  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePassword = async (e) => {
    e.preventDefault();
    setError("");
    if (!pw) {
      setError("Enter your password to continue.");
      return;
    }
    setBusy(true);
    const { error: err } = await verifyPassword(pw);
    setBusy(false);
    if (err) {
      setError(err.message || "Incorrect password");
      return;
    }
    setPw("");
    onVerified();
  };

  const handleGoogle = async () => {
    setError("");
    setBusy(true);
    const { error: err } = await startGoogleReauth(purpose, returnTo);
    // On success the browser redirects to Google; we only reach here on failure.
    if (err) {
      setBusy(false);
      setError(err.message || "Couldn't start Google verification.");
    }
  };

  const inputId = `reauth-pw-${purpose}`;

  return (
    <div className={`reauth reauth-${theme}`}>
      {title && <h3 className="reauth-title">{title}</h3>}
      {description && <p className="reauth-desc">{description}</p>}

      {google ? (
        <>
          <p className="reauth-google-note">
            Your account uses Google Sign-In. Verify with Google to continue.
          </p>
          <GoogleButton
            onClick={handleGoogle}
            disabled={busy}
            label={busy ? "Redirecting…" : "Verify with Google"}
          />
          {error && (
            <p className="field-error reauth-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <form onSubmit={handlePassword} noValidate>
          <div className="reauth-field">
            <label htmlFor={inputId}>Password</label>
            <div className="reauth-pw-wrap">
              <input
                id={inputId}
                type={show ? "text" : "password"}
                placeholder="Your password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  if (error) setError("");
                }}
                autoComplete="current-password"
                aria-invalid={!!error}
                disabled={busy}
              />
              <button
                type="button"
                className="reauth-pw-toggle"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            {error && (
              <p className="field-error reauth-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary reauth-submit"
            disabled={busy || !pw}
          >
            {busy ? "Checking…" : submitLabel}
          </button>
        </form>
      )}
    </div>
  );
}

export default ReauthGate;
