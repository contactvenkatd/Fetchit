import { useState } from "react";
import "./Pricing.css";

// Local money formatter — kept here (not imported from stripeClient) so the
// landing page never pulls Stripe.js into its bundle. The amounts below are the
// marketing display; the charged amounts live in stripeClient.js / the edge fn.
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
    cta: "Get Started",
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
    cta: "Try Plus",
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
    cta: "Go Pro",
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
    cta: "Get Max",
    style: "ghost",
    best: true,
    badge: "Best Value",
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
          <p>Start free. Upgrade when FetchIt becomes your best friend.</p>
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
            return (
              <div
                className={`plan${plan.featured ? " featured" : ""}${
                  plan.best ? " best" : ""
                }`}
                key={plan.name}
              >
                {plan.badge && (
                  <span
                    className={`plan-tag${plan.best ? " plan-tag-best" : ""}`}
                  >
                    {plan.badge}
                  </span>
                )}
                <h3>{plan.name}</h3>
                <div className="price">
                  {priceText}
                  <span>/mo</span>
                </div>
                <p className="plan-billing-note">{note}</p>
                <p className="plan-blurb">{plan.blurb}</p>
                <p className="plan-retailers">
                  🛍️ Shop across a multitude of retailers
                </p>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  className={`btn btn-${plan.style}`}
                  onClick={() =>
                    onSelect({
                      name: plan.name,
                      priceLabel: `${priceText}/mo`,
                      billing,
                    })
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
