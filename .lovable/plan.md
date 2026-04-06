

# AGC Listing Guardian — Complete Redesign Plan

This is a large-scale rebuild touching every layer: design system, authentication, database, UI structure, and business logic. The plan is organized into 8 phases, each deliverable independently.

---

## Phase 1: Design System Foundation

**Goal**: Replace the Amazon-orange light theme with the dark cyan-accented design system.

- Replace all CSS custom properties in `src/index.css` with the new palette (background `#0A0A0F`, surface `#111118`, primary `#00E5FF`, secondary `#7C3AED`, etc.)
- Update `tailwind.config.ts` to add custom colors (`surface`, `surface-elevated`, `cyan`, `violet`) and extend theme
- Add Inter font import in `index.html` if not already present
- Add global styles: thin dark scrollbars with cyan thumb, glass-card utility class, glow effects
- Update `src/components/ui/button.tsx` default variant to use cyan primary
- Update `src/components/ui/card.tsx` to use `bg-surface border-white/5 rounded-2xl`

**Files**: `src/index.css`, `tailwind.config.ts`, `index.html`, button/card UI components

---

## Phase 2: Database + Auth Infrastructure

**Goal**: Create user tables, auth context, and Google OAuth flow.

### Database migrations:
- Create `user_profiles` table (id uuid PK referencing auth.users, email, full_name, avatar_url, amazon_store_url, onboarding_complete default false, timestamps)
- Create `user_credits` table (id, user_id referencing auth.users, credit_type enum, total_credits, used_credits, plan text, timestamps, UNIQUE on user_id+credit_type)
- Create `handle_new_user()` trigger function that auto-creates profile + 3 credit rows (10 scrape, 20 analyze, 5 fix)
- Enable RLS on both tables: users can only read/update their own rows

### Auth code:
- Create `src/contexts/AuthContext.tsx` with Google OAuth via Lovable Cloud (`lovable.auth.signInWithOAuth`)
- Handle `onAuthStateChange`: fetch profile, upsert if missing, set loading false
- Create `src/hooks/useAuth.ts` re-exporting `useAuthContext`
- Create `src/hooks/useCredits.ts` — fetches user_credits, exposes `remainingCredits(type)`, `hasCredits(type)`
- Create `src/components/auth/AuthGuard.tsx` — blocks unauthenticated access, shows login card
- Create `src/components/auth/CreditsDisplay.tsx` — header pills showing credit counts

**Files**: 2 migrations, 4 new src files, wrap `App.tsx` with `AuthProvider`

---

## Phase 3: Login + Onboarding + Pricing Pages

**Goal**: Build the three new pages with the dark design language.

### Login (rendered by AuthGuard when unauthenticated):
- Full-screen dark bg with CSS gradient mesh animation
- Centered glass card with Shield logo, cyan glow ring
- "Continue with Google" button
- Terms fine print

### Onboarding (`/onboarding`):
- Dark bg, centered card, step indicator
- Welcome with user's name from Google profile
- Amazon storefront URL input with cyan focus ring
- "Connect Store" primary button + "Skip for now" ghost button
- On complete: update `onboarding_complete` in profile, navigate to `/`

### Pricing (`/pricing`):
- 3-column grid: Free / Starter ($49) / Pro ($199)
- "Most Popular" badge on Starter
- Feature checklists, CTA buttons (ghost / cyan / violet gradient)
- Stripe checkout integration (edge function `create-checkout-session`)

**Files**: `src/pages/Onboarding.tsx`, `src/pages/Pricing.tsx`, update `AuthGuard.tsx`, update `App.tsx` routes

---

## Phase 4: Header + Dashboard Layout Restructure

**Goal**: Redesign the header and convert dashboard from scrolling layout to fixed sidebar + main content.

### Header (48px):
- Left: Shield icon + "AGC Guardian" wordmark
- Center-right: Credit pills (colored red when 0)
- Right: Notification bell, Avatar dropdown (profile, upgrade, settings, sign out)

