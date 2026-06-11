// Supabase Edge Function: reactivate-subscription
// ---------------------------------------------------------------------------
// Runs server-side (Deno) where the Stripe SECRET key is safe. Undoes a
// scheduled cancellation by clearing cancel_at_period_end on the caller's Stripe
// subscription(s). The client then removes plan_cancels_at from metadata (see
// utils.js reactivateSubscription).
//
// Deploy:   supabase functions deploy reactivate-subscription
// Secret:   reuses STRIPE_SECRET_KEY (already set for create-subscription)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Test mode only — use a test secret key (sk_test_...).

import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
  // CORS preflight.
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

    const customerId = (user.user_metadata as Record<string, unknown> | null)
      ?.stripe_customer_id as string | undefined;
    // No Stripe customer → nothing to reactivate; let the client clear metadata.
    if (!customerId) return json({ ok: true, reactivated: 0 });

    // Clear cancel_at_period_end on any subscription still set to cancel.
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    let reactivated = 0;
    for (const sub of subs.data) {
      if (!sub.cancel_at_period_end) continue;
      // Already fully canceled subscriptions can't be revived this way.
      if (sub.status === "canceled") continue;
      await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
      });
      reactivated += 1;
    }

    return json({ ok: true, reactivated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reactivation failed.";
    return json({ error: message }, 500);
  }
});
