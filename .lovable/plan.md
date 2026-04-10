

# Phase 3: Research-Grounded Policy Intelligence & Recommendation Quality

## Overview

Six goals: real grounded policy research, current Amazon title rules, image coverage logic, consolidated recommendations, structured studio prompts, and overall recommendation quality.

---

## 1. Replace fake policy updates with real Gemini grounding

**Current state**: `check-policy-updates` uses a plain prompt that says "search for..." but has no actual search tool. Gemini hallucinates updates.

**Fix**: Use Gemini's native `google_search` tool in the REST API. The Gemini native API supports `"tools": [{"google_search": {}}]` which performs real web search and returns `groundingMetadata` with source URLs.

**Changes**:

- **`supabase/functions/check-policy-updates/index.ts`** — Rewrite to:
  1. Pass `google_search: {}` as a tool (not `function` tool) in the Gemini request body
  2. This requires a small addition to `_shared/gemini.ts` to support non-function tools (or call the Gemini API directly in this function)
  3. Parse `groundingMetadata` from the response for source URLs, web search queries used
  4. Extract structured results using a follow-up tool call or JSON parse
  5. Each update item returns: `title`, `summary`, `sourceUrl`, `sourceName`, `publishedDate`, `checkedAt`, `confidence` (high/medium/low based on grounding chunks), `affectedArea`
  6. Return `{ status: 'no_updates' }` explicitly when no real updates found
  7. Return `{ status: 'error', reason: '...' }` on failure

- **`supabase/functions/_shared/gemini.ts`** — Add support for `google_search` tool type in `convertTools()`. When a tool has `google_search: {}`, pass it through as-is (not as a function declaration). Also extract `groundingMetadata` from the response and include it in the OpenAI-compatible wrapper.

- **`src/hooks/usePolicyUpdates.ts`** — Update `PolicyUpdate` interface to include new fields: `title`, `sourceUrl`, `sourceName`, `publishedDate`, `checkedAt`, `confidence`, `affectedArea`. Update `PolicyData` to include `status` field.

- **`src/components/PolicyUpdates.tsx`** — Update UI to show:
  - Source links with domain names as clickable citations
  - `checkedAt` timestamp
  - Confidence badge (high/medium/low)
  - Affected area tag
  - Empty state: "No policy changes detected" vs error state: "Research unavailable"

---

## 2. Update title analysis for current Amazon title rules (Jan 2025)

**Current state**: Title analysis is entirely AI-generated freeform text via `listing-suggestions` and `generate-suggestions`. No structured rule checking.

**Fix**: Add a deterministic title rule checker and improve AI title suggestions.

**Changes**:

- **New file: `src/config/titleRules.ts`** — Define structured title rules:
  - 200-char limit (most categories)
  - No ALL CAPS words (except brand/acronyms)
  - No special characters: `~`, `!`, `$`, `?`, `_`, `{`, `}`, `^`, `¬`, `¦` etc.
  - No promotional language: "best seller", "hot item", "top rated", "#1", "limited time"
  - No subjective claims: "amazing", "best quality", "premium" without context
  - No repeated words (same word 3+ times = keyword stuffing)
  - Brand should appear first
  - Each rule has: `id`, `name`, `check` function, `severity`, `guidance`, `reference` (Jan 21, 2025 rule set)

- **New file: `src/utils/titleAnalyzer.ts`** — Export `analyzeTitleCompliance(title, category?)` that runs all rules and returns structured findings: `{ passed: boolean, rules: { ruleId, passed, message, guidance }[] }`.

- **Update `supabase/functions/generate-suggestions/index.ts`** — Enhance the title_improvements section of the system prompt to reference the January 2025 rules explicitly. Include structured rule violations in the prompt context so the AI generates specific rewrites, not generic advice.

- **Update `src/components/recommendations/TitleImprovementsTab.tsx`** — Add a deterministic "Title Compliance" section at the top showing pass/fail per rule before the AI suggestions. Show the rule reference and guidance.

---

## 3. Upgrade image completeness from slot count to required coverage

**Current state**: `listing-scorecard` uses a simple map: 9 images = 100, 8 = 88, etc. No coverage-type awareness beyond the diversity score.

**Fix**: Replace completeness with coverage-based scoring.

**Changes**:

- **`supabase/functions/listing-scorecard/index.ts`** — Replace the `completenessMap` with a coverage model:
  - Required coverage types: `HERO/MAIN` (weight 30), `LIFESTYLE/IN_USE` (weight 25), `INFOGRAPHIC` (weight 25), `DETAIL/PACKAGING/SIZE_CHART` (weight 20)
  - Score = sum of weights for covered types, with a small bonus for slot utilization
  - Generate specific missing-coverage recommendations instead of "add N more images"
  - Make recommendations explain what type is missing, why it matters, and what to show
  - Keep category-aware: e.g., FOOD needs ingredients closeup, SUPPLEMENTS needs supplement facts

