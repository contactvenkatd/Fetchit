import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import Toast from "./Toast";
import { useAuth } from "../AuthContext";
import {
  setPendingPlan,
  finalizePlan,
  detectPlanChange,
  getPlan,
  nextBillingDate,
  cancelSubscription,
  sendPlanEmail,
} from "../utils";
import "./Pricing.css";
import "./Modal.css"; // reuse .modal / .modal-overlay for the downgrade dialog
import "./PlansPage.css";

// "July 11, 2026"
const formatDate = (d) =>
  d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

// Button label for a plan card given the detected change type + target billing.
function changeLabel(change, planName, isAnnual) {
  if (!change) return `Choose ${planName}`; // logged out
  switch (change.type) {
    case "current":
      return "Current Plan";
    case "upgrade":
      return "Upgrade";
    case "downgrade":
      return "Downgrade";
    case "billing_change":
      return isAnnual ? "Switch to annual" : "Switch to monthly";
    default: // "purchase"
      return `Choose ${planName}`;
  }
}

// Local money formatter (no Stripe import on this page). Charged amounts are the
// source of truth in stripeClient.js / the create-subscription edge function.
const money = (n) =>
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PLANS = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    blurb: "Try FetchIt's AI.",
    features: [
      "Auto checkout",
      "Full chat history",
      "Incognito mode",
      "Email order confirmations",
      "Deal alerts",
      "Hassle-free returns",
      "5 hour sessions, resets every 5 hours",
    ],
    style: "ghost",
  },
  {
    name: "Plus",
    monthly: 4.99,
    annual: 4.99,
    flat: true,
    blurb: "For everyday smart shoppers.",
    features: [
      "Everything in Free",
      "2x more usage than Free",
      "Order history & spending analytics",
      "Hassle-free returns",
      "Early access to new features",
      "Priority customer support",
      "5 hour sessions, resets every 5 hours",
    ],
    style: "primary",
  },
  {
    name: "Pro",
    monthly: 19.99,
    annual: 17.99,
    blurb: "For power shoppers.",
    features: [
      "Everything in Plus",
      "5x more usage than Free",
      "Priority AI processing",
      "Return tracking",
      "Monthly spending report",
      "Price drop notifications",
      "5 hour sessions, resets every 5 hours",
    ],
    style: "primary",
    featured: true,
    badge: "Most Popular",
  },
  {
    name: "Max",
    monthly: 99.99,
    annual: 89.99,
    blurb: "For families & power users.",
    features: [
      "Everything in Pro",
      "25x more usage than Free",
      "Up to 5 family members",
      "Dedicated support",
      "Early access to new features",
      "5 hour sessions, resets every 5 hours",
    ],
    style: "ghost",
    best: true,
    badge: "Best Value",
  },
];

function PlansPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [billing, setBilling] = useState("monthly");
  const isAnnual = billing === "annual";

  // Paid → Free downgrade confirmation.
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [downgrading, setDowngrading] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimer = useRef(null);
  const showToast = (message) => {
    setToast({ visible: true, message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      3000
    );
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // The current paid plan + its period end, for the downgrade modal/email.
  const currentPlan = session ? getPlan(session) : "Free";
  const periodEnd = session ? nextBillingDate(session) : null;
  const periodEndText = periodEnd ? formatDate(periodEnd) : null;

  // Go back through browser history; fall back to the landing page if this was
  // a direct visit (no in-app history to return to).
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const choose = async (plan, price) => {
    const loggedIn = !!session;
    const change = loggedIn ? detectPlanChange(session, plan.name, billing) : null;
    if (plan.name === "Free") {
      // Paid → Free is a downgrade: confirm here, then cancel at period end (the
      // user keeps their plan until then). The /account cancel flow does the same.
      if (change && change.type === "downgrade") {
        setDowngradeOpen(true);
        return;
      }
      if (loggedIn) {
        await finalizePlan("Free");
        navigate("/delivery-payment");
      } else {
        setPendingPlan({ name: "Free" });
        navigate("/login");
      }
      return;
    }
    // Already on this exact plan + billing → nothing to do (button is disabled).
    if (change && change.type === "current") return;
    const planObj = {
      name: plan.name,
      price,
      priceLabel: `$${money(price)}/mo`,
      billing,
    };
    if (loggedIn) {
      // Pass the detected change so CheckoutPage cancels the old sub + sends the
      // right email (it also recomputes from the session as a safety net).
      navigate("/checkout", { state: { plan: planObj, change } });
    } else {
      setPendingPlan(planObj);
      navigate("/login");
    }
  };

  const handleConfirmDowngrade = async () => {
    setDowngrading(true);
    // suppressEmail: we send a tailored "downgrade" email below instead of the
    // generic cancellation one.
    const { error, cancelsAt, canceledPlan } = await cancelSubscription({
      suppressEmail: true,
    });
    if (error) {
      setDowngrading(false);
      showToast(error.message || "Couldn't downgrade — please try again.");
      return;
    }
    const when = cancelsAt || periodEnd;
    sendPlanEmail({
      type: "downgrade",
      plan: "Free",
      fromPlan: canceledPlan || currentPlan,
      // Period end → the email's "keep access until <date>" line.
      dateISO: when ? when.toISOString() : undefined,
    });
    const whenText = when ? formatDate(when) : "the end of your billing period";
    setDowngradeOpen(false);
    showToast(`You'll move to Free on ${whenText} 🐕`);
    // Let the toast show briefly, then send them to /account.
    setTimeout(() => navigate("/account"), 1800);
  };

  return (
    <AuthLayout width="wide">
      <button type="button" className="plans-back" onClick={handleBack}>
        ← Back
      </button>
      <div className="plans-head">
        <h1>Choose your plan</h1>
        <p>You can upgrade anytime.</p>
      </div>

      <div className="billing-toggle" role="group" aria-label="Billing period">
        <button
          className={`billing-option${!isAnnual ? " active" : ""}`}
          onClick={() => setBilling("monthly")}
          aria-pressed={!isAnnual}
        >
          Monthly
        </button>
        <button
          className={`billing-option${isAnnual ? " active" : ""}`}
          onClick={() => setBilling("annual")}
          aria-pressed={isAnnual}
        >
          Annual
          <span className="save-badge">Save 10%</span>
        </button>
      </div>

      <div className="pricing pricing-4">
        {PLANS.map((plan) => {
          const price = isAnnual ? plan.annual : plan.monthly;
          const priceText = price === 0 ? "$0" : `$${money(price)}`;
          const note = plan.flat
            ? "Flat rate, no commitment"
            : isAnnual && price > 0
            ? "billed annually"
            : " ";
          // Classify this card vs the user's current plan/billing (null = logged
          // out). Drives the label, the "Current Plan" badge, and the disabled
          // state. Billing-aware: same plan + different toggle → a switch, not
          // "current".
          const change = session
            ? detectPlanChange(session, plan.name, billing)
            : null;
          const isCurrent = !!change && change.type === "current";
          const btnLabel = changeLabel(change, plan.name, isAnnual);
          return (
            <div
              className={`plan${plan.featured ? " featured" : ""}${
                plan.best ? " best" : ""
              }${isCurrent ? " is-current" : ""}`}
              key={plan.name}
            >
              {isCurrent ? (
                <span className="plan-tag plan-tag-current">Current Plan</span>
              ) : (
                plan.badge && (
                  <span
                    className={`plan-tag${plan.best ? " plan-tag-best" : ""}`}
                  >
                    {plan.badge}
                  </span>
                )
              )}
              <h3>{plan.name}</h3>
              <div className="price">
                {priceText}
                <span>/mo</span>
              </div>
              <p className="plan-billing-note">{note}</p>
              <p className="plan-blurb">{plan.blurb}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                className={`btn btn-${plan.style}`}
                onClick={() => choose(plan, price)}
                disabled={isCurrent}
              >
                {btnLabel}
              </button>
              {plan.name !== "Free" && (
                <p className="plan-policy">
                  No refunds · Cancel anytime · Access until period ends
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Paid → Free downgrade confirmation. */}
      {downgradeOpen && (
        <div
          className="modal-overlay downgrade-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !downgrading) {
              setDowngradeOpen(false);
            }
          }}
        >
          <div
            className="modal downgrade-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dg-title"
          >
            <h2 id="dg-title">Downgrade to Free?</h2>
            <p className="modal-sub">
              You&apos;ll lose access to your FetchIt {currentPlan} features at
              the end of your billing period
              {periodEndText ? (
                <>
                  {" "}
                  (<strong>{periodEndText}</strong>)
                </>
              ) : null}
              . No refund will be issued.
            </p>
            <div className="downgrade-actions">
              <button
                type="button"
                className="btn dg-keep-btn"
                onClick={() => setDowngradeOpen(false)}
                disabled={downgrading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn dg-confirm-btn"
                onClick={handleConfirmDowngrade}
                disabled={downgrading}
              >
                {downgrading ? "Processing…" : "Downgrade to Free"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast visible={toast.visible} message={toast.message} />
    </AuthLayout>
  );
}

export default PlansPage;
