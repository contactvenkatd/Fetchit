// Reusable Cloudflare Turnstile widget (explicit rendering).
//
// Why explicit (not the implicit `.cf-turnstile` auto-scan): the api.js script
// only scans the DOM once, on load. In a SPA the auth forms mount AFTER that
// scan, so the widget never renders. Here we render explicitly via
// window.turnstile.render() once BOTH the script is ready and our container is
// mounted, which is the reliable path for React.
//
// The widget calls onToken(token) whenever it produces a fresh token (initial
// solve + after a reset/expiry). Turnstile tokens are single-use, so a flow that
// makes two CAPTCHA-protected calls (signUp → send-OTP) mints a second token via
// the imperative ref: `await turnstileRef.current.refresh()` resolves with the
// next token after resetting the widget.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

// Resolve once window.turnstile (defined by the async-loaded api.js) is ready.
// Returns a cancel function so an unmounting effect can stop waiting.
function whenTurnstileReady(cb) {
  const ready = () =>
    window.turnstile && typeof window.turnstile.render === "function";
  if (ready()) {
    cb();
    return () => {};
  }
  const interval = setInterval(() => {
    if (ready()) {
      clearInterval(interval);
      cb();
    }
  }, 100);
  // Give up after ~10s so we never leak the interval.
  const timeout = setTimeout(() => clearInterval(interval), 10000);
  return () => {
    clearInterval(interval);
    clearTimeout(timeout);
  };
}

const Turnstile = forwardRef(function Turnstile({ onToken }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const pendingRef = useRef(null); // resolver for an in-flight refresh()
  // Keep the latest onToken without re-running the render effect.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    const cancelWait = whenTurnstileReady(() => {
      if (cancelled || !containerRef.current) return;
      if (widgetIdRef.current !== null) return; // guard StrictMode double-mount
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => {
          if (onTokenRef.current) onTokenRef.current(token);
          if (pendingRef.current) {
            pendingRef.current(token);
            pendingRef.current = null;
          }
        },
        "expired-callback": () => {
          if (onTokenRef.current) onTokenRef.current("");
        },
        "error-callback": () => {
          if (pendingRef.current) {
            pendingRef.current("");
            pendingRef.current = null;
          }
        },
      });
    });

    return () => {
      cancelled = true;
      cancelWait();
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
      }
      widgetIdRef.current = null;
      pendingRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      // Reset the widget and resolve with the NEXT fresh token (or "" on
      // failure/timeout). Used between chained CAPTCHA-protected calls.
      refresh() {
        return new Promise((resolve) => {
          if (widgetIdRef.current === null || !window.turnstile) {
            resolve("");
            return;
          }
          pendingRef.current = resolve;
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {
            pendingRef.current = null;
            resolve("");
            return;
          }
          // Safety net so a stuck challenge never hangs the caller.
          setTimeout(() => {
            if (pendingRef.current) {
              pendingRef.current("");
              pendingRef.current = null;
            }
          }, 8000);
        });
      },
    }),
    []
  );

  return <div ref={containerRef} className="turnstile-widget" />;
});

export default Turnstile;
