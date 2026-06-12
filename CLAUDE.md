# FetchIt — AI Shopping Assistant

## Project Overview
FetchIt is a friendly AI-powered shopping agent. You chat with FetchIt's AI in
natural language, it returns personalized product picks (with photos, prices,
and verified reviews), and — once you pick one — it checks out for you
automatically in the background. Built as a React (Create React App) landing
page with plain CSS, no UI libraries. Auth, chat history, and order history are
backed by **Supabase** (`@supabase/supabase-js`); see "Supabase Backend" below.

## Branding
- **Name:** **FetchIt** (capital I, matching the logo). All user-facing text uses
  "FetchIt"; lowercase `fetchit` is reserved for code (storage keys like
  `fetchit_*`, the `fetchit.app` mock domain, `fetchit-logo.png`, the `fetchit-app`
  dir) and must stay lowercase. All-caps "FETCHIT" (e.g. TOS legalese) stays.
- **Tagline:** Your shopping best friend
- **Personality:** Friendly, fun, playful — like a dog that fetches deals
- **Logo:** a single image file at **`public/fetchit-logo.png`** (square ~1254×1254
  yellow badge — the dog + "FetchIt" wordmark + tagline; the yellow background
  blends with the palette). It's rendered via `<img className="logo-img">` (global
  style in `App.css`) wherever the brand mark appears — Navbar, Footer, the chat
  header + sidebar, all auth/onboarding pages (`AuthLayout`), the
  account/cards/orders/family/TOS top bars, AND the mock-chat assistant avatar
  (`.avatar-img`). The landing **Hero** shows it large (`.hero-logo`, tagline
  legible); tight bars show it small (~44px). It's also the browser-tab
  **favicon** + apple-touch-icon (`public/index.html`), and the **email** header
  (the edge functions render `<img src="${appOrigin}/fetchit-logo.png">` when an
  origin is supplied, falling back to an emoji-tile + "FetchIt" wordmark). The old
  emoji-tile + wordmark (`.logo-mark` / `.logo-text`) is retired (styles kept in
  `App.css`). Note: decorative 🐕 elsewhere (real chat avatar, toasts, copy like
  "Check your email 🐕") is NOT branding and is left as-is.

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
Providers → Email, keep "Confirm email" enabled (signup email verification).
Under Auth → Providers → **Google**, enable it and set the Google OAuth client
ID/secret (powers "Continue with Google" — see "Google OAuth"). In Auth → URL
Configuration → Redirect URLs, allow your origin (a wildcard like
`http://localhost:3000/**` covers `/terms` (signup verification target),
`/account`, `/account?type=deletion`, `/reset-password`, and `/auth/callback`
(Google OAuth landing)). Credentials live in `src/supabaseClient.js`. (Login
confirmation no longer needs a redirect URL — it uses a reauthentication
**code**, not a link.)

**Email templates — one purpose each:**
- **Confirm signup** → signup email verification (`signUp`).
- **Reset Password** → password change/reset (`resetPasswordForEmail`).
- **Magic Link** → **login OTP only** (`signInWithOtp` → 6-digit code, no
  `emailRedirectTo`). Its body must include **`{{ .Token }}`** so the code shows;
  copy e.g. "Your FetchIt sign-in code is below 🐕".
- **Account deletion** and all plan emails (purchase/cancel/reactivate/etc.) go
  through the **send-email** edge function (Resend API), NOT a Supabase
  template — so deletion has its own branded "Confirm your FetchIt account
  deletion" email, fully separate from login.

**Stripe setup (one-time, for real checkout):** deploy the
`create-subscription`, `cancel-subscription`, `reactivate-subscription`,
`create-setup-intent`, and `save-card` Edge Functions (`supabase functions deploy
<name>`) and give them the Stripe **secret** key (`supabase secrets set
STRIPE_SECRET_KEY=sk_test_...` — all five share the one key). The frontend only
holds the **publishable** test key (`src/stripeClient.js`). `create-setup-intent`
+ `save-card` power the address/card collection (Delivery & Payment step +
Cards & Address page). See "Stripe Payments" below. Test mode throughout — no real
charges.

**Email setup (one-time, transactional emails):** deploy the `send-email` Edge
Function (`supabase functions deploy send-email`) and give it the Resend API key
(`supabase secrets set RESEND_API_KEY=re_...`). It sends branded plan + deletion
emails via the **Resend API** (`POST https://api.resend.com/emails`, `fetch`).
The family-sharing functions also use Resend (the same `RESEND_API_KEY`) — deploy
`send-family-invite` and `family-manage` too (and `family-invite` for the join
flow; see "Family Sharing"). Until a domain is verified in Resend, `from` uses
Resend's test sender `onboarding@resend.dev` (delivers only to your Resend account
email). See "Transactional Email" below.

## Page Sections (in order)
1. **Navbar** — sticky; logo, smooth-scroll links (How It Works / Features /
   Pricing), "Try Free" CTA, hamburger menu ≤760px.
