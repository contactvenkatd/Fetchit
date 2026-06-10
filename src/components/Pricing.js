import { useState } from "react";
import "./Pricing.css";

const PLANS = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    blurb: "Try Fetchit's AI.",
    features: ["3 AI chats/month", "Manual checkout"],
    cta: "Get Started",
    style: "ghost",
  },
  {
    name: "Plus",
    monthly: 9,
    annual: 7,
    blurb: "For everyday smart shoppers.",
    features: ["Unlimited chats", "Auto checkout", "Deal alerts"],
    cta: "Try Plus Free",
    style: "primary",
    featured: true,
  },
  {
    name: "Pro",
    monthly: 19,
    annual: 15,
    blurb: "For power shoppers & families.",
    features: [
      "Everything in Plus",
      "Priority AI",
      "Family members",
      "Return tracking",
    ],
    cta: "Go Pro",
    style: "ghost",
  },
];

function Pricing({ onSelect }) {
  const [billing, setBilling] = useState("monthly");
  const isAnnual = billing === "annual";

  return (
    <section className="block" id="pricing">
      <div className="container">
        <div className="section-head">
          <h2>Simple, Friendly Pricing</h2>
          <p>Start free. Upgrade when Fetchit becomes your best friend.</p>
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
                  {isAnnual && price > 0 ? "billed annually" : " "}
                </p>
                <p className="plan-blurb">{plan.blurb}</p>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  className={`btn btn-${plan.style}`}
                  onClick={() =>
                    onSelect({ name: plan.name, priceLabel: `$${price}/mo` })
                  }
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
