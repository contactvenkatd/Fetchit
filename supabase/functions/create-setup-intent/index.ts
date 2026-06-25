// Supabase Edge Function: create-setup-intent
// ---------------------------------------------------------------------------
// Runs server-side (Deno) where the Stripe SECRET key is safe. Saves a card for
// future off-session charges WITHOUT charging now (used by the Delivery &
// Payment onboarding step and the Cards & Address "update card" flow). It:
//   1. Authenticates the caller from their Supabase JWT.
//   2. Reuses (or creates + persists) that user's Stripe customer — the SAME
//      stripe_customer_id used by create-subscription, so there's one customer.
//   3. Creates a SetupIntent for that customer and returns its client secret so
//      the browser can confirm the card with Stripe Elements (confirmCardSetup).
//
// Deploy:   supabase functions deploy create-setup-intent
// Secret:   supabase secrets set STRIPE_SECRET_KEY=sk_test_...   (shared key)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Test mode only — use a test secret key (sk_test_...); no real charges.

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:3000",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe is not configured." }, 500);
    const stripe = new Stripe(stripeKey);

    // ----- Authenticate the caller from their JWT -----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Not authenticated." }, 401);
    }
    const user = userData.user;

    // ----- Reuse or create the Stripe customer (shared with subscriptions) ----
    let customerId = (user.user_metadata as Record<string, unknown> | null)
      ?.stripe_customer_id as string | undefined;

    if (customerId) {
      const existing = await stripe.customers
        .retrieve(customerId)
        .catch(() => null);
      if (!existing || (existing as Stripe.DeletedCustomer).deleted) {
        customerId = undefined;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_uid: user.id },
      });
      customerId = customer.id;
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          stripe_customer_id: customerId,
        },
      });
    }

    // ----- Create the SetupIntent (off-session future charges) -----
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      metadata: { supabase_uid: user.id },
    });

    return json({ clientSecret: setupIntent.client_secret, customerId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup failed.";
    return json({ error: message }, 500);
  }
});