2. **Hero** — headline "Shop Smarter. Fetch Faster."; subheading about FetchIt
   searching Amazon, Walmart, Target, Best Buy, AliExpress and more, then buying
   automatically; a **"Shops from:" retailer-badges row** (`.hero-retailers` /
   `.retailer-badge` — charcoal pills with a yellow border, listing all 8
   Zinc-supported retailers: Amazon, Walmart, Target, Best Buy, Costco, Home
   Depot, Lowe's, AliExpress) below the subheading, followed by a muted "Access to
   over 20 million SKUs across all retailers" line (`.hero-skus`); a single "See
   How It Works" button that scrolls to the How It Works section.
3. **Meet FetchIt AI** (`ChatMockup`) — view-only mock chat UI (see below).
4. **How It Works** — 3 steps: Chat with FetchIt AI → Pick from AI-Curated
   Recommendations → FetchIt Buys It For You.
5. **Features** — 5 cards: Shop Everywhere at Once (multi-store search across all
   8 Zinc retailers — Amazon/Walmart/Target/Best Buy/Costco/Home Depot/Lowe's/
   AliExpress — over 20 million products, for the best price), Conversational AI,
   Smart Recommendations, Auto Checkout (Puppeteer-powered), Secure Payments
   (Stripe-powered). The grid is a fixed `repeat(5, 1fr)` — all 5 cards stay on a
   single row at every width; the breakpoints shrink padding/icon/type rather than
   wrapping to more rows.
6. **Social Proof** — 50,000+ shoppers, $2.4M saved this month, 99.8% satisfaction.
7. **Pricing** — 4 tiers, Monthly/Annual toggle ("Save 10%"). Pro is badged
   "Most Popular" (yellow card), Max "Best Value" (orange-framed card). Every card
   shows a "🛍️ Shop across a multitude of retailers" pill (`.plan-retailers`,
   rendered once in JSX so it appears on all plans). See "Pricing Tiers" below for
   prices + features. The toggle is purely a display choice; the per-card billing
   note clarifies it (Plus = "Flat rate, no commitment", Pro/Max annual = "billed
   annually").
8. **FAQ** — 5 accordion items (aria-expanded, animated chevron).
9. **Footer** — tagline "FetchIt — your shopping best friend", links.

## Meet FetchIt AI — Chat Mockup (`ChatMockup.js` / `.css`)
A fully mocked (no real AI), **view-only** chat inside browser-window chrome
(rounded top bar, red/yellow/green dots, "fetchit.app" address bar). Dark
charcoal section background, scrollable chat area, input bar at the bottom.
**The whole `.browser-window` has `pointer-events: none` (the `is-static`
modifier) and the input + Send button are `disabled`/`readOnly`** — the
conversation auto-plays but the user can't type, send, or buy. The assistant's
avatar is the **FetchIt logo image** (`.avatar-img`, replacing the old 🐕 emoji).

- **Auto-play on scroll into view** (IntersectionObserver, threshold 0.25,
  **replays on every entry** — the observer is NOT disconnected, so scrolling away
  and back resets the demo and replays it from the start each time; each replay
  clears pending timers + empties the message list first): one message every
  1.2s — FetchIt greeting → user (gift for mom, ~$50) → FetchIt follow-up → user
  (60, gardening + tea) → FetchIt "give me a sec 🔍" → typing indicator (2s) → 3
  product cards. (No buy/send handlers — the component takes no `onRequestSignup`
  prop anymore.)
- **Product cards** (`ProductCard.js`): horizontally scrollable, colored
  placeholder image (soft greens/browns + emoji), name, price, star rating,
  1-line description, full-width yellow "Buy This 🐕" button (inert here — the
  cards render but can't be clicked). The three demo products: Premium Tea
  Sampler Gift Set ($34.99, 4.8), Leather Garden Tool Bag ($47.99, 4.6),
  Botanical Herb Starter Kit ($52.00, 4.7).
- **Styling:** FetchIt bubbles `#2A2A2A` with the logo-image avatar; user bubbles
  `#FFD700` charcoal text, right-aligned; 3-dot typing animation; smooth
  auto-scroll to bottom. `prefers-reduced-motion` → all demo messages shown
  instantly, no typing animation.

## Email Signup Flow
- **Pricing buttons** open `Modal` ("Almost there! 🐕", shows selected plan +
  price, email input with validation, "Start Fetching" / "Cancel"). Modal traps
  focus, closes on Escape / overlay click, locks body scroll, restores focus.
- (The view-only chat mockup no longer opens this modal — see "Meet FetchIt AI".)
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
- `/terms` — `TermsAgreementPage` (protected onboarding step: TOS summary +
  agreement checkbox; after email verification, before `/plans`)
- `/tos` — `TosPage` (full Terms of Service; **public**, no login required)
- `/plans` — `PlansPage`, wrapped in `PlansGate` (logged out → `/login`; logged
  in with no plan yet → show; logged in with a plan → `/chat`, unless navigated
  with `state.manage` for an intentional plan change)
- `/auth/callback` — `AuthCallback` (Google OAuth landing; dispatches to
  `/terms` / `/chat` / back to `/signup` / `/login` — see "Google OAuth" below)
- `/checkout` — `CheckoutPage`
- `/delivery-payment` — `DeliveryPaymentPage` (protected onboarding step: shipping
  address + saved card; between checkout and `/onboarding`)
- `/onboarding` — `OnboardingPage` (protected: optional first/last name after a
  plan is picked; "Skip for now" or save → `/chat`)
- `/reset-password` — `ResetPasswordPage` (forgot-password reset link target;
  reverse-protected — only reachable via the email link)
- `/chat` — `ChatPage` (protected: redirects to `/login` if not signed in)
- `/account` — `AccountPage` (protected: profile, password, delete account)
- `/cards-address` — `CardsAddressPage` (protected; password reauth wall, then
  shipping address + saved card management)
- `/family-sharing` — `FamilySharingPage` (protected, **Max owners only**; invite
  up to 4 members — non-Max see an upgrade gate; see "Family Sharing")
- `/join-family` — `JoinFamilyPage` (invite landing `?token=…`; **public** —
  validates the token, then create-account / log-in / accept / decline)
- `/orders` — `OrdersAnalytics` (protected: spend analytics + order history)
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
  own `sb-*` keys and survive tab close/reopen. It also defines
  `terminateAccountSession()` + the `ACCOUNT_TERMINATED_*` constants and a custom
  `global.fetch` that 401-terminates an admin-deleted user (see "Instant Account
  Termination").
- **Auth context** — `src/AuthContext.js` (`AuthProvider` + `useAuth()`) resolves
  the initial session once (async) and stays in sync via `onAuthStateChange`.
  `useAuth()` returns `{ session, loading }`; `session.user.email` is the signed-in
  email, `session.user.user_metadata` holds `plan`, `first_name`, `last_name`.
  Components must wait for `loading` to be false before treating "no session" as
  logged-out.
- **Email verification** is ON: `signUp()` returns no session until the user
  clicks the confirmation link (`emailRedirectTo` = `<origin>/terms`).
  `SignupPage` shows a "Check your email 🐕" screen instead of advancing.
  Confirming in the same browser auto-signs-in (detected in the URL) → lands on
  **`/terms`** (the TOS agreement step), which continues to **`/plans`** to pick a
  plan (`PlansGate` shows it because the new user has no plan yet). Add
  `<origin>/terms` to the allowed Redirect URLs.
- **`supabase/schema.sql`** — the `chats`, `orders`, `sessions`, `weekly_usage`,
  `profiles`, `family_invites`, and `family_members` tables + RLS policies, plus
  the `delete_user()` RPC (SECURITY DEFINER, deletes `auth.uid()`; chats, orders,
  sessions, weekly usage, profile, and family invites/memberships cascade). Run it
  once in the Supabase SQL editor. `user_id` defaults to `auth.uid()`, so the
  client never sends it. (`sessions` + `weekly_usage` back the per-plan token/usage
  limits — see "Usage Limits". `family_invites` / `family_members` are RLS-scoped
  to `owner_id` and back Family Sharing — see that section.
  `profiles` holds the shipping address + Stripe customer/card pointers + TOS
  acceptance (`tos_accepted` / `tos_accepted_at`, written at the `/terms` step) —
  one row per user, keyed by `user_id`, written across the `/terms` and Delivery &
  Payment steps and edited on `/cards-address`.)

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
the account-termination helpers `checkAccountStatus()`/`enforceAccountStatus()`/
`guardAuthError(error)` + the re-exported `terminateAccountSession()`/
`ACCOUNT_TERMINATED_KEY`/`ACCOUNT_TERMINATED_MESSAGE` (see "Instant Account
Termination"),
the provider/reauth helpers `userProviders(session)`/`hasPasswordIdentity(session)`/
`isGoogleUser(session)` + `startGoogleReauth(purpose, returnTo)`/
`consumeReauthResult(purpose)` (see "Reauthentication"),
`getChats()`/`saveChat(chat)`/`deleteChat(id)`, `saveOrder({productName, price,
category, …})`/`getOrders()`, the address/card helpers `createSetupIntent()`/
`saveCard(pmId)` and `getProfile()`/`saveProfile(fields)` (the `profiles` table),
the family-sharing helpers `isMaxOwner(session)`/`isFamilyMember(session)`/
`planDisplayName(plan)`/`familyOwnerLabel(session)`/`familyDisbandAt(session)`/
`familyDisbandDue(session)`, `getFamilyData()`/`sendFamilyInvite(email)`/
`removeFamilyMember(id)`/`disbandFamily()`/`scheduleFamilyDisband(dateISO)`/
`unscheduleFamilyDisband()`/`leaveFamily()` and the join-flow
`validateFamilyInvite`/`acceptFamilyInvite`/`declineFamilyInvite`/
`maybeAcceptPendingInvite()` + invite-token storage
`setFamilyInviteToken`/`getFamilyInviteToken`/`clearFamilyInviteToken` (see
"Family Sharing"), plus the usage-limit helpers (INTERNAL, see "Usage Limits"):
`TOKEN_LIMITS`/`tokenLimit(plan)`, `WEEKLY_TOKEN_LIMITS`/`weeklyTokenLimit(plan)`,
`SESSION_WINDOW_MS`, `WEEK_WINDOW_MS`, `NEXT_PLAN`,
`estimateTokens(text)`, `formatResetIn(start)`, `getOrCreateSession(plan)`/
`getActiveSession()`/`addSessionTokens(id, used, n)`/`isSessionExpired(s)`, and
the weekly equivalents `weekStartMs()`/`nextWeeklyReset()`/`isWeekExpired(w)`/
`getActiveWeeklyUsage()`/`getOrCreateWeeklyUsage(plan)`/`addWeeklyTokens(id, used, n)`.
Still localStorage (demo only, no account): `getSignups`/
`saveSignup`/`clearSignups` (admin list) and `setPendingPlan`/`getPendingPlan`/
`clearPendingPlan` (transient plan-resume). The shared
`routePlanSelection(plan, navigate, session)` in `App.js` decides where a
pricing-card click goes.

## Signup & Plan Flow
The happy path is **signup → verify email → /terms → /plans → (Free or paid:
/checkout) → /delivery-payment → /onboarding → /chat**. `/terms` ("Before we get
started") is the TOS agreement step; `/delivery-payment` ("Almost there!")
collects the shipping address + a saved card; `/onboarding` ("One last thing!")
collects the display name. Both come *after* a plan is
picked, and both are skippable (address/card editable later in `/cards-address`,
name in `/account`). Signup itself never collects a name. Routes that should only show
when logged out (`/`, `/login`, `/signup`, `*`) are wrapped in `RedirectIfAuthed`
(renders nothing while `loading`, redirects to `/chat` when a session exists,
else shows the page); `/plans` has its own `PlansGate` (see Routes).

Flow:
1. **Navbar** (landing): "Sign In" → `/login`, "Create Account" → `/signup`.
2. **Signup** (`/signup`): email + password (show/hide toggle). Validates email
   format + password ≥8 chars → `signUp(email, password)`. Because email
   verification is on, no session is created yet → shows the "Check your email"
   screen. The confirmation link (`emailRedirectTo` = `<origin>/terms`) returns
   the now-signed-in, plan-less user to **`/terms`** (the TOS step → `/plans`).
   Supabase errors (e.g. user
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
4. **Terms** (`/terms`, `TermsAgreementPage`): protected "Before we get started"
   card (reuses `AuthLayout`/`.auth-card`) shown right after verification, before
   plans. A SUMMARY of key points (service fee on every order · shopping data may
   train AI models · 18+ only · orders via third-party retailers — NOT the full
   TOS), a "Read full Terms of Service ↗" link opening **`/tos`** in a new tab, and
   a single agreement **checkbox** ("I have read and agree to the Terms of Service
   and Privacy Policy"). No scrolling required. **Continue** is disabled until the
   box is checked → `saveProfile({ tosAccepted: true, tosAcceptedAt })` (creates
   the `profiles` row) → `/plans`.
5. **Plans** (`/plans`, gated by `PlansGate`): "Choose your plan" + the 4 tiers
   (Free/Plus/Pro/Max) + Monthly/Annual toggle (Save 10%).
   Free → if logged in `finalizePlan("Free")` → `/delivery-payment`, else save pending → `/login`.
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
6. **Checkout** (`/checkout`): **real Stripe Elements** (see "Stripe Payments").
   Monthly/Annual toggle (seeded from the plan-page choice, Save 10%) + summary
   pill (plan + per-month price) + billing note. Cardholder name input + Stripe
   `CardNumber`/`CardExpiry`/`CardCvc` Elements (secure, Stripe-hosted iframes
   styled to match the cream inputs), "🔒 Secured by Stripe" + a test-card hint.
   Submit → `createSubscription()` (edge function makes the customer +
   subscription) → `stripe.confirmCardPayment(clientSecret, …)` → on
   `succeeded`/`processing` `finalizePlan(plan, billing)` (stamps billing period
   + start date) → "✅ You're all set! 🐕" → after 2s **`/delivery-payment`**. Free
   never reaches here (routes straight to `/delivery-payment`); a Free plan in nav
   state is bounced there defensively.
7. **Delivery & Payment** (`/delivery-payment`, `DeliveryPaymentPage`): protected
   step (reuses `AuthLayout`/`.auth-card`). "Almost there! 🐕" — shipping address
   (full name, address line 1, line 2 optional, city, state, ZIP, country default
   "United States") + a card via Stripe `CardNumber`/`CardExpiry`/`CardCvc`
   Elements. Submit → `createSetupIntent()` (edge fn: reuse/create the SAME Stripe
   customer + a SetupIntent, no charge) → `stripe.confirmCardSetup(…)` (card
   tokenized in-browser) → `saveCard(pmId)` (edge fn: set default PM + return
   brand/last4/expiry) → `saveProfile(…)` (writes the **`profiles`** row: address,
   `stripe_customer_id`, `stripe_payment_method_id`, display card metadata) →
   `/onboarding`. "Skip for now" → `/onboarding` without saving (address/card can
   be added later in `/cards-address`).
8. **Onboarding** (`/onboarding`, `OnboardingPage`): protected name-collection
   card (reuses `AuthLayout`/`.auth-card`). "One last thing! 🐕" + first/last
   name → `saveName()` (→ `user_metadata.first_name/last_name`) → `/chat`. "Skip
   for now" goes to `/chat` without saving a name. **Either way** (Save or Skip)
   completing this step calls `markRegistered()` — the final commit of signup —
   so a Google account abandoned before here stays un-registered (see "Google
   OAuth").
9. **Chat** (`/chat`): full-screen dark app, protected (no session → `/login`).
   Left **sidebar** (`ChatSidebar`, 280px, `#111`): FetchIt logo, yellow "New
   Chat" button, scrollable list of this user's past chats (title = first message
   truncated to 40 chars, date/time, hover-reveal trash to delete with confirm),
   and an "🕵️ Incognito" button at the bottom. Top bar: logo + account dropdown
   (shows "Hi, &lt;First Name&gt; 👋", or the email if no name; menu has **Account
   Settings** → `/account`, **Cards & Address** → `/cards-address`, **Family
   Sharing** → `/family-sharing` (Max owners AND `max_family` members), **Orders &
   Analytics** →
   `/orders`, **Log Out**, and **Terms of Service** → `/tos` at the very bottom);
   a hamburger appears ≤768px to toggle
   the sidebar as an animated
   overlay. Empty state: 🐕 + "What can we get you?" + 3 suggestion chips. Fixed
   bottom input. Sending a message (or chip) fades the empty state, shows the user
   bubble, a typing indicator → (1.5s) "Got it! Let me find the best options for
   you... 🔍" → (2.5s later) 3 keyword-matched product cards (gift / coffee /
   headphones, default gift). "Buy This 🐕" → progress bar → "✅ Done!".

## Google OAuth (Sign up / Log in with Google)
Both `/signup` and `/login` show a **"Continue with Google"** button
(`GoogleButton`, styled by `.google-btn` in `AuthLayout.css`) above an "or"
divider and the email/password form. One Supabase provider sign-in
(`signInWithGoogle(intent)` → `supabase.auth.signInWithOAuth({ provider:
"google", redirectTo: <origin>/auth/callback })`) backs **both** flows — Supabase
auto-creates the account on first OAuth sign-in, so "sign up only" vs "log in
only" can't be expressed to Supabase directly. Two app-owned mechanisms bridge
that gap:
- **Intent** — `signInWithGoogle` stashes `"signup"` or `"login"` in
  `sessionStorage` (`OAUTH_INTENT_KEY`) before the redirect; `AuthCallback` reads
  it back after the round-trip.
- **Registered flag** — `user_metadata.fetchit_registered` (`isRegistered()` /
  `markRegistered()`), set only when the user **completes the `/onboarding` name
  step** (Save OR "Skip for now" — `OnboardingPage`), NOT at the `/plans`
  hand-off. This flag — NOT mere existence in `auth.users` — is the source of
  truth for "has a FetchIt account", so two kinds of half-finished account stay
  *un*-registered and are sent back through the full signup flow next time: one
  Google auto-creates during an accidental "Log in with Google", and one from a
  signup abandoned before onboarding finishes. (Also avoids a deadlock — a later
  real signup still proceeds since signup keys off the flag, not existence.)

**`/auth/callback`** (`AuthCallback`) waits for `detectSessionInUrl` to establish
the session (via `useAuth()`), then dispatches on `{ intent, registered }`:
- **Sign up**, already registered → stash `OAUTH_ERROR_KEY="signup_exists"`,
  sign out, → `/signup`, which shows **"An account already exists with this
  Google account. Please log in instead."** (link → `/login`).
- **Sign up**, new → **`/plans`** (pick Free/Plus/Pro/Max). From there the normal
  plan flow runs: paid → `/checkout` → `/onboarding` ("One last thing!" display
  name) → `/chat`; Free → `/onboarding` → `/chat`. The account is marked
  registered only when `/onboarding` completes (`markRegistered()` on Save or
  Skip) — abandoning before then leaves it un-registered, so the next Google
  login is rejected ("no account found") and a fresh signup re-runs the flow.
- **Log in**, already registered → **`/chat`**.
- **Log in**, new (no account) → stash `OAUTH_ERROR_KEY="login_noaccount"`, sign
  out, → `/login`, which shows **"No account found with this Google account.
  Please sign up instead."** (link → `/signup`).

If OAuth is cancelled/fails (no session after a short wait), `AuthCallback`
returns to `/signup` or `/login` per the stored intent. The "rejected" branches
sign the transient session out and set `fetchit_oauth_error`; `RedirectIfAuthed`
treats that flag (like `fetchit_login_pending`) as a reason NOT to bounce to
`/chat` while the session drains and the message renders.

**Supabase setup (one-time):** enable **Google** under Auth → Providers (set the
Google client ID/secret), and ensure `<origin>/auth/callback` (signup/login) AND
the reauth return paths `<origin>/account` + `<origin>/cards-address` are allowed
in Auth → URL Configuration → Redirect URLs (the `http://localhost:3000/**`
wildcard already covers all of them).

### Reauthentication — `ReauthGate` (provider-aware identity confirmation)
Google-only users have no password, so every password-gated area branches on the
auth **provider**. Detection (`utils.js`): `userProviders(session)` reads the
user's `identities` (fallback `app_metadata.provider`); `hasPasswordIdentity()`
= has an "email" identity; `isGoogleUser()` = google **and** no email identity.

**`<ReauthGate>`** (`ReauthGate.js` / `.css`) is the single reusable gate used by
every such area — it renders the right confirmation UI for the signed-in user:
- **Email/password** → password form → `verifyPassword(pw)` → on success calls
  `onVerified()` **synchronously** (inline, no redirect).
- **Google-only** → "Verify with Google" button → `startGoogleReauth(purpose,
  returnTo)` → Supabase `signInWithOAuth` (account chooser forced, `redirectTo`
  = the gated page itself, NOT `/auth/callback`). This is a **redirect
  round-trip**: the page must call `consumeReauthResult(purpose)` on mount and
  run the SAME post-verify action. `purpose` (a unique string) ties the two
  together; `startGoogleReauth` stashes it in `sessionStorage` and
  `consumeReauthResult` returns true exactly once on return.

  **Hardening (anti-bypass).** The marker alone isn't trusted —
  `consumeReauthResult` *also* requires that the current page load actually
  carried a fresh Google OAuth response. `utils.js` captures `OAUTH_RETURN_PRESENT`
  **synchronously at module load** (before Supabase's `detectSessionInUrl` strips
  the URL — the same trick as App.js's `URL_RETURN`): true only if the URL has an
  implicit-flow `access_token`/`refresh_token` in the hash or a PKCE `code` in the
  query. A user who **cancels at Google and navigates back manually** has the
  stale marker but no auth params → `consumeReauthResult` rejects it and clears
  the marker (so it can't be replayed), and the wall stays locked.

Props: `purpose`, `returnTo`, `onVerified`, `title?`, `description?`,
`submitLabel?`, `theme` ("dark" for account pages / "light" for modals). Current
consumers: the **Cards & Address** wall (`purpose="cards-address"`, dark) and the
**account-deletion** "Verify it's you" modal (`purpose="delete-account"`, light).
To gate a new area: render `<ReauthGate>` with a unique `purpose`, and on mount
`if (consumeReauthResult(<purpose>)) <runTheGatedAction>()` so the Google
redirect-return resumes it. The change-password area instead **hides** the form
for Google users (no password exists — shows the managed-by-Google note).

## Chat history & Incognito (`ChatPage` + `ChatSidebar`)
- Each conversation is a row in the Supabase **`chats`** table
  `{ id (client-generated uuid), title, messages (jsonb), created_at }`
  (transient typing/progress bubbles are stripped before saving; chat ids use
  `crypto.randomUUID()`). RLS scopes rows to `auth.uid()` — accounts never see
  each other's chats. After each save the list is re-fetched via `getChats()`.
  "New Chat" resets to the empty state; clicking a past chat restores its
  messages (including product cards); the trash icon deletes the row.
- Each "Buy This 🐕" inserts an **`orders`** row `{ product_name, product_image,
  retailer, category, order_price, service_fee, zinc_order_id, status:
  'completed' }` (fire-and-forget, RLS-scoped). `category` is the product
  category from Zinc's response (mocked per demo product in `ChatPage`) and
  powers the analytics breakdown. `service_fee` is FetchIt's tiered checkout fee
  (`serviceFeeFor()` in `utils.js`): orders under $20 → flat $2.00; orders $20
  and over → $1.00 + 5% of `order_price` (`SERVICE_FEE_FLAT` /
  `SERVICE_FEE_THRESHOLD` / `SERVICE_FEE_BASE` / `SERVICE_FEE_RATE`). These rows
  back the **Orders & Analytics** page (see Routes → `/orders`).
- Each send is metered against the plan's token budgets (the **`sessions`** 5-hour
  window AND the **`weekly_usage`** weekly window) and may surface a session- or
  weekly-"limit reached" message — INTERNAL, see "Usage Limits".
- **Incognito** (sidebar button): hides the sidebar, shows a "🕵️ Incognito Mode"
  badge + "Exit Incognito" button in the top bar, tints the chat `#1A1A2E`, and
  shows a "this chat won't be saved" banner. Nothing is written to Supabase
  while incognito. "Exit Incognito" restores the sidebar and normal mode.
  Incognito is component state only — a page refresh resets to normal.

**Sign out** (account dropdown → Log Out) calls `signOut()` and redirects to
`/` (the landing page); the account stays in Supabase so the user can sign back
in. Visiting `/chat` directly with no session still redirects to `/login`.

## Instant Account Termination (admin-deleted user)
When an admin deletes a user from the Supabase dashboard, that user's JWT stays
valid for up to ~1 hour, so they'd otherwise remain logged in. FetchIt detects
this and force-logs-them-out almost immediately, two complementary ways, both
funnelling into the single **`terminateAccountSession()`** (in
`src/supabaseClient.js` — kept there, not `utils.js`, so the guarded fetch can
use it without a circular import; `utils.js` re-exports it): a hard local
sign-out (`signOut({ scope: "local" })`), `localStorage.clear()` +
`sessionStorage.clear()`, then sets the `fetchit_account_terminated`
sessionStorage flag (after the clear, so it survives) and hard-redirects to
`/login` (`window.location.assign`, or `reload` if already there). A
re-entrancy guard runs the teardown once even if many calls fail at once.

- **`supabase/functions/check-account-status/index.ts`** — Deno edge function
  (service role; no extra secrets — uses the injected `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY`). Authenticates the caller from their JWT and
  checks they still exist in `auth.users` (`admin.auth.getUser(token)`, with a
  secondary `admin.auth.admin.getUserById(sub)` confirm by the decoded `sub`),
  returning **`{ active: true }`** or **`{ active: false }`**. Deleted users
  (valid-but-orphaned JWT) → `{ active: false }`. Fails OPEN (`active: true`) on
  unexpected/transient errors so a glitch never locks legitimate users out.
  Deploy: `supabase functions deploy check-account-status`.
- **`AccountStatusWatcher`** (global, in `App.js`, mounted beside
  `PlanChangeWatcher`) — while logged in, calls `enforceAccountStatus()`
  (`utils.js`: `checkAccountStatus()` → terminate on a definitive `false`) **on
  page load, every 60 seconds, and on every tab focus / visibility regain**.
  Skips the check when the tab is hidden or there's no session.
- **401 catch-all** — a custom `global.fetch` wrapper in `supabaseClient.js`
  terminates on a **401** from any PostgREST (`/rest/v1/`) or Edge Function
  (`/functions/v1/`) call *while a session is stored* — but NOT from `/auth/v1/`
  (where 400/401/403 are normal during sign-in / OTP / reauth and must not nuke
  the session). As belt-and-suspenders, `utils.js` data wrappers
  (`getChats`/`saveChat`/`deleteChat`/`saveOrder`/`getOrders`/`getProfile`/
  `saveProfile`) also call **`guardAuthError(error)`** in their error branches,
  which terminates on a 401 / `PGRST301` / JWT / "user not found" error.
- **Message** — after termination, `/login` reads the
  `fetchit_account_terminated` flag (`ACCOUNT_TERMINATED_KEY` /
  `ACCOUNT_TERMINATED_MESSAGE` from `utils.js`, re-exported from
  `supabaseClient.js`) and shows *"Your account has been terminated. Please
  contact support if you believe this is an error."* once (the flag is cleared on
  read).
- `checkAccountStatus()` / `enforceAccountStatus()` **fail open** (return
  `active: true`) when logged out or on any transient/network error — only a
  definitive `{ active: false }` (or 401) terminates.

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
  card → opens a confirm modal ("Are you sure…?", "You'll keep access to FetchIt
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
- **Change password** — **Google-only accounts** (`isGoogleUser(session)`) have
  no password, so this section instead shows: *"Your account uses Google Sign-In.
  Password changes are managed through your Google account."* Email/password
  accounts get the email-confirmed two-step flow:
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
  confirmation email template (subject "Confirm your FetchIt password change")
  lives in `supabase/schema.sql` comments — paste it into the dashboard's
  **Reset Password** template, and add `<origin>/account` to the allowed
  Redirect URLs.
- **Danger zone** — identity-verified, email-confirmed, multi-step deletion:
  1. Red outlined "Delete my account" → **"Verify it's you"** modal containing a
     shared **`<ReauthGate purpose="delete-account">`** (see "Reauthentication"):
     password users confirm with their password, Google-only users with "Verify
     with Google". On success the modal closes and `sendAccountDeletionEmail()`
     fires (`beginAccountDeletionEmail`, the shared post-verify action — also
     re-run on mount via `consumeReauthResult("delete-account")` after a Google
     redirect): it mints a one-time token (stored in
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

## Cards & Address — `/cards-address` (`CardsAddressPage.js` / `.css`)
Reached from the chat account dropdown → "Cards & Address". Protected (no session
→ `/login`). Dark charcoal shell + top bar (reuses `AccountPage.css`): back arrow
→ `/chat`, logo, "Cards & Address" title. Wrapped in `<Elements>` so the card
sub-form can use the Stripe hooks.
- **Reauthentication wall (first).** On entry the page shows ONLY a "Confirm it's
  you" card (🔒) built from the shared **`<ReauthGate>`** (see "Reauthentication").
  Password users get a password form; Google-only users get a "Verify with Google"
  button. Only once verified does `unlocked` flip and the profile load
  (`getProfile()`) — no address/card details render until then. (Google verify is
  a redirect round-trip back to `/cards-address`, caught on mount by
  `consumeReauthResult("cards-address")`.)
- **Shipping address** — editable form (full name, address line 1, line 2
  optional, city, state, ZIP, country) pre-filled from the `profiles` row. "Save
  changes" → `saveProfile(address)` → toast "Address updated! 🐕".
- **Payment method** — shows the saved card as "Visa •••• 4242 · Expires 08/27"
  (from the display-only `card_*` columns), or "No card on file yet." **Update
  card** / **Add card** reveals dark-styled Stripe `CardNumber`/`CardExpiry`/
  `CardCvc` Elements → `createSetupIntent()` → `stripe.confirmCardSetup(…)` →
  `saveCard(pmId)` → `saveProfile({ stripe_customer_id, stripe_payment_method_id,
  card_* })` → updates the display + toast "Card updated! 🐕". Raw card data never
  hits our servers.

## Family Sharing (Max plan) — `/family-sharing` + `/join-family`
A **Max owner** (real paid Max subscriber) can invite up to **4** people to share
their plan. Each invited member gets their own account with **Max-level** access
(the `max_family` plan — see "Pricing Tiers"), covered by the owner, with no
subscription of their own and no invite powers. The cross-user work (emailing an
arbitrary invitee, reading/accepting an invite as a different/logged-out user,
downgrading a member) runs in three **Edge Functions** with the service role,
since RLS is owner-scoped.

- **Provider/plan helpers** (`utils.js`): `isMaxOwner(session)` (`getPlan === "Max"`),
  `isFamilyMember(session)` (`max_family`), `planDisplayName(plan)`
  (`max_family` → "Max (Family)"). The dropdown shows **Family Sharing** when
  `getPlan(session)` is **`"Max"` OR `"max_family"`** — owners (to manage the
  family) and members (to see who they share with + Leave Family).
- **`/family-sharing` (`FamilySharingPage`)** — protected, three views:
  - **Max owner** — **4 slots** ("Slot 1…4"), each either **Empty** (with an
    **Invite** button) or a filled member (email + "Member"/"Invite pending"
    status + **Remove**). Invite opens a modal → `sendFamilyInvite(email)` →
    `send-family-invite` edge fn (verifies Max + the 4-slot cap, mints a token,
    inserts `family_invites`, emails the invitee via Resend). Remove →
    `removeFamilyMember(inviteId)` → `family-manage` (revokes a pending invite, or
    downgrades + emails an accepted member). Slots come from `getFamilyData()`
    (a read of the owner's non-declined `family_invites`). They **auto-refresh**
    when the owner returns to the tab/window (Page Visibility API + `focus`
    listener) — members accept/decline/leave from their OWN sessions, so the owner
    re-fetches on focus to pick those up (e.g. a freed slot after someone leaves).
  - **`max_family` member** — **read-only**: *"You are part of [owner]'s family
    plan"* (owner from `familyOwnerLabel`) + a **Leave Family** button (confirm →
    `leaveFamily()` → `/plans`). NO slots, NO invite/Remove buttons.
  - **Anyone else** — *"Family Sharing is available on the Max plan"* + upgrade.
- **Invite email** (Resend, in `send-family-invite`) — subject *"[Owner] invited
  you to their FetchIt Max family"*; branded body (Pro-level access, no payment
  needed, covered by the owner) with a big yellow **Accept Invitation** button →
  `<origin>/join-family?token=<token>`.
- **`/join-family?token=…` (`JoinFamilyPage`)** — public. `validateFamilyInvite`
  (`family-invite` action `validate`) checks the token; invalid/used → error.
  Valid:
  - **Logged out** → *"[Owner] invited you to FetchIt Max"* + **Create Account** /
    **Log In** (both stash the token via `setFamilyInviteToken` and route to
    `/signup` / `/login`).
  - **Logged in** → Google avatar (or initials) + name/email + *"[Owner] invited
    you to join their FetchIt Max family plan"* + **Accept** / **Decline**.
    Accept → `acceptFamilyInvite` (`family-invite` `accept`: creates the
    `family_members` row, sets the caller's plan to `max_family`, marks the invite
    accepted, then `refreshSession()`) → `/chat`. Decline → `declineFamilyInvite`
    → `/chat` (or `/` if logged out).
- **Invited signup onboarding** (token stashed in `localStorage` as
  `fetchit_family_invite`): the signup flow **skips plans + payment** but keeps
  TOS + address + name. `/terms` → (token present) `/delivery-payment` **in
  address-only mode** (no card) → `/onboarding` → on completion
  `maybeAcceptPendingInvite()` accepts the invite (sets `max_family`) → `/chat`.
  Existing-user logins via an invite accept immediately in `finishLogin`
  (LoginPage) / `AuthCallback` (Google) before going to `/chat`.
- **Owner leaves Max — two paths:**
  - **Cancel (grace period)** — `cancelSubscription()` (Max) calls
    `scheduleFamilyDisband(periodEnd)` → `family-manage` `schedule`: members
    **keep max_family access until the owner's period end**. It stamps each
    member's `user_metadata.family_disband_at` (mirrored to
    `family_members.pending_disband_at`) and emails them *"access is ending on
    [date]"*. `getPlan()` honors `family_disband_at` — a member reads `max_family`
    until that date, then `Free` (the lazy cutoff). On the member's next app use
    (`ChatPage` or `/account`) `familyDisbandDue(session)` triggers `leaveFamily()`
    to **finalize** (persist Free + remove the membership row). Owner reactivates
    (`reactivateSubscription` on Max) → `unscheduleFamilyDisband()` clears it.
  - **Plan change off Max (immediate)** — a Max→Plus/Pro downgrade in
    `CheckoutPage` (the owner's plan switches now) calls `disbandFamily()` →
    `family-manage` `disband`: **downgrades + emails every member immediately**
    ("access has ended") and clears the rows.
- **Member account view / Leave Family** (`/account`, `max_family`): no billing
  UI; the plan card shows *"You're on a family plan shared by [owner name/email].
  To manage your plan, ask the plan owner or leave the family."* (owner from
  `familyOwnerLabel`, set on the member's metadata at accept) plus a scheduled
  "Access ends [date]" line when applicable. A **Leave Family** button → confirm
  ("Are you sure? You'll be moved to the Free plan.") → `leaveFamily()`
  (`family-manage` `leave`: removes the caller's membership row, **deletes the
  matching `family_invites` row so the owner's slot frees up**, sets their plan to
  Free, `refreshSession()`) → `/plans`. (The same `leaveFamily()` runs in the lazy
  post-disband finalize.) The owner sees the freed slot next time their Family
  Sharing page refreshes on focus.
- **INVARIANT — the owner's plan is never written by family activity.** Only a
  MEMBER's plan ever changes (→ `max_family` on accept, → Free on
  leave/remove/disband). The edge functions enforce this: `family-invite` accept
  rejects a self-accept (`member.id === owner_id`) and only updates a non-owner's
  plan; `family-manage`'s `downgradeNow` early-returns if `memberId === ownerId`
  and only ever downgrades a current `max_family` user; `leave` no-ops unless the
  caller is a `max_family` member. So a Max owner always stays "max" regardless of
  any invite/accept/leave/disband.
- **Removed-member notification (`PlanChangeWatcher` in `App.js`).** When the
  owner removes a member, the edge function downgrades their plan server-side but
  the member's local session keeps showing `max_family` until it refreshes. The
  global `PlanChangeWatcher` fixes this: while the user is `max_family` it calls
  `supabase.auth.refreshSession()` on page load + tab focus/visibility (throttled
  5s) to pull fresh metadata, then watches for the **RAW** plan
  (`planKey(metadata.plan)`) flipping `max_family → Free`. On that transition it
  shows a one-time modal — *"You have been removed from [owner]'s family plan. …
  choose a new plan?"* with **Choose a Plan** (→ `/plans`) and **Stay on Free**
  (dismiss). Persistence/keys are **keyed by user id** (localStorage unless noted):
  `fetchit_last_plan_<uid>` / `fetchit_last_owner_<uid>` = the baseline;
  `fetchit_plan_changed_<uid>` = the pending modal (shown once, cleared on dismiss);
  `fetchit_left_family` (sessionStorage, set by `leaveFamily()`) marks a
  SELF-initiated leave so it's NOT mistaken for a removal. Keying by uid means the
  baseline **never crosses users and isn't cleared on logout** — so a member
  removed *while logged out* still sees the modal on their next fresh sign-in (the
  persisted baseline is `max_family`, but the fresh session reports `Free` →
  transition). Logout only hides the in-memory modal, never the keyed baseline.
  Using the RAW plan (not `getPlan()`) means a *scheduled* disband (plan stays
  `max_family`, `getPlan` goes Free via `family_disband_at`) does NOT fire this
  modal — that path finalizes itself via the lazy `leaveFamily()`.

## Orders & Analytics — `/orders` (`OrdersAnalytics.js` / `.css`)
Reached from the chat account dropdown → "Orders & Analytics". Protected (no
session → `/login`). Dark charcoal shell + top bar (reuses `AccountPage.css`):
back arrow → `/chat`, logo, "Orders & Analytics" title. Loads the user's orders
once via `getOrders()` (RLS-scoped). A two-column grid (`.oa-grid`) that stacks
≤860px:
- **Left — Spend analytics.** Four **spend cards** (Lifetime / Yearly / Monthly /
  Weekly) showing total spent in each period (the Lifetime card is yellow-
  accented). "Spent" per order = `order_price` only (service fee excluded);
  periods are calendar-based in local time (weekly = since this Monday, monthly =
  since the 1st, yearly = since Jan 1; lifetime = all). Below them a **category
  breakdown** panel with four period **tabs** — selecting one shows that period's
  per-category totals as labeled bars (sorted high→low, bar width relative to the
  top category). Empty period → "No spending in this period yet." Computed
  client-side by `spendSummary(orders)` and `categoryBreakdown(orders, period)`
  over the `category` column (`utils.js`; `SPEND_PERIODS` defines the windows).
- **Right — Order history.** The user's orders newest-first in a **fixed-height,
  scrollable** list (`.oa-orders`, themed scrollbar) using the shared order-card
  design (emoji thumb, name, status pill, retailer · category · date, price +
  FetchIt fee). Empty state: 🛍️ + "No orders yet — start shopping!" + a Start
  Shopping button.

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
  `user_metadata.family_members = 5` (0 on every other plan). The owner invites up
  to **4** people via **Family Sharing** (see that section).
- **`max_family`** is a 5th plan key (lowercase, set in `user_metadata.plan` by the
  family-invite accept flow) — an invited member on someone else's Max plan. Same
  token limits + AI access as Max (`TOKEN_LIMITS`/`WEEKLY_TOKEN_LIMITS`/
  `PLAN_USAGE_LABEL` include it), but **no subscription of their own**, **no
  billing/cancel UI** (`isPaid` excludes it on `/account`; shown as "Max (Family)"
  via `planDisplayName`, with a "shared by [owner]" note + **Leave Family** button
  instead of Change Plan), and **no Family Sharing access**. If their owner cancels
  Max they keep access until the period end (`family_disband_at` — `getPlan` honors
  it), then lazily downgrade to Free; if the owner changes plan they're downgraded
  immediately (see Family Sharing).
- User-facing features per plan (NO token numbers ever — see "Usage Limits"):
  - **Free:** Auto checkout · Full chat history · Incognito mode · Email order
    confirmations · Deal alerts · Hassle-free returns · "5 hour sessions, resets
    every 5 hours"
  - **Plus:** Everything in Free · "2x more usage than Free" · Order history &
    spending analytics · Hassle-free returns · Early access to new features ·
    Priority customer support · 5-hour sessions
  - **Pro:** Everything in Plus · "5x more usage than Free" · Priority AI
    processing · Return tracking · Monthly spending report · Price drop
    notifications · 5-hour sessions
  - **Max:** Everything in Pro · "25x more usage than Free" · Up to 5 family
    members · Dedicated support · Early access to new features · 5-hour sessions

## Usage Limits (INTERNAL — never shown to users)
Each plan has a per-session **token budget** that resets every **5 hours**. Token
counts and limits are deliberately invisible in the UI; users only ever see a
friendly "limit reached" message with a reset countdown + upgrade nudge.

- **Limits** (`utils.js` `TOKEN_LIMITS`): Free 50,000 · Plus 130,000 ·
  Pro 325,000 · Max 1,625,000 tokens per 5-hour window. These are the
  authoritative numbers from the **Terms of Service** (Section 6 — the legal
  source of truth), so `TOKEN_LIMITS` MUST stay in sync with `/tos`
  (`TosPage.js`). (Marketing copy still describes tiers as ~2×/5×/25× "more than
  Free" — approximate, not exact multiples of the new Free value.)
- **Weekly caps** (`utils.js` `WEEKLY_TOKEN_LIMITS`, also from TOS §6): Free
  100,000 · Plus 355,000 · Pro 1,811,000 · Max 9,579,000 tokens/week. **Enforced**
  alongside the 5-hour cap (see Storage / ChatPage below).
- **Windows** — two run in parallel: the 5-hour session (`SESSION_WINDOW_MS`,
  rolling) and the weekly window (`WEEK_WINDOW_MS` = 7 days), which **resets every
  Monday at 12:00 AM local time** (`weekStartMs()` anchors the current week's
  Monday-midnight; `nextWeeklyReset()` is the next one). A send is blocked if
  EITHER window is exhausted.
- **Storage** — two Supabase tables, both RLS-scoped per user:
  - **`sessions`** `{ id, user_id, plan, tokens_used, session_start, created_at }`
    — one row per 5-hour window; active = newest row whose `session_start` is
    within the last 5 hours (`getActiveSession`), else a fresh row
    (`getOrCreateSession`); `addSessionTokens` accumulates.
  - **`weekly_usage`** `{ id, user_id, plan, tokens_used, week_start, created_at }`
    — one row per week; `week_start` is that week's Monday 00:00 local. Active =
    newest row whose `week_start` equals the current week's Monday
    (`getActiveWeeklyUsage`/`isWeekExpired`), else a fresh row the new week
    (`getOrCreateWeeklyUsage`, the reset); `addWeeklyTokens` accumulates.
- **ChatPage** (`consumeOrBlock`): on each send (outside incognito) it estimates
  the exchange's tokens (`estimateTokens`, ~4 chars/token — a mock meter, no real
  model), refreshes both windows (rolling them over when expired), and **blocks if
  either limit is reached** (weekly checked first), otherwise records the cost in
  BOTH windows. The block surfaces a `limit` message bubble with `scope`:
  - `scope: "session"` → *"You've reached your session limit 🐕 / Your session
    resets in [X hours X minutes]."*
  - `scope: "weekly"` → *"You've reached your weekly limit 🐕 / Resets Monday at
    midnight."*
  Both append the upgrade nudge *"Upgrade to [next plan] for [2x/5x/25x] more
  usage."* (`NEXT_PLAN`; Max has none) with a button routing to `/plans`.
  **Incognito skips token tracking entirely** (writes nothing to Supabase). Each
  window **fails open** independently — if a table isn't migrated yet, that window
  just isn't metered and chat still works.

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
  (reuses `STRIPE_SECRET_KEY`; Verify JWT ON). Undoes a scheduled cancellation
  end-to-end: (1) auth from JWT; (2/3) finds the caller's subscription(s) via the
  stored `stripe_customer_id` and clears `cancel_at_period_end` in Stripe; (4)
  **clears `plan_cancels_at` in `user_metadata`** so getPlan() keeps returning the
  paid plan (restores the previous plan — the `plan` field is unchanged); (5) if a
  family disband was scheduled (Max owner with members whose `pending_disband_at`
  is set), **calls `family-manage` `unschedule`** (function-to-function, passing
  the owner's JWT) to restore members' access. Returns
  `{ ok, reactivated, plan, familyRestored }`. (NB: `utils.js`
  `reactivateSubscription()` still clears `plan_cancels_at` locally + sends the
  email + calls `unscheduleFamilyDisband()` — those are now idempotent overlaps
  that also refresh the local session.)
- **`supabase/functions/create-setup-intent/index.ts`** — Deno edge function
  (reuses `STRIPE_SECRET_KEY`). **Saves a card without charging** (Delivery &
  Payment step + Cards & Address "update card"). Authenticates the caller, reuses
  or creates the SAME Stripe customer (`stripe_customer_id`), and creates a
  SetupIntent (`usage: "off_session"`). Returns `{ clientSecret, customerId }`;
  the browser confirms with `stripe.confirmCardSetup`.
- **`supabase/functions/save-card/index.ts`** — Deno edge function (reuses
  `STRIPE_SECRET_KEY`). Takes the confirmed `paymentMethodId`, attaches it to the
  customer (idempotent) + sets it as the **default** payment method, and returns
  the NON-sensitive card metadata `{ brand, last4, expMonth, expYear }` for
  display. Raw card data never touches our servers (tokenized by Stripe Elements).
- **`utils.js` `createSubscription({ plan, billing })`** / `cancelSubscription()`
  / `reactivateSubscription()` / `createSetupIntent()` / `saveCard(pmId)` — thin
  `supabase.functions.invoke(…)` wrappers; each returns `{ data }` or `{ error:
  { message } }` (unwraps the function's JSON error). `cancelSubscription` records
  `plan_cancels_at` = the period end (Stripe's `periodEnd`, else the computed
  `nextBillingDate`) — it does **not** downgrade the plan; `reactivateSubscription`
  clears `plan_cancels_at`. `createSetupIntent`/`saveCard` back the address+card
  flows; `getProfile()` / `saveProfile(fields)` read/upsert the `profiles` row.
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
Branded yellow/charcoal FetchIt emails for the plan lifecycle events + account
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
  - `purchase` → "Welcome to FetchIt <Plan>! 🐕"; plan, price/mo, billing period,
    next billing date (now + interval if no `dateISO`), usage "Up to <2x/5x/25x>
    Free usage". (Upgrades reuse this template.)
  - `cancellation` → "Your FetchIt subscription has been cancelled"; plan, keep
    access until `dateISO`, no-refund note, **Reactivate** button → `<origin>/account`.
  - `reactivation` → "Your FetchIt <Plan> is back! 🐕"; plan active, next billing date.
  - `downgrade` → paid→paid: "Your FetchIt plan has been updated" / "…active
    immediately." paid→**Free**: "Your FetchIt plan is changing to Free" / keep
    access to <fromPlan> until `dateISO`, then moves to Free, no refund, +
    Reactivate button.
  - `billing_change` → "Your FetchIt billing has been updated"; "You've switched
    to <monthly/annual> billing for FetchIt <Plan>. New billing date: <date>."
  - `deletion_confirm` → "Confirm your FetchIt account deletion"; scary red
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
(which resumes it after sign-in). Free skips payment and goes to `/chat`. (The
ChatMockup demo is now view-only and no longer triggers the early-access modal.)

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
supabase/schema.sql           # chats + orders + sessions + weekly_usage + profiles + family_invites/members tables and RLS (run once)
supabase/functions/create-subscription/index.ts  # Stripe customer + subscription (secret key)
supabase/functions/cancel-subscription/index.ts  # cancel subscription at period end (secret key)
supabase/functions/reactivate-subscription/index.ts  # undo a scheduled cancellation (secret key)
supabase/functions/create-setup-intent/index.ts  # save a card (SetupIntent, no charge) (secret key)
supabase/functions/save-card/index.ts  # set default PM + return card brand/last4/exp (secret key)
supabase/functions/check-account-status/index.ts  # is the caller still in auth.users? { active } (service role)
supabase/functions/send-email/index.ts  # branded purchase/cancel/reactivate emails via Resend API
supabase/functions/send-family-invite/index.ts  # Max owner invites a family member (Resend) (secret key)
supabase/functions/family-invite/index.ts  # invitee side: validate / accept / decline an invite (service role)
supabase/functions/family-manage/index.ts  # remove / disband / schedule / unschedule (owner) + leave (member) (service role)
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
    ├── SignupPage.js          # /signup — email + password (+ Continue with Google)
    ├── LoginPage.js/.css      # /login — email + password (+ forgot-password, Google)
    ├── GoogleButton.js        # shared "Continue with Google" button (Google G logo)
    ├── AuthCallback.js        # /auth/callback — Google OAuth dispatch (intent + registered)
    ├── ReauthGate.js/.css     # reusable password-or-Google identity confirmation gate
    ├── ResetPasswordPage.js/.css # /reset-password — set new password via link
    ├── TermsAgreementPage.js/.css # /terms — TOS summary + agreement checkbox (onboarding)
    ├── TosPage.js/.css        # /tos — full Terms of Service (public)
    ├── PlansPage.js/.css      # /plans (reuses Pricing.css card styles)
    ├── CheckoutPage.js/.css   # /checkout — real Stripe Elements form + success
    ├── DeliveryPaymentPage.js/.css # /delivery-payment — shipping address + saved card (onboarding)
    ├── OnboardingPage.js/.css # /onboarding — optional first/last name collection
    ├── ChatPage.js/.css       # /chat — full-screen chat app (history + incognito)
    ├── AccountPage.js/.css    # /account — profile, password, delete account
    ├── CardsAddressPage.js/.css # /cards-address — reauth wall + address + saved card
    ├── FamilySharingPage.js/.css # /family-sharing — Max owner: 4 invite slots + invite modal
    ├── JoinFamilyPage.js/.css   # /join-family — invite landing (validate / create / login / accept / decline)
    ├── OrdersAnalytics.js/.css # /orders — spend analytics + scrollable order history
    └── ChatSidebar.js/.css    # /chat left sidebar — history list + New Chat + Incognito
```

## Conventions
- Keep the yellow/orange/charcoal palette and the playful, friendly voice.
- One CSS file per component; reuse CSS variables from `index.css`.
- Respect `prefers-reduced-motion` for any new animation.
- `CI=true npm run build` fails on ESLint warnings — keep React hook
  dependency arrays clean (e.g. the chat demo uses a "latest-ref" pattern so the
  observer effect can keep `[]` deps).
