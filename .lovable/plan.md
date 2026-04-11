

## Phase 2: Category-Specific Policy Expansion

### Overview
Expand the Phase 1 universal policy registry and deterministic audit engine to support category-specific rules with structured evidence, category-aware fix guidance, and layered rule selection.

### Files Changed

**New files:**
- `src/config/categoryPolicyRules.ts` — Category-specific policy rules for APPAREL, FOOTWEAR, JEWELRY, HANDBAGS_LUGGAGE, HARDLINES (plus existing categories)

**Updated files:**
- `src/config/policyRegistry.ts` — Widen `category` type from `'universal'` to include all category strings; add `getRulesForCategory()` and `getApplicableRules()` helpers; add `fix_guidance` field to `PolicyRule`
- `src/config/categoryRules.ts` — Add APPAREL, FOOTWEAR, JEWELRY, HANDBAGS_LUGGAGE, HARDLINES to `ProductCategory` type, `CATEGORY_RULES`, `CATEGORY_OPTIONS`, and `GEMINI_CATEGORY_MAP`
- `src/utils/deterministicAudit.ts` — Accept `productCategory` parameter; run category-specific deterministic checks after universal checks; attach category to findings
- `src/hooks/useAuditSession.ts` — Pass detected/forced category into `runDeterministicAudit`
- `supabase/functions/analyze-image/index.ts` — Add APPAREL/FOOTWEAR/JEWELRY/HANDBAGS_LUGGAGE/HARDLINES rule strings to the LLM prompt; add them to `CATEGORY_RULES_MAP` and category detection prompt; include category in violation mapping
- `src/utils/__tests__/policyEngine.test.ts` — Add tests for category rule selection, override behavior, category-specific rules, and `getApplicableRules` helper

### Implementation Details

**1. PolicyRule type expansion** (`policyRegistry.ts`):
```typescript
// category widens from 'universal' to:
category: 'universal' | 'APPAREL' | 'FOOTWEAR' | 'JEWELRY' | 'HANDBAGS_LUGGAGE' | 'HARDLINES' | 'FOOD_BEVERAGE' | 'SUPPLEMENTS' | 'PET_SUPPLIES' | 'BEAUTY_PERSONAL_CARE' | 'ELECTRONICS' | 'GENERAL_MERCHANDISE';
fix_guidance?: string; // category-aware fix recommendation
```

Add helpers:
- `getRulesForCategory(category)` — returns universal + category-specific rules
- `getApplicableRules(imageType, category)` — filters by both image type and category

**2. Category-specific policy rules** (`categoryPolicyRules.ts`):

APPAREL rules (example):
- `APPAREL_MAIN_MODEL` (llm) — Adult apparel main image should show product on model or ghost mannequin
- `APPAREL_KIDS_OFF_MODEL` (llm) — Kids/baby apparel should be flat lay or off-model
- `APPAREL_NO_CROP` (hybrid) — No cropping of garment edges

FOOTWEAR rules:
- `FOOTWEAR_SINGLE_SHOE` (llm) — Main image: single left shoe at 45-degree angle facing left
- `FOOTWEAR_SOLE_VISIBLE` (llm) — Secondary should include sole view

JEWELRY rules:
- `JEWELRY_NO_MANNEQUIN` (llm) — No mannequin or model on main image
- `JEWELRY_NO_PACKAGING` (llm) — No gift boxes or packaging on main image
- `JEWELRY_OCCUPANCY` (hybrid) — Higher occupancy expectation (product small by nature)

HANDBAGS_LUGGAGE rules:
- `HANDBAGS_FULL_PRODUCT` (llm) — Full product visible, no cropping
- `HANDBAGS_NO_PROPS` (llm) — No distracting props or styling accessories
- `HANDBAGS_MAIN_PRESENTATION` (llm) — Upright, front-facing, handles visible

HARDLINES rules:
- `HARDLINES_WHITE_BG` (hybrid) — White background strictly enforced
- `HARDLINES_IMAGE_MIX` (llm) — Should include environment/size-fit images in secondary set

Each rule includes `fix_guidance` for category-aware recommendations.

**3. Deterministic audit expansion** (`deterministicAudit.ts`):
- `runDeterministicAudit` gains optional `productCategory` param
- After universal checks, runs category-specific deterministic/hybrid checks (e.g., APPAREL crop detection reuses edge-crop logic with tighter thresholds)
- Each finding gets `category` field in evidence

**4. Edge function expansion** (`analyze-image/index.ts`):
- Add APPAREL_RULES, FOOTWEAR_RULES, JEWELRY_RULES, HANDBAGS_LUGGAGE_RULES, HARDLINES_RULES prompt strings
- Add these to `CATEGORY_RULES_MAP` and SYSTEM_PROMPT category list
- Add to `product_category` enum in OUTPUT_SCHEMA
- Violation mapping preserves `rule_id` and `category` from AI response

**5. categoryRules.ts expansion**:
- Add 5 new ProductCategory values: APPAREL, FOOTWEAR, JEWELRY, HANDBAGS_LUGGAGE, HARDLINES
- Add corresponding `CategoryRuleSet` entries with keywords, main/secondary rules, ocr_fields, prohibited, report_notes
- Add to CATEGORY_OPTIONS and GEMINI_CATEGORY_MAP

**6. Tests** (`policyEngine.test.ts`):
- `getRulesForCategory` returns universal + category rules
- `getApplicableRules` filters by image type AND category
- Category rules don't break universal rule selection
- At least one rule per new category exists
- `computePolicyStatus` works with category-tagged findings

### Residual Risks
- LLM category detection may misclassify edge cases (e.g., jewelry vs accessories) — mitigated by existing `forcedCategory` override
- Some category rules are inherently subjective (model vs flat lay) — marked as `llm` check_type, not `deterministic`
- New category keywords in `categoryRules.ts` may overlap (e.g., "bag" matches both HANDBAGS and GENERAL) — ordering matters, first match wins

### Verification
Will run and return exact output of:
- `rg -n "APPAREL|FOOTWEAR|JEWELRY|HANDBAGS|LUGGAGE|HARDLINES|category" src supabase -S`
- `rg -n "rule_id|policyStatus|qualityScore|deterministicFindings|applicableRules|detectedCategory" src supabase -S`
- `rg -n "describe\\(|it\\(|test\\(" src supabase -S`
- `npm run test`
- `npm run typecheck`

