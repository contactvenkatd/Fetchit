// Supabase Edge Function: family-manage
// ---------------------------------------------------------------------------
// Family management — needs the service role to read/write OTHER users' plans
// (which RLS / the browser can't). Dispatches on `action`:
//   OWNER actions (caller = owner):
//     - remove    : remove ONE slot. Pending invite → revoked; accepted member →
//                   downgraded to Free, membership removed, emailed.
//     - disband   : remove ALL members + invites IMMEDIATELY (downgrade + email).
//                   Used on a plan change off Max.
//     - schedule  : the owner cancelled Max — members KEEP access until the
//                   period end (`disbandAt`). Stamp each member's metadata
//                   (family_disband_at) + family_members.pending_disband_at, and
//                   email them that access ends on that date. getPlan() enforces
//                   the cutoff client-side; the member is finalized lazily.
//     - unschedule: owner reactivated Max — clear the scheduled disband.
//   MEMBER action (caller = member):
//     - leave     : remove the caller's own membership + set their plan to Free.
//                   Used by "Leave Family" and the lazy post-disband finalize.
//
// Deploy:  supabase functions deploy family-manage
// Secret:  RESEND_API_KEY (shared). SUPABASE_URL + SERVICE_ROLE_KEY auto-injected.

import { createClient } from "npm:@supabase/supabase-js@^2";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "FetchIt 🐕 <onboarding@resend.dev>";

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

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// FetchIt logo image header when the app origin is known, else emoji+wordmark.
let LOGO_ORIGIN = "";
function logoHeader(): string {
  if (LOGO_ORIGIN) {
    return `<img src="${LOGO_ORIGIN}/fetchit-logo.png" alt="FetchIt" width="46" height="46" style="border-radius:12px;display:inline-block;vertical-align:middle;" />`;
  }
  return `<span style="display:inline-block;background:#FFD700;border-radius:14px;padding:8px 12px;font-size:22px;line-height:1;">🐕</span>
          <span style="color:#FFFFFF;font-family:'Baloo 2',Arial,sans-serif;font-weight:800;font-size:22px;vertical-align:middle;margin-left:10px;">FetchIt</span>`;
}

function shell(title: string, bodyP: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#FFFDF7;padding:32px 0;font-family:'Nunito',Arial,sans-serif;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px rgba(26,26,26,0.12);">
        <tr><td style="background:#1A1A1A;padding:24px 32px;">
          ${logoHeader()}
        </td></tr>
        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;font-size:26px;font-weight:800;">${title}</h1>
          ${bodyP}
          <p style="margin:24px 0 0;color:#999;font-size:13px;">FetchIt — your shopping best friend 🐕</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}
const para = (t: string) =>
  `<p style="margin:0 0 16px;color:#555;font-size:16px;line-height:1.6;">${t}</p>`;

const endedHtml = (owner: string) =>
  shell(
    "Your family access has ended 🐕",
    para(`Your access to <strong>${owner}</strong>'s FetchIt Max family plan has ended, so your account has been moved to the <strong>Free</strong> plan.`) +
      para("Your chats and orders are safe. Want to keep Max-level usage? You can subscribe any time."),
  );
const endingHtml = (owner: string, date: string) =>
  shell(
    "Your family access is ending 🐕",
    para(`<strong>${owner}</strong> has cancelled their FetchIt Max plan, so your family access will end on <strong>${date}</strong>.`) +
      para(`You'll keep full Max-level access until then. After that your account moves to the <strong>Free</strong> plan — your chats and orders stay safe.`),
  );

type Admin = ReturnType<typeof createClient>;

async function setMemberPlan(
  admin: Admin,
  memberId: string,
  patch: Record<string, unknown>,
) {
  const { data: mu } = await admin.auth.admin.getUserById(memberId);
  const meta = (mu?.user?.user_metadata as Record<string, unknown>) || {};
  await admin.auth.admin.updateUserById(memberId, {
    user_metadata: { ...meta, ...patch },
  });
  return { meta, email: mu?.user?.email as string | undefined };
}

async function sendMail(apiKey: string | undefined, to: string | undefined, subject: string, html: string) {
  if (!apiKey || !to) return;
  await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch(() => {});
}

