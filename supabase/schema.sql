-- FetchIt — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`) to create the
-- tables the app reads/writes. Auth (auth.users) is managed by Supabase, so
-- only the app-owned tables are defined here.
--
-- Every table is scoped per user via Row Level Security: a signed-in user can
-- only see and modify their own rows. user_id (or owner_id for the family
-- tables) defaults to auth.uid() so the client never has to send it.

-- ---------------------------------------------------------------------------
-- chats — one row per conversation; messages is the full thread as JSON.
-- ---------------------------------------------------------------------------
create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title       text,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists chats_user_id_created_at_idx
  on public.chats (user_id, created_at desc);

alter table public.chats enable row level security;

drop policy if exists "Users can manage their own chats" on public.chats;
create policy "Users can manage their own chats"
  on public.chats
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- orders — one row per "Buy This" checkout in the chat. Backs the Orders &
-- Analytics page (/orders). order_price is what the retailer charged; service_fee
-- is FetchIt's fee on top; zinc_order_id is the (mock) fulfilment id.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  product_name  text not null,
  product_image text,
  retailer      text,
  category      text,
  order_price   numeric(10, 2),
  service_fee   numeric(10, 2),
  zinc_order_id text,
  -- pending | processing | completed | failed
  status        text not null default 'completed',
  created_at    timestamptz not null default now()
);

-- Bring older installs (which had `price text` and no fee/retailer/category
-- columns) up to the current shape. Safe to run repeatedly.
alter table public.orders add column if not exists product_image text;
alter table public.orders add column if not exists retailer      text;
alter table public.orders add column if not exists category      text;
alter table public.orders add column if not exists order_price    numeric(10, 2);
alter table public.orders add column if not exists service_fee    numeric(10, 2);
alter table public.orders add column if not exists zinc_order_id  text;

create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

drop policy if exists "Users can manage their own orders" on public.orders;
create policy "Users can manage their own orders"
  on public.orders
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sessions — usage windows for the token/rate limit. One row per 5-hour window;
-- `tokens_used` accumulates the (estimated) tokens spent in that window. The
-- app finds the active window by reading the newest row and checking whether
-- session_start is within the last 5 hours (the reset cadence). Token limits and
-- the 5h window live in the app (src/utils.js) — internal, never shown to users.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  plan          text not null default 'Free',
  tokens_used   bigint not null default 0,
  session_start timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists sessions_user_id_start_idx
  on public.sessions (user_id, session_start desc);

alter table public.sessions enable row level security;

drop policy if exists "Users can manage their own sessions" on public.sessions;
create policy "Users can manage their own sessions"
  on public.sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- weekly_usage — the weekly token cap (Terms of Service §6), enforced alongside
-- the 5-hour `sessions` window. One row per ISO-ish week; `week_start` is that
-- week's Monday 00:00 *local* time (computed client-side, stored as an absolute
-- timestamp), and `tokens_used` accumulates the week's spend. The app reads the
-- newest row and reuses it while its week_start matches the current week's
-- Monday; otherwise a fresh row is created (the weekly reset). Limits live in the
-- app (src/utils.js WEEKLY_TOKEN_LIMITS) — internal, never shown to users.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  plan          text not null default 'Free',
  tokens_used   bigint not null default 0,
  week_start    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists weekly_usage_user_id_week_idx
  on public.weekly_usage (user_id, week_start desc);

alter table public.weekly_usage enable row level security;

drop policy if exists "Users can manage their own weekly usage" on public.weekly_usage;
create policy "Users can manage their own weekly usage"
  on public.weekly_usage
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- profiles — one row per user: shipping address + Stripe customer / saved card
-- pointers, collected in the "Delivery & Payment" onboarding step and editable
-- on the Cards & Address page (/cards-address). user_id is the primary key (one
-- profile per user) and defaults to auth.uid(), so the client never sends it.
--
-- Only NON-sensitive card metadata is kept here (brand + last 4 + expiry, for
-- display). Raw card data NEVER touches our DB — Stripe Elements tokenizes it;
-- we only store the resulting payment_method id (charged server-side, off
-- session, via the edge functions).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id                  uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  full_name                text,
  address_line1            text,
  address_line2            text,
  city                     text,
  state                    text,
  zip                      text,
  country                  text default 'United States',
  stripe_customer_id       text,
  stripe_payment_method_id text,
  -- Display-only card metadata (safe to store; never the full number/CVC).
  card_brand               text,
  card_last4               text,
  card_exp_month           int,
  card_exp_year            int,
  -- Terms of Service acceptance (captured at the /terms onboarding step).
  tos_accepted             boolean not null default false,
  tos_accepted_at          timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Bring older installs up to the current shape (safe to run repeatedly).
alter table public.profiles add column if not exists tos_accepted    boolean not null default false;
alter table public.profiles add column if not exists tos_accepted_at  timestamptz;

alter table public.profiles enable row level security;

drop policy if exists "Users can manage their own profile" on public.profiles;
create policy "Users can manage their own profile"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- family_invites / family_members — Max-plan family sharing. A Max owner can
-- invite up to 4 people; each invite carries a unique token used in the join
-- link (/join-family?token=…). RLS is scoped to owner_id, so an owner manages
-- only their own rows; the cross-user parts of the join flow (a logged-out or
-- different user reading/accepting an invite by token, and downgrading a member
-- when removed) run in the family-* Edge Functions with the service role, which
-- bypasses RLS. `member_email` on family_members is denormalized so the owner
-- can display members without reading other users' rows.
-- ---------------------------------------------------------------------------
create table if not exists public.family_invites (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  invitee_email text not null,
  token         text not null unique,
  status        text not null default 'pending', -- pending | accepted | declined
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz
);

create index if not exists family_invites_owner_idx
  on public.family_invites (owner_id, created_at desc);

alter table public.family_invites enable row level security;

drop policy if exists "Owners can manage their own family invites" on public.family_invites;
create policy "Owners can manage their own family invites"
  on public.family_invites
  for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create table if not exists public.family_members (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade default auth.uid(),
  member_id         uuid not null references auth.users (id) on delete cascade,
  member_email      text,
  -- Set when the owner cancels Max: the family disbands at the owner's period
  -- end (members keep access until then, lazily downgraded after). Mirrored onto
  -- each member's user_metadata.family_disband_at so getPlan() can enforce it
  -- client-side without a cross-user read.
  pending_disband_at timestamptz,
  joined_at         timestamptz not null default now()
);

-- Bring older installs up to the current shape (safe to run repeatedly).
alter table public.family_members add column if not exists pending_disband_at timestamptz;

create index if not exists family_members_owner_idx
  on public.family_members (owner_id);

alter table public.family_members enable row level security;

drop policy if exists "Owners can manage their own family members" on public.family_members;
create policy "Owners can manage their own family members"
  on public.family_members
  for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- delete_user() — lets a signed-in user delete their own account from the
-- client. Removing the auth.users row cascades to their chats, orders,
-- sessions, weekly usage, profile, and family invites/memberships (all
-- reference auth.users on delete cascade). SECURITY
-- DEFINER so it runs with the owner's privileges; it only ever targets
-- auth.uid(), so a user can only delete themselves. Called from the app via
-- supabase.rpc('delete_user').
-- ---------------------------------------------------------------------------
create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;


-- ===========================================================================
-- EMAIL TEMPLATE — password change confirmation (dashboard config, not SQL)
-- ===========================================================================
-- The "Change password" flow in /account calls supabase.auth.resetPasswordFor
-- Email(), which uses the **Reset Password** email template. (If you instead
-- wire an email change, the **Change Email Address** template uses the same
-- markup — paste this into whichever you use.)
--
-- Supabase dashboard → Authentication → Email Templates → Reset Password:
--   Subject:  Confirm your FetchIt password change
--   Body:     paste the branded HTML below (uses the {{ .ConfirmationURL }} token)
--
-- Also set Authentication → URL Configuration → Redirect URLs to allow returning
-- to /account (including the ?type=deletion variant). The simplest is a wildcard
-- for your origin, e.g. http://localhost:3000/** (and your production origin).
--
-- ---------------------------------------------------------------------------
-- <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
--        style="background:#FFFDF7;padding:32px 0;font-family:'Nunito',Arial,sans-serif;">
--   <tr><td align="center">
--     <table width="480" cellpadding="0" cellspacing="0" role="presentation"
--            style="background:#FFFFFF;border-radius:24px;overflow:hidden;
--                   box-shadow:0 20px 50px rgba(26,26,26,0.12);">
--       <!-- Header -->
--       <tr><td style="background:#1A1A1A;padding:28px 32px;">
--         <span style="display:inline-block;background:#FFD700;border-radius:14px;
--                      padding:8px 12px;font-size:22px;line-height:1;">🐕</span>
--         <span style="color:#FFFFFF;font-family:'Baloo 2',Arial,sans-serif;
--                      font-weight:800;font-size:22px;vertical-align:middle;
--                      margin-left:10px;">FetchIt</span>
--       </td></tr>
--       <!-- Body -->
--       <tr><td style="padding:36px 32px 8px;">
--         <h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;
--                    font-size:26px;font-weight:800;">Confirm your password change 🐕</h1>
--         <p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.6;">
--           We got a request to change your FetchIt password. Tap the button below
--           to confirm it's you — then you can set your new password.
--         </p>
--         <a href="{{ .ConfirmationURL }}"
--            style="display:inline-block;background:#FF6B35;color:#FFFFFF;
--                   text-decoration:none;font-family:'Baloo 2',Arial,sans-serif;
--                   font-weight:700;font-size:17px;padding:14px 32px;
--                   border-radius:999px;">Confirm password change</a>
--         <p style="margin:24px 0 0;color:#999999;font-size:13px;line-height:1.6;">
--           Didn't request this? You can safely ignore this email — your password
--           won't change.
--         </p>
--       </td></tr>
--       <!-- Footer -->
--       <tr><td style="padding:24px 32px 32px;border-top:1px solid #F0ECDF;">
--         <p style="margin:0;color:#999999;font-size:13px;">
--           FetchIt — your shopping best friend 🐕
--         </p>
--       </td></tr>
--     </table>
--   </td></tr>
-- </table>
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- EMAIL TEMPLATE — account deletion confirmation (reference only)
-- ===========================================================================
-- The "Delete my account" flow in /account sends its OWN branded email via the
-- `send-email` Edge Function (Resend), with a one-time token link to
-- /account?type=deletion&token=… — NOT a Supabase template. (The Magic Link
-- template is owned by login OTP.) The HTML below is the reference design that
-- the send-email function's `deletion_confirm` template mirrors; there's nothing
-- to paste into the dashboard for deletion.
--
-- ---------------------------------------------------------------------------
-- <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
--        style="background:#FFFDF7;padding:32px 0;font-family:'Nunito',Arial,sans-serif;">
--   <tr><td align="center">
--     <table width="480" cellpadding="0" cellspacing="0" role="presentation"
--            style="background:#FFFFFF;border-radius:24px;overflow:hidden;
--                   box-shadow:0 20px 50px rgba(26,26,26,0.12);">
--       <!-- Header -->
--       <tr><td style="background:#1A1A1A;padding:28px 32px;">
--         <span style="display:inline-block;background:#FFD700;border-radius:14px;
--                      padding:8px 12px;font-size:22px;line-height:1;">🐕</span>
--         <span style="color:#FFFFFF;font-family:'Baloo 2',Arial,sans-serif;
--                      font-weight:800;font-size:22px;vertical-align:middle;
--                      margin-left:10px;">FetchIt</span>
--       </td></tr>
--       <!-- Body -->
--       <tr><td style="padding:36px 32px 8px;">
--         <h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;
--                    font-size:26px;font-weight:800;">Confirm account deletion 🐕</h1>
--         <p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.6;">
--           We received a request to delete your FetchIt account. Click below to
--           proceed with account deletion. If you didn't request this, ignore this
--           email — your account is safe.
--         </p>
--         <a href="{{ .ConfirmationURL }}"
--            style="display:inline-block;background:#E5484D;color:#FFFFFF;
--                   text-decoration:none;font-family:'Baloo 2',Arial,sans-serif;
--                   font-weight:700;font-size:17px;padding:14px 32px;
--                   border-radius:999px;">Proceed with deletion</a>
--         <p style="margin:24px 0 0;color:#B3261E;font-size:14px;font-weight:700;">
--           ⚠️ This action cannot be undone.
--         </p>
--       </td></tr>
--       <!-- Footer -->
--       <tr><td style="padding:24px 32px 32px;border-top:1px solid #F0ECDF;">
--         <p style="margin:0;color:#999999;font-size:13px;">
--           FetchIt — your shopping best friend 🐕
--         </p>
--       </td></tr>
--     </table>
--   </td></tr>
-- </table>
-- ---------------------------------------------------------------------------
