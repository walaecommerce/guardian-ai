

# Phase 2: Background Segmentation for MAIN Images

## What Changes

Currently, Pattern A (MAIN images) sends a text prompt that regenerates the entire product image from scratch, which risks altering product identity (wrong label text, changed colors, distorted shape). Instead, we'll use an **image-to-image "background replacement only"** approach that instructs the model to keep every product pixel intact and only replace the background with pure white.

## Technical Approach

### 1. Update `generate-fix/index.ts` — Pattern A

Replace the current MAIN image flow (lines 229-246) with a two-step strategy:

**Step 1 — Background-Only Edit (primary approach):** When `imageBase64` is available, send the original image to the model with an explicit "BACKGROUND-ONLY" prompt:
- "Replace ONLY the background with pure white RGB(255,255,255). Do NOT modify, regenerate, or touch any product pixels. The product must remain pixel-identical."
- Include the product identity card for verification context
- Include category-specific occupancy/angle guidance
- This uses the same image generation model but as an **edit** rather than a generation

**Step 2 — Full regeneration fallback:** If Step 1 fails (no image returned, or the gateway returns an error), fall back to the current text-to-image Pattern A approach. Log the fallback for monitoring.

### 2. New Prompt Builder: `buildBackgroundReplacementPrompt`

A new function that constructs the background-only edit prompt:

```text
BACKGROUND-ONLY EDIT — STRICT RULES:
1. Replace the background with pure white RGB(255,255,255)
2. DO NOT modify, regenerate, recolor, or alter the product in any way
3. DO NOT change label text, logos, colors, or shape
4. DO NOT crop or reposition the product
5. Ensure product occupies 85%+ of the frame (resize canvas if needed)
6. Remove any shadows that are not directly beneath the product
7. Add a soft, natural shadow directly beneath the product

[Product Identity Card injected here]
[Category-specific angle/lighting notes here]
```

### 3. Category-Specific Background Notes

Instead of full regeneration prompts, add lightweight "background edit notes" per category — e.g., for BEAUTY: "preserve glossy surface reflections", for ELECTRONICS: "preserve chrome/glass reflections on the product surface". These are appended to the background replacement prompt.

### 4. Retry Logic Update

When a background-only edit fails verification (score < 85), the retry prompt should reference the specific failure. If the failure is "product identity mismatch" on a background-only edit, that's unexpected — log a warning and fall back to the current full-generation approach on the next retry.

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/generate-fix/index.ts` | Add `buildBackgroundReplacementPrompt()`, update Pattern A to use background-only edit with fallback |

## What This Does NOT Change

- Pattern B and C (SECONDARY images) remain unchanged
- The verification flow (`verify-image`) remains unchanged
- The identity card extraction remains unchanged
- No database changes needed

