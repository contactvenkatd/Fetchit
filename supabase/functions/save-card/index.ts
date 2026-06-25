// Supabase Edge Function: save-card
// ---------------------------------------------------------------------------
// Runs server-side (Deno) with the Stripe SECRET key. Called right after the
// browser confirms a SetupIntent (confirmCardSetup) — it takes the resulting
// payment_method id and:
//   1. Authenticates the caller from their Supabase JWT.
//   2. Attaches the PM to the caller's Stripe customer (idempotent) and makes it
//      the customer's default payment method for future off-session charges.
//   3. Returns the NON-sensitive card metadata (brand, last4, expiry) so the
//      client can show "Visa •••• 4242 · 08/27" and persist it to `profiles`.
//
// Deploy:   supabase functions deploy save-card
// Secret:   reuses STRIPE_SECRET_KEY (shared with the other Stripe functions).
//
// Test mode only — no real charges.

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

    const { paymentMethodId } = await req.json().catch(() => ({}));
    if (!paymentMethodId) {
      return json({ error: "Missing payment method." }, 400);
    }

    const customerId = (user.user_metadata as Record<string, unknown> | null)
      ?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return json({ error: "No Stripe customer on file." }, 400);
    }

    // Attach (idempotent — confirmCardSetup already attaches it for the customer)
    // then make it the default for future invoices / off-session charges.
    await stripe.paymentMethods
      .attach(paymentMethodId, { customer: customerId })
      .catch((e: unknown) => {
        // Ignore "already attached"; rethrow anything else.
        const msg = e instanceof Error ? e.message : "";
        if (!/already been attached/i.test(msg)) throw e;
      });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const card = pm.card
      ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        }
      : null;

    return json({ ok: true, card });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save card.";
    return json({ error: message }, 500);
  }
});
