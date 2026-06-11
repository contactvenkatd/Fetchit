# Fetchit — AI Shopping Assistant

## Project Overview
Fetchit is a friendly AI-powered shopping agent. You chat with Fetchit's AI in
natural language, it returns personalized product picks (with photos, prices,
and verified reviews), and — once you pick one — it checks out for you
automatically in the background. Built as a React (Create React App) landing
page with plain CSS, no UI libraries. Auth, chat history, and order history are
backed by **Supabase** (`@supabase/supabase-js`); see "Supabase Backend" below.

## Branding
- **Name:** Fetchit
- **Tagline:** Your shopping best friend
- **Personality:** Friendly, fun, playful — like a dog that fetches deals
- **Logo:** 🐕 emoji in a yellow rounded tile next to the "Fetchit" wordmark

## Color Palette (CSS variables in `src/index.css`)
- `--yellow` `#FFD700` — primary / highlights
- `--orange` `#FF6B35` — accent / primary CTA buttons, "Most Popular" tag
- `--charcoal` `#1A1A1A` — text / dark sections (chat mockup, social proof, footer)
- `--white` `#FFFFFF`, `--cream` `#FFFDF7` — backgrounds
- Fonts: **Baloo 2** (playful headings) + **Nunito** (body) via Google Fonts
- Rounded corners throughout; hover-lift animations; all motion respects
  `prefers-reduced-motion`.

## Run
```bash
cd fetchit-app
npm install
npm start          # dev server at http://localhost:3000
npm run build      # production build (CI=true treats lint warnings as errors)
```
**Supabase setup (one-time):** run `supabase/schema.sql` in the Supabase SQL
editor to create the `chats` + `orders` + `sessions` tables and RLS policies. In Auth →
Providers → Email, keep "Confirm email" enabled (signup email verification). In
Auth → URL Configuration → Redirect URLs, allow your origin (a wildcard like
`http://localhost:3000/**` covers `/plans` (signup verification target),
`/account`, `/account?type=deletion`, and `/reset-password`). Credentials live in
`src/supabaseClient.js`. (Login confirmation no longer needs a redirect URL — it
uses a reauthentication **code**, not a link.)

**Email templates — one purpose each:**
- **Confirm signup** → signup email verification (`signUp`).
- **Reset Password** → password change/reset (`resetPasswordForEmail`).
- **Magic Link** → **login OTP only** (`signInWithOtp` → 6-digit code, no
  `emailRedirectTo`). Its body must include **`{{ .Token }}`** so the code shows;
  copy e.g. "Your Fetchit sign-in code is below 🐕".
- **Account deletion** and all plan emails (purchase/cancel/reactivate/etc.) go
  through the **send-email** edge function (Resend API), NOT a Supabase
  template — so deletion has its own branded "Confirm your Fetchit account
  deletion" email, fully separate from login.

**Stripe setup (one-time, for real checkout):** deploy the
`create-subscription`, `cancel-subscription`, and `reactivate-subscription` Edge
Functions (`supabase functions deploy <name>`) and give them the Stripe
**secret** key (`supabase secrets set STRIPE_SECRET_KEY=sk_test_...`). The
frontend only holds the **publishable** test key (`src/stripeClient.js`). See
"Stripe Payments" below. Test mode throughout — no real charges.

**Email setup (one-time, transactional emails):** deploy the `send-email` Edge
Function (`supabase functions deploy send-email`) and give it the Resend API key
(`supabase secrets set RESEND_API_KEY=re_...`). It sends branded plan + deletion
emails via the **Resend API** (`POST https://api.resend.com/emails`, `fetch`).
Until a domain is verified in Resend, `from` uses Resend's test sender
`onboarding@resend.dev` (delivers only to your Resend account email). See
"Transactional Email" below.

## Page Sections (in order)
1. **Navbar** — sticky; logo, smooth-scroll links (How It Works / Features /
   Pricing), "Try Free" CTA, hamburger menu ≤760px.
2. **Hero** — headline "Just Tell Fetchit What You Want"; subheading about
   chatting with the AI; a single "See How It Works" button that scrolls to the
   How It Works section.
3. **Meet Fetchit AI** (`ChatMockup`) — interactive mock chat UI (see below).
4. **How It Works** — 3 steps: Chat with Fetchit AI → Pick from AI-Curated
   Recommendations → Fetchit Buys It For You.
5. **Features** — 4 cards: Conversational AI, Smart Recommendations,
   Auto Checkout (Puppeteer-powered), Secure Payments (Stripe-powered).