- **Update the completeness `priorityActions` message** to reference specific missing coverage types, not just counts.

---

## 4. Consolidate recommendation logic into one contract

**Current state**: Two separate backend functions (`listing-suggestions` and `generate-suggestions`) and two separate frontend components (`AIRecommendations` and `RecommendationsPanel`) that produce different shapes of recommendation data.

**Fix**: Consolidate to one backend + one frontend.

**Changes**:

- **Delete `supabase/functions/listing-suggestions/index.ts`** — This is the older, less structured version.

- **Delete `src/components/AIRecommendations.tsx`** — Orphan component (not imported in any page). Uses `listing-suggestions`.

- **Update `supabase/functions/generate-suggestions/index.ts`** — This is the canonical recommendation engine. Enhance its prompt to:
  - Include deterministic title rule violations from the request body
  - Include missing image coverage types
  - Return the existing structured tool-call shape (already well-typed)
  - Add `source` or `evidence` field to each recommendation where applicable

- **`src/components/recommendations/types.ts`** — Add optional `evidence` field to recommendation types.

- **`src/components/recommendations/RecommendationsPanel.tsx`** — Remains the single canonical UI. No changes needed beyond what TitleImprovementsTab gets.

---

## 5. Rebuild studio prompts as a structured planner

**Current state**: `generate-studio-image` has simple template strings. `generate-suggested-image` wraps prompts with a generic "generate a high-quality Amazon product listing image" wrapper.

**Fix**: Add a structured prompt planner.

**Changes**:

- **`supabase/functions/generate-studio-image/index.ts`** — Replace the flat `TEMPLATES` with a structured planner:
  - Accept `category` from the request body
  - Load category-specific rules (prohibited elements, required characteristics)
  - Build prompt with explicit sections: subject, scene, composition, lighting, constraints (prohibited: badges, watermarks, competitor logos), preservation (brand identity, claims), Amazon compliance notes
  - Add negative instructions: "Do NOT include: promotional badges, 'Best Seller' text, watermarks, competitor brand names"
  - Keep template variety but make each template category-aware

- **`supabase/functions/generate-suggested-image/index.ts`** — Same: enhance the prompt wrapper with structured planner sections including prohibited elements and category context.

- **`src/pages/Studio.tsx`** — Add optional category selector. Pass `category` to the edge function. No major UI redesign.

---

## 6. Improve recommendation quality and research grounding

**Changes**:

- **`supabase/functions/generate-suggestions/index.ts`** — Rewrite the system prompt to:
  - Remove generic advice ("improve your listing")
  - Require specific, actionable recommendations with evidence
  - Reference the January 2025 title rules
  - Reference image coverage best practices with conversion data
  - Require each recommendation to explain *why* with category-specific reasoning
  - Set temperature to 0.2 (from 0.4) for more consistent output

- **Update all recommendation prompts** to include: "Do not generate vague or boilerplate recommendations. Each recommendation must reference a specific finding from the audit data."

---

## Files changed (summary)

### New files
- `src/config/titleRules.ts` — Structured title rule definitions
- `src/utils/titleAnalyzer.ts` — Deterministic title compliance checker

### Deleted files
- `supabase/functions/listing-suggestions/index.ts` — Duplicate recommendation engine
- `src/components/AIRecommendations.tsx` — Orphan component

### Modified edge functions
- `supabase/functions/_shared/gemini.ts` — Support `google_search` grounding tool
- `supabase/functions/check-policy-updates/index.ts` — Real grounded search
- `supabase/functions/generate-suggestions/index.ts` — Enhanced prompts, evidence fields
- `supabase/functions/generate-studio-image/index.ts` — Structured prompt planner
- `supabase/functions/generate-suggested-image/index.ts` — Category-aware prompts
- `supabase/functions/listing-scorecard/index.ts` — Coverage-based completeness

### Modified frontend
- `src/hooks/usePolicyUpdates.ts` — New policy update contract
- `src/components/PolicyUpdates.tsx` — Citations, confidence, empty/error states
- `src/components/recommendations/types.ts` — Evidence field
- `src/components/recommendations/TitleImprovementsTab.tsx` — Deterministic rule check section
- `src/pages/Studio.tsx` — Category selector

### No migrations needed

### Deployment notes
- Gemini grounding with `google_search` requires the `GOOGLE_GEMINI_API_KEY` to have grounding enabled (it is by default on Gemini 2.5 Pro/Flash)
- Deleting `listing-suggestions` function: will need to be removed from deployed functions

### Remaining risks
- Gemini grounding quality depends on Google Search availability; the error state handles this gracefully
- Title rules may need per-category character limit overrides in future (currently 200 for all)

