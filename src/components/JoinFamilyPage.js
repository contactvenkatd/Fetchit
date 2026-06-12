import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import {
  validateFamilyInvite,
  acceptFamilyInvite,
  declineFamilyInvite,
  setFamilyInviteToken,
  clearFamilyInviteToken,
  getName,
} from "../utils";
import "./JoinFamilyPage.css";

// /join-family?token=… — the invitee's landing page. Validates the token, then
// branches on whether the visitor is logged in.
function JoinFamilyPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [invite, setInvite] = useState(null); // { ownerName, inviteeEmail, status, valid }
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const validatedRef = useRef(false);

  // Validate the token once.
  useEffect(() => {
    if (validatedRef.current) return;
    validatedRef.current = true;
    if (!token) {
      setError("This invite link is missing its token.");
      setChecking(false);
      return;
    }
    validateFamilyInvite(token).then((res) => {
      if (res.error) setError(res.error.message || "This invite link is invalid.");
      else if (!res.data.valid) {
        setError(
          res.data.status === "accepted"
            ? "This invite has already been accepted."
            : "This invite is no longer available."
        );
      } else {
        setInvite(res.data);
      }
      setChecking(false);
    });
  }, [token]);

  const handleAccept = async () => {
    setBusy(true);
    const { error: accErr } = await acceptFamilyInvite(token);
    setBusy(false);
    if (accErr) {
      setError(accErr.message || "Couldn't accept the invite.");
      return;
    }
    clearFamilyInviteToken();
    navigate("/chat", { replace: true });
  };

  const handleDecline = async () => {
    setBusy(true);
    await declineFamilyInvite(token);
    clearFamilyInviteToken();
    navigate(session ? "/chat" : "/", { replace: true });
  };

  const goAuth = (path) => {
    // Persist the token across the signup/login round-trip so it's accepted after.
    setFamilyInviteToken(token);
    navigate(path);
  };

  if (loading || checking) {
    return (
      <AuthLayout>
        <div className="auth-card jf-card">
          <p className="auth-sub">Checking your invite…</p>
        </div>
      </AuthLayout>
    );
  }

  if (error || !invite) {
    return (
      <AuthLayout>
        <div className="auth-card jf-card">
          <div className="jf-icon" aria-hidden="true">🐕</div>
          <h1>Invite unavailable</h1>
          <p className="auth-sub">{error || "This invite link is invalid or has expired."}</p>
          <button type="button" className="btn btn-primary auth-btn" onClick={() => navigate("/")}>
            Go to FetchIt
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ----- Logged out: invite them to create an account or log in -----
  if (!session) {
    return (
      <AuthLayout>
        <div className="auth-card jf-card">
          <div className="jf-icon" aria-hidden="true">👨‍👩‍👧‍👦</div>
          <h1>{invite.ownerName} invited you to FetchIt Max</h1>
          <p className="auth-sub">
            Join their family plan for full Pro-level AI shopping — no payment
            needed. Create an account or log in to accept.
          </p>
          <button type="button" className="btn btn-primary auth-btn" onClick={() => goAuth("/signup")}>
            Create Account
          </button>
          <button type="button" className="btn btn-dark auth-btn jf-secondary" onClick={() => goAuth("/login")}>
            Log In
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ----- Logged in: accept / decline -----
  const meta = (session.user && session.user.user_metadata) || {};
  const avatarUrl = meta.avatar_url || meta.picture || null;
  const { firstName, lastName } = getName(session);
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const email = session.user.email;
  const initial = (displayName || email || "?").charAt(0).toUpperCase();

  return (
    <AuthLayout>
      <div className="auth-card jf-card">
        <div className="jf-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="jf-avatar-initial" aria-hidden="true">{initial}</span>
          )}
        </div>
        <p className="jf-you">{displayName || email}</p>
        <h1>{invite.ownerName} invited you to join their FetchIt Max family plan</h1>
        <p className="auth-sub">
          Accept to get Max-level access on this account — covered by {invite.ownerName}.
        </p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button type="button" className="btn btn-primary auth-btn" onClick={handleAccept} disabled={busy}>
          {busy ? "Joining…" : "Accept"}
        </button>
        <button type="button" className="btn btn-dark auth-btn jf-secondary" onClick={handleDecline} disabled={busy}>
          Decline
        </button>
      </div>
    </AuthLayout>
  );
}

export default JoinFamilyPage;
