import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { isValidEmail, createUser } from "../utils";

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const emailRef = useRef(null);

  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = {};
    if (!isValidEmail(email)) next.email = "Please enter a valid email";
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    createUser(email, password);
    navigate("/plans");
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="auth-sub">Start shopping smarter with Fetchit.</p>

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
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
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

          <button type="submit" className="btn btn-primary auth-btn">
            Create Account
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
