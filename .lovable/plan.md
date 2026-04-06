

# Amazon Image Optimization System: Documentation and Improvement Plan

## Section 1: Current System Architecture

### 1.1 The Complete Workflow (as implemented)

```text
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. IMPORT   │───▶│ 2. CLASSIFY  │───▶│ 3. ANALYZE   │───▶│  4. FIX/     │───▶│ 5. VERIFY    │
│  (scrape or  │    │  (AI vision  │    │  (compliance │    │  ENHANCE     │    │  (score ≥85  │
│   upload)    │    │   category)  │    │   audit)     │    │  (generate)  │    │   to pass)   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                  │                    │
                                                                  ◀────── retry ───────┘
                                                                (up to 3x with critique)
```

**Step 1 - Import**: Scrape Amazon listing via ASIN or upload images manually. Creates an `enhancement_session` in the database.

**Step 2 - Classify**: AI vision classifies each image by content type (PRODUCT_SHOT, INFOGRAPHIC, LIFESTYLE, etc.) separate from position-based type (MAIN vs SECONDARY).

**Step 3 - Analyze** (`analyze-image`): Uses `google/gemini-3.1-pro-preview` with category-aware prompts. Detects product category (FOOD_BEVERAGE, SUPPLEMENTS, BEAUTY, etc.), applies universal + category-specific rules, performs OCR for packaging text, cross-references against listing title, and returns a compliance score with violations.

**Step 4 - Fix/Enhance** (`generate-fix` / `generate-enhancement`): Uses `google/gemini-3-pro-image-preview` for image generation. Three patterns:
- **Pattern A (MAIN)**: Text-to-image with category-specific prompt templates (8 categories). Generates a fresh studio photo on pure white background.
- **Pattern B (SECONDARY)**: Image-to-image surgical edit. Removes only prohibited badges while preserving lifestyle/infographic content.
- **Pattern C (SECONDARY + Main Ref)**: Same as B but passes the MAIN image as a reference for product identity consistency.

**Step 5 - Verify** (`verify-image`): Uses `google/gemini-3.1-pro-preview` to compare original vs generated image. Checks background compliance, text removal, product identity, occupancy, and quality. Score ≥ 85 passes; otherwise, critique feeds back into Step 4 for retry (max 3 attempts).

### 1.2 Product Consistency Mechanisms

**What is currently implemented:**
- Pattern C passes the MAIN image alongside the SECONDARY image during fix generation, with instructions to "ensure product matches the reference main image provided"
- The `verify-image` function accepts `mainImageBase64` and adds it as "MAIN PRODUCT REFERENCE (for product identity check)" when verifying secondary images
- The `enhance-analyze-image` function compares secondary images against the main image for `sameProductDetected` and `productMatchScore`
- Verification checks `productMatch` — if false, `isSatisfactory` is forced to false regardless of score

**What is NOT implemented (gaps):**
- No persistent "product identity embedding" — the main image is re-sent as raw base64 every time, with no extracted feature vector or structured product descriptor
- No explicit color/label/shape consistency check — the model is just told "ensure product matches" without structured criteria
- No "product identity card" that stores extracted product attributes (brand logo position, label text, color palette, shape silhouette) for reuse across all images

### 1.3 Prompt Architecture

**Analysis prompts** (~3,000 tokens): Structured as System + Category Rules + Output Schema. Very detailed with specific deduction tables (e.g., -40 for missing product, -30 for badges). Includes OCR extraction and content consistency cross-referencing.

**Fix prompts** (~200-500 tokens): Category-specific templates with product title interpolation. Focus on photographic style (e.g., "3/4 angle showing front and one side" for food, "ghost mannequin or flat lay" for apparel). Protected zones and removal instructions appended dynamically from spatial analysis.

**Verification prompts** (~150 tokens): Simple checker schema requesting boolean checks and a score. Minimal guidance — relies on the model's general capability.

**Enhancement prompts** (~200-300 tokens): Category-specific goals (e.g., lifestyle: "make product the hero", infographic: "add product cutout, enhance callouts").

---

## Section 2: Market Research — Best Practices (2025-2026)

### 2.1 The 7-Image Strategy (Industry Standard)
Top-performing listings use all 7+ image slots:
1. **Hero/Main** — pure white, 85%+ fill, studio quality
2. **Feature Callout Infographic** — top 3-5 selling points with icons
3. **Dimensions/Size Reference** — reduces returns by 35%
4. **Lifestyle/In-Use** — product as hero in aspirational context
5. **Ingredients/Materials Closeup** — builds trust
6. **Comparison/Before-After** — shows value proposition
7. **Packaging/What's in the Box** — sets expectations

### 2.2 Mobile-First Optimization
- 60%+ of Amazon shoppers browse on mobile
- Text on infographics must be 24pt+ for mobile readability
- Images viewed at ~150px width on mobile — product must be identifiable at this size
- Competitors like Photoroom and GreenOnion auto-generate mobile-optimized layouts

