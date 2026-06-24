import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import JoinFamilyPage from "./JoinFamilyPage";

// Returns true if the current device is iOS or Android — those open the FetchIt
// mobile app via the fetchitmobile:// deep link instead of the web join flow.
function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

// /join-family?token=… — the single email link target for BOTH web and mobile
// invites (the invite emails always point at http://localhost:3000/join-family).
// On iPhone/iPad/Android it hands the token off to the FetchIt mobile app via a
// fetchitmobile:// deep link; on desktop/web it renders the normal in-app join
// flow (JoinFamilyPage) directly.
function JoinFamilyRedirectPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [mobile] = useState(isMobileDevice);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!mobile || redirectedRef.current) return;
    redirectedRef.current = true;
    const deepLink = `fetchitmobile://join-family?token=${encodeURIComponent(token)}`;
    window.location.href = deepLink;
  }, [mobile, token]);

  // Desktop / web → handle the invite acceptance directly.
  if (!mobile) {
    return <JoinFamilyPage />;
  }

  // Mobile → we've fired the deep link; show a friendly hand-off message in case
  // the app didn't open (e.g. not installed).
  return (
    <AuthLayout>
      <div className="auth-card jf-card">
        <div className="jf-icon" aria-hidden="true">🐕</div>
        <h1>Opening FetchIt…</h1>
        <p className="auth-sub">
          We're handing your invite off to the FetchIt app. If nothing happens,
          make sure the FetchIt app is installed.
        </p>
      </div>
    </AuthLayout>
  );
}

export default JoinFamilyRedirectPage;
