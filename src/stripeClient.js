// Shared Stripe client (frontend, publishable key only — safe to ship).
//
// IMPORTANT: only the *publishable* key lives here. Creating customers and
// subscriptions requires the *secret* key, which never touches frontend code —
// that work happens in the Supabase Edge Function `supabase/functions/
// create-subscription` (see utils.js `createSubscription`). The frontend's job
// is limited to securely collecting the card via Stripe Elements and confirming
// the PaymentIntent the function returns.
import { loadStripe } from "@stripe/stripe-js";

// Stripe test-mode publishable key. Test mode only — no real charges.
export const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51Th9ugHqjZ0DYGoFydiFTMk58JXPCXzCcJxpdj0dFWC11vdv4sTiFuE5JPwu74G4jc8wQThpG8f7jL3AtDfVv89A00LkDZYfo2";

// loadStripe returns a promise; create it once at module load so <Elements>
// always gets the same instance.
export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// ---------------------------------------------------------------------------
// Stripe "products" — the four paid tiers and what each costs. This is the
// authoritative price map for what we charge; the create-subscription edge
// function keeps an IDENTICAL cents/interval table and the two MUST stay in
// sync (the price shown is the price billed). We use inline price_data on the
// subscription rather than pre-created dashboard Price IDs, so the plan name +
// billing period below fully determine the charge.
//
//   Plus — $4.99 flat (same monthly OR annual; billed monthly, no commitment)
//   Pro  — $19.99/mo  or  $17.99/mo billed annually ($215.88/year)
//   Max  — $99.99/mo  or  $89.99/mo billed annually ($1,079.88/year), 5 members
//
// Each entry: { cents, interval, perMonth } per billing period. `perMonth` is
// the per-month sticker price for display; `cents`/`interval` are what Stripe
// actually charges (a year-interval cents amount is the full annual total).
export const PLAN_PRICING = {
  Plus: {
    monthly: { cents: 499, interval: "month", perMonth: 4.99 },
    annual: { cents: 499, interval: "month", perMonth: 4.99 },
    flat: true, // never an annual commitment — always month-to-month $4.99
  },
  Pro: {
    monthly: { cents: 1999, interval: "month", perMonth: 19.99 },
    annual: { cents: 21588, interval: "year", perMonth: 17.99 },
  },
  Max: {
    monthly: { cents: 9999, interval: "month", perMonth: 99.99 },
    annual: { cents: 107988, interval: "year", perMonth: 89.99 },
    family: 5, // Max includes up to 5 family members
  },
};

const billingKey = (billing) => (billing === "annual" ? "annual" : "monthly");

// "1,079.88" / "17.99" / "4.99" — 2-decimal USD with thousands separators.
export function money(n) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Per-month sticker price (number) for a paid plan + billing period.
export function monthlyDisplay(planName, billing) {
  const p = PLAN_PRICING[planName];
  return p ? p[billingKey(billing)].perMonth : 0;
}

// Full amount charged today, in dollars: the year total for annual plans, or
// the monthly price for monthly/flat plans.
export function annualTotal(planName) {
  const p = PLAN_PRICING[planName];
  if (!p) return 0;
  return p.annual.cents / 100;
}

// True for plans with no annual commitment (Plus) — show "Flat rate".
export function isFlatPlan(planName) {
  return !!(PLAN_PRICING[planName] && PLAN_PRICING[planName].flat);
}

// Family-member allowance for a plan (Max → 5, others → 0).
export function familyMembers(planName) {
  const p = PLAN_PRICING[planName];
  return (p && p.family) || 0;
}