### 2.3 Industry AI Image Best Practices
- **Reference-anchored generation**: Leading tools (Photoroom, PixelPanda) extract a "product mask" from the original photo and use it as a hard constraint during generation — the product pixels are never regenerated, only the background/context changes
- **Multi-image consistency scoring**: Tools like NightJar score consistency across all 7+ images as a set, not individually
- **A/B testing integration**: Top platforms generate multiple variants and connect to Amazon Experiments for data-driven selection
- **Batch coherence**: All images in a listing should share a visual language (same fonts, same color palette, same photography style)

### 2.4 Gaps vs. Market Leaders

| Capability | Our System | Market Leaders | Gap |
|---|---|---|---|
| Product mask extraction | None — regenerates full image | Hard pixel mask preserved | High |
| Cross-image style consistency | None | Font/color/style enforcement | High |
| Mobile readability scoring | Exists (text_readability_score) | Auto-resize + preview | Medium |
| A/B variant generation | None | 3-5 variants per slot | Medium |
| Product identity card | Implicit (raw image ref) | Structured descriptor | High |
| Batch set scoring | Individual only | Holistic listing score | Medium |
| Background segmentation | AI regeneration | Precise segmentation + swap | High |

---

## Section 3: Implementation Plan

### Phase 1: Product Identity Card (High Impact)
**Goal**: Extract and persist a structured product descriptor from the MAIN image so all subsequent operations reference it consistently.

- Create a new edge function `extract-product-identity` that analyzes the MAIN image and returns: brand name, product name, dominant colors (hex values), shape silhouette description, label text, key visual features, and a product descriptor paragraph
- Store this in a new `product_identity` column on the `enhancement_sessions` table (JSONB)
- Pass the structured identity card (not just raw image bytes) to `generate-fix`, `verify-image`, and `generate-enhancement` as additional context in prompts
- **Verification upgrade**: Check generated images against the identity card's specific attributes (e.g., "label says X", "primary color is #Y")

### Phase 2: Background Segmentation Instead of Regeneration (High Impact)
**Goal**: For MAIN images, stop regenerating the entire product. Instead, segment the product, preserve it pixel-perfectly, and only replace the background.

- Update `generate-fix` Pattern A to use a two-step approach: (1) send image to AI with prompt "segment the product from background", (2) composite the original product pixels onto pure white
- This eliminates the biggest source of product identity failures — the model changing product details during regeneration
- Fallback to current full-generation approach if segmentation fails

### Phase 3: Cross-Image Style Consistency Engine (Medium Impact)
**Goal**: Ensure all 7+ images in a listing share visual coherence.

- After analyzing all images, compute a "listing style profile" (dominant colors, font styles detected, photography style)
- Add a `listing-consistency-score` endpoint that evaluates the full image set holistically
- Surface a "Listing Coherence Score" in the UI alongside individual image scores
- Flag inconsistencies: e.g., "Image 3 uses sans-serif fonts while Images 2,4,5 use serif"

### Phase 4: Mobile Preview and Auto-Resize (Medium Impact)
**Goal**: Show sellers exactly how their images look on mobile before publishing.

- Add a mobile preview panel (150px thumbnail simulation) to the analysis results
- Auto-flag text that would be unreadable at mobile size (already have `text_readability_score` — surface it more prominently)
- Add a "Mobile Readability" badge to each image card

### Phase 5: A/B Variant Generation (Lower Priority)
**Goal**: Generate 2-3 variants per image slot for seller testing.

- Add a "Generate Variants" button that creates alternative versions with different angles, lighting, or composition
- Store variants in the session for comparison
- Future: integrate with Amazon Experiments API for automated A/B testing

### Phase 6: Prompt Engineering Improvements (Quick Wins)
**Goal**: Improve fix quality without architectural changes.

- **Verification prompts**: Add structured rubric with weighted criteria instead of simple boolean checks. Include specific product identity attributes from the identity card.
- **Secondary fix prompts**: Add explicit "DO NOT regenerate the product" instruction and specify exact badge locations from spatial analysis for surgical removal
- **Retry prompts**: Include visual diff description from previous attempt critique (e.g., "the label text was blurred in the previous attempt — this time preserve all text at original resolution")
- **Enhancement prompts**: Add mobile readability requirements (e.g., "ensure all text is readable at 150px width")

### Implementation Priority

| Phase | Effort | Impact | Priority |
|---|---|---|---|
| Phase 1: Product Identity Card | 2-3 days | High | 1st |
| Phase 6: Prompt Improvements | 1 day | Medium-High | 2nd |
| Phase 2: Background Segmentation | 3-4 days | High | 3rd |
| Phase 4: Mobile Preview | 1-2 days | Medium | 4th |
| Phase 3: Style Consistency | 3-4 days | Medium | 5th |
| Phase 5: A/B Variants | 2-3 days | Lower | 6th |

