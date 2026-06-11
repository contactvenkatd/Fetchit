import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "./Toast";
import { useAuth } from "../AuthContext";
import {
  getName,
  saveName,
  requestPasswordChange,
  resendPasswordChangeEmail,
  applyNewPassword,
  verifyPassword,
  sendAccountDeletionEmail,
  deleteAccount,
} from "../utils";
import "./Modal.css"; // reuse .modal / .modal-overlay / .modal-cancel styles
import "./AccountPage.css";

// Coarse password strength → a 0–4 score plus a label/class for the meter.
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

function PasswordStrengthMeter({ value }) {
  const strength = passwordStrength(value);
  if (!value) return null;
  return (
    <div className="pw-strength" aria-hidden="true">
      <div className="pw-bars">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`pw-bar${
              i <= strength.score ? ` filled ${strength.level}` : ""
            }`}
          />
        ))}
      </div>
      <span className={`pw-label ${strength.level}`}>{strength.label}</span>
    </div>
  );
}

function AccountPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const initialName = getName(session);

  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwSent, setPwSent] = useState(false); // confirmation email sent, awaiting click
  const [sentTo, setSentTo] = useState("");
  // True after returning from the email link — show the "finish" form.
  const [recovering, setRecovering] = useState(false);

  // Account deletion (email-confirmed, multi-step).
  const [delEmailSent, setDelEmailSent] = useState(false); // step 1 email sent
  const [delSentTo, setDelSentTo] = useState("");
  const [delSending, setDelSending] = useState(false);
  // null | "verify" | "warn" | "final"
  const [deleteStep, setDeleteStep] = useState(null);
  const [verifyPw, setVerifyPw] = useState("");
  const [showVerifyPw, setShowVerifyPw] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimer = useRef(null);
  // Set once the account is deleted, so the "not signed in → /login" guard below
  // doesn't fire and fight the single navigate("/") after deletion.
  const deletedRef = useRef(false);

  const showToast = useCallback((message) => {
    setToast({ visible: true, message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      3000
    );
  }, []);

  // Protected: must be signed in. Skipped during account deletion — the session
  // is being cleared and we redirect to "/" ourselves, so don't bounce to /login.
  useEffect(() => {
    if (!loading && !session && !deletedRef.current) {
      navigate("/login", { replace: true });
    }
  }, [loading, session, navigate]);

  // Keep the profile fields in sync once the session resolves.
  useEffect(() => {
    if (session) {
      const n = getName(session);
      setFirstName(n.firstName);
      setLastName(n.lastName);
    }
  }, [session]);

  // Did we arrive via the password-change confirmation link? (Flag set in App.js.)
  useEffect(() => {
    if (sessionStorage.getItem("fetchit_pw_recovery") === "1") {
      sessionStorage.removeItem("fetchit_pw_recovery");
      setRecovering(true);
      setPwSent(false);
    }
  }, []);

  // Did we arrive via the account-deletion confirmation link? Open the warning
  // modal. (Flag set in App.js after detecting ?type=deletion.)
  useEffect(() => {
    if (sessionStorage.getItem("fetchit_delete_intent") === "1") {
      sessionStorage.removeItem("fetchit_delete_intent");
      setDeleteStep("warn");
      setDelEmailSent(false);
    }
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (loading || !session) return null;

  const email = session.user.email;

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    const { error } = await saveName(firstName, lastName);
    setSavingProfile(false);
    if (error) {
      showToast("Couldn't save profile — try again.");
      return;
    }
    showToast("Profile updated! 🐕");
  };

  // Step 1: validate, verify current password, email the confirmation link.
  const handleRequestChange = async (e) => {
    e.preventDefault();
    setPwError("");
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    setSavingPw(true);
    const { error, email: addr } = await requestPasswordChange(currentPw);
    setSavingPw(false);
    if (error) {
      setPwError(error.message || "Couldn't start the password change.");
      return;
    }
    setSentTo(addr || email);
    setPwSent(true);
  };

  const handleResend = async () => {
    setSavingPw(true);
    const { error } = await resendPasswordChangeEmail();
    setSavingPw(false);
    if (error) {
      setPwError(error.message || "Couldn't resend the email.");
      return;
    }
    showToast("Confirmation email resent 🐕");
  };

  // Step 2: set the new password inside the recovery session.
  const handleConfirmNewPassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    setSavingPw(true);
    const { error } = await applyNewPassword(newPw);
    setSavingPw(false);
    if (error) {
      setPwError(error.message || "Couldn't update password.");
      return;
    }
    setRecovering(false);
    setPwSent(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    showToast("Password updated! 🐕");
  };

  // Step 1: verify the password, then send the deletion confirmation email.
  const handleVerifyAndSend = async (e) => {
    e.preventDefault();
    setVerifyError("");
    setVerifying(true);
    const { error } = await verifyPassword(verifyPw);
    if (error) {
      setVerifying(false);
      setVerifyError(error.message || "Incorrect password");
      return;
    }
    // Verified → close the verify modal, then email the confirmation link.
    setVerifying(false);
    setDeleteStep(null);
    setVerifyPw("");
    setShowVerifyPw(false);
    setDelSending(true);
    const { error: sendErr, email: addr } = await sendAccountDeletionEmail();
    setDelSending(false);
    if (sendErr) {
      showToast("Couldn't send the email — try again.");
      return;
    }
    setDelSentTo(addr || email);
    setDelEmailSent(true);
  };

  const handleResendDelete = async () => {
    setDelSending(true);
    const { error } = await sendAccountDeletionEmail();
    setDelSending(false);
    if (error) {
      showToast("Couldn't resend the email — try again.");
      return;
    }
    showToast("Confirmation email resent 🐕");
  };

  const closeDeleteModals = () => {
    setDeleteStep(null);
    setConfirmText("");
    setVerifyPw("");
    setVerifyError("");
    setShowVerifyPw(false);
  };

  // Final step: actually delete, then redirect home with a flash message.
  const handleConfirmDelete = async () => {
    if (confirmText !== "DELETE" || deletedRef.current) return;
    setDeleting(true);
    const { error } = await deleteAccount();
    if (error) {
      setDeleting(false);
      showToast("Couldn't delete account — try again.");
      return;
    }
    // Mark deleted first so the protected-route guard won't race us to /login,
    // queue the flash, then navigate home exactly once.
    deletedRef.current = true;
    sessionStorage.setItem("fetchit_flash", "Your account has been deleted.");
    navigate("/", { replace: true });
  };

  return (
    <div className="account-page">
      <header className="account-topbar">
        <button
          className="account-back"
          onClick={() => navigate("/chat")}
          aria-label="Back to chat"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 5l-7 7 7 7"
            />
          </svg>
        </button>
        <span className="logo">
          <span className="logo-mark" role="img" aria-label="Fetchit dog">
            🐕
          </span>
          <span className="logo-text">Fetchit</span>
        </span>
        <span className="account-topbar-title">Account Settings</span>
      </header>

      <main className="account-main">
        <div className="account-card">
          {/* ---------- Profile ---------- */}
          <section className="account-section">
            <h2>Profile</h2>
            <p className="account-section-sub">Signed in as {email}</p>
            <form onSubmit={handleSaveProfile} noValidate>
              <div className="account-row">
                <div className="account-field">
                  <label htmlFor="ac-first">First name</label>
                  <input
                    id="ac-first"
                    type="text"
                    placeholder="Alex"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="account-field">
                  <label htmlFor="ac-last">Last name</label>
                  <input
                    id="ac-last"
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
                className="btn btn-primary account-btn-save"
                disabled={savingProfile}
              >
                {savingProfile ? "Saving…" : "Save changes"}
              </button>
            </form>
          </section>

          <hr className="account-divider" />

          {/* ---------- Change password ---------- */}
          <section className="account-section">
            <h2>Change password</h2>

            {recovering ? (
              /* Step 2: arrived from the email link — finish the change. */
              <form onSubmit={handleConfirmNewPassword} noValidate>
                <div className="pw-recovery-banner" role="status">
                  ✅ Email confirmed — set your new password to finish.
                </div>
                <div className="account-field">
                  <label htmlFor="ac-new2">New password</label>
                  <input
                    id="ac-new2"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                  />
                  <PasswordStrengthMeter value={newPw} />
                </div>
                <div className="account-field">
                  <label htmlFor="ac-confirm2">Confirm new password</label>
                  <input
                    id="ac-confirm2"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={!!pwError}
                    aria-describedby={pwError ? "ac-pw-err" : undefined}
                  />
                </div>
                {pwError && (
                  <p className="field-error" id="ac-pw-err" role="alert">
                    {pwError}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary account-btn-save"
                  disabled={savingPw}
                >
                  {savingPw ? "Updating…" : "Update password"}
                </button>
              </form>
            ) : pwSent ? (
              /* Step 1 done: confirmation email sent, awaiting the link click. */
              <div className="pw-check">
                <p className="pw-check-title">Check your email 🐕</p>
                <p>
                  We sent a confirmation link to <strong>{sentTo}</strong>. Click
                  it to confirm your new password.
                </p>
                {pwError && (
                  <p className="field-error" role="alert">
                    {pwError}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-primary account-btn-save pw-resend"
                  onClick={handleResend}
                  disabled={savingPw}
                >
                  {savingPw ? "Sending…" : "Resend email"}
                </button>
              </div>
            ) : (
              /* Step 1 form: enter current + new + confirm. */
              <form onSubmit={handleRequestChange} noValidate>
                <div className="account-field">
                  <label htmlFor="ac-cur">Current password</label>
                  <input
                    id="ac-cur"
                    type="password"
                    placeholder="Your current password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="account-field">
                  <label htmlFor="ac-new">New password</label>
                  <input
                    id="ac-new"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                  />
                  <PasswordStrengthMeter value={newPw} />
                </div>
                <div className="account-field">
                  <label htmlFor="ac-confirm">Confirm new password</label>
                  <input
                    id="ac-confirm"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={!!pwError}
                    aria-describedby={pwError ? "ac-pw-err" : undefined}
                  />
                </div>
                {pwError && (
                  <p className="field-error" id="ac-pw-err" role="alert">
                    {pwError}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary account-btn-save"
                  disabled={savingPw}
                >
                  {savingPw ? "Sending…" : "Update password"}
                </button>
              </form>
            )}
          </section>

          <hr className="account-divider" />

          {/* ---------- Danger zone ---------- */}
          <section className="account-section">
            <h2 className="danger-title">Danger zone</h2>
            {delEmailSent ? (
              <div className="pw-check">
                <p className="pw-check-title">Check your email 🐕</p>
                <p>
                  We sent a deletion confirmation link to{" "}
                  <strong>{delSentTo}</strong>. Click it to confirm you want to
                  delete your account.
                </p>
                <button
                  type="button"
                  className="danger-btn pw-resend"
                  onClick={handleResendDelete}
                  disabled={delSending}
                >
                  {delSending ? "Sending…" : "Resend email"}
                </button>
              </div>
            ) : (
              <>
                <p className="account-section-sub">
                  Deleting your account is permanent and can&apos;t be undone.
                </p>
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => setDeleteStep("verify")}
                  disabled={delSending}
                >
                  {delSending ? "Sending…" : "Delete my account"}
                </button>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Step 1 — verify password before any email is sent. */}
      {deleteStep === "verify" && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !verifying) closeDeleteModals();
          }}
        >
          <div
            className="modal verify-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-title"
          >
            <h2 id="verify-title">Verify it&apos;s you</h2>
            <p className="modal-sub">Enter your password to continue.</p>
            <form onSubmit={handleVerifyAndSend} noValidate>
              <div className="verify-pw-wrap">
                <input
                  type={showVerifyPw ? "text" : "password"}
                  className="verify-input"
                  placeholder="Your password"
                  value={verifyPw}
                  onChange={(e) => {
                    setVerifyPw(e.target.value);
                    if (verifyError) setVerifyError("");
                  }}
                  autoComplete="current-password"
                  aria-invalid={!!verifyError}
                  aria-describedby={verifyError ? "verify-err" : undefined}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  disabled={verifying}
                />
                <button
                  type="button"
                  className="verify-pw-toggle"
                  onClick={() => setShowVerifyPw((v) => !v)}
                  aria-pressed={showVerifyPw}
                  aria-label={showVerifyPw ? "Hide password" : "Show password"}
                >
                  {showVerifyPw ? "Hide" : "Show"}
                </button>
              </div>
              {verifyError && (
                <p className="field-error" id="verify-err" role="alert">
                  {verifyError}
                </p>
              )}
              <button
                type="submit"
                className="btn delete-keep-btn verify-continue"
                disabled={verifying || !verifyPw}
              >
                {verifying ? "Checking…" : "Continue"}
              </button>
            </form>
            <button
              type="button"
              className="modal-cancel"
              onClick={closeDeleteModals}
              disabled={verifying}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — warning modal (after the email link is confirmed). */}
      {deleteStep === "warn" && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDeleteModals();
          }}
        >
          <div
            className="modal delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-warn-title"
          >
            <div className="delete-warn-icon" aria-hidden="true">
              ⚠️
            </div>
            <h2 id="del-warn-title">Are you sure you want to delete your account?</h2>
            <div className="delete-warn-box" role="alert">
              <p>This will permanently delete:</p>
              <ul>
                <li>All your chat history</li>
                <li>All your orders</li>
                <li>Your account and profile</li>
              </ul>
              <p className="delete-warn-final">This cannot be undone.</p>
            </div>
            <div className="delete-actions">
              <button
                type="button"
                className="btn delete-keep-btn"
                onClick={closeDeleteModals}
              >
                No, keep my account
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => setDeleteStep("final")}
              >
                Yes, delete my account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — final type-DELETE confirmation. */}
      {deleteStep === "final" && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) closeDeleteModals();
          }}
        >
          <div
            className="modal delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-final-title"
          >
            <h2 id="del-final-title">Final confirmation</h2>
            <p className="modal-sub">
              Type <strong>DELETE</strong> to confirm you want to permanently
              delete your Fetchit account.
            </p>
            <input
              type="text"
              className="delete-confirm-input"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              aria-label="Type DELETE to confirm"
              disabled={deleting}
            />
            <button
              type="button"
              className="danger-btn danger-btn-solid"
              onClick={handleConfirmDelete}
              disabled={confirmText !== "DELETE" || deleting}
            >
              {deleting ? "Deleting…" : "Confirm deletion"}
            </button>
            <button
              type="button"
              className="modal-cancel"
              onClick={closeDeleteModals}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <Toast visible={toast.visible} message={toast.message} />
    </div>
  );
}

export default AccountPage;