6. **Social Proof** — 50,000+ shoppers, $2.4M saved this month, 99.8% satisfaction.
7. **Pricing** — 4 tiers, Monthly/Annual toggle ("Save 10%"). Pro is badged
   "Most Popular" (yellow card), Max "Best Value" (orange-framed card). See
   "Pricing Tiers" below for prices + features. The toggle is purely a display
   choice; the per-card billing note clarifies it (Plus = "Flat rate, no
   commitment", Pro/Max annual = "billed annually").
8. **FAQ** — 5 accordion items (aria-expanded, animated chevron).
9. **Footer** — tagline "Fetchit — your shopping best friend", links.

## Meet Fetchit AI — Chat Mockup (`ChatMockup.js` / `.css`)
A fully mocked (no real AI) interactive chat inside browser-window chrome
(rounded top bar, red/yellow/green dots, "fetchit.app" address bar). Dark
charcoal section background. Fixed-height 500px scrollable chat area, input bar
at the bottom.

- **Auto-play on scroll into view** (IntersectionObserver, fires once): one
  message every 1.2s — Fetchit greeting → user (gift for mom, ~$50) → Fetchit
  follow-up → user (60, gardening + tea) → Fetchit "give me a sec 🔍" → typing
  indicator (2s) → 3 product cards.
- **Product cards** (`ProductCard.js`): horizontally scrollable, colored
  placeholder image (soft greens/browns + emoji), name, price, star rating,
  1-line description, full-width yellow "Buy This 🐕" button. The three demo
  products: Premium Tea Sampler Gift Set ($34.99, 4.8), Leather Garden Tool Bag
  ($47.99, 4.6), Botanical Herb Starter Kit ($52.00, 4.7).
- **Buy flow** (any card): user "Buy This 🐕" → Fetchit "On it! 🛒 Checking out
  in the background..." → animated progress bar (2s) → "✅ Done! Your <product>
  is ordered. Confirmation sent to your email."
- **Free-text input:** sending a message appends it, Fetchit auto-replies
  "This is a demo — the real Fetchit AI is coming soon! Sign up to get early
  access. 🐕", then opens the email signup modal (`onRequestSignup`).
- **Styling:** Fetchit bubbles `#2A2A2A` with yellow 🐕 avatar; user bubbles
  `#FFD700` charcoal text, right-aligned; 3-dot typing animation; smooth
  auto-scroll to bottom. `prefers-reduced-motion` → all demo messages shown
  instantly, no typing/progress animation.

## Email Signup Flow
- **Pricing buttons** open `Modal` ("Almost there! 🐕", shows selected plan +
  price, email input with validation, "Start Fetching" / "Cancel"). Modal traps
  focus, closes on Escape / overlay click, locks body scroll, restores focus.
- **Chat demo input** opens the same modal with a pseudo-plan "Early Access".
- Valid submit saves `{ email, plan, timestamp }` to `localStorage` under
  `fetchit_signups` (see `src/utils.js`) and fires the bottom-right toast.
- Email validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; error message
  "Please enter a valid email" wired via `aria-describedby`.

## Hidden Admin Page — `/admin` (`AdminPage.js` / `.css`)
Lightweight path-based routing in `App.js` (`window.location.pathname`). Renders
a table of all signups (#, email, plan pill, formatted date) with a "Clear All"
button (confirm dialog, clears localStorage). No auth — demo only; localStorage
is per-browser.

## Routes (React Router v6, `App.js`)
- `/` — landing page (`Landing` component: Navbar, Hero, ChatMockup, etc.)
- `/signup` — `SignupPage` (email + password → create account)
- `/login` — `LoginPage` (email + password → sign in)
- `/plans` — `PlansPage`, wrapped in `PlansGate` (logged out → `/login`; logged
  in with no plan yet → show; logged in with a plan → `/chat`, unless navigated
  with `state.manage` for an intentional plan change)
- `/checkout` — `CheckoutPage`
- `/onboarding` — `OnboardingPage` (protected: optional first/last name after a
  plan is picked; "Skip for now" or save → `/chat`)
- `/reset-password` — `ResetPasswordPage` (forgot-password reset link target;
  reverse-protected — only reachable via the email link)
- `/chat` — `ChatPage` (protected: redirects to `/login` if not signed in)
- `/account` — `AccountPage` (protected: profile, password, delete account)
- `/admin` — `AdminPage` (hidden signups dashboard)
- `*` — falls back to the landing page

**Auto-login:** `/`, `/login`, `/signup` (and `*`) are wrapped in
`RedirectIfAuthed` — if an active session exists, they redirect to `/chat`
(works across tab close/reopen since the session lives in localStorage). Sign-in
pages are only reachable when logged out.

## Supabase Backend
Real auth + data persistence via Supabase. Everything client-side (anon key in
the browser); per-user access is enforced by Row Level Security, not the client.

- **Client** — `src/supabaseClient.js` creates the shared `supabase` instance
  with the project URL + anon key (`persistSession`, `autoRefreshToken`,
  `detectSessionInUrl` all on). Sessions live in localStorage under Supabase's
  own `sb-*` keys and survive tab close/reopen.
- **Auth context** — `src/AuthContext.js` (`AuthProvider` + `useAuth()`) resolves
  the initial session once (async) and stays in sync via `onAuthStateChange`.
  `useAuth()` returns `{ session, loading }`; `session.user.email` is the signed-in
  email, `session.user.user_metadata` holds `plan`, `first_name`, `last_name`.
  Components must wait for `loading` to be false before treating "no session" as
  logged-out.
- **Email verification** is ON: `signUp()` returns no session until the user
  clicks the confirmation link (`emailRedirectTo` = `<origin>/plans`).
  `SignupPage` shows a "Check your email 🐕" screen instead of advancing.
  Confirming in the same browser auto-signs-in (detected in the URL) → lands on
  **`/plans`** to pick a plan (`PlansGate` shows it because the new user has no
  plan yet). Add `<origin>/plans` to the allowed Redirect URLs.
- **`supabase/schema.sql`** — the `chats`, `orders`, and `sessions` tables + RLS
  policies, plus the `delete_user()` RPC (SECURITY DEFINER, deletes `auth.uid()`;
  chats, orders, and sessions cascade). Run it once in the Supabase SQL editor.
  `user_id` defaults to `auth.uid()`, so the client never sends it. (`sessions`
  backs the per-plan token/usage limit — see "Usage Limits".)

`src/utils.js` auth/data helpers (all async, thin wrappers over Supabase):
`signUp(email, password)`, `signIn(email, password)`, `signOut()`,
`getSession()`, `finalizePlan(plan, billing)` (normalizes via `planKey`, writes
`user_metadata.plan` + `family_members` + `plan_billing`/`plan_started_at` for
paid plans, clears `plan_cancels_at`), `getPlan(session)` (effective plan —
returns Free once `plan_cancels_at` passes) / `getPlanBilling(session)` (billing
period), `isCanceled(session)` (cancellation scheduled but not yet effective) /
`planCancelsAt(session)` (the cancel Date), `planUsageLabel(plan)` (token-free
usage descriptor), `nextBillingDate(session)` (approx renewal from the stored
start + interval), `cancelSubscription()` (cancel-subscription edge fn → sets
`plan_cancels_at`) / `reactivateSubscription()` (clears it),
`detectPlanChange(session, plan, billing)` (classifies purchase/upgrade/downgrade/
billing_change/current) + `cancelStripeSubscriptions({exceptSubscriptionId, atPeriodEnd})`
(replace-old-sub during a plan change), `sendPlanEmail(payload)`
(fire-and-forget branded email via the send-email edge fn — see "Transactional Email"),
`getName(session)` (sync — reads `{firstName, lastName}` from metadata),
`saveName(first, last)`, the email-confirmed password trio
`requestPasswordChange(current)` (re-auths, then emails a link) /
`resendPasswordChangeEmail()` / `applyNewPassword(next)` (sets it in the recovery
session — shared by `/account` and `/reset-password`),
`sendPasswordReset(email)` (forgot-password link → `/reset-password`),
`verifyPassword(pw)` (re-auths to confirm identity before deletion),
`sendAccountDeletionEmail()` (mints a 1h token in metadata + sends a custom
deletion email via send-email) / `verifyDeleteToken(session, token)` /
`clearDeleteToken()`, `deleteAccount()` (calls the `delete_user()` RPC then
signs out), plus
`sendLoginOtp(email)`/`verifyLoginOtp(email, token)` (login email OTP),
`getChats()`/`saveChat(chat)`/`deleteChat(id)` and `saveOrder({productName,
price, status})`, plus the usage-limit helpers (INTERNAL, see "Usage Limits"):
`TOKEN_LIMITS`/`tokenLimit(plan)`, `SESSION_WINDOW_MS`, `NEXT_PLAN`,
`estimateTokens(text)`, `formatResetIn(start)`, `getOrCreateSession(plan)`/
`getActiveSession()`/`addSessionTokens(id, used, n)`/`isSessionExpired(s)`.
Still localStorage (demo only, no account): `getSignups`/
`saveSignup`/`clearSignups` (admin list) and `setPendingPlan`/`getPendingPlan`/
`clearPendingPlan` (transient plan-resume). The shared
`routePlanSelection(plan, navigate, session)` in `App.js` decides where a
pricing-card click goes.

## Signup & Plan Flow
The happy path is **signup → verify email → /plans → (Free or paid:
/checkout) → /onboarding → /chat**. Name collection is its own `/onboarding`
step *after* a plan is picked (optional — skippable, also editable in
`/account`). Signup itself never collects a name. Routes that should only show
when logged out (`/`, `/login`, `/signup`, `*`) are wrapped in `RedirectIfAuthed`
(renders nothing while `loading`, redirects to `/chat` when a session exists,
else shows the page); `/plans` has its own `PlansGate` (see Routes).

Flow:
1. **Navbar** (landing): "Sign In" → `/login`, "Create Account" → `/signup`.
2. **Signup** (`/signup`): email + password (show/hide toggle). Validates email
   format + password ≥8 chars → `signUp(email, password)`. Because email
   verification is on, no session is created yet → shows the "Check your email"
   screen. The confirmation link (`emailRedirectTo` = `<origin>/plans`) returns
   the now-signed-in, plan-less user to **`/plans`**. Supabase errors (e.g. user
   exists) render inline.
3. **Login** (`/login`): email + password → `signInWithPassword`; wrong creds →
   "Incorrect email or password", unconfirmed email → "Please verify your email
   before signing in". **A real email OTP second factor gates the sign-in:** on
   valid credentials we **sign back out** (`signOut({ scope: "local" })` — no
   session until the code checks out), then `sendLoginOtp(email)`
   (`signInWithOtp`, `shouldCreateUser: false`) emails a **6-digit code**. The
   screen swaps to "Check your email 🐕 … enter the 6-digit code" + code input +
   **Confirm & sign in** + **Resend code** + **Back to sign in**. The code is
   verified with `verifyLoginOtp` (`verifyOtp`, `type: 'email'`) — **wrong codes
   are rejected by Supabase**, and a correct code establishes the session. Then
   `finishLogin` routes: resume pending plan (Free → `/onboarding`, paid →
   `/checkout`), else plan-less → `/plans`, else `/chat`. A `fetchit_login_pending`
   sessionStorage flag holds `RedirectIfAuthed` across the two brief windows where
   a session exists (the password step, and post-verification before routing).
   No redirect URL needed (OTP is a code, not a link).
   - **Forgot password?** (subtle grey link under the password field) swaps the
     form in place for a "Reset your password" form (email pre-filled with what
     was typed) → `sendPasswordReset(email)` (`resetPasswordForEmail`,
     `redirectTo` = `/reset-password`) → "Check your email 🐕" + "Back to sign
     in". The link returns to **`/reset-password`** (`ResetPasswordPage`): a
     recovery session lets the user set a new password (show/hide + strength
     meter, validates ≥8 chars & match) via `applyNewPassword()` → toast
     "Password updated! You're all set 🐕" → `/chat` after 2s (already signed in
     via the recovery session). Expired/used link (URL `error_code`) → "This link
     has expired" + link back to `/login`. The page is reverse-protected: a visit
     without a recovery link bounces to `/chat` (logged in) or `/login` (out).
     `App.js`'s `RecoveryHandler` skips `/reset-password` so it doesn't divert the
     link to the in-app `/account` password-change flow (both use `type=recovery`;
     the landing path disambiguates).
4. **Plans** (`/plans`, gated by `PlansGate`): "Choose your plan" + the 4 tiers
   (Free/Plus/Pro/Max) + Monthly/Annual toggle (Save 10%).
   Free → if logged in `finalizePlan("Free")` → `/onboarding`, else save pending → `/login`.
   Plus/Pro/Max → if logged in `/checkout`, else save pending → `/login`.
   - **Current-plan highlighting** (logged in): `detectPlanChange` labels each
     card — green "Current Plan" badge + **disabled** button for the current
     plan/billing, else **Upgrade** / **Downgrade** / **Switch to annual·monthly**.
     Logged-out keeps the plain "Choose <plan>" buttons.
   - **Paid → Free downgrade**: clicking **Free** while on a paid plan opens a
     confirmation modal ("Downgrade to Free?", lose access to <plan> features at
     period end <date>, no refund — "Cancel" yellow / "Downgrade to Free" red
     outlined). Confirm → `cancelSubscription({ suppressEmail: true })` (cancel at
     period end, keep access until then) → `sendPlanEmail({ type: "downgrade",
     plan: "Free", fromPlan })` → toast "You'll move to Free on <date> 🐕" →
     `/account`.
5. **Checkout** (`/checkout`): **real Stripe Elements** (see "Stripe Payments").
   Monthly/Annual toggle (seeded from the plan-page choice, Save 10%) + summary
   pill (plan + per-month price) + billing note. Cardholder name input + Stripe
   `CardNumber`/`CardExpiry`/`CardCvc` Elements (secure, Stripe-hosted iframes
   styled to match the cream inputs), "🔒 Secured by Stripe" + a test-card hint.
   Submit → `createSubscription()` (edge function makes the customer +
   subscription) → `stripe.confirmCardPayment(clientSecret, …)` → on
   `succeeded`/`processing` `finalizePlan(plan, billing)` (stamps billing period
   + start date) → "✅ You're all set! 🐕" → after 2s **`/onboarding`**. Free never
   reaches here (routes straight to `/onboarding`); a Free plan in nav state is
   bounced there defensively.
6. **Onboarding** (`/onboarding`, `OnboardingPage`): protected name-collection
   card (reuses `AuthLayout`/`.auth-card`). "One last thing! 🐕" + first/last
   name → `saveName()` (→ `user_metadata.first_name/last_name`) → `/chat`. "Skip
   for now" goes straight to `/chat` without saving.
7. **Chat** (`/chat`): full-screen dark app, protected (no session → `/login`).
   Left **sidebar** (`ChatSidebar`, 280px, `#111`): Fetchit logo, yellow "New
   Chat" button, scrollable list of this user's past chats (title = first message
   truncated to 40 chars, date/time, hover-reveal trash to delete with confirm),
   and an "🕵️ Incognito" button at the bottom. Top bar: logo + account dropdown
   (shows "Hi, &lt;First Name&gt; 👋", or the email if no name; menu has **Account
   Settings** → `/account` and **Log Out**); a hamburger appears ≤768px to toggle
   the sidebar as an animated
   overlay. Empty state: 🐕 + "What can we get you?" + 3 suggestion chips. Fixed
   bottom input. Sending a message (or chip) fades the empty state, shows the user
   bubble, a typing indicator → (1.5s) "Got it! Let me find the best options for
   you... 🔍" → (2.5s later) 3 keyword-matched product cards (gift / coffee /
   headphones, default gift). "Buy This 🐕" → progress bar → "✅ Done!".

