

## Multi-Feature Enhancement Plan

This plan addresses the user's grouped requests: real-time credit updates, AI credits exhaustion banner, partial failure handling, Media Library category filter, session name disambiguation, and Amazon retry with exponential backoff.

**Note on the 402 "AI credits exhausted" error**: This is a Lovable AI gateway billing issue, not a code bug. The workspace needs more AI credits added via Settings → Workspace → Usage. The features below improve how the app handles this scenario gracefully.

---

### 1. Real-time credit refresh after each image analysis

**File: `src/hooks/useAuditSession.ts`**

Currently `refreshCredits()` is called only after the entire audit loop completes (line 629). Move an additional `refreshCredits()` call inside the per-image loop, right after each successful analysis result is processed (~line 537), so sidebar credit bars update live as each image consumes a credit.

---

### 2. AI credits exhausted banner

**New file: `src/components/AICreditsExhaustedBanner.tsx`**

A dismissible alert banner that detects when edge functions return 402 `payment_required` errors. Different from the existing `CreditWarningBanner` (which tracks in-app credits), this banner specifically handles Lovable AI gateway exhaustion:

- Renders a destructive Alert with message: "AI credits exhausted. Add credits in Settings → Workspace → Usage."
- Dismiss button using local state
- Triggered via a new context/state flag set when any edge function returns 402

**File: `src/hooks/useAuditSession.ts`**

Add a `aiCreditsExhausted` state flag. In `analyzeAsset()` (line 469), when status is 402, set this flag to `true`. Expose it from the hook.

**File: `src/pages/Index.tsx`**

Render `AICreditsExhaustedBanner` at the top of the dashboard when the flag is true.

---

### 3. Partial failure state in audit results

**File: `src/components/audit/AuditStep.tsx`**

After the audit loop, if some images succeeded and some failed (have `analysisError`), show a mixed-results banner:

- "X of Y images analyzed successfully. Z failed." with a Retry Failed button
- List failed image names with their error reasons
- The retry button re-runs `analyzeAsset()` only on failed images

**File: `src/hooks/useAuditSession.ts`**

Add a `handleRetryFailedAnalysis()` function that filters assets with `analysisError` set and re-runs the audit loop only on those assets. Expose it from the hook.

---

### 4. Media Library category filter

**File: `src/pages/Media.tsx`**

Add a third `<Select>` filter for `image_category` alongside the existing session and status filters:

- Options: All Categories, PRODUCT_SHOT, INFOGRAPHIC, LIFESTYLE, PACKAGING, SIZE_CHART, COMPARISON, OTHER
- Filter logic added to `filteredImages` (~line 84): check `img.image_category`

---

### 5. Session name disambiguation in Media Library

**File: `src/pages/Media.tsx`**

Update the session filter dropdown (line 141-145) to append date or ASIN suffix:

- Format: `"{title} · {ASIN || date}"` where date is formatted as "MMM d" using date-fns
- This distinguishes sessions with the same product title

---

### 6. Amazon import retry with exponential backoff

**File: `src/hooks/useAuditSession.ts`**

Wrap the `scrapeAmazonProduct()` call in `handleImportFromAmazon` with an exponential backoff retry (3 attempts, delays: 2s, 4s, 8s). Show retry status in logs. If all retries fail, show a "Retry Import" button in the ImportStep error state.

**File: `src/components/audit/ImportStep.tsx`**

Add a retry button that appears after import failure, calling `onImportFromAmazon` again.

---

### Files to modify
| File | Change |
|------|--------|
| `src/hooks/useAuditSession.ts` | Real-time credit refresh per image, AI exhausted flag, retry failed analysis, import retry with backoff |
| `src/components/AICreditsExhaustedBanner.tsx` | New — dismissible 402 banner |
| `src/components/audit/AuditStep.tsx` | Partial failure banner with retry |
| `src/pages/Media.tsx` | Category filter + session name disambiguation |
| `src/pages/Index.tsx` | Render AI credits banner |
| `src/components/audit/ImportStep.tsx` | Retry button on import failure |

