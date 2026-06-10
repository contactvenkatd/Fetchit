# Fetchit 🐕

> Your shopping best friend — a friendly AI shopping assistant that shops for you.

A React (Create React App) landing page for **Fetchit**, built with plain CSS (no
Tailwind or UI libraries) and no backend.

## Getting Started

```bash
cd fetchit-app
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

To build for production:

```bash
npm run build
```

## Project Structure

```
src/
├── index.js              # React entry point
├── index.css             # Global reset, fonts, CSS variables (color palette)
├── App.js                # Page composition
├── App.css               # Shared layout + button + logo styles
└── components/
    ├── Navbar.js / .css      # Sticky nav with logo + Try Free CTA
    ├── Hero.js / .css        # Headline, subheading, primary CTA
    ├── HowItWorks.js / .css  # 3 steps
    ├── Features.js / .css    # 4 feature cards
    ├── SocialProof.js / .css # Stats band (50k+ / $2.4M / 99.8%)
    ├── Pricing.js / .css     # Free / Plus / Pro
    └── Footer.js / .css      # Tagline + links
```

## Branding

| Token       | Value     | Use                      |
| ----------- | --------- | ------------------------ |
| `--yellow`  | `#FFD700` | Primary / highlights     |
| `--orange`  | `#FF6B35` | Accent / CTA buttons     |
| `--charcoal`| `#1A1A1A` | Text / dark sections     |
| `--white`   | `#FFFFFF` | Background               |

Fonts: **Baloo 2** (playful headings) + **Nunito** (body), loaded from Google Fonts.
