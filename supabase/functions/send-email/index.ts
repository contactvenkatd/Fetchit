// Supabase Edge Function: send-email
// ---------------------------------------------------------------------------
// Sends branded transactional emails via the Resend API for plan lifecycle
// events (purchase/upgrade, cancellation, reactivation, downgrade,
// billing_change) AND account-deletion confirmation. Runs server-side (Deno) so
// the API key never touches the browser. Recipient is always the authenticated
// caller's own email (from their JWT); the client only sends
// { type, plan, billing, dateISO, appOrigin, fromPlan, token }.
//
// Deploy:   supabase functions deploy send-email
// Secret:   supabase secrets set RESEND_API_KEY=re_...
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// NOTE: Resend requires a verified domain. Until you verify one, FROM uses
// Resend's shared test sender onboarding@resend.dev (delivers only to the email
// on your Resend account). Swap FROM to your verified domain for production.

import { createClient } from "npm:@supabase/supabase-js@^2";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "FetchIt 🐕 <onboarding@resend.dev>";

const PRICING: Record<string, { monthly: number; annual: number; flat?: boolean }> = {
  Plus: { monthly: 4.99, annual: 4.99, flat: true },
  Pro: { monthly: 19.99, annual: 17.99 },
  Max: { monthly: 99.99, annual: 89.99 },
};
const USAGE: Record<string, string> = { Plus: "2x", Pro: "5x", Max: "25x" };

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

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// The branded header — the FetchIt logo image when we know the app origin (an
// absolute URL email clients can load), else the emoji-tile + wordmark fallback.
let LOGO_ORIGIN = "";
function logoHeader(): string {
  if (LOGO_ORIGIN) {
    return `<img src="${LOGO_ORIGIN}/fetchit-logo.png" alt="FetchIt"
                 width="46" height="46"
                 style="border-radius:12px;display:inline-block;vertical-align:middle;" />`;
  }
  return `<span style="display:inline-block;background:#FFD700;border-radius:14px;
                       padding:8px 12px;font-size:22px;line-height:1;">🐕</span>
          <span style="color:#FFFFFF;font-family:'Baloo 2',Arial,sans-serif;
                       font-weight:800;font-size:22px;vertical-align:middle;
                       margin-left:10px;">FetchIt</span>`;
}

