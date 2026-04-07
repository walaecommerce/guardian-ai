

## Plan: Optimize Prompt Pipeline for Analysis, Fix, and Enhancement

### Current Architecture Review

The system has 4 key edge functions in a pipeline:

```text
analyze-image → generate-fix → verify-image → (retry loop)
                                     ↑__________________|

enhance-analyze-image → generate-enhancement (parallel path)
```

**Current Models:**
- Analysis/Verification: `gemini-2.5-pro` / `gemini-2.5-flash`
- Image Gen/Edit: `gemini-2.0-flash-exp` (old, experimental)

### Problems Identified

1. **Wrong image generation model**: `gemini-2.0-flash-exp` is deprecated/experimental. Should use `gemini-2.5-flash-image` (Nano Banana) or `gemini-3.1-flash-image-preview` (Nano Banana 2) for image generation — these are the only supported image generation models.

2. **Analysis prompt is bloated (~8K tokens)**: All 6 category rule sets are sent every time, even though only 1 applies. This wastes context and dilutes attention.

3. **No spatial analysis in analyze-image**: The analysis output schema mentions `spatialAnalysis` but the prompt never asks the model to produce it. The `generate-fix` function then tries to use `spatialAnalysis.overlayElements` which is always empty — meaning Tier 2 (OpenAI masked inpainting) never activates.

4. **Fix prompt doesn't receive the analysis output**: `generate-fix` gets a `generativePrompt` string from the analysis, but discards the structured violation data. The fix prompt should reference exact violations.

5. **Verification is shallow**: The verify prompt asks for boolean checks but doesn't re-run the same analysis rubric. A fix could pass verification but still fail a re-analysis.

6. **Enhancement prompts are generic**: `generate-enhancement` category prompts don't reference the specific opportunities identified by `enhance-analyze-image`. The analysis results are thrown away.

7. **No chain-of-thought for image gen**: Image generation models benefit from explicit step-by-step instructions. Current prompts are paragraph-form descriptions.

### Proposed Improvements

#### 1. Upgrade Image Generation Model (`_shared/models.ts`)
Switch from `gemini-2.0-flash-exp` to `gemini-2.5-flash-image` (reliable, fast) with fallback to `gemini-3.1-flash-image-preview` (higher quality).

```
analysis: "gemini-2.5-pro"
imageGen: "gemini-2.5-flash-image"         // was gemini-2.0-flash-exp
imageEdit: "gemini-2.5-flash-image"         // was gemini-2.0-flash-exp
imageGenHQ: "gemini-3.1-flash-image-preview" // new: high-quality fallback
verification: "gemini-2.5-flash"
```

#### 2. Add Spatial Analysis to `analyze-image` Prompt
Add explicit spatial detection instructions and output fields so that overlay badge positions are actually returned. This enables Tier 2 masked inpainting to work.

New output fields:
```json
"spatial_analysis": {
  "overlay_elements": [
    { "id": "badge_1", "type": "best_seller_badge", "location": "top-left",
      "bounds": { "top": 2, "left": 3, "width": 18, "height": 8 },
      "action": "remove", "is_part_of_packaging": false }
  ],
  "text_zones": [...],
  "product_zones": [...],
  "protected_areas": [...]
}
```

#### 3. Slim Down Analysis Prompt — Send Only Relevant Category
Instead of concatenating all 6 category blocks into every prompt (FOOD + PET + SUPPLEMENT + BEAUTY + ELECTRONICS + GENERAL), use a 2-pass approach:
- **Pass 1** (already happens): Model detects category as part of analysis
- **Change**: Move category rules into the user message after telling the model which category context to apply, OR use a single "detect then apply" instruction that explicitly says "ONLY apply the rules for the category you detected"

This reduces prompt size by ~60% and improves focus.

#### 4. Feed Structured Violations into Fix Prompt
Currently `generate-fix` gets `generativePrompt` (a free-text AI suggestion) but ignores the actual violation list. Change to:
- Pass top 3 violations with their severity and recommendation directly into the fix prompt
- Include the `scoring_rationale` so the model knows what went wrong

#### 5. Structured Step-by-Step Fix Instructions
Replace paragraph prompts with numbered step instructions for image generation:

```text
STEP 1: Identify all non-product pixels (background, shadows, surfaces)
STEP 2: Replace identified pixels with pure white RGB(255,255,255)
STEP 3: Add a subtle natural drop shadow directly beneath the product
STEP 4: Verify the product occupies 85%+ of the frame — if not, crop tighter
STEP 5: Verify all label text is unchanged and legible
OUTPUT: The edited image only. No text response needed.
```

#### 6. Connect Enhancement Analysis → Generation
Currently `handleBatchEnhance` calls `enhance-analyze-image` then `generate-enhancement`, but the analysis results (specific `enhancementOpportunities`) aren't passed into the generation prompt. Fix: extract the top opportunities and inject them as `targetImprovements` in the generation call.

#### 7. Add Model Fallback Chain in `generate-fix`
Update `callGateway` to try `gemini-2.5-flash-image` first, then fall back to `gemini-3.1-flash-image-preview` if the first returns 404 or empty.

### Files Modified

1. **`supabase/functions/_shared/models.ts`** — Update model IDs, add `imageGenHQ`
2. **`supabase/functions/analyze-image/index.ts`** — Add spatial analysis output schema, add "only apply detected category" instruction, slim prompt
3. **`supabase/functions/generate-fix/index.ts`** — Accept structured violations, use step-by-step prompts, update model fallback chain
4. **`supabase/functions/verify-image/index.ts`** — Minor: reference spatial zones in verification
5. **`supabase/functions/enhance-analyze-image/index.ts`** — No prompt changes needed (already good)
6. **`supabase/functions/generate-enhancement/index.ts`** — Accept and use `targetImprovements` from analysis results
7. **`src/hooks/useAuditSession.ts`** — Pass enhancement analysis opportunities into generation call; pass violations into fix call