## Chat history & Incognito (`ChatPage` + `ChatSidebar`)
- Each conversation is a row in the Supabase **`chats`** table
  `{ id (client-generated uuid), title, messages (jsonb), created_at }`
  (transient typing/progress bubbles are stripped before saving; chat ids use
  `crypto.randomUUID()`). RLS scopes rows to `auth.uid()` — accounts never see
  each other's chats. After each save the list is re-fetched via `getChats()`.
  "New Chat" resets to the empty state; clicking a past chat restores its
  messages (including product cards); the trash icon deletes the row.
- Each "Buy This 🐕" inserts an **`orders`** row
  `{ product_name, price, status: 'completed' }` (fire-and-forget, RLS-scoped).
- Each send is metered against the plan's token budget (the **`sessions`** table)
  and may surface a "limit reached" message — INTERNAL, see "Usage Limits".
- **Incognito** (sidebar button): hides the sidebar, shows a "🕵️ Incognito Mode"
  badge + "Exit Incognito" button in the top bar, tints the chat `#1A1A2E`, and
  shows a "this chat won't be saved" banner. Nothing is written to Supabase
  while incognito. "Exit Incognito" restores the sidebar and normal mode.
  Incognito is component state only — a page refresh resets to normal.

**Sign out** (account dropdown → Log Out) calls `signOut()` and redirects to
`/` (the landing page); the account stays in Supabase so the user can sign back
in. Visiting `/chat` directly with no session still redirects to `/login`.

