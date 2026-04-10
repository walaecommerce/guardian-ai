

# Fix Remaining Phase 4 Workflow Drift

## Scope

Replace all `split('_')[0]` category parsing with `extractImageCategory` and wire `buildAssetFromDownload` into `useAuditSession.ts`.

---

## 1. `src/hooks/useAuditSession.ts`

**Import** `extractImageCategory` from `@/utils/imageCategory` and `buildAssetFromDownload` from `@/utils/sessionAssetHelpers`.

**Line ~1240** — `category: a.name.split('_')[0]` → `category: extractImageCategory(a)`

**Line ~1252** — same pattern → `category: extractImageCategory(a)`

**Lines ~1302-1313** — Replace manual asset construction with:
```typescript
const asset = buildAssetFromDownload(
  file,
  aiCategory,
  imagesToProcess[i].url,
  contentHash,
  compAssets.length === 0,
);
```
(Prefix the `id` with `comp_` after construction if needed, or accept the helper's random ID since it's ephemeral.)

**Line ~1336** — `a.name.split('_')[0] || 'UNKNOWN'` → `extractImageCategory(a)`

## 2. `src/components/CompetitorAudit.tsx`

**Import** `extractImageCategory` from `@/utils/imageCategory`.

**Line ~113** — `a.name.split('_')[0] || 'UNKNOWN'` → `extractImageCategory(a)`

## 3. `src/components/ProductSummaryCard.tsx`

**Import** `extractImageCategory` from `@/utils/imageCategory`.

**Lines ~266-268** — Replace:
```typescript
const categoryLabel = asset.analysisResult?.productCategory
  || asset.name.split('_')[0]
  || 'UNKNOWN';
```
With:
```typescript
const categoryLabel = asset.analysisResult?.productCategory
  || extractImageCategory(asset);
```

---

## Files changed

1. `src/hooks/useAuditSession.ts` — import helpers, replace 3 split calls + use `buildAssetFromDownload`
2. `src/components/CompetitorAudit.tsx` — import helper, replace 1 split call
3. `src/components/ProductSummaryCard.tsx` — import helper, replace 1 split call

No migrations. No env changes. No UX changes.

