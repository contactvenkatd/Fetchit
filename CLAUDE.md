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
editor to create the `chats` + `orders` tables and RLS policies. In Auth →
Providers → Email, keep "Confirm email" enabled (signup email verification). In
Auth → URL Configuration → Redirect URLs, allow your origin (a wildcard like
`http://localhost:3000/**` covers `/account`, `/account?type=deletion`, and
`/reset-password`). Credentials live in `src/supabaseClient.js`.

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
7. **Pricing** — Monthly/Annual toggle (annual = 20% off):
   - Free ($0): 3 AI chats/month, manual checkout
   - Plus ($9/mo, $7 annual): unlimited chats, auto checkout, deal alerts
   - Pro ($19/mo, $15 annual): everything in Plus, priority AI, family members,
     return tracking
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
- `/plans` — `PlansPage`
- `/checkout` — `CheckoutPage`
- `/onboarding` — `OnboardingPage` (protected: name collection after plan pick)
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
  clicks the confirmation link (`emailRedirectTo` = app origin). `SignupPage`
  shows a "Check your email 🐕" screen instead of advancing. Confirming in the
  same browser auto-signs-in (detected in the URL) → lands on `/chat`.
- **`supabase/schema.sql`** — the `chats` and `orders` tables + RLS policies,
  plus the `delete_user()` RPC (SECURITY DEFINER, deletes `auth.uid()`; chats and
  orders cascade). Run it once in the Supabase SQL editor. `user_id` defaults to
  `auth.uid()`, so the client never sends it.

`src/utils.js` auth/data helpers (all async, thin wrappers over Supabase):
`signUp(email, password)`, `signIn(email, password)`, `signOut()`,
`getSession()`, `finalizePlan(plan)` (writes `user_metadata.plan`),
`getName(session)` (sync — reads `{firstName, lastName}` from metadata),
`saveName(first, last)`, the email-confirmed password trio
`requestPasswordChange(current)` (re-auths, then emails a link) /
`resendPasswordChangeEmail()` / `applyNewPassword(next)` (sets it in the recovery
session — shared by `/account` and `/reset-password`),
`sendPasswordReset(email)` (forgot-password link → `/reset-password`),
`verifyPassword(pw)` (re-auths to confirm identity before deletion),
`sendAccountDeletionEmail()` (magic link, used for the delete-account
confirmation + resend), `deleteAccount()` (calls the `delete_user()` RPC then
signs out), plus
`getChats()`/`saveChat(chat)`/`deleteChat(id)` and `saveOrder({productName,
price, status})`. Still localStorage (demo only, no account): `getSignups`/
`saveSignup`/`clearSignups` (admin list) and `setPendingPlan`/`getPendingPlan`/
`clearPendingPlan` (transient plan-resume). The shared
`routePlanSelection(plan, navigate, session)` in `App.js` decides where a
pricing-card click goes.

## Onboarding Flow
Routes that should only show when logged out (`/`, `/login`, `/signup`, `*`) are
wrapped in `RedirectIfAuthed`, which reads `useAuth()` and renders nothing while
`loading`, redirects to `/chat` when a session exists, else shows the page.

Flow:
1. **Navbar** (landing): "Sign In" → `/login`, "Create Account" → `/signup`.
2. **Signup** (`/signup`): email + password (show/hide toggle). Validates email
   format + password ≥8 chars → `signUp(email, password)`. Because email
   verification is on, no session is created yet → shows the "Check your email"
   screen (does NOT advance to `/plans`). Supabase errors (e.g. user exists)
   render inline.
3. **Login** (`/login`): email + password → `signInWithPassword`; wrong creds →
   "Incorrect email or password", unconfirmed email → "Please verify your email
   before signing in". On success, if a pending plan exists resume it
   (Free → `/chat`, paid → `/checkout`), else `/chat`.
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
4. **Plans** (`/plans`): "Choose your plan" + Monthly/Annual toggle (Save 20%).
   Free → if logged in `finalizePlan("Free")` → `/onboarding`, else save pending → `/login`.
   Plus/Pro → if logged in `/checkout`, else save pending → `/login`.
5. **Checkout** (`/checkout`): summary pill (plan + price) + mock Stripe card
   form (cardholder name, auto-formatted card `1234 5678 9012 3456`, MM/YY expiry,
   CVV, "Secured by Stripe"). Validates 16-digit card, future expiry, 3-digit CVV,
   non-empty name → `finalizePlan(plan)` → "✅ You're all set! 🐕" → after 2s `/onboarding`.
6. **Onboarding** (`/onboarding`): protected name-collection card (reuses
   `AuthLayout` / `.auth-card`). "One last thing! 🐕" + first/last name inputs +
   yellow "Let's Go!" → `saveName()` (→ `user_metadata.first_name/last_name`) →
   `/chat`. "Skip for now" goes straight to `/chat` without saving.
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
three divider-separated sections (mobile-friendly, name fields stack ≤480px):
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
     and `sendAccountDeletionEmail()` fire (a magic link via `signInWithOtp`,
     `emailRedirectTo` = `/account?type=deletion`). The button is then replaced by
     a "Check your email 🐕" panel + **Resend email** (resend skips re-verifying).
  2. Clicking the emailed link returns to `/account?type=deletion`. `App.js`'s
     `RecoveryHandler` detects the `?type=deletion` query (priority over the
     password `type=recovery` hash), sets a `fetchit_delete_intent` sessionStorage
     flag, and routes to `/account`.
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

## Landing pricing
The landing Pricing buttons route via `routePlanSelection`: logged in → straight
to `/checkout` (skips `/plans`); logged out → save the plan and go to `/login`
(which resumes it after sign-in). Free skips payment and goes to `/chat`. The
ChatMockup demo still opens the early-access email `Modal` + `Toast`.

## Tech Stack
- React 18 + react-scripts 5 (Create React App)
- React Router v6 (`react-router-dom`) for all routes
- Plain CSS, one `.css` file per component (global class names, no CSS modules)
- **Supabase** (`@supabase/supabase-js`) for auth + the `chats`/`orders` tables;
  the early-access signups list and the transient pending-plan still use
  `localStorage`
- The "auto checkout (Puppeteer)" and "Stripe payments" features are product
  copy / mock UI — not a real integration.

## File Structure
```
supabase/schema.sql           # chats + orders tables and RLS policies (run once)
src/
├── index.js / index.css      # entry + global reset, palette, .visually-hidden
├── App.js / App.css          # React Router routes (AuthProvider), shared styles
├── supabaseClient.js         # shared Supabase client (URL + anon key)
├── AuthContext.js            # AuthProvider + useAuth() (live session, loading)
├── utils.js                  # email validation, signups, Supabase auth/chats/orders
└── components/
    ├── Navbar.js/.css         # sticky nav + hamburger (landing)
    ├── Hero.js/.css           # headline + "See How It Works"
    ├── ChatMockup.js/.css     # landing interactive AI chat demo (auto-play, buy flow)
    ├── ProductCard.js/.css    # product card (used by chat demo + chat page)
    ├── HowItWorks.js/.css     # 3 steps
    ├── Features.js/.css       # 4 feature cards
    ├── SocialProof.js/.css    # stats band
    ├── Pricing.js/.css        # Free / Plus / Pro + Monthly/Annual toggle
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
    ├── CheckoutPage.js/.css   # /checkout — mock Stripe form + success
    ├── OnboardingPage.js/.css # /onboarding — first/last name collection
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
