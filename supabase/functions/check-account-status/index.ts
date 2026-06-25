// Supabase Edge Function: check-account-status
// ---------------------------------------------------------------------------
// Tells the app whether the caller still exists in auth.users. When an admin
// deletes a user from the Supabase dashboard, that user's JWT stays
// cryptographically valid for up to ~1 hour, so PostgREST/RLS keeps honoring it
// and they appear logged in. This function checks the user against auth.users
// with the SERVICE ROLE (which sees deletions immediately) and returns
//   { active: true }   — the user still exists, or
//   { active: false }  — the user is gone (deleted) → the client logs them out.
//
// Deploy:   supabase functions deploy check-account-status
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically — no
//  extra secrets needed.)

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

// Pull the `sub` (user id) claim out of a JWT without verifying the signature —
// we only use it as a lookup key; existence is then confirmed with the service
// role, so a forged sub can't reveal or change anything.
function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const norm = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Primary check: validate the JWT and fetch the user. For a deleted user the
    // token is still un-expired but the user row is gone, so this errors.
    const { data: byToken, error: tokenErr } = await admin.auth.getUser(token);
    if (!tokenErr && byToken?.user) return json({ active: true });

    // Secondary confirm by id (covers edge cases where token validation behaves
    // differently): look the user up directly in auth.users.
    const sub = decodeJwtSub(token);
    if (sub) {
      const { data: byId, error: idErr } = await admin.auth.admin.getUserById(
        sub,
      );
      if (!idErr && byId?.user) return json({ active: true });
    }

    // No valid user behind this token → the account no longer exists.
    return json({ active: false });
  } catch (_err) {
    // Unexpected/transient failure → fail OPEN (active) so a glitch in this
    // function never locks legitimate users out. The deleted-user path above
    // returns a definitive { active: false }; only genuine errors land here.
    return json({ active: true });
  }
});
