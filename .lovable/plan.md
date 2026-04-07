

# Add Credit Warning Banner to Dashboard

## What
A dismissible warning banner at the top of the dashboard that alerts users when any credit type is low (≤20% remaining) or fully exhausted, with a link to the pricing page.

## Design
- **Exhausted (0 remaining)**: Red/destructive banner — "You've used all your [type] credits. Upgrade to continue."
- **Low (≤20% remaining)**: Amber/warning banner — "You're running low on [type] credits (X remaining)."
- Multiple low/exhausted types consolidated into a single banner with all warnings listed.
- Dismissible per session (reappears on refresh if still low).
- Includes "View Plans" button linking to `/pricing`.

## Changes

### 1. Create `src/components/CreditWarningBanner.tsx`
- Import `useCredits` hook, `Alert`/`AlertTitle`/`AlertDescription` from UI, and `Link` from router.
- Check all three credit types (scrape, analyze, fix). For each, compute remaining vs total.
- If any are exhausted → destructive variant. If any are low (≤20%) → default variant with amber styling.
- Render nothing if all credits are healthy or banner is dismissed.
- Show consolidated message listing affected credit types.
- "View Plans" button navigates to `/pricing`.

### 2. Modify `src/pages/Index.tsx`
- Import `CreditWarningBanner`.
- Add it below the PolicyBanner, above the CommandBar (~line 77).