// Downgrade a member to Free now (only if still a family member), email them.
// GUARD: never touch the OWNER — if memberId is the owner, skip entirely. The
// owner always stays on "max" regardless of family activity.
async function downgradeNow(
  admin: Admin,
  apiKey: string | undefined,
  ownerId: string,
  memberId: string,
  memberEmail: string | null,
  ownerName: string,
) {
  if (memberId === ownerId) return; // owner is never downgraded
  const { data: mu } = await admin.auth.admin.getUserById(memberId);
  const meta = (mu?.user?.user_metadata as Record<string, unknown>) || {};
  // Only ever downgrade an actual family member (never a real Max/paid plan).
  if (String(meta.plan || "").toLowerCase() === "max_family") {
    await admin.auth.admin.updateUserById(memberId, {
      user_metadata: { ...meta, plan: "Free", family_owner_id: null, family_owner_email: null, family_owner_name: null, family_disband_at: null },
    });
  }
  await sendMail(apiKey, memberEmail || mu?.user?.email, "Your FetchIt Max family access has ended", endedHtml(ownerName));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Not authenticated." }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Not authenticated." }, 401);
    const caller = userData.user;
    const cm = (caller.user_metadata as Record<string, unknown>) || {};
    const ownerDisplay =
      [cm.first_name, cm.last_name].filter(Boolean).join(" ").trim() ||
      caller.email ||
      "the plan owner";

    const { action, inviteId, disbandAt, appOrigin = "" } = await req.json().catch(() => ({}));
    LOGO_ORIGIN = appOrigin || ""; // email header renders the logo image when set

    // ---- MEMBER: leave the family ----
    // Only ever affects the caller, and only when they're a max_family member —
    // so an owner (plan "max") who somehow hits this keeps their plan untouched.
    if (action === "leave") {
      if (String(cm.plan || "").toLowerCase() !== "max_family") {
        return json({ ok: true }); // not a family member → nothing to do
      }
      // Free the owner's slot too: delete the membership AND the matching invite
      // row (the owner's Family Sharing slots are derived from family_invites, so
      // an orphaned 'accepted' invite would keep the slot looking filled).
      const { data: memRows } = await admin
        .from("family_members")
        .select("owner_id, member_email")
        .eq("member_id", caller.id);
      for (const m of memRows || []) {
        const inviteEmail = String(m.member_email || caller.email || "").toLowerCase();
        if (m.owner_id && inviteEmail) {
          await admin
            .from("family_invites")
            .delete()
            .eq("owner_id", m.owner_id)
            .eq("invitee_email", inviteEmail);
        }
      }
      await admin.from("family_members").delete().eq("member_id", caller.id);
      await admin.auth.admin.updateUserById(caller.id, {
        user_metadata: { ...cm, plan: "Free", family_owner_id: null, family_owner_email: null, family_owner_name: null, family_disband_at: null },
      });
      return json({ ok: true });
    }

    // ---- OWNER actions below (caller = owner) ----
    if (action === "remove") {
      if (!inviteId) return json({ error: "Missing slot id." }, 400);
      const { data: invite } = await admin
        .from("family_invites")
        .select("id, invitee_email, status")
        .eq("id", inviteId)
        .eq("owner_id", caller.id)
        .maybeSingle();
      if (!invite) return json({ error: "Slot not found." }, 404);
      if (invite.status === "accepted") {
        const { data: mem } = await admin
          .from("family_members")
          .select("id, member_id, member_email")
          .eq("owner_id", caller.id)
          .eq("member_email", invite.invitee_email)
          .maybeSingle();
        if (mem) {
          await downgradeNow(admin, apiKey, caller.id, mem.member_id, mem.member_email, ownerDisplay);
          await admin.from("family_members").delete().eq("id", mem.id);
        }
      }
      await admin.from("family_invites").delete().eq("id", invite.id);
      return json({ ok: true });
    }

    if (action === "disband") {
      const { data: members } = await admin
        .from("family_members")
        .select("id, member_id, member_email")
        .eq("owner_id", caller.id);
      for (const mem of members || []) {
        await downgradeNow(admin, apiKey, caller.id, mem.member_id, mem.member_email, ownerDisplay);
      }
      await admin.from("family_members").delete().eq("owner_id", caller.id);
      await admin.from("family_invites").delete().eq("owner_id", caller.id);
      return json({ ok: true, removed: (members || []).length });
    }

    if (action === "schedule") {
      const when = disbandAt ? new Date(disbandAt) : null;
      const whenISO = when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
      const dateText = when && !Number.isNaN(when.getTime())
        ? fmtDate(when)
        : "the end of the billing period";
      const { data: members } = await admin
        .from("family_members")
        .select("id, member_id, member_email")
        .eq("owner_id", caller.id);
      for (const mem of members || []) {
        const { email } = await setMemberPlan(admin, mem.member_id, {
          family_disband_at: whenISO,
        });
        await admin
          .from("family_members")
          .update({ pending_disband_at: whenISO })
          .eq("id", mem.id);
        await sendMail(apiKey, mem.member_email || email, "Your FetchIt Max family access is ending", endingHtml(ownerDisplay, dateText));
      }
      return json({ ok: true, scheduled: (members || []).length });
    }

    if (action === "unschedule") {
      const { data: members } = await admin
        .from("family_members")
        .select("id, member_id")
        .eq("owner_id", caller.id);
      for (const mem of members || []) {
        await setMemberPlan(admin, mem.member_id, { family_disband_at: null });
        await admin
          .from("family_members")
          .update({ pending_disband_at: null })
          .eq("id", mem.id);
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Family management failed.";
    return json({ error: message }, 500);
  }
});
