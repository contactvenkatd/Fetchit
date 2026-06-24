import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "./Toast";
import ReauthGate from "./ReauthGate";
import { useAuth } from "../AuthContext";
import {
  getName,
  saveName,
  requestPasswordChange,
  resendPasswordChangeEmail,
  applyNewPassword,
  sendAccountDeletionEmail,
  deleteAccount,
  verifyDeleteToken,
  clearDeleteToken,
  isGoogleUser,
  consumeReauthResult,
  getPlan,
  getPlanBilling,
  planUsageLabel,
  planDisplayName,
  familyOwnerLabel,
  familyDisbandAt,
  familyDisbandDue,
  leaveFamily,
  nextBillingDate,
  cancelSubscription,
  reactivateSubscription,
  isCanceled,
  planCancelsAt,
} from "../utils";
import { monthlyDisplay, money } from "../stripeClient";
import "./Modal.css"; // reuse .modal / .modal-overlay / .modal-cancel styles
import "./AccountPage.css";

// "July 11, 2026"
const formatDate = (d) =>
  d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Subscription cancellation (paid plans only).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  // Family-member "Leave Family" confirmation.
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimer = useRef(null);
  // Set once the account is deleted, so the "not signed in → /login" guard below
  // doesn't fire and fight the single navigate("/") after deletion.
  const deletedRef = useRef(false);
  // Ensures the deletion-link token is verified at most once.
  const deletionLinkRef = useRef(false);
  // Ensures a returned Google reauth resumes the deletion email at most once.
  const reauthResumeRef = useRef(false);
  // Ensures a lapsed family member is finalized at most once.
  const lapseRef = useRef(false);

  const showToast = useCallback((message) => {
    setToast({ visible: true, message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      3000
    );
  }, []);

  // Close the delete verify modal and send the deletion confirmation email. The
  // shared post-verify action — called by the password path (ReauthGate
  // onVerified) AND, after a Google reauth round-trip, by the resume effect.
  const beginAccountDeletionEmail = useCallback(async () => {
    setDeleteStep(null);
    setDelSending(true);
    const { error: sendErr, email: addr } = await sendAccountDeletionEmail();
    setDelSending(false);
    if (sendErr) {
      showToast("Couldn't send the email — try again.");
      return;
    }
    setDelSentTo(addr || "");
    setDelEmailSent(true);
  }, [showToast]);

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

  // Did we arrive via the account-deletion confirmation link
  // (/account?type=deletion&token=…)? Verify the token against our metadata
  // before opening the warning modal. Session-aware so it waits for the user to
  // resolve; runs at most once.
  useEffect(() => {
    if (deletionLinkRef.current || loading || !session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") !== "deletion") return;
    deletionLinkRef.current = true;
    const token = params.get("token");
    // Don't leave the token sitting in the URL / browser history.
    window.history.replaceState({}, "", "/account");
    if (verifyDeleteToken(session, token)) {
      clearDeleteToken(); // one-time use
      setDelEmailSent(false);
      setDeleteStep("warn");
    } else {
      showToast("This deletion link has expired or is invalid.");
    }
  }, [loading, session, showToast]);

  // Returning from a Google reauthentication redirect (deletion) → resume the
  // deletion email send that the reauth was gating.
  useEffect(() => {
    if (loading || !session || reauthResumeRef.current) return;
    if (consumeReauthResult("delete-account")) {
      reauthResumeRef.current = true;
      beginAccountDeletionEmail();
    }
  }, [loading, session, beginAccountDeletionEmail]);

  // Lazy family disband: finalize a lapsed family member here too (not just on
  // chat visits) — downgrade to Free + remove their membership row.
  useEffect(() => {
    if (lapseRef.current || !session) return;
    if (familyDisbandDue(session)) {
      lapseRef.current = true;
      leaveFamily();
    }
  }, [session]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (loading || !session) return null;

  const email = session.user.email;
  // Google-only users have no password — show a managed message instead of the
  // change-password form, and "Verify with Google" in any reauth gate.
  const googleUser = isGoogleUser(session);

  // ----- Current plan (for the "Your Plan" card) -----
  const plan = getPlan(session); // Free | Plus | Pro | Max | max_family
  const familyMember = plan === "max_family"; // on someone else's Max plan
  // Family Sharing is available to Max owners AND family members. getPlan reads
  // server-side user_metadata, so this stays correct across refreshes.
  const showFamilySharing = plan === "Max" || plan === "max_family";
  // A family member has Max-level access but no subscription of their own.
  const isPaid = plan !== "Free" && !familyMember;
  const familyOwner = familyMember ? familyOwnerLabel(session) : null;
  const famDisbandDate = familyMember ? familyDisbandAt(session) : null;
  const planBilling = getPlanBilling(session);
  const priceText =
    plan === "Free" || familyMember
      ? "$0/mo"
      : `$${money(monthlyDisplay(plan, planBilling))}/mo`;
  const usageLabel = planUsageLabel(plan);
  const nextBill = nextBillingDate(session);
  const nextBillText = nextBill ? formatDate(nextBill) : null;
  // Scheduled cancellation: still on the paid plan, but it ends on this date.
  const canceled = isCanceled(session);
  const cancelDate = planCancelsAt(session);
  const cancelDateText = cancelDate ? formatDate(cancelDate) : null;

  const handleCancelSub = async () => {
    setCanceling(true);
    const { error } = await cancelSubscription();
    setCanceling(false);
    if (error) {
      showToast(error.message || "Couldn't cancel — please try again.");
      return;
    }
    setCancelOpen(false);
    // Plan stays active until the period ends; the card now shows "Cancels on…"
    // once the session metadata refreshes (USER_UPDATED → AuthContext).
    showToast("Subscription canceled — you keep access until your period ends 🐕");
  };

  const handleLeaveFamily = async () => {
    setLeaving(true);
    const { error } = await leaveFamily();
    setLeaving(false);
    if (error) {
      showToast(error.message || "Couldn't leave the family — try again.");
      return;
    }
    setLeaveOpen(false);
    navigate("/plans", { state: { manage: true } });
  };

  const handleReactivate = async () => {
    setReactivating(true);
    const { error } = await reactivateSubscription();
    setReactivating(false);
    if (error) {
      showToast(error.message || "Couldn't reactivate — please try again.");
      return;
    }
    showToast("Subscription reactivated 🐕");
  };

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
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </span>
        <span className="account-topbar-title">Account Settings</span>
      </header>

      <main className="account-main">
        <div className="account-card">
          {/* ---------- Your Plan ---------- */}
          <section className="account-section">
            <h2>Your Plan</h2>
            <div className={`plan-card plan-card-${familyMember ? "max" : plan.toLowerCase()}`}>
              <div className="plan-card-head">
                <span className="plan-card-name">{planDisplayName(plan)}</span>
                {familyMember ? (
                  <span className="plan-card-badge best">Family</span>
                ) : canceled && cancelDateText ? (
                  <span className="plan-card-badge canceled">
                    Cancels on {cancelDateText}
                  </span>
                ) : (
                  <>
                    {plan === "Pro" && (
                      <span className="plan-card-badge">Most Popular</span>
                    )}
                    {plan === "Max" && (
                      <span className="plan-card-badge best">Best Value</span>
                    )}
                  </>
                )}
              </div>
              <div className="plan-card-price">{priceText}</div>
              <ul className="plan-card-meta">
                <li>{usageLabel}</li>
                <li>Sessions reset every 5 hours</li>
                {familyMember &&
                  (famDisbandDate ? (
                    <li>Access ends {formatDate(famDisbandDate)}</li>
                  ) : (
                    <li>Covered by your family plan</li>
                  ))}
                {!canceled && nextBillText && (
                  <li>Next billing date: {nextBillText}</li>
                )}
              </ul>
              {canceled && cancelDateText ? (
                <p className="plan-card-policy">
                  Your plan remains active until {cancelDateText}. After that
                  you&apos;ll move to the Free plan. No refund is issued for the
                  current period.
                </p>
              ) : (
                isPaid &&
                nextBillText && (
                  <p className="plan-card-policy">
                    Your plan remains active until {nextBillText}. If you cancel,
                    you keep access until that date.
                  </p>
                )
              )}
              {familyMember ? (
                <>
                  <p className="plan-card-policy fam-shared-note">
                    You&apos;re on a family plan shared by{" "}
                    <strong>{familyOwner}</strong>. To manage your plan, ask the
                    plan owner or leave the family.
                  </p>
                  <button
                    type="button"
                    className="btn plan-change-btn manage leave-family-btn"
                    onClick={() => setLeaveOpen(true)}
                  >
                    Leave Family
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`btn plan-change-btn${plan === "Max" ? " manage" : ""}`}
                  // state.manage lets /plans show even though the user has a plan.
                  onClick={() => navigate("/plans", { state: { manage: true } })}
                >
                  {plan === "Max" ? "Manage Plan" : "Upgrade Plan"}
                </button>
              )}
            </div>
            {isPaid &&
              (canceled ? (
                <button
                  type="button"
                  className="cancel-sub-link reactivate"
                  onClick={handleReactivate}
                  disabled={reactivating}
                >
                  {reactivating ? "Reactivating…" : "Reactivate subscription"}
                </button>
              ) : (
                <button
                  type="button"
                  className="cancel-sub-link"
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel subscription
                </button>
              ))}
          </section>

          <hr className="account-divider" />

          {/* ---------- Family Sharing (Max owners + family members) ---------- */}
          {showFamilySharing && (
            <>
              <section className="account-section">
                <h2>Family Sharing</h2>
                <p className="account-section-sub">
                  {familyMember
                    ? "View who you share your family plan with."
                    : "Invite up to 4 people to share your Max plan."}
                </p>
                <button
                  type="button"
                  className="btn plan-change-btn"
                  onClick={() => navigate("/family-sharing")}
                >
                  Manage Family Sharing
                </button>
              </section>

              <hr className="account-divider" />
            </>
          )}

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

            {googleUser ? (
              /* Google-only account — no password to change. */
              <p className="account-section-sub google-managed-note">
                Your account uses Google Sign-In. Password changes are managed
                through your Google account.
              </p>
            ) : recovering ? (
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

      {/* Step 1 — confirm identity (password OR Google) before any email is
          sent. ReauthGate branches on the user's provider. */}
      {deleteStep === "verify" && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDeleteModals();
          }}
        >
          <div
            className="modal verify-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-title"
          >
            <h2 id="verify-title">Verify it&apos;s you</h2>
            <ReauthGate
              purpose="delete-account"
              returnTo="/account"
              theme="light"
              description="Confirm your identity to continue deleting your account."
              submitLabel="Continue"
              onVerified={beginAccountDeletionEmail}
            />
            <button
              type="button"
              className="modal-cancel"
              onClick={closeDeleteModals}
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
              delete your FetchIt account.
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

      {/* Cancel-subscription confirmation. */}
      {cancelOpen && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !canceling) setCancelOpen(false);
          }}
        >
          <div
            className="modal cancel-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
          >
            <h2 id="cancel-title">Are you sure you want to cancel?</h2>
            <p className="modal-sub">
              {nextBillText ? (
                <>
                  You&apos;ll keep access to FetchIt {plan} until{" "}
                  <strong>{nextBillText}</strong>.
                </>
              ) : (
                <>You&apos;ll keep access until the end of your billing period.</>
              )}
            </p>
            <p className="cancel-policy">
              No refund will be issued. You will keep full access to FetchIt{" "}
              {plan} until the end of your current billing period. Your plan does
              not change until your billing period ends
              {nextBillText ? <> — {nextBillText}</> : null}.
            </p>
            <div className="cancel-actions">
              <button
                type="button"
                className="btn delete-keep-btn"
                onClick={() => setCancelOpen(false)}
                disabled={canceling}
              >
                Keep my plan
              </button>
              <button
                type="button"
                className="danger-btn danger-btn-solid"
                onClick={handleCancelSub}
                disabled={canceling}
              >
                {canceling ? "Canceling…" : "Cancel subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave-family confirmation (max_family members). */}
      {leaveOpen && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !leaving) setLeaveOpen(false);
          }}
        >
          <div
            className="modal cancel-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
          >
            <h2 id="leave-title">Are you sure?</h2>
            <p className="modal-sub">You&apos;ll be moved to the Free plan.</p>
            <div className="cancel-actions">
              <button
                type="button"
                className="btn delete-keep-btn"
                onClick={() => setLeaveOpen(false)}
                disabled={leaving}
              >
                Keep family plan
              </button>
              <button
                type="button"
                className="danger-btn danger-btn-solid"
                onClick={handleLeaveFamily}
                disabled={leaving}
              >
                {leaving ? "Leaving…" : "Leave family"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast visible={toast.visible} message={toast.message} />
    </div>
  );
}

export default AccountPage;
