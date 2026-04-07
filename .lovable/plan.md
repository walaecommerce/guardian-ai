

# Phase 2: Enhance ProductSummaryCard

## Current State
The `ProductSummaryCard` already has editable title, remove/set-as-main hover actions, and a "Start Audit" CTA. However it's visually plain and missing several polish items.

## Enhancements

### 1. Visual upgrade to ProductSummaryCard
- Add glass-card styling (`bg-card/50 backdrop-blur border-primary/20`) consistent with the dark cyan design system
- Make the "Start Audit" CTA more prominent: gradient background, pulse animation when ready, larger with an animated arrow icon
- Add image count and dimension summary badges (e.g. "7 images", "MAIN + 6 secondary")
- Show analyzing progress inline on the CTA button when audit is running

### 2. Drag-to-reorder support
- Integrate `@dnd-kit` (already installed per memory) for drag-to-reorder in the image grid
- First position automatically becomes MAIN; update types on drop
- Add visual drop indicator and "1st - Landing" badge on the first slot

### 3. Richer image thumbnails
- Show AI-detected category label (from `asset.analysisResult?.category` or filename parse) as a bottom badge
- Add image dimensions text on hover (read from the `File` object or image natural size)
- Improve hover overlay: semi-transparent with smooth scale-up transition per the design standards (translateY -2px + cyan glow)

### 4. Embed AmazonGalleryPreview
- Show the existing `AmazonGalleryPreview` component beneath the image grid inside the card, giving users a live preview of how their top 7 images will appear on Amazon

### 5. Category selector
- Surface the `selectedCategory` / `onCategoryChange` as a compact dropdown in the card header next to the ASIN badge, since this affects which compliance rules apply

## Files Changed
- `src/components/ProductSummaryCard.tsx` — all visual and interaction enhancements
- `src/components/audit/ImportStep.tsx` — minor: pass any new props if needed

## No backend changes required.