// Branded yellow/charcoal shell around the body HTML.
function wrap(innerHtml: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#FFFDF7;padding:32px 0;font-family:'Nunito',Arial,sans-serif;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#FFFFFF;border-radius:24px;overflow:hidden;
                    box-shadow:0 20px 50px rgba(26,26,26,0.12);">
        <tr><td style="background:#1A1A1A;padding:24px 32px;">
          ${logoHeader()}
        </td></tr>
        <tr><td style="padding:36px 32px 8px;">${innerHtml}</td></tr>
        <tr><td style="padding:24px 32px 32px;border-top:1px solid #F0ECDF;">
          <p style="margin:0;color:#999999;font-size:13px;">
            FetchIt — your shopping best friend 🐕
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

const h1 = (t: string) =>
  `<h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;font-size:26px;font-weight:800;">${t}</h1>`;
const p = (t: string) =>
  `<p style="margin:0 0 16px;color:#555555;font-size:16px;line-height:1.6;">${t}</p>`;
const detail = (label: string, value: string) =>
  `<tr><td style="padding:6px 0;color:#999;font-size:14px;font-weight:700;">${label}</td>
       <td style="padding:6px 0;color:#1A1A1A;font-size:14px;font-weight:700;text-align:right;">${value}</td></tr>`;
const button = (href: string, text: string) =>
  `<a href="${href}" style="display:inline-block;background:#FF6B35;color:#FFFFFF;
     text-decoration:none;font-family:'Baloo 2',Arial,sans-serif;font-weight:700;
     font-size:17px;padding:14px 32px;border-radius:999px;margin-top:8px;">${text}</a>`;

// Build { subject, html } for a given event.
function buildEmail(opts: {
  type: string;
  plan: string;
  billing: string;
  dateISO?: string | null;
  appOrigin?: string;
  fromPlan?: string | null;
  token?: string | null;
}): { subject: string; html: string } {
  const { type, plan, billing, dateISO, appOrigin, fromPlan, token } = opts;

  // Account-deletion confirmation — scary red template with a token link back to
  // the app. Its own template (not Supabase's Magic Link, which login OTP owns).
  if (type === "deletion_confirm") {
    const link = `${appOrigin || ""}/account?type=deletion&token=${token || ""}`;
    return {
      subject: "Confirm your FetchIt account deletion",
      html: wrap(
        h1("Confirm account deletion 🐕") +
          p("We received a request to delete your FetchIt account. Click below to proceed. If you didn't request this, you can safely ignore this email — your account is safe.") +
          `<a href="${link}" style="display:inline-block;background:#E5484D;color:#FFFFFF;
             text-decoration:none;font-family:'Baloo 2',Arial,sans-serif;font-weight:700;
             font-size:17px;padding:14px 32px;border-radius:999px;margin-top:8px;">Proceed with deletion</a>` +
          `<p style="margin:24px 0 0;color:#B3261E;font-size:14px;font-weight:700;">⚠️ This action cannot be undone.</p>` +
          `<p style="margin:12px 0 0;color:#999999;font-size:13px;">This link expires in 1 hour.</p>`,
      ),
    };
  }

  const pricing = PRICING[plan];
  const isAnnual = billing === "annual";
  const flat = !!(pricing && pricing.flat);
  const perMonth = pricing ? (isAnnual ? pricing.annual : pricing.monthly) : 0;
  const billingLabel = flat
    ? "Flat rate, no commitment"
    : isAnnual
    ? "Billed annually"
    : "Billed monthly";
  const usage = USAGE[plan] || "more";

  if (type === "cancellation") {
    const until = dateISO ? fmtDate(new Date(dateISO)) : "the end of your billing period";
    const accountUrl = `${appOrigin || ""}/account`;
    return {
      subject: "Your FetchIt subscription has been cancelled",
      html: wrap(
        h1("Sorry to see you go 🐕") +
          p(`Your <strong>FetchIt ${plan}</strong> subscription has been cancelled. No refund is issued for the current period.`) +
          p(`You'll keep <strong>full access</strong> to FetchIt ${plan} until <strong>${until}</strong> — after that you'll move to the Free plan.`) +
          p("Changed your mind? You can reactivate any time before then.") +
          button(accountUrl, "Reactivate subscription"),
      ),
    };
  }

  if (type === "reactivation") {
    const next = dateISO ? fmtDate(new Date(dateISO)) : null;
    return {
      subject: `Your FetchIt ${plan} is back! 🐕`,
      html: wrap(
        h1("Welcome back! 🐕") +
          p(`Good news — your <strong>FetchIt ${plan}</strong> subscription is active again and will keep renewing as normal.`) +
          (next ? p(`Your next billing date is <strong>${next}</strong>.`) : "") +
          p("Happy fetching!"),
      ),
    };
  }

  if (type === "downgrade") {
    const from = fromPlan || "your previous plan";
    // Downgrade to Free keeps the paid plan until the period ends, then lapses to
    // Free — different copy from a paid → paid downgrade (which is immediate).
    if (plan === "Free") {
      const until = dateISO
        ? fmtDate(new Date(dateISO))
        : "the end of your billing period";
      const accountUrl = `${appOrigin || ""}/account`;
      return {
        subject: "Your FetchIt plan is changing to Free",
        html: wrap(
          h1("Your plan is changing to Free 🐕") +
            p(`You've requested to downgrade from <strong>FetchIt ${from}</strong> to the Free plan.`) +
            p(`You'll keep <strong>full access</strong> to FetchIt ${from} until <strong>${until}</strong>. After that your account moves to Free.`) +
            p("No refund will be issued.") +
            p("Changed your mind? Reactivate at fetchit.app/account") +
            button(accountUrl, "Reactivate subscription"),
        ),
      };
    }
    return {
      subject: "Your FetchIt plan has been updated",
      html: wrap(
        h1("Your plan has been updated 🐕") +
          p(`You've switched from <strong>FetchIt ${from}</strong> to <strong>FetchIt ${plan}</strong>. Your new plan is active immediately.`) +
          p("Thanks for sticking with FetchIt — happy fetching!"),
      ),
    };
  }

  if (type === "billing_change") {
    let next: string;
    if (dateISO) {
      next = fmtDate(new Date(dateISO));
    } else {
      const d = new Date();
      if (isAnnual && !flat) d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
      next = fmtDate(d);
    }
    const period = isAnnual ? "annual" : "monthly";
    return {
      subject: "Your FetchIt billing has been updated",
      html: wrap(
        h1("Your billing has been updated 🐕") +
          p(`You've switched to <strong>${period}</strong> billing for <strong>FetchIt ${plan}</strong>.`) +
          p(`New billing date: <strong>${next}</strong>.`),
      ),
    };
  }

  // Default: purchase (also used for upgrades). Next billing = now + interval.
  let nextText: string;
  if (dateISO) {
    nextText = fmtDate(new Date(dateISO));
  } else {
    const d = new Date();
    if (isAnnual && !flat) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    nextText = fmtDate(d);
  }
  return {
    subject: `Welcome to FetchIt ${plan}! 🐕`,
    html: wrap(
      h1(`Welcome to FetchIt ${plan}! 🐕`) +
        p(`Thanks for subscribing — your plan is active and ready to fetch. Here are the details:`) +
        `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="margin:8px 0 20px;border-top:1px solid #F0ECDF;border-bottom:1px solid #F0ECDF;">
          ${detail("Plan", `FetchIt ${plan}`)}
          ${detail("Price", `$${money(perMonth)}/mo`)}
          ${detail("Billing", billingLabel)}
          ${detail("Next billing date", nextText)}
          ${detail("Usage", `Up to ${usage} Free usage`)}
        </table>` +
        p("Head back to FetchIt and start telling it what you want!"),
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email is not configured (RESEND_API_KEY missing)." }, 500);

    // ----- Authenticate the caller; send only to their own email -----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.email) {
      return json({ error: "Not authenticated." }, 401);
    }
    const to = userData.user.email;

    const {
      type = "purchase",
      plan = "Plus",
      billing = "monthly",
      dateISO = null,
      appOrigin = "",
      fromPlan = null,
      // NB: named `deleteToken` to avoid colliding with the JWT `token` above.
      token: deleteToken = null,
    } = await req.json().catch(() => ({}));

    LOGO_ORIGIN = appOrigin || ""; // header renders the logo image when set
    const { subject, html } = buildEmail({
      type,
      plan,
      billing,
      dateISO,
      appOrigin,
      fromPlan,
      token: deleteToken,
    });

    // ----- Send via the Resend API -----
    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });

    const result = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      // Surface Resend's real error (e.g. domain not verified, invalid key).
      const message =
        result?.message || result?.error || `Resend error ${resendRes.status}`;
      return json({ error: message, status: resendRes.status }, 502);
    }

    return json({ ok: true, id: result?.id ?? null, sent: to, type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email failed.";
    return json({ error: message }, 500);
  }
});
