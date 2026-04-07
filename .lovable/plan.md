

## Plan: Add Enhance All to CommandBar + Fix & Enhance All Combo + Fix Gemini Tool Schema Bug

### Bug Fix: `check-policy-updates` 400 Error
The logs show `additionalProperties` is rejected by Gemini's native API. The `convertTools` helper in `gemini.ts` passes tool parameters through verbatim, but Gemini doesn't support `additionalProperties`. Fix: strip `additionalProperties` recursively from tool parameter schemas in `convertTools`.

### Changes

#### 1. Fix `supabase/functions/_shared/gemini.ts` — Strip unsupported schema fields
Add a recursive `cleanSchema` function that removes `additionalProperties` from any object schema before sending to Gemini. Apply it inside `convertTools`.

#### 2. Update `src/components/CommandBar.tsx` — Add Enhance All + Fix & Enhance All
- Add new props: `onBatchEnhance`, `isBatchEnhancing`, `batchEnhanceProgress`, `enhanceableCount`, `onFixAndEnhance`
- On the **fix step**:
  - Show "Fix All (N)" when there are unfixed failures
  - Show "Enhance All (N)" when there are enhanceable images
  - Show "Fix & Enhance All" when **both** conditions are true (runs fix first, then enhance)
- Add enhance progress to the active progress bar display

#### 3. Add `handleFixAndEnhance` to `src/hooks/useAuditSession.ts`
A new handler that sequentially calls `handleBatchFix` then `handleBatchEnhance`. Waits for fix to complete before starting enhance. Expose it in the return object along with a computed `enhanceableCount`.

#### 4. Wire up in `src/pages/Index.tsx`
- Import and render `CommandBar` at the top of the audit page
- Pass all enhance/fix/combo props from the session hook

### Files Modified
1. `supabase/functions/_shared/gemini.ts` — Add `cleanSchema` to strip `additionalProperties`
2. `src/components/CommandBar.tsx` — Add enhance + combo button props and rendering
3. `src/hooks/useAuditSession.ts` — Add `handleFixAndEnhance` + expose `enhanceableCount`
4. `src/pages/Index.tsx` — Wire CommandBar with new props

