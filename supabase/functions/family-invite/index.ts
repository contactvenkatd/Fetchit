// Supabase Edge Function: family-invite
// ---------------------------------------------------------------------------
// The invitee side of family sharing — runs server-side (service role) because
// the invitee is a DIFFERENT user from the owner (or not logged in yet), so RLS
// (owner-scoped) can't serve them. Dispatches on `action`:
//   - validate : look up an invite by token (PUBLIC, no auth) → owner name +
//                invitee email + status, for the /join-family screen.
//   - accept   : (AUTH) create the family_members row, set the caller's plan to
//                max_family, mark the invite accepted.
//   - decline  : mark the invite declined.
//
// Deploy:  supabase functions deploy family-invite
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY injected automatically.)

import { createClient } from "npm:@supabase/supabase-js@^2";

const MAX_SLOTS = 4;

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

const ownerName = (m: Record<string, unknown>, email?: string) => {
  const name = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
  return name || email || "A FetchIt member";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action, token } = await req.json().catch(() => ({}));
    if (!token) return json({ error: "Missing invite token." }, 400);

    const { data: invite } = await admin
      .from("family_invites")
      .select("id, owner_id, invitee_email, status")
      .eq("token", token)
      .maybeSingle();
    if (!invite) return json({ error: "This invite link is invalid." }, 404);

    // Resolve the owner's display name (for all actions).
    const { data: ownerData } = await admin.auth.admin.getUserById(invite.owner_id);
    const ownerDisplay = ownerData?.user
      ? ownerName(ownerData.user.user_metadata || {}, ownerData.user.email)
      : "A FetchIt member";

    // ----- validate (public) -----
    if (action === "validate") {
      return json({
        ownerName: ownerDisplay,
        inviteeEmail: invite.invitee_email,
        status: invite.status,
        valid: invite.status === "pending",
      });
    }

    // ----- decline -----
    if (action === "decline") {
      if (invite.status === "pending") {
        await admin
          .from("family_invites")
          .update({ status: "declined" })
          .eq("id", invite.id);
      }
      return json({ ok: true });
    }

    // ----- accept (requires auth) -----
    if (action === "accept") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "Not authenticated." }, 401);
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
      if (userErr || !userData?.user) return json({ error: "Not authenticated." }, 401);
      const member = userData.user;

      if (invite.status !== "pending") {
        return json({ error: "This invite is no longer available." }, 400);
      }
      // GUARD: the owner must ALWAYS stay on "max" — never let an accept touch
      // the owner's plan. If the caller is the owner (e.g. they opened their own
      // family's invite link while signed in), reject before any plan update.
      if (member.id === invite.owner_id) {
        return json({ error: "You can't join your own family." }, 400);
      }
      // Owner must still be on Max with a free slot.
      const ownerPlan = String(
        (ownerData?.user?.user_metadata as Record<string, unknown>)?.plan || "",
      ).toLowerCase();
      if (ownerPlan !== "max") {
        return json({ error: "This family plan is no longer active." }, 400);
      }
      const { count } = await admin
        .from("family_members")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", invite.owner_id);
      if ((count || 0) >= MAX_SLOTS) {
        return json({ error: "This family is full." }, 400);
      }

      // Create the membership (idempotent-ish: skip if already a member).
      const { data: already } = await admin
        .from("family_members")
        .select("id")
        .eq("owner_id", invite.owner_id)
        .eq("member_id", member.id)
        .maybeSingle();
      if (!already) {
        const { error: memErr } = await admin.from("family_members").insert({
          owner_id: invite.owner_id,
          member_id: member.id,
          member_email: member.email,
        });
        if (memErr) return json({ error: memErr.message }, 500);
      }

      // Set the MEMBER's plan to max_family, recording the owner for display
      // ("shared by …") and management (Leave Family / lazy disband). Belt-and-
      // suspenders: only ever update a non-owner's plan (the owner stays "max").
      if (member.id !== invite.owner_id) {
        await admin.auth.admin.updateUserById(member.id, {
          user_metadata: {
            ...(member.user_metadata ?? {}),
            plan: "max_family",
            family_owner_id: invite.owner_id,
            family_owner_email: ownerData?.user?.email || null,
            family_owner_name: ownerDisplay,
            family_disband_at: null,
          },
        });
      }

      await admin
        .from("family_invites")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      return json({ ok: true, ownerName: ownerDisplay });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invite action failed.";
    return json({ error: message }, 500);
  }
});
