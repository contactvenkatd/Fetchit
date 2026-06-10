import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { finalizePlan } from "../utils";
import "./CheckoutPage.css";

const prefersReduced = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const formatCardNumber = (value) =>
  value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();

const formatExpiry = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

function isFutureExpiry(mmYY) {
  const m = mmYY.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const endOfCardMonth = new Date(year, month, 1); // first day of next month
  return endOfCardMonth > now;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const plan = location.state && location.state.plan;
  const successRef = useRef(null);

  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);

  // No plan in nav state → back to plan selection.
  useEffect(() => {
    if (!plan) navigate("/plans", { replace: true });
  }, [plan, navigate]);

  useEffect(() => {
    if (done) {
      const id = setTimeout(() => navigate("/chat"), prefersReduced() ? 300 : 2000);
      if (successRef.current) successRef.current.focus();
      return () => clearTimeout(id);
    }
    return undefined;
  }, [done, navigate]);

  if (!plan) return null;

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = "Cardholder name is required";
    if (card.replace(/\s/g, "").length !== 16)
      next.card = "Card number must be 16 digits";
    if (!isFutureExpiry(expiry)) next.expiry = "Enter a valid future date";
    if (!/^\d{3}$/.test(cvv)) next.cvv = "CVV must be 3 digits";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    finalizePlan(plan.name);
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout>
        <div className="auth-card checkout-success" ref={successRef} tabIndex={-1}>
          <div className="success-check" aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <circle className="sc-circle" cx="26" cy="26" r="24" />
              <path className="sc-tick" d="M14 27l8 8 16-16" />
            </svg>
          </div>
          <h1>You&apos;re all set! 🐕</h1>
          <p className="auth-sub">
            Welcome to Fetchit {plan.name}. Taking you to your chat…
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h1>Complete your subscription</h1>

        <div className="checkout-summary">
          <span className="cs-plan">Fetchit {plan.name}</span>
          <span className="cs-price">{plan.priceLabel}</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="co-name">Cardholder name</label>
            <input
              id="co-name"
              type="text"
              placeholder="Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="cc-name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "co-name-err" : undefined}
            />
            {errors.name && (
              <p className="field-error" id="co-name-err" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="co-card">Card number</label>
            <input
              id="co-card"
              type="text"
              inputMode="numeric"
              placeholder="1234 5678 9012 3456"
              value={card}
              onChange={(e) => setCard(formatCardNumber(e.target.value))}
              autoComplete="cc-number"
              aria-invalid={!!errors.card}
              aria-describedby={errors.card ? "co-card-err" : undefined}
            />
            {errors.card && (
              <p className="field-error" id="co-card-err" role="alert">
                {errors.card}
              </p>
            )}
          </div>

          <div className="checkout-row">
            <div className="auth-field">
              <label htmlFor="co-exp">Expiry (MM/YY)</label>
              <input
                id="co-exp"
                type="text"
                inputMode="numeric"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                autoComplete="cc-exp"
                aria-invalid={!!errors.expiry}
                aria-describedby={errors.expiry ? "co-exp-err" : undefined}
              />
              {errors.expiry && (
                <p className="field-error" id="co-exp-err" role="alert">
                  {errors.expiry}
                </p>
              )}
            </div>
            <div className="auth-field">
              <label htmlFor="co-cvv">CVV</label>
              <input
                id="co-cvv"
                type="text"
                inputMode="numeric"
                placeholder="123"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                autoComplete="cc-csc"
                aria-invalid={!!errors.cvv}
                aria-describedby={errors.cvv ? "co-cvv-err" : undefined}
              />
              {errors.cvv && (
                <p className="field-error" id="co-cvv-err" role="alert">
                  {errors.cvv}
                </p>
              )}
            </div>
          </div>

          <p className="stripe-note">
            <span className="stripe-lock" aria-hidden="true">
              🔒
            </span>
            Secured by Stripe
          </p>

          <button type="submit" className="btn btn-primary auth-btn">
            Start Fetchit {plan.name}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}

export default CheckoutPage;
