

# Marketing Landing Page — Implementation Plan

## Overview

Create a public-facing landing page at `/` that unauthenticated visitors see instead of the login card. The page will showcase features, social proof, and drive signups. Authenticated users continue straight to the dashboard.

## Architecture Change

Currently, `AuthGuard` shows a `LoginScreen` card for all unauthenticated visitors. We will:

1. Add a `/landing` route **outside** the `AuthGuard` wrapper
2. Modify `AuthGuard` to redirect unauthenticated users to `/landing` instead of rendering the inline login screen
3. Keep the Google OAuth button on the landing page itself

## New File: `src/pages/Landing.tsx`

A single-page marketing site with these sections:

### Hero Section
- Full-width dark gradient background with animated cyan/violet blurs
- Shield logo + "AGC Listing Guardian" headline
- Subheadline: "AI-powered Amazon image compliance and optimization"
- Two CTAs: "Get Started Free" (cyan, triggers Google OAuth) and "See How It Works" (outline, scrolls to features)
- Optional: mock dashboard screenshot or abstract graphic

### Features Grid (3 columns)
- **Instant Compliance Audit** — Upload or scrape Amazon listings, get pass/fail results in seconds
- **AI-Powered Fixes** — One-click image corrections that meet Amazon's latest guidelines
- **Competitor Intelligence** — Compare your listings side-by-side with top competitors
- **Studio Image Generation** — Generate optimized product images with AI
- **Policy Change Alerts** — Stay ahead of Amazon guideline updates
- **Detailed Reports** — Export branded PDF compliance reports

Each card: glass-card style, Lucide icon in cyan, title, short description.

### How It Works (3 steps)
Horizontal stepper with numbered cyan circles:
1. "Upload or paste your Amazon listing URL"
2. "AI analyzes every image against 50+ Amazon rules"
3. "Fix issues instantly and export your report"

### Social Proof / Testimonials
- 3 testimonial cards with quote, name, role (placeholder data)
- Stats bar: "10,000+ images analyzed", "98% compliance rate", "500+ sellers"

### Pricing Preview
- Reuse the existing `TIERS` data from `subscriptionTiers.ts`
- Compact 4-column tier cards with key features and price
- CTA links to `/pricing` for full details

### Final CTA
- "Ready to protect your listings?" with "Start Free" button (Google OAuth)

### Footer
- Minimal: links to Terms, Privacy, Pricing
- Copyright line

## Route Changes in `App.tsx`

- Add `Landing` import and route `<Route path="/landing" element={<Landing />} />` **before** the `AuthGuard` wrapper
- In `AuthGuard`, replace `<LoginScreen />` with `<Navigate to="/landing" replace />`

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/Landing.tsx` | Create (~300 lines) |
| `src/App.tsx` | Add `/landing` route outside AuthGuard |
| `src/components/auth/AuthGuard.tsx` | Replace LoginScreen with redirect to `/landing` |

## Design Tokens

Follows the existing Electric Cyan design system: dark backgrounds, glass-card effects, cyan accents, Inter font, `rounded-2xl` cards, `backdrop-blur-2xl`.

