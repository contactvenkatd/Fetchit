// Supabase Edge Function: send-family-invite
// ---------------------------------------------------------------------------
// A Max-plan OWNER invites someone to their family. Runs server-side (service
// role) so it can: verify the caller is really on Max, enforce the 4-slot cap,
// mint a secure token, insert the family_invites row, and email the invitee an
// "Accept Invitation" link — all things the browser/RLS can't do safely.
//
// Deploy:   supabase functions deploy send-family-invite
// Secrets:  RESEND_API_KEY (shared with send-email). SUPABASE_URL +
//           SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@^2";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "FetchIt 🐕 <onboarding@resend.dev>";
const MAX_SLOTS = 4;

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

const ownerName = (user: { user_metadata?: Record<string, unknown>; email?: string }) => {
  const m = user.user_metadata || {};
  const name = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
  return name || user.email || "A FetchIt member";
};

function inviteEmailHtml(owner: string, link: string, origin: string): string {
  const header = origin
    ? `<img src="${origin}/fetchit-logo.png" alt="FetchIt" width="46" height="46" style="border-radius:12px;display:inline-block;vertical-align:middle;" />`
    : `<span style="display:inline-block;background:#FFD700;border-radius:14px;padding:8px 12px;font-size:22px;line-height:1;">🐕</span>
       <span style="color:#FFFFFF;font-family:'Baloo 2',Arial,sans-serif;font-weight:800;font-size:22px;vertical-align:middle;margin-left:10px;">FetchIt</span>`;
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#FFFDF7;padding:32px 0;font-family:'Nunito',Arial,sans-serif;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px rgba(26,26,26,0.12);">
        <tr><td style="background:#1A1A1A;padding:24px 32px;">
          ${header}
        </td></tr>
        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;font-size:26px;font-weight:800;">You're invited! 🐕</h1>
          <p style="margin:0 0 16px;color:#555;font-size:16px;line-height:1.6;"><strong>${owner}</strong> invited you to join their <strong>FetchIt Max</strong> family plan.</p>
          <ul style="margin:0 0 20px;padding-left:20px;color:#555;font-size:16px;line-height:1.7;">
            <li>Full <strong>Pro-level</strong> AI shopping assistant access</li>
            <li><strong>No payment needed</strong> — it's covered by the plan owner</li>
            <li>Your own chats, orders, and shipping address</li>
          </ul>
          <a href="${link}" style="display:inline-block;background:#FFD700;color:#1A1A1A;text-decoration:none;font-family:'Baloo 2',Arial,sans-serif;font-weight:800;font-size:18px;padding:15px 36px;border-radius:999px;margin-top:4px;">Accept Invitation</a>
          <p style="margin:24px 0 0;color:#999;font-size:13px;line-height:1.6;">If you weren't expecting this, you can ignore this email.</p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;border-top:1px solid #F0ECDF;">
          <p style="margin:0;color:#999;font-size:13px;">FetchIt — your shopping best friend 🐕</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email is not configured (RESEND_API_KEY missing)." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Not authenticated." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Not authenticated." }, 401);
    const owner = userData.user;

    // Only a real Max subscriber (not a family member) can invite.
    const plan = String((owner.user_metadata as Record<string, unknown>)?.plan || "").toLowerCase();
    if (plan !== "max") {
      return json({ error: "Family sharing is available on the Max plan." }, 403);
    }

    const { email, appOrigin = "" } = await req.json().catch(() => ({}));
    const invitee = String(email || "").trim().toLowerCase();
    if (!invitee || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitee)) {
      return json({ error: "Please enter a valid email address." }, 400);
    }
    if (invitee === String(owner.email || "").toLowerCase()) {
      return json({ error: "You can't invite yourself." }, 400);
    }

    // Enforce the 4-slot cap + no duplicate active invite for the same email.
    const { data: existing } = await admin
      .from("family_invites")
      .select("id, invitee_email, status")
      .eq("owner_id", owner.id)
      .neq("status", "declined");
    const active = existing || [];
    if (active.length >= MAX_SLOTS) {
      return json({ error: "All 4 family slots are full." }, 400);
    }
    if (active.some((r) => String(r.invitee_email).toLowerCase() === invitee)) {
      return json({ error: "That email already has an invite." }, 400);
    }

    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const { data: inserted, error: insErr } = await admin
      .from("family_invites")
      .insert({ owner_id: owner.id, invitee_email: invitee, token, status: "pending" })
      .select("id, invitee_email, status")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    const link = `${appOrigin}/join-family?token=${token}`;
    const name = ownerName(owner);
    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: invitee,
        subject: `${name} invited you to their FetchIt Max family`,
        html: inviteEmailHtml(name, link, appOrigin),
      }),
    });
    const result = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      // Email failed — roll back the invite so the slot isn't stuck.
      await admin.from("family_invites").delete().eq("id", inserted.id);
      const message = result?.message || result?.error || `Resend error ${resendRes.status}`;
      return json({ error: message }, 502);
    }

    return json({ ok: true, invite: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invite failed.";
    return json({ error: message }, 500);
  }
});
