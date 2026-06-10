# Fetchit — AI Shopping Assistant

## Project Overview
Fetchit is a friendly AI-powered shopping agent. You chat with Fetchit's AI in
natural language, it returns personalized product picks (with photos, prices,
and verified reviews), and — once you pick one — it checks out for you
automatically in the background. Built as a React (Create React App) landing
page with plain CSS, no UI libraries, no backend.

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
- `/chat` — `ChatPage` (protected: redirects to `/login` if not signed in)
- `/admin` — `AdminPage` (hidden signups dashboard)
- `*` — falls back to the landing page

**Auto-login:** `/`, `/login`, `/signup` (and `*`) are wrapped in
`RedirectIfAuthed` — if an active session exists, they redirect to `/chat`
(works across tab close/reopen since the session lives in localStorage). Sign-in
pages are only reachable when logged out.

## Mock Auth & Onboarding Flow
All client-side, no backend. Helpers live in `src/utils.js`:
- `fetchit_accounts` — **permanent** account registry keyed by email:
  `{ [email]: { email, password, plan, createdAt } }` (mock — password in plain
  text on purpose; never do this for real). Accounts survive browser restarts.
- `fetchit_session` — active login `{ email, plan }`. Sign-out clears ONLY this;
  the account stays in the registry so the user can sign back in.
- `fetchit_pending_plan` — a plan clicked while logged out, resumed after login
- `fetchit_signups` — admin list (chat-demo emails + finalized plan signups)
- `fetchit_chats` — chat history keyed by email (see Chat history below)
Key functions: `createUser`, `authenticate`, `startSession(email)`, `getSession`,
`getUser`, `isLoggedIn`, `clearSession`, `setPendingPlan`/`getPendingPlan`/
`clearPendingPlan`, `finalizePlan`, and `getChats`/`saveChat`/`deleteChat`/
`clearChats`. The shared `routePlanSelection(plan, navigate)` in `App.js` decides
where a pricing-card click goes.

Flow:
1. **Navbar** (landing): "Sign In" → `/login`, "Create Account" → `/signup`.
2. **Signup** (`/signup`): email + password (show/hide toggle). Validates email
   format + password ≥8 chars → `createUser(email, password)` (starts a session)
   → `/plans`.
3. **Login** (`/login`): email + password. `authenticate` against the stored
   mock user; wrong creds → inline error. On success → `startSession`, then if a
   pending plan exists resume it (Free → `/chat`, paid → `/checkout`), else `/chat`.
4. **Plans** (`/plans`): "Choose your plan" + Monthly/Annual toggle (Save 20%).
   Free → if logged in `finalizePlan("Free")` → `/chat`, else save pending → `/login`.
   Plus/Pro → if logged in `/checkout`, else save pending → `/login`.
5. **Checkout** (`/checkout`): summary pill (plan + price) + mock Stripe card
   form (cardholder name, auto-formatted card `1234 5678 9012 3456`, MM/YY expiry,
   CVV, "Secured by Stripe"). Validates 16-digit card, future expiry, 3-digit CVV,
   non-empty name → `finalizePlan(plan)` → "✅ You're all set! 🐕" → after 2s `/chat`.
6. **Chat** (`/chat`): full-screen dark app, protected (no session → `/login`).
   Left **sidebar** (`ChatSidebar`, 280px, `#111`): Fetchit logo, yellow "New
   Chat" button, scrollable list of this user's past chats (title = first message
   truncated to 40 chars, date/time, hover-reveal trash to delete with confirm),
   and an "🕵️ Incognito" button at the bottom. Top bar: logo + account dropdown
   (Log Out); a hamburger appears ≤768px to toggle the sidebar as an animated
   overlay. Empty state: 🐕 + "What can we get you?" + 3 suggestion chips. Fixed
   bottom input. Sending a message (or chip) fades the empty state, shows the user
   bubble, a typing indicator → (1.5s) "Got it! Let me find the best options for
   you... 🔍" → (2.5s later) 3 keyword-matched product cards (gift / coffee /
   headphones, default gift). "Buy This 🐕" → progress bar → "✅ Done!".

## Chat history & Incognito (`ChatPage` + `ChatSidebar`)
- Each conversation is persisted under `fetchit_chats[email]` as
  `{ id, title, createdAt, messages }` (transient typing/progress bubbles are
  stripped before saving). History is scoped per email — accounts never see each
  other's chats. "New Chat" resets to the empty state; clicking a past chat
  restores its messages (including product cards); the trash icon deletes it.
- **Incognito** (sidebar button): hides the sidebar, shows a "🕵️ Incognito Mode"
  badge + "Exit Incognito" button in the top bar, tints the chat `#1A1A2E`, and
  shows a "this chat won't be saved" banner. Nothing is written to localStorage
  while incognito. "Exit Incognito" restores the sidebar and normal mode.
  Incognito is component state only — a page refresh resets to normal.

**Sign out** (account dropdown → Log Out) clears the session and redirects to
`/` (the landing page); the account stays saved so the user can sign back in.
Visiting `/chat` directly with no session still redirects to `/login`.

## Landing pricing
The landing Pricing buttons route via `routePlanSelection`: logged in → straight
to `/checkout` (skips `/plans`); logged out → save the plan and go to `/login`
(which resumes it after sign-in). Free skips payment and goes to `/chat`. The
ChatMockup demo still opens the early-access email `Modal` + `Toast`.

## Tech Stack
- React 18 + react-scripts 5 (Create React App)
- React Router v6 (`react-router-dom`) for all routes
- Plain CSS, one `.css` file per component (global class names, no CSS modules)
- No backend; accounts, sessions, and signups all persist in `localStorage`
- The "auto checkout (Puppeteer)" and "Stripe payments" features are product
  copy / mock UI — not a real integration.

## File Structure
```
src/
├── index.js / index.css      # entry + global reset, palette, .visually-hidden
├── App.js / App.css          # React Router routes, shared button/logo styles
├── utils.js                  # email validation, signups, + mock auth/session/account
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
    ├── LoginPage.js           # /login — email + password
    ├── PlansPage.js/.css      # /plans (reuses Pricing.css card styles)
    ├── CheckoutPage.js/.css   # /checkout — mock Stripe form + success
    ├── ChatPage.js/.css       # /chat — full-screen chat app (history + incognito)
    └── ChatSidebar.js/.css    # /chat left sidebar — history list + New Chat + Incognito
```

## Conventions
- Keep the yellow/orange/charcoal palette and the playful, friendly voice.
- One CSS file per component; reuse CSS variables from `index.css`.
- Respect `prefers-reduced-motion` for any new animation.
- `CI=true npm run build` fails on ESLint warnings — keep React hook
  dependency arrays clean (e.g. the chat demo uses a "latest-ref" pattern so the
  observer effect can keep `[]` deps).
