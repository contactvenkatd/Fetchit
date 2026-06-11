import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import { setPendingPlan, finalizePlan } from "../utils";
import "./Pricing.css";
import "./PlansPage.css";

const PLANS = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    blurb: "Try Fetchit's AI.",
    features: ["3 AI chats/month", "Manual checkout"],
    style: "ghost",
  },
  {
    name: "Plus",
    monthly: 9,
    annual: 7,
    blurb: "For everyday smart shoppers.",
    features: ["Unlimited chats", "Auto checkout", "Deal alerts"],
    style: "primary",
    featured: true,
  },
  {
    name: "Pro",
    monthly: 19,
    annual: 15,
    blurb: "For power shoppers & families.",
    features: ["Everything in Plus", "Priority AI", "Family members", "Return tracking"],
    style: "ghost",
  },
];

function PlansPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [billing, setBilling] = useState("monthly");
  const isAnnual = billing === "annual";

  // Go back through browser history; fall back to the landing page if this was
  // a direct visit (no in-app history to return to).
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const choose = async (plan, price) => {
    const loggedIn = !!session;
    if (plan.name === "Free") {
      if (loggedIn) {
        await finalizePlan("Free");
        navigate("/onboarding");
      } else {
        setPendingPlan({ name: "Free" });
        navigate("/login");
      }
      return;
    }
    const planObj = {
      name: plan.name,
      price,
      priceLabel: `$${price}/mo`,
      billing,
    };
    if (loggedIn) {
      navigate("/checkout", { state: { plan: planObj } });
    } else {
      setPendingPlan(planObj);
      navigate("/login");
    }
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
          <span className="save-badge">Save 20%</span>
        </button>
      </div>

      <div className="pricing">
        {PLANS.map((plan) => {
          const price = isAnnual ? plan.annual : plan.monthly;
          return (
            <div
              className={`plan${plan.featured ? " featured" : ""}`}
              key={plan.name}
            >
              {plan.featured && <span className="plan-tag">Most Popular</span>}
              <h3>{plan.name}</h3>
              <div className="price">
                ${price}
                <span>/mo</span>
              </div>
              <p className="plan-billing-note">
                {isAnnual && price > 0 ? "billed annually" : " "}
              </p>
              <p className="plan-blurb">{plan.blurb}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                className={`btn btn-${plan.style}`}
                onClick={() => choose(plan, price)}
              >
                Choose {plan.name}
              </button>
            </div>
          );
        })}
      </div>
    </AuthLayout>
  );
}

export default PlansPage;
