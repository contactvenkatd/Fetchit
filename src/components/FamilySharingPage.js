import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "./Toast";
import { useAuth } from "../AuthContext";
import {
  isMaxOwner,
  isFamilyMember,
  familyOwnerLabel,
  leaveFamily,
  getFamilyData,
  sendFamilyInvite,
  removeFamilyMember,
  isValidEmail,
  MAX_FAMILY_SLOTS,
} from "../utils";
import "./Modal.css"; // reuse .modal / .modal-overlay / .modal-cancel
import "./AccountPage.css"; // dark shell + top bar
import "./FamilySharingPage.css";

function FamilySharingPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const owner = !loading && session && isMaxOwner(session); // Max owner
  const member = !loading && session && isFamilyMember(session); // max_family

  const [slots, setSlots] = useState([]); // [{ id, email, status }]
  const [fetching, setFetching] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimer = useRef(null);
  const showToast = useCallback((message) => {
    setToast({ visible: true, message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  const refresh = useCallback(() => {
    setFetching(true);
    getFamilyData().then((list) => {
      setSlots(list);
      setFetching(false);
    });
  }, []);

  useEffect(() => {
    if (owner) refresh();
  }, [owner, refresh]);

  // Keep the owner's slots fresh: members accept / decline / leave from their own
  // sessions, so re-fetch whenever the owner returns to this tab/window (a member
  // leaving frees a slot, etc.). Page Visibility API + window focus.
  useEffect(() => {
    if (!owner) return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [owner, refresh]);

  if (loading || !session) return null;

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteError("");
    if (!isValidEmail(inviteEmail)) {
      setInviteError("Please enter a valid email.");
      return;
    }
    setSending(true);
    const { error } = await sendFamilyInvite(inviteEmail);
    setSending(false);
    if (error) {
      setInviteError(error.message || "Couldn't send the invite.");
      return;
    }
    setInviteOpen(false);
    setInviteEmail("");
    showToast("Invite sent 🐕");
    refresh();
  };

  const handleRemove = async (slot) => {
    const label = slot.status === "accepted" ? "remove this member" : "revoke this invite";
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    setRemovingId(slot.id);
    const { error } = await removeFamilyMember(slot.id);
    setRemovingId(null);
    if (error) {
      showToast(error.message || "Couldn't update the slot.");
      return;
    }
    showToast(slot.status === "accepted" ? "Member removed 🐕" : "Invite revoked 🐕");
    refresh();
  };

  const handleLeave = async () => {
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

  return (
    <div className="account-page">
      <header className="account-topbar">
        <button className="account-back" onClick={() => navigate("/chat")} aria-label="Back to chat">
          ←
        </button>
        <a href="/" className="logo">
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </a>
        <span className="account-topbar-title">Family Sharing</span>
      </header>

      <main className="account-main">
        {member ? (
          /* max_family member — read-only: who they share with + Leave Family. */
          <div className="account-card fam-gate">
            <div className="fam-gate-icon" aria-hidden="true">👨‍👩‍👧‍👦</div>
            <h2>You are part of {familyOwnerLabel(session)}&apos;s family plan</h2>
            <p className="account-section-sub">
              You have full Max-level access, covered by{" "}
              <strong>{familyOwnerLabel(session)}</strong>. To change your plan, ask
              the plan owner or leave the family.
            </p>
            <button
              type="button"
              className="btn plan-change-btn manage leave-family-btn"
              onClick={() => setLeaveOpen(true)}
            >
              Leave Family
            </button>
          </div>
        ) : !owner ? (
          /* Gate — non-Max, non-member: invite to upgrade. */
          <div className="account-card fam-gate">
            <div className="fam-gate-icon" aria-hidden="true">👨‍👩‍👧‍👦</div>
            <h2>Family Sharing is available on the Max plan</h2>
            <p className="account-section-sub">
              Upgrade to Max to invite up to {MAX_FAMILY_SLOTS} family members — each
              gets full Pro-level access, covered by your plan.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/plans", { state: { manage: true } })}
            >
              Upgrade to Max
            </button>
          </div>
        ) : (
          <div className="fam-wrap">
            <div className="fam-head">
              <h1>Your Family 🐕</h1>
              <p>
                Invite up to {MAX_FAMILY_SLOTS} people to share your FetchIt Max
                plan. Each gets their own account with Max-level access — no payment
                needed.
              </p>
            </div>

            <ul className="fam-slots">
              {Array.from({ length: MAX_FAMILY_SLOTS }).map((_, i) => {
                const slot = slots[i];
                return (
                  <li key={i} className={`fam-slot${slot ? " filled" : ""}`}>
                    <span className="fam-slot-label">Slot {i + 1}</span>
                    {slot ? (
                      <div className="fam-slot-body">
                        <div className="fam-slot-member">
                          <span className="fam-slot-email">{slot.email}</span>
                          <span className={`fam-slot-status fam-status-${slot.status}`}>
                            {slot.status === "accepted" ? "Member" : "Invite pending"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="fam-remove-btn"
                          onClick={() => handleRemove(slot)}
                          disabled={removingId === slot.id}
                        >
                          {removingId === slot.id ? "…" : "Remove"}
                        </button>
                      </div>
                    ) : (
                      <div className="fam-slot-body">
                        <span className="fam-slot-empty">Empty</span>
                        <button
                          type="button"
                          className="btn btn-primary fam-invite-btn"
                          onClick={() => {
                            setInviteError("");
                            setInviteEmail("");
                            setInviteOpen(true);
                          }}
                          disabled={fetching}
                        >
                          Invite
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>

      {inviteOpen && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !sending) setInviteOpen(false);
          }}
        >
          <div className="modal fam-modal" role="dialog" aria-modal="true" aria-labelledby="fam-invite-title">
            <h2 id="fam-invite-title">Invite a family member</h2>
            <p className="modal-sub">
              We&apos;ll email them an invite link to join your FetchIt Max family.
            </p>
            <form onSubmit={handleSendInvite} noValidate>
              <input
                type="email"
                className="fam-invite-input"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  if (inviteError) setInviteError("");
                }}
                autoComplete="email"
                aria-invalid={!!inviteError}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                disabled={sending}
              />
              {inviteError && <p className="field-error" role="alert">{inviteError}</p>}
              <button type="submit" className="btn btn-primary fam-modal-send" disabled={sending}>
                {sending ? "Sending…" : "Send invite"}
              </button>
            </form>
            <button type="button" className="modal-cancel" onClick={() => setInviteOpen(false)} disabled={sending}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {leaveOpen && (
        <div
          className="modal-overlay delete-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !leaving) setLeaveOpen(false);
          }}
        >
          <div className="modal cancel-modal" role="alertdialog" aria-modal="true" aria-labelledby="fam-leave-title">
            <h2 id="fam-leave-title">Are you sure?</h2>
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
                onClick={handleLeave}
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

export default FamilySharingPage;
