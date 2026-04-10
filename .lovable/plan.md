

# Fix Remaining Phase 3 Gaps

## 1. Add canonical image category extraction helper

**New file: `src/utils/imageCategory.ts`**

Export a helper `extractImageCategory(asset: ImageAsset): ImageCategory` that uses the same regex already proven in `AnalysisResults.tsx`:

```typescript
const CATEGORY_REGEX = /^(PRODUCT_SHOT|INFOGRAPHIC|LIFESTYLE|PRODUCT_IN_USE|SIZE_CHART|COMPARISON|PACKAGING|DETAIL|APLUS|MAIN|UNKNOWN)_/;

export function extractImageCategory(asset: ImageAsset): ImageCategory {
  const match = asset.name.match(CATEGORY_REGEX);
  return (match ? match[1] : 'UNKNOWN') as ImageCategory;
}
```

This replaces all ad-hoc category extraction in the affected files.

## 2. Use the helper in ListingScoreCard and RecommendationsPanel

**`src/components/ListingScoreCard.tsx`** — Replace the broken `result?.imageCategory || asset.name...` fallback (lines 219–221) with `extractImageCategory(asset)`.

**`src/components/recommendations/RecommendationsPanel.tsx`** — Replace the inline `result?.imageCategory || a.name.replace(...)` fallback (lines 67–68) with the same helper.

## 3. Pass category into MissingImagesTab from RecommendationsPanel

**`src/components/recommendations/RecommendationsPanel.tsx`** — Derive the dominant product category from analyzed assets (most common non-UNKNOWN category) and pass it as `category` prop to `MissingImagesTab` on line 200.

## 4. Stop sending null scorecard data — remove from contract

The main recommendation flow doesn't generate a scorecard first, so sending `scoreCardData: null` is misleading. The coverage context is already provided via `missingCoverageTypes`.

**`src/components/recommendations/RecommendationsPanel.tsx`** — Remove `scoreCardData: null` from the request body.

**`supabase/functions/generate-suggestions/index.ts`** — Remove `scoreCardData` from the destructured request body and from the prompt template (it's already unused beyond a `JSON.stringify(scoreCardData || {})` that produces `{}`).

## 5. Pass product category into listing-scorecard

**`src/components/ListingScoreCard.tsx`** — Derive the dominant category from assets using `extractImageCategory` and pass it as `category` in the request body to the `listing-scorecard` edge function (line 233). The backend already reads `category` at line 80.

---

## Files changed

1. **New**: `src/utils/imageCategory.ts` — canonical extraction helper
2. **Modified**: `src/components/ListingScoreCard.tsx` — use helper, pass category to backend
3. **Modified**: `src/components/recommendations/RecommendationsPanel.tsx` — use helper, pass category to MissingImagesTab, remove scoreCardData
4. **Modified**: `supabase/functions/generate-suggestions/index.ts` — remove scoreCardData from contract

No migrations. No new env vars.