## Account Settings — `/account` (`AccountPage.js` / `.css`)
Reached from the chat account dropdown → "Account Settings". Protected (no
session → `/login`). Dark charcoal shell matching the chat page: top bar with a
back arrow → `/chat`, logo, and "Account Settings" title; a single card with
four divider-separated sections (mobile-friendly, name fields stack ≤480px):
- **Your Plan** (top) — a plan-matched card (border: Free grey, Plus blue, Pro
  yellow, Max orange) showing the plan name (+ "Most Popular"/"Best Value"
  badge for Pro/Max), price per month (`monthlyDisplay`/`money` from
  `stripeClient.js`, "$0/mo" for Free), a token-free **usage** line
  (`planUsageLabel` → "Base usage" / "Up to 2×/5×/25× Free usage" — limits stay
  internal), "Sessions reset every 5 hours", and (paid only) "Next billing date:
  …" from `nextBillingDate(session)`. A full-width **Change Plan** button →
  `/plans`: "Upgrade Plan" (yellow) on Free/Plus/Pro, "Manage Plan" (grey) on
  Max. Paid plans also show a small grey **Cancel subscription** link below the
  card → opens a confirm modal ("Are you sure…?", "You'll keep access to Fetchit
  <plan> until <next billing date>" + the no-refund policy text, "Keep my plan"
  yellow / "Cancel subscription" red). Confirm → `cancelSubscription()` (the
  `cancel-subscription` edge function sets `cancel_at_period_end` on the Stripe
  subscription; the client then records `plan_cancels_at` = the period end).
  **The plan is NOT downgraded immediately** — `getPlan()` keeps returning the
  paid plan until `plan_cancels_at` passes, so the user keeps full access
  (matching the policy text). While a cancellation is scheduled
  (`isCanceled(session)`), the card shows a red **"Cancels on <date>"** badge
  (replacing the marketing badge), hides the "Next billing date" line, swaps the
  policy line to "Your plan remains active until <date>. After that you'll move
  to the Free plan…", and the link becomes **Reactivate subscription** →
  `reactivateSubscription()` (the `reactivate-subscription` edge function clears
  `cancel_at_period_end`; client clears `plan_cancels_at`). Once `plan_cancels_at`
  passes, `getPlan()` returns Free everywhere (no webhook needed — it's computed
  client-side from the date). `finalizePlan()` clears `plan_cancels_at`, so
  re-subscribing or changing plans cancels a pending cancellation.
