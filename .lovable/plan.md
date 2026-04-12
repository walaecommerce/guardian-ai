

## Phase 3: Category-Aware Safe Fix Generation

### Overview
Refactor the fix generation pipeline to default to edit-preserving fixes for MAIN images (not full regeneration), add a structured fix plan layer that selects safe fix modes based on category + violations + image role, strengthen identity preservation constraints per category, and improve verification to check for new violations.

### Files Changed

**New files:**
- `src/utils/fixPlanEngine.ts` — Fix plan builder: given image type, category, violations, and deterministic findings, produces a structured `FixPlan` with strategy, preservation constraints, permitted changes, and prohibited modifications
- `src/utils/__tests__/fixPlanEngine.test.ts` — Tests for fix strategy selection, category-aware planning, main-image safe mode

**Updated files:**
- `supabase/functions/generate-fix/index.ts` — Receives fix plan from client; uses it to build structured prompts with explicit preserve/change/remove/rule sections; adds category-specific preservation constraints; defaults MAIN to Pattern A1 more aggressively
- `supabase/functions/verify-image/index.ts` — Adds "no new violations" check and category-aware identity verification; checks fix actually addressed the target rule_id
- `src/hooks/useAuditSession.ts` — Calls `buildFixPlan()` before invoking generate-fix; passes plan in request body
- `src/types.ts` — Add `FixPlan` and `FixStrategy` types

### Implementation Details

**1. FixPlan types** (`src/types.ts`):
```typescript
export type FixStrategy = 'bg-cleanup' | 'crop-reframe' | 'overlay-removal' | 'inpaint-edit' | 'full-regeneration';

export interface FixPlan {
  strategy: FixStrategy;
  targetRuleIds: string[];
  category: string;
  imageType: 'MAIN' | 'SECONDARY';
  preserve: string[];      // what must not change
  permitted: string[];      // what may be modified
  remove: string[];         // what must be removed
  prohibited: string[];     // modifications that are forbidden
  categoryConstraints: string[]; // category-specific instructions
}
```

**2. Fix plan engine** (`src/utils/fixPlanEngine.ts`):

Core function `buildFixPlan(imageType, category, violations, deterministicFindings, productIdentity)`:

- For MAIN images, selects strategy based on violation types:
  - Background violations → `bg-cleanup`
  - Occupancy violations → `crop-reframe`
  - Text/badge overlay violations → `overlay-removal`
  - Multiple issues → `inpaint-edit`
  - No original image available → `full-regeneration` (only fallback)
- For SECONDARY images, defaults to `overlay-removal` or `inpaint-edit`
- Populates `preserve[]` from category:
  - APPAREL: garment shape, cut, fabric texture, color, stitching
  - FOOTWEAR: shoe shape, material, color, sole pattern
  - JEWELRY: metal/stone arrangement, settings, finish
  - HANDBAGS_LUGGAGE: handles, straps, hardware, silhouette
  - HARDLINES/ELECTRONICS: ports, controls, safety labels, dimensions
  - FOOD/SUPPLEMENTS/BEAUTY/PET: all packaging text, label claims, regulated info
- Populates `prohibited[]` from category (e.g., "Do not change label text" for FOOD)
- Populates `remove[]` from violation list (badges, non-white background pixels, etc.)

**3. generate-fix refactor** (`supabase/functions/generate-fix/index.ts`):

- Accept `fixPlan` in request body
- New prompt builder `buildPlanAwarePrompt(fixPlan, title, identity)` that structures the prompt as:
  ```
  FIX OBJECTIVE: [strategy description]
  TARGET RULES: [rule_ids being fixed]
  
  MUST PRESERVE:
  - [preserve items]
  
  MAY CHANGE:
  - [permitted items]
  
  MUST REMOVE:
  - [remove items]
  
  PROHIBITED MODIFICATIONS:
  - [prohibited items]
  
  CATEGORY CONSTRAINTS:
  - [category-specific instructions]
  ```
- When `fixPlan.strategy !== 'full-regeneration'`, always use Pattern A1 (edit-only) with the original image
- Only fall back to Pattern A2 when strategy is explicitly `full-regeneration` or A1 fails with identity mismatch
- Keep existing `buildBackgroundReplacementPrompt` and `buildMainImagePrompt` as inner helpers, but wrap them with the plan-aware structure

**4. verify-image improvements** (`supabase/functions/verify-image/index.ts`):

- Add `targetRuleIds` to request body (from fix plan)
- Add to rubric: "Target rule violations fixed" check — verify the specific rules that were supposed to be fixed are now passing
- Add "No new violations introduced" as explicit check
- Add category-aware identity section that lists category-specific preservation requirements

**5. useAuditSession.ts integration** (around line 832):

- Import `buildFixPlan` from `src/utils/fixPlanEngine`
- Before calling `generate-fix`, build a fix plan:
  ```typescript
  const fixPlan = buildFixPlan(
    asset.type,
    asset.analysisResult?.productCategory || selectedCategory || 'GENERAL',
    asset.analysisResult?.violations || [],
    asset.analysisResult?.deterministicFindings || [],
    productIdentity
  );
  ```
- Pass `fixPlan` in the edge function invocation body
- Pass `fixPlan.targetRuleIds` to verify-image

**6. Tests** (`src/utils/__tests__/fixPlanEngine.test.ts`):

- MAIN image with bg violation → strategy `bg-cleanup`, not `full-regeneration`
- MAIN image with overlay violation → strategy `overlay-removal`
- SECONDARY image → never `full-regeneration` unless no original
- APPAREL category → preserve includes "garment shape", prohibited includes "do not alter fabric texture"
- FOOD category → preserve includes "packaging text", "label claims"
- JEWELRY category → preserve includes "metal/stone arrangement"
- Plan includes target rule_ids from violations
- Plan with no violations → strategy `bg-cleanup` (safest default for MAIN)

### Residual Risks

- LLM may still alter product despite explicit preservation instructions — mitigated by verification loop with identity checks
- `full-regeneration` fallback still exists but is no longer the default path for MAIN images
- Edge function prompt length increases slightly due to structured plan sections — within model context limits
- Fix plan is built client-side; a malicious client could override it — but verification still runs server-side with identity checks

### Verification
Will run and return exact output of:
- `rg -n "fix plan|fix strategy|preserve|inpaint|regenerate|policy|rule_id|deterministicFindings|identity" src supabase -S`
- `rg -n "APPAREL|FOOTWEAR|JEWELRY|HANDBAGS|LUGGAGE|HARDLINES|FOOD_BEVERAGE|SUPPLEMENTS|BEAUTY|PET_SUPPLIES|ELECTRONICS" src supabase/functions/generate-fix -S`
- `rg -n "describe\\(|it\\(|test\\(" src supabase -S`
- `npm run test`
- `npm run typecheck`

