import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import {
  finalizePlan,
  createSubscription,
  detectPlanChange,
  cancelStripeSubscriptions,
  sendPlanEmail,
  disbandFamily,
} from "../utils";
import {
  stripePromise,
  monthlyDisplay,
  annualTotal,
  isFlatPlan,
  money,
} from "../stripeClient";
import "./Pricing.css"; // billing-toggle / billing-option / save-badge styles
import "./CheckoutPage.css";

const prefersReduced = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Shared look for the three Stripe Element iframes — match the app's inputs.
const ELEMENT_STYLE = {
  base: {
    color: "#1A1A1A",
    fontFamily: '"Nunito", sans-serif',
    fontSize: "16px",
    fontWeight: "600",
    "::placeholder": { color: "#9a9a9a" },
  },
  invalid: { color: "#d32f2f", iconColor: "#d32f2f" },
};

// The card form. Lives inside <Elements> so the Stripe hooks are available.
function CheckoutForm({ plan }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const stripe = useStripe();
  const elements = useElements();
  const successRef = useRef(null);

  // The checkout's own billing toggle, seeded from what the user picked on the
  // plans page. The amount actually charged follows this toggle.
  const [billing, setBilling] = useState(
    plan.billing === "annual" ? "annual" : "monthly"
  );
  const isAnnual = billing === "annual";

  const [name, setName] = useState("");
  const [cardComplete, setCardComplete] = useState({
    number: false,
    expiry: false,
    cvc: false,
  });
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const flat = isFlatPlan(plan.name);
  const perMonth = monthlyDisplay(plan.name, billing);
  const priceLabel = `$${money(perMonth)}/mo`;
  const billingNote = flat
    ? "Flat rate, no commitment."
    : isAnnual
    ? `Billed annually — $${money(annualTotal(plan.name))}/year today.`
    : "Billed monthly. Cancel anytime.";

  useEffect(() => {
    if (done) {
      const id = setTimeout(
        () => navigate("/delivery-payment"),
        prefersReduced() ? 300 : 2000
      );
      if (successRef.current) successRef.current.focus();
      return () => clearTimeout(id);
    }
    return undefined;
  }, [done, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!stripe || !elements) return; // Stripe.js still loading.
    if (!name.trim()) {
      setError("Cardholder name is required.");
      return;
    }
    if (!cardComplete.number || !cardComplete.expiry || !cardComplete.cvc) {
      setError("Please enter your full card details.");
      return;
    }

    setProcessing(true);

    // Classify the change from the CURRENT plan BEFORE we mutate metadata, using
    // the live billing toggle (so a toggle change on this page is respected).
    const change = detectPlanChange(session, plan.name, billing);

    // 1. Server creates (or reuses) the customer + an incomplete subscription
    //    and hands back the PaymentIntent client secret + the new sub id.
    const { data, error: subError } = await createSubscription({
      plan: plan.name,
      billing,
    });
    if (subError) {
      setError(subError.message);
      setProcessing(false);
      return;
    }
    const newSubscriptionId = data.subscriptionId;

    // 2. Confirm the card payment in the browser (secret key never involved).
    const { error: payError, paymentIntent } = await stripe.confirmCardPayment(
      data.clientSecret,
      {
        payment_method: {
          card: elements.getElement(CardNumberElement),
          billing_details: { name: name.trim() },
        },
      }
    );
    if (payError) {
      setError(payError.message || "Payment could not be completed.");
      setProcessing(false);
      return;
    }
    if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
      // 3. Record the new plan (+ billing period) on the user. Plan changes
      //    take effect IMMEDIATELY here — right after Stripe confirms payment
      //    (rule 4: no delay, no waiting for the billing period). The trigger is
      //    the detected change type (purchase / upgrade / downgrade / billing_change).
      await finalizePlan(plan.name, billing, `checkout:${change.type}`);

      // 4. For a change (not a first purchase), cancel the OLD subscription —
      //    immediately for an upgrade / billing switch, at period end for a
      //    downgrade — leaving the just-created one untouched.
      const isChange = ["upgrade", "downgrade", "billing_change"].includes(
        change.type
      );
      if (isChange) {
        await cancelStripeSubscriptions({
          exceptSubscriptionId: newSubscriptionId,
          atPeriodEnd: change.type === "downgrade",
        });
      }

      // Moving OFF Max (to Plus/Pro) tears down the family — downgrade + notify
      // every member.
      if (change.fromPlan === "Max" && plan.name !== "Max") disbandFamily();

      // 5. Send the matching confirmation email. Upgrade reuses the purchase
      //    "Welcome to FetchIt <Plan>!" template; downgrade / billing switch
      //    have their own.
      const emailType =
        change.type === "downgrade"
          ? "downgrade"
          : change.type === "billing_change"
          ? "billing_change"
          : "purchase";
      sendPlanEmail({
        type: emailType,
        plan: plan.name,
        billing,
        fromPlan: change.fromPlan || undefined,
      });

      setDone(true);
      return;
    }

    setError("Payment could not be completed. Please try again.");
    setProcessing(false);
  };

  if (done) {
    return (
      <div className="auth-card checkout-success" ref={successRef} tabIndex={-1}>
        <div className="success-check" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <circle className="sc-circle" cx="26" cy="26" r="24" />
            <path className="sc-tick" d="M14 27l8 8 16-16" />
          </svg>
        </div>
        <h1>You&apos;re all set! 🐕</h1>
        <p className="auth-sub">
          Welcome to FetchIt {plan.name}. Just one more step…
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <button
        type="button"
        className="back-link"
        onClick={() => navigate("/plans")}
      >
        ← Back
      </button>
      <h1>Complete your subscription</h1>

      <div
        className="billing-toggle co-billing"
        role="group"
        aria-label="Billing period"
      >
        <button
          type="button"
          className={`billing-option${!isAnnual ? " active" : ""}`}
          onClick={() => setBilling("monthly")}
          aria-pressed={!isAnnual}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`billing-option${isAnnual ? " active" : ""}`}
          onClick={() => setBilling("annual")}
          aria-pressed={isAnnual}
        >
          Annual
          <span className="save-badge">Save 10%</span>
        </button>
      </div>

      <div className="checkout-summary">
        <span className="cs-plan">FetchIt {plan.name}</span>
        <span className="cs-price">{priceLabel}</span>
      </div>
      <p className="co-billing-note">{billingNote}</p>

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
          />
        </div>

        <div className="auth-field">
          <label htmlFor="co-card">Card number</label>
          <div className="stripe-input" id="co-card">
            <CardNumberElement
              options={{ style: ELEMENT_STYLE, showIcon: true }}
              onChange={(e) =>
                setCardComplete((c) => ({ ...c, number: e.complete }))
              }
            />
          </div>
        </div>

        <div className="checkout-row">
          <div className="auth-field">
            <label htmlFor="co-exp">Expiry</label>
            <div className="stripe-input" id="co-exp">
              <CardExpiryElement
                options={{ style: ELEMENT_STYLE }}
                onChange={(e) =>
                  setCardComplete((c) => ({ ...c, expiry: e.complete }))
                }
              />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="co-cvv">CVC</label>
            <div className="stripe-input" id="co-cvv">
              <CardCvcElement
                options={{ style: ELEMENT_STYLE }}
                onChange={(e) =>
                  setCardComplete((c) => ({ ...c, cvc: e.complete }))
                }
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="field-error checkout-error" role="alert">
            {error}
          </p>
        )}

        <p className="stripe-note">
          <span className="stripe-lock" aria-hidden="true">
            🔒
          </span>
          Secured by Stripe
        </p>
        <p className="stripe-test-hint">
          Test mode — use card <code>4242 4242 4242 4242</code>, any future
          expiry &amp; CVC.
        </p>

        <button
          type="submit"
          className="btn btn-primary auth-btn"
          disabled={!stripe || processing}
        >
          {processing ? "Processing…" : `Start FetchIt ${plan.name}`}
        </button>

        <p className="checkout-policy">
          By subscribing you agree to our Terms of Service. No refunds. Cancel
          anytime — you keep full access until the end of your billing period.
          Your plan begins the day of purchase and renews every month or year
          depending on the billing period you selected.
        </p>
      </form>
    </div>
  );
}

function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const plan = location.state && location.state.plan;

  // No plan in nav state → back to plan selection. Free needs no payment, so it
  // jumps straight to the Delivery & Payment step.
  useEffect(() => {
    if (!plan) navigate("/plans", { replace: true });
    else if (plan.name === "Free")
      navigate("/delivery-payment", { replace: true });
  }, [plan, navigate]);

  if (!plan || plan.name === "Free") return null;

  return (
    <AuthLayout>
      <Elements stripe={stripePromise}>
        <CheckoutForm plan={plan} />
      </Elements>
    </AuthLayout>
  );
}

export default CheckoutPage;
