

# Comprehensive UX Redesign and System Fix Plan

## Problems Identified

### 1. Import Step UX is Confusing
- The command bar has a generic "Amazon URL..." placeholder with a search icon -- users don't understand they need to paste a product URL there
- After import, it jumps straight to "8 images ready to audit" without showing what was collected (title, bullet points, images, ASIN)
- No way to add/replace individual images, edit metadata, or review scraped data before auditing
- The import step has an upload card, category picker, listing title textarea, and bulk import -- all competing for attention with no clear flow

### 2. Post-Import Summary is Missing
- After scraping, the system auto-advances to the audit step showing only "X images ready to audit"
- No product summary card showing: title, ASIN, bullet points, description, image gallery preview
- No option to edit scraped title, add/remove images, or upload replacements before audit

### 3. Credits Are Never Actually Deducted
- The `useCreditGate` hook checks `total_credits - used_credits` but **no edge function ever increments `used_credits`**
- Every scrape, analyze, and fix operation passes the gate but never reduces the balance
- Credits show as remaining forever -- the system is effectively unmetered

### 4. Session/Media Management Gaps
- Sessions page exists but is a basic list -- no media library view
- No way to browse all uploaded media across sessions
- No way to resume and edit a previous session's images

---

## Plan

### Phase 1: Fix Credit Deduction (Critical Bug)

**Create `supabase/functions/_shared/credits.ts`** -- a shared module with two functions:
- `checkCredits(userId, type)` -- returns remaining count
- `useCredit(userId, type)` -- atomically increments `used_credits` by 1, returns new remaining count or throws if exhausted

**Update 3 edge functions** to call `useCredit()` before performing work:
- `scrape-amazon/index.ts` -- deduct 1 `scrape` credit
- `analyze-image/index.ts` -- deduct 1 `analyze` credit  
- `generate-fix/index.ts` -- deduct 1 `fix` credit

Each function will: extract user ID from the JWT, call `useCredit()`, and return 402 if exhausted.

**Update `useCredits.ts`** to call `refresh()` after each gated action completes, so the sidebar bars update in real time.

### Phase 2: Redesign the Import Step

**Replace the current ImportStep with a two-phase layout:**

**Phase A -- Empty state (no images yet):**
- Large centered card with a clear label: "Paste your Amazon product URL"
- A dedicated, prominent URL input field (not the tiny command bar) with placeholder: `https://www.amazon.com/dp/B0XXXXXXXX`
- Below it: "Or upload images manually" with the drag-and-drop zone
- Remove the confusing command bar URL input (move it to only show when images exist)

**Phase B -- Post-import product summary:**
- **Product Info Card**: Title (editable), ASIN badge, category detected, source URL
- **Image Gallery Grid**: All scraped images shown as thumbnails with their AI classification labels (MAIN, LIFESTYLE, INFOGRAPHIC, etc.)
- **Action buttons per image**: Remove, Replace, Crop, Set as Main
- **"Add More Images" button**: Upload additional images to the set
- **Category override dropdown** (existing, but repositioned into the summary card)
- **"Start Audit" prominent CTA** at the bottom

### Phase 3: Enhance the Audit Results View

After audit completes, instead of just "8 images ready to audit":
- Show a **compliance scorecard summary** at the top (overall score, pass/fail/warning counts)
- Each image card shows its thumbnail, classification, score, and status badge
- Failed images have a "Fix" button inline
- Add a **product metadata sidebar** showing the scraped title, bullets, and description for reference

### Phase 4: Add a Media Library Page

**New route `/media`** -- a browsable gallery of all images across all sessions:
- Grid of images with session name, date, status (original/fixed), and compliance score
- Filter by: session, status (passed/failed/fixed), date range
- Click to open the image detail drawer
- Add to sidebar and mobile bottom nav

### Phase 5: Improve Session History

**Enhance `/sessions` page:**
- Show product thumbnail, title, ASIN, date, image count, and average score for each session
- Add "Resume" button that navigates to `/session/:id` with full state rehydration
- Add "Delete" option per session
- Show session status (in_progress, completed, archived)

---

## Technical Details

### Credit Deduction Module
```text
supabase/functions/_shared/credits.ts
  - checkCredits(supabaseClient, userId, creditType) -> number
  - useCredit(supabaseClient, userId, creditType) -> { remaining: number }
    Uses: UPDATE user_credits SET used_credits = used_credits + 1
           WHERE user_id = $1 AND credit_type = $2
           AND used_credits < total_credits
           RETURNING total_credits - used_credits AS remaining
    If no row updated -> throw 402
```

### Files to Create
- `supabase/functions/_shared/credits.ts`
- `src/pages/Media.tsx`
- `src/components/ProductSummaryCard.tsx` (post-import summary)

### Files to Modify
- `supabase/functions/scrape-amazon/index.ts` -- add credit deduction
- `supabase/functions/analyze-image/index.ts` -- add credit deduction
- `supabase/functions/generate-fix/index.ts` -- add credit deduction
- `src/components/audit/ImportStep.tsx` -- redesign two-phase layout
- `src/components/CommandBar.tsx` -- simplify, remove URL input from command bar when on import step
- `src/hooks/useAuditSession.ts` -- refresh credits after actions, pass scraped product data to UI
- `src/hooks/useCredits.ts` -- add `refresh` call integration
- `src/components/AppSidebar.tsx` -- add Media link
- `src/components/MobileBottomNav.tsx` -- add Media link
- `src/App.tsx` -- add `/media` route
- `src/components/SessionHistory.tsx` -- enhance with thumbnails and resume
- `src/components/audit/AuditStep.tsx` -- add scorecard summary

### Implementation Order
1. Phase 1 (credits) -- most critical, fixes a billing bug
2. Phase 2 (import redesign) -- biggest UX improvement
3. Phase 3 (audit results) -- polish
4. Phase 4 (media library) -- new feature
5. Phase 5 (session history) -- enhancement