- **Profile** — first/last name inputs pre-filled from `getName(session)`. "Save
  changes" → `saveName()` → success toast "Profile updated! 🐕".
- **Change password** — email-confirmed, two steps:
  1. Current / new / confirm inputs (new shows a 4-bar strength meter:
     Weak/Fair/Good/Strong). Validates new ≥8 chars and new === confirm (inline
     error), then `requestPasswordChange(current)` re-auths with the current
     password (wrong → "Current password is incorrect.") and emails a
     confirmation link (`resetPasswordForEmail`, `redirectTo` = `/account`). The
     password is **not** changed yet. The form is replaced by a "Check your
     email 🐕" panel with a **Resend email** button (`resendPasswordChangeEmail`).
  2. Clicking the emailed link returns to `/account` in a Supabase recovery
     session (`type=recovery`). `App.js`'s `RecoveryHandler` captures the URL
     `type` at module load (before Supabase strips it), sets a
     `fetchit_pw_recovery` sessionStorage flag, and routes to `/account`.
     `AccountPage` then shows a "Finish your password change" form (new +
     confirm) → `applyNewPassword()` (`updateUser({ password })` inside the
     recovery session) → success toast "Password updated! 🐕".

  The typed password is **never persisted** across the email round-trip (no
  localStorage) — the user sets it in the recovery session, so it can't be
  carried in component state through the full-page reload. The branded
  confirmation email template (subject "Confirm your Fetchit password change")
  lives in `supabase/schema.sql` comments — paste it into the dashboard's
  **Reset Password** template, and add `<origin>/account` to the allowed
  Redirect URLs.
