import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import {
  authenticate,
  startSession,
  getPendingPlan,
  clearPendingPlan,
  finalizePlan,
} from "../utils";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef(null);

  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!authenticate(email, password)) {
      setError("Incorrect email or password");
      return;
    }
    startSession(email);

    // Resume a plan the user picked before logging in, if any.
    const pending = getPendingPlan();
    if (pending) {
      clearPendingPlan();
      if (pending.name === "Free") {
        finalizePlan("Free");
        navigate("/chat");
      } else {
        navigate("/checkout", { state: { plan: pending } });
      }
      return;
    }
    navigate("/chat");
  };

  return (
    <AuthLayout>
      <div className="auth-card">
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
          </div>

          {error && (
            <p className="field-error" id="li-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary auth-btn">
            Sign In
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
