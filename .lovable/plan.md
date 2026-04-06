

# Surgical Image Fixing: Gemini Nano Banana 2 + OpenAI Masked Inpainting

## Overview

Upgrade the secondary image badge removal pipeline to use a two-tier strategy: try Gemini 3.1 Flash Image (Nano Banana 2) first for speed, then fall back to OpenAI Image Edits API with programmatic SVG masks for pixel-perfect inpainting. Keep the current Gemini background-only edit for MAIN images (user confirmed).

## Architecture

```text
SECONDARY IMAGE FIX REQUEST
        │
        ▼
┌─────────────────────────┐
│ Tier 1: Nano Banana 2   │  (fast, via Lovable AI gateway)
│ gemini-3.1-flash-image  │
│ Surgical edit prompt +  │
│ spatial zone context    │
└──────────┬──────────────┘
           │
     verify-image
           │
    score < 85?  ────── YES ──▶ ┌──────────────────────────┐
           │                    │ Tier 2: OpenAI Image      │
           NO                   │ Edits API (/v1/images/    │
           │                    │ edits) + SVG Mask from    │
           ▼                    │ spatialAnalysis bounds    │
        ✅ DONE                 └──────────┬───────────────┘
                                           │
                                     verify-image
                                           │
                                        ✅ DONE
```

## What Changes

### 1. Update `_shared/models.ts`
Add Nano Banana 2 model for secondary image editing:
```typescript
export const MODELS = {
  analysis: "google/gemini-3.1-pro-preview",
  imageGen: "google/gemini-3-pro-image-preview",
  imageEdit: "google/gemini-3.1-flash-image-preview",  // NEW — Nano Banana 2
  verification: "google/gemini-3.1-pro-preview",
};
```

### 2. Update `generate-fix/index.ts` — Secondary patterns B & C

**Tier 1 (Gemini Nano Banana 2):** Replace the current `MODELS.imageGen` call for secondary images with `MODELS.imageEdit`. The prompt stays the same (surgical edit). Nano Banana 2 is faster and cheaper, with pro-level quality for edits.

**Tier 2 (OpenAI Masked Inpainting):** Add a new pathway triggered when the request includes `useOpenAIInpainting: true` (set by the frontend on retry after Tier 1 fails verification):

- Read `OPENAI_API_KEY` from env (already configured)
- Generate a PNG mask programmatically from `spatialAnalysis.overlayElements` bounding boxes — white pixels over badges, transparent everywhere else (using Deno Canvas or raw PNG byte construction)
- Call `https://api.openai.com/v1/images/edits` with the original image + mask + inpainting prompt
- Parse the response and return the inpainted image

**Mask generation approach:** Use the spatial analysis bounding boxes (`bounds: { top, left, width, height }`) to create an SVG, render it to a PNG buffer. Each overlay element marked `action: 'remove'` becomes a white rectangle on a transparent canvas. This mask tells OpenAI exactly which pixels to redraw.

### 3. Update `src/config/models.ts` (frontend)
Add the `imageEdit` model reference to match the backend.

### 4. Update frontend retry logic
In the fix generation flow (likely in `Index.tsx` or `FixModal.tsx`), when a secondary image fix fails verification after the initial attempt, set `useOpenAIInpainting: true` on the retry payload so the edge function routes to Tier 2.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/_shared/models.ts` | Add `imageEdit` model |
| `supabase/functions/generate-fix/index.ts` | Use `MODELS.imageEdit` for secondary patterns B/C; add OpenAI inpainting Tier 2 with mask generation |
| `src/config/models.ts` | Add `imageEdit` model |
| `src/pages/Index.tsx` or fix flow | Pass `useOpenAIInpainting` flag on retry |

## What Does NOT Change

- MAIN image flow (Pattern A1/A2) stays as-is with Gemini background-only edit
- Verification flow (`verify-image`) stays unchanged
- Product Identity Card extraction stays unchanged
- Analysis (`analyze-image`) stays unchanged

## Cost Impact

- Tier 1 (Nano Banana 2): Faster and cheaper than current `gemini-3-pro-image-preview`
- Tier 2 (OpenAI): Only invoked on retry — ~$0.02-0.04 per edit. Most images should pass at Tier 1.