- **Danger zone** — password-verified, email-confirmed, multi-step deletion:
  1. Red outlined "Delete my account" → **"Verify it's you"** modal (password
     input with show/hide, yellow "Continue", Cancel). `verifyPassword()`
     re-auths; wrong → "Incorrect password". Only on success does the modal close
     and `sendAccountDeletionEmail()` fire: it mints a one-time token (stored in
     `user_metadata.delete_token` with a 1h expiry) and sends a custom branded
     email via the **send-email** edge function (NOT a Supabase magic link), with
     a link to `/account?type=deletion&token=<token>`. The button is then replaced
     by a "Check your email 🐕" panel + **Resend email** (resend re-mints + skips
     re-verifying).
  2. Clicking the emailed link returns to `/account?type=deletion&token=…` (works
     while signed in — the link doesn't log you in). `AccountPage` verifies the
     token against its metadata (`verifyDeleteToken`, match + not expired), strips
     it from the URL, consumes it (`clearDeleteToken`), and opens the warning
     modal. An invalid/expired token → toast "This deletion link has expired or is
     invalid." (`RecoveryHandler` no longer touches deletion.)
  3. `AccountPage` opens **Modal 1 (warning)** — ⚠️ icon, "Are you sure…?", a red
     box listing what's deleted (chats, orders, account/profile, "This cannot be
     undone"), "No, keep my account" (yellow, closes) / "Yes, delete my account"
     (red outlined → Modal 2).
  4. **Modal 2 (final)** — "Type DELETE to confirm"; the red "Confirm deletion"
     button stays disabled until the input is exactly `DELETE`. Cancel closes
     both. Confirm → `deleteAccount()` (the `delete_user()` RPC cascades chats +
     orders, then signs out) → `/` with a flash toast "Your account has been
     deleted." (passed via `fetchit_flash` sessionStorage, shown by `Landing`).

  Both modals reuse `Modal.css` (so they respect `prefers-reduced-motion`) on a
  `.delete-overlay` with `z-index:1000` (above the toast and base modals).

Toasts use the shared `Toast` component (3s auto-dismiss).

## Pricing Tiers
Four tiers. Prices are shown per-month; annual plans are billed as the full year
up front. The marketing copy lives in `Pricing.js` (landing) and `PlansPage.js`
(`/plans`) — keep the two in sync; the **charged** amounts live in
`stripeClient.js` `PLAN_PRICING` and the `create-subscription` edge function.

| Plan | Monthly | Annual (per-mo) | Annual total | Family |
|------|---------|-----------------|--------------|--------|
| Free | $0      | $0              | —            | No |
| Plus | $4.99   | $4.99 (flat)    | billed monthly | No |
| Pro  | $19.99  | $17.99          | $215.88/yr   | No |
| Max  | $99.99  | $89.99          | $1,079.88/yr | Up to 5 members |

- **Plus is flat** ($4.99 either toggle, always billed monthly — no annual
  commitment; `isFlatPlan()` / the `flat` flag drive the "Flat rate, no
  commitment" copy and a `month`-interval Stripe charge on both toggles).
- **Annual saves ~10%** for Pro/Max (toggle badge reads "Save 10%").
- **Max** includes up to 5 family members; `finalizePlan("Max")` writes
  `user_metadata.family_members = 5` (0 on every other plan).
- User-facing features per plan (NO token numbers ever — see "Usage Limits"):
  - **Free:** Auto checkout · Full chat history · Incognito mode · Email order
    confirmations · Deal alerts · "5 hour sessions, resets every 5 hours"
  - **Plus:** Everything in Free · "2x more usage than Free" · 5-hour sessions
  - **Pro:** Everything in Plus · "5x more usage than Free" · Priority AI
    processing · Return tracking · Monthly spending report · Price drop
    notifications · 5-hour sessions
  - **Max:** Everything in Pro · "25x more usage than Free" · Up to 5 family
    members · Dedicated support · Early access to new features · 5-hour sessions

## Usage Limits (INTERNAL — never shown to users)
Each plan has a per-session **token budget** that resets every **5 hours**. Token
counts and limits are deliberately invisible in the UI; users only ever see a
friendly "limit reached" message with a reset countdown + upgrade nudge.

- **Limits** (`utils.js` `TOKEN_LIMITS`): Free 65,000 · Plus 130,000 (2×) ·
  Pro 325,000 (5×) · Max 1,625,000 (25×) tokens per session.
- **Window** (`SESSION_WINDOW_MS`) = 5 hours, same for all plans.
- **Storage** — the Supabase **`sessions`** table: `{ id, user_id, plan,
  tokens_used, session_start, created_at }`, RLS-scoped per user. One row per
  5-hour window. The active window is the newest row whose `session_start` is
  within the last 5 hours; if none/expired, a fresh row is created
  (`getOrCreateSession`). `addSessionTokens` accumulates usage.
- **ChatPage** (`consumeOrBlock`): on each send (outside incognito) it estimates
  the exchange's tokens (`estimateTokens`, ~4 chars/token — a mock meter, no real
  model) and either records them or, if the window is exhausted, shows a `limit`
  message bubble: *"You've reached your session limit 🐕 / Your session resets in
  [X hours X minutes]. / Upgrade to [next plan] for [2x/5x/25x] more usage."*
  (`NEXT_PLAN` maps Free→Plus 2×, Plus→Pro 5×, Pro→Max 25×; Max has no upgrade
  line). The upgrade button routes to `/plans`. **Incognito skips token tracking
  entirely** (it writes nothing to Supabase). Token tracking **fails open** — if
  the `sessions` table isn't migrated yet, chat still works (usage just isn't
  metered).

## Stripe Payments
Real subscriptions via Stripe **test mode**. The secret key must never be in the
browser, so the flow is split between the frontend (publishable key, collects +
confirms the card) and a Supabase **Edge Function** (secret key, creates the
customer + subscription).

