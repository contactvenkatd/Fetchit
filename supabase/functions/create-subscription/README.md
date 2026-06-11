# create-subscription (Supabase Edge Function)

Holds the Stripe **secret** key and creates the customer + subscription for
`/checkout`. The browser only collects/confirms the card (publishable key in
`src/stripeClient.js`).

## One-time setup

```bash
# 1. Link the project (if not already linked)
supabase link --project-ref fpphpncruohjlppqhfep

# 2. Give the function your Stripe TEST secret key
supabase secrets set STRIPE_SECRET_KEY=sk_test_...

# 3. Deploy
supabase functions deploy create-subscription
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
**not** set them yourself.

## What it does

1. Authenticates the caller from their Supabase JWT.
2. Reuses or creates the user's Stripe customer, storing `stripe_customer_id` in
   `user_metadata` (no duplicate customers for returning users).
3. Creates an incomplete subscription (inline `price_data`, so no dashboard
   Price IDs needed) and returns `{ clientSecret, subscriptionId, customerId }`.

Keep the cents amounts in `PLAN_PRICING` identical to `src/stripeClient.js`.

Test mode only — use `sk_test_...` and card `4242 4242 4242 4242`.
