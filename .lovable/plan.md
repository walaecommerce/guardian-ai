

## Problem

When images are imported but not yet audited, the Audit step shows only a text prompt ("8 images ready for audit") with no image thumbnails. Users can't see which images they're about to audit. The `AnalysisResults` component filters out unanalyzed images entirely (returns `null` at line 235), and the `AuditStep` only shows either the "needs audit" prompt OR the results — never a gallery of pending images.

## Plan

### 1. Add a pre-audit image gallery to `AuditStep.tsx`

Below the "Run Audit" prompt (the dashed border box), render a thumbnail grid showing all imported images before the audit runs. This gives users visual confirmation of what they're about to audit.

```
When `needsAudit` is true, after the prompt box, add:
- A grid (3-4 columns) of image thumbnail cards
- Each card shows: image preview, MAIN/SECONDARY badge, file name
- Clicking a card calls onSelectAsset(asset) to open details
```

### 2. Also show the gallery during analysis (`isAnalyzing` state)

When the audit is running, show the same grid but with a scanning overlay/spinner on each image that hasn't been analyzed yet, so users see progress visually.

```
When `isAnalyzing` is true AND not all images have results yet:
- Show the same thumbnail grid
- Images being analyzed get a shimmer/spinner overlay
- Images already analyzed show their PASS/FAIL badge
```

### Files to modify

- **`src/components/audit/AuditStep.tsx`** — Add a thumbnail grid section that renders when `needsAudit || isAnalyzing`. Each thumbnail is a simple Card with the image preview, type badge, and name. This sits between the "Run Audit" prompt and the `AnalysisResults` component.

No changes needed to `AnalysisResults.tsx` — it continues to handle post-audit display. The new gallery in `AuditStep` covers the pre-audit and in-progress states.