### Dashboard layout:
- Fixed left sidebar (280px) with:
  - Logo + wordmark
  - Upload drop zone (dashed cyan border on hover)
  - Nav items: Overview, Audit Results, Fix Images, Competitor Intel, Reports (icon + label, active = cyan pill)
  - Credits widget at bottom with upgrade button
- Main content area fills remaining space with internal scroll

### Responsive:
- Below 1024px: sidebar collapses to 40px icon rail, hover expands
- Below 768px: sidebar becomes bottom tab bar

**Files**: New `src/components/dashboard/DashboardLayout.tsx`, `DashboardSidebar.tsx`, redesign `Header.tsx`, update `Index.tsx`

---

## Phase 5: Dashboard Tabs Redesign

**Goal**: Redesign the 6 tab contents with empty states and new styling.

### Tab mapping (old → new):
- results → **Audit Results**: Table with thumbnails, score bars, status badges, action buttons
- recommendations + scorecard → **Overview**: Score gauge (cyan circular progress), image grid with status badges, summary stats
- comparison → **Fix Images**: Side-by-side original vs fixed, "Generate Fix" button, download button
- compare → **Competitor Intel**: URL input + import, split comparison card, impact badges
- history → **Reports**: Saved compliance report cards with download PDF
- (new) → **History**: Session history list with "Load Session" button

### Empty states for every tab:
- Large dimmed Lucide icon (w-16 h-16, cyan at 30% opacity)
- Heading describing the tab
- Sub-text with action prompt
- CTA button

**Files**: Update `AnalysisResults.tsx`, `BatchComparisonView.tsx`, `CompetitorAudit.tsx`, `ListingScoreCard.tsx`, create empty state components

---

## Phase 6: Credits Integration + Edge Function Updates

**Goal**: Wire credits into the audit workflow.

- Create `supabase/functions/_shared/credits.ts` — `deductCredit(authHeader, creditType)` function
- Update `scrape-amazon` to deduct 1 scrape credit
- Update `analyze-image` to deduct 1 analyze credit  
- Update `generate-fix` to deduct 1 fix credit
- Frontend: check `hasCredits(type)` before calling functions, show upgrade prompt if exhausted
- After each action, refresh credits display

**Files**: `_shared/credits.ts`, 3 edge function updates, `useCredits.ts` integration in `Index.tsx`

---

## Phase 7: Cleanup + Micro-interactions

**Goal**: Remove all demo/mock data and add polish.

### Remove:
- `DemoImages.tsx` and all references to `loadDemoImages`
- `HeroSection.tsx` and the hero display logic
- Any hardcoded sample data, console.logs exposed in UI
- "Powered by Lovable" / "Powered by Gemini AI" text

### Add micro-interactions:
- Image cards: hover `translateY(-2px)` with cyan shadow
- Status badges: PASS = green pulse dot, FAIL = red, ANALYZING = cyan spinner, FIXED = violet
- Buttons: `active:scale-[0.98]` on press
- Tab switches: 200ms fade transition
- Score numbers: count-up animation
- Upload zone: animated dashed border on drag-over

**Files**: Multiple component updates, delete `DemoImages.tsx`, `HeroSection.tsx`

---

## Phase 8: Stripe Integration + Final Polish

**Goal**: Connect pricing to Stripe checkout and final QA.

- Enable Stripe via Lovable tool
- Create `create-checkout-session` edge function
- Wire Pricing page CTAs to create Stripe checkout sessions
- Handle webhook for plan upgrades (update user_credits)
- Final responsive testing and bug fixes

**Files**: New edge function, `Pricing.tsx` updates, webhook handler

---

## Implementation Order

Each phase will be a separate implementation message. Phases 1-2 are foundational and must go first. Phases 3-7 can be adjusted based on your priorities. Phase 8 requires Stripe setup.

**Estimated total**: ~15-20 implementation messages across all phases.