- **`src/stripeClient.js`** — `stripePromise` (`loadStripe` with the publishable
  test key) + `PLAN_PRICING` (cents + interval per billing period for Plus / Pro
  / Max — see "Pricing Tiers") and the `money()` / `monthlyDisplay()` /
  `annualTotal()` / `isFlatPlan()` / `familyMembers()` helpers. This pricing
  table is duplicated in the edge function and the two **must stay in sync** —
  the price shown is the price charged. (Plus is flat → `month` interval on both
  toggles; Pro/Max annual → `year` interval with the full-year amount.)
- **`supabase/functions/create-subscription/index.ts`** — Deno edge function
  (`STRIPE_SECRET_KEY` from `supabase secrets`). Authenticates the caller from
  their Supabase JWT (service-role client → live user row), **reuses or creates**
  the Stripe customer and persists `stripe_customer_id` to `user_metadata` via
  the admin API (so returning users never get a duplicate customer), then creates
  an incomplete subscription (`payment_behavior: "default_incomplete"`, inline
  `price_data` with a per-plan Product resolved by `ensureProduct` — the
  Subscriptions API needs a Product ID, not `product_data`) and returns
  `{ clientSecret, subscriptionId, customerId }`. Handles CORS + a stale/deleted
  stored customer id.
- **`supabase/functions/cancel-subscription/index.ts`** — Deno edge function
  (reuses `STRIPE_SECRET_KEY`). Cancels the caller's still-billing subscriptions.
  Body options: `atPeriodEnd` (default true → `cancel_at_period_end`; false →
  immediate `subscriptions.cancel`) and `exceptSubscriptionId` (skip one — the
  brand-new sub during a plan change). Returns `{ ok, canceled, periodEnd }`.
- **`supabase/functions/reactivate-subscription/index.ts`** — Deno edge function
  (reuses `STRIPE_SECRET_KEY`). Clears `cancel_at_period_end` on the caller's
  subscriptions to undo a scheduled cancellation. Returns `{ ok, reactivated }`.
