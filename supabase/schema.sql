-- Fetchit — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`) to create the
-- tables the app reads/writes. Auth (auth.users) is managed by Supabase, so
-- only the app-owned tables are defined here.
--
-- Both tables are scoped per user via Row Level Security: a signed-in user can
-- only see and modify their own rows. user_id defaults to auth.uid() so the
-- client never has to send it.

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
-- orders — one row per "Buy This" checkout in the chat.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  product_name  text not null,
  price         text,
  status        text not null default 'completed',
  created_at    timestamptz not null default now()
);

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
-- delete_user() — lets a signed-in user delete their own account from the
-- client. Removing the auth.users row cascades to their chats, orders, and
-- sessions (all reference auth.users on delete cascade). SECURITY DEFINER so it runs with the
-- owner's privileges; it only ever targets auth.uid(), so a user can only
-- delete themselves. Called from the app via supabase.rpc('delete_user').
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
--   Subject:  Confirm your Fetchit password change
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
--                      margin-left:10px;">Fetchit</span>
--       </td></tr>
--       <!-- Body -->
--       <tr><td style="padding:36px 32px 8px;">
--         <h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;
--                    font-size:26px;font-weight:800;">Confirm your password change 🐕</h1>
--         <p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.6;">
--           We got a request to change your Fetchit password. Tap the button below
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
--           Fetchit — your shopping best friend 🐕
--         </p>
--       </td></tr>
--     </table>
--   </td></tr>
-- </table>
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- EMAIL TEMPLATE — account deletion confirmation (dashboard config, not SQL)
-- ===========================================================================
-- The "Delete my account" flow in /account calls supabase.auth.signInWithOtp()
-- (a magic link), which uses the **Magic Link** email template — separate from
-- the Reset Password template above, so the two emails are branded independently.
--
-- Supabase dashboard → Authentication → Email Templates → Magic Link:
--   Subject:  Confirm your Fetchit account deletion
--   Body:     paste the branded HTML below (uses the {{ .ConfirmationURL }} token)
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
--                      margin-left:10px;">Fetchit</span>
--       </td></tr>
--       <!-- Body -->
--       <tr><td style="padding:36px 32px 8px;">
--         <h1 style="margin:0 0 12px;color:#1A1A1A;font-family:'Baloo 2',Arial,sans-serif;
--                    font-size:26px;font-weight:800;">Confirm account deletion 🐕</h1>
--         <p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.6;">
--           We received a request to delete your Fetchit account. Click below to
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
--           Fetchit — your shopping best friend 🐕
--         </p>
--       </td></tr>
--     </table>
--   </td></tr>
-- </table>
-- ---------------------------------------------------------------------------