- **`utils.js` `createSubscription({ plan, billing })`** / `cancelSubscription()`
  / `reactivateSubscription()` — thin `supabase.functions.invoke(…)` wrappers;
  each returns `{ data }` or `{ error: { message } }` (unwraps the function's
  JSON error). `cancelSubscription` records `plan_cancels_at` = the period end
  (Stripe's `periodEnd`, else the computed `nextBillingDate`) — it does **not**
  downgrade the plan; `reactivateSubscription` clears `plan_cancels_at`.
- **`CheckoutPage.js`** — wraps the form in `<Elements>`; the inner
  `CheckoutForm` calls `createSubscription()` then `confirmCardPayment()`. Free
  plans never hit Stripe. The card is tokenized by Stripe's iframes — raw card
  data never touches our React state or the network.

**Plan changes** (Plus⇄Pro⇄Max, monthly⇄annual) all flow through `/checkout`,
which **replaces** the subscription (per the create-new-then-cancel-old pattern):
- `detectPlanChange(session, plan, billing)` (`utils.js`) classifies the action —
  `purchase` / `upgrade` / `downgrade` / `billing_change` / `current` — from the
  CURRENT plan + billing. It drives the `/plans` button labels (Upgrade /
  Downgrade / Switch to annual·monthly / Current Plan, billing-aware) and is
  recomputed in CheckoutForm from the live billing toggle.
- After the new subscription is paid: `finalizePlan()` writes the new plan, then
  for a change `cancelStripeSubscriptions({ exceptSubscriptionId: <new sub>,
  atPeriodEnd })` cancels the OLD sub — **immediately** for upgrade / billing
  switch, **at period end** for downgrade (`utils.js` → cancel-subscription edge
  fn) — leaving the new one alone. Then the matching email fires (see
  "Transactional Email").
- Paid → Free is a "downgrade" handled on `/plans` itself (not `/checkout`): a
  confirm modal → `cancelSubscription({ suppressEmail: true })` (cancel at period
  end) + a `downgrade` email + toast → redirect to `/account`. `cancelSubscription`
  takes `{ suppressEmail }` so this flow sends its own email instead of the
  generic `cancellation` one.

## Transactional Email
Branded yellow/charcoal Fetchit emails for the plan lifecycle events + account
deletion, sent via the **Resend API**.

- **`supabase/functions/send-email/index.ts`** — Deno edge function. Sends via a
  `fetch` to `https://api.resend.com/emails` (`Authorization: Bearer
  <RESEND_API_KEY>`); `from` defaults to `onboarding@resend.dev` until a domain
  is verified. (The body's deletion `token` is destructured as `deleteToken` to
  avoid shadowing the JWT `token`.)
  Authenticates the caller from their JWT and **always sends to that user's own
  email** (the client can't address arbitrary inboxes). The templates AND the
  pricing/usage/date data live server-side; the client only sends
  `{ type, plan, billing, dateISO, appOrigin, fromPlan, token }`. `type`s:
  - `purchase` → "Welcome to Fetchit <Plan>! 🐕"; plan, price/mo, billing period,
    next billing date (now + interval if no `dateISO`), usage "Up to <2x/5x/25x>
    Free usage". (Upgrades reuse this template.)
  - `cancellation` → "Your Fetchit subscription has been cancelled"; plan, keep
    access until `dateISO`, no-refund note, **Reactivate** button → `<origin>/account`.
  - `reactivation` → "Your Fetchit <Plan> is back! 🐕"; plan active, next billing date.
  - `downgrade` → paid→paid: "Your Fetchit plan has been updated" / "…active
    immediately." paid→**Free**: "Your Fetchit plan is changing to Free" / keep
    access to <fromPlan> until `dateISO`, then moves to Free, no refund, +
    Reactivate button.
  - `billing_change` → "Your Fetchit billing has been updated"; "You've switched
    to <monthly/annual> billing for Fetchit <Plan>. New billing date: <date>."
  - `deletion_confirm` → "Confirm your Fetchit account deletion"; scary red
    template, **Proceed with deletion** button → `<origin>/account?type=deletion&token=<token>`,
    "⚠️ This action cannot be undone", 1-hour expiry. (See Account Settings.)
- **`utils.js` `sendPlanEmail(payload)`** — fire-and-forget
  `supabase.functions.invoke("send-email", …)` (adds `appOrigin`). Sent by
  **CheckoutPage** after a paid action (`purchase`/upgrade → `purchase`;
  `downgrade`; `billing_change`), and by `cancelSubscription()` (`cancellation`)
  / `reactivateSubscription()` (`reactivation`). `finalizePlan()` no longer
  sends email — CheckoutPage owns it so the right template fires per scenario.

## Landing pricing
The landing Pricing buttons route via `routePlanSelection`: logged in → straight
to `/checkout` (skips `/plans`); logged out → save the plan and go to `/login`
(which resumes it after sign-in). Free skips payment and goes to `/chat`. The
ChatMockup demo still opens the early-access email `Modal` + `Toast`.

## Tech Stack
- React 18 + react-scripts 5 (Create React App)
- React Router v6 (`react-router-dom`) for all routes
- Plain CSS, one `.css` file per component (global class names, no CSS modules)
- **Supabase** (`@supabase/supabase-js`) for auth + the `chats`/`orders` tables
  + the `create-subscription` Edge Function; the early-access signups list and
  the transient pending-plan still use `localStorage`
- **Stripe** (`@stripe/stripe-js` + `@stripe/react-stripe-js`) for real
  test-mode subscriptions on `/checkout` (Elements + the edge function — see
  "Stripe Payments").
- The "auto checkout (Puppeteer)" feature is still product copy / mock UI — not a
  real integration.

## File Structure
```
supabase/schema.sql           # chats + orders + sessions tables and RLS policies (run once)
supabase/functions/create-subscription/index.ts  # Stripe customer + subscription (secret key)
supabase/functions/cancel-subscription/index.ts  # cancel subscription at period end (secret key)
supabase/functions/reactivate-subscription/index.ts  # undo a scheduled cancellation (secret key)
supabase/functions/send-email/index.ts  # branded purchase/cancel/reactivate emails via Resend API
src/
├── index.js / index.css      # entry + global reset, palette, .visually-hidden
├── App.js / App.css          # React Router routes (AuthProvider), shared styles
├── supabaseClient.js         # shared Supabase client (URL + anon key)
├── stripeClient.js           # Stripe publishable key, stripePromise, plan pricing
├── AuthContext.js            # AuthProvider + useAuth() (live session, loading)
├── utils.js                  # email validation, signups, Supabase auth/chats/orders, createSubscription
└── components/
    ├── Navbar.js/.css         # sticky nav + hamburger (landing)
    ├── Hero.js/.css           # headline + "See How It Works"
    ├── ChatMockup.js/.css     # landing interactive AI chat demo (auto-play, buy flow)
    ├── ProductCard.js/.css    # product card (used by chat demo + chat page)
    ├── HowItWorks.js/.css     # 3 steps
    ├── Features.js/.css       # 4 feature cards
    ├── SocialProof.js/.css    # stats band
    ├── Pricing.js/.css        # Free / Plus / Pro / Max + Monthly/Annual toggle
    ├── FAQ.js/.css            # accordion
    ├── Footer.js/.css         # tagline + links
    ├── Modal.js/.css          # email capture modal (focus trap, Escape)
    ├── Toast.js/.css          # bottom-right toast (3s auto-dismiss)
    ├── Reveal.js              # IntersectionObserver scroll-reveal wrapper
    ├── AdminPage.js/.css      # /admin signups table
    ├── AuthLayout.js/.css     # dark centered shell for auth pages (+ form styles)
    ├── SignupPage.js          # /signup — email + password
    ├── LoginPage.js/.css      # /login — email + password (+ forgot-password)
    ├── ResetPasswordPage.js/.css # /reset-password — set new password via link
    ├── PlansPage.js/.css      # /plans (reuses Pricing.css card styles)
    ├── CheckoutPage.js/.css   # /checkout — real Stripe Elements form + success
    ├── OnboardingPage.js/.css # /onboarding — optional first/last name collection
    ├── ChatPage.js/.css       # /chat — full-screen chat app (history + incognito)
    ├── AccountPage.js/.css    # /account — profile, password, delete account
    └── ChatSidebar.js/.css    # /chat left sidebar — history list + New Chat + Incognito
```

## Conventions
- Keep the yellow/orange/charcoal palette and the playful, friendly voice.
- One CSS file per component; reuse CSS variables from `index.css`.
- Respect `prefers-reduced-motion` for any new animation.
- `CI=true npm run build` fails on ESLint warnings — keep React hook
  dependency arrays clean (e.g. the chat demo uses a "latest-ref" pattern so the
  observer effect can keep `[]` deps).
