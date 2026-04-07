

## Plan: Add "Enhance All" Batch Operation to Fix Step

### Summary
Add an "Enhance All" button alongside the existing "Fix All" button in the Fix step. "Fix All" targets compliance failures (FAIL/WARNING images without fixes). "Enhance All" targets ALL images (including PASS) to improve their marketing quality using the existing `enhance-analyze-image` and `generate-enhancement` edge functions.

### What Changes

#### 1. Add `handleBatchEnhance` to `useAuditSession.ts`
- New state: `isBatchEnhancing`, `batchEnhanceProgress`
- New handler that iterates through enhanceable images (all analyzed images, or optionally only PASS images that haven't been enhanced yet)
- For each image: calls `enhance-analyze-image` to get enhancement analysis, then `generate-enhancement` to produce the enhanced version
- Stores the enhanced image in `fixedImage` (reusing the existing field) with `fixMethod` set to a new value like `'enhancement'`
- Sequential processing with rate limit delays (same pattern as batch fix)
- Expose new state and handler in the return object

#### 2. Add `'enhancement'` to `FixMethod` type in `types.ts`
- Extend `FixMethod` union: `'bg-segmentation' | 'full-regeneration' | 'openai-inpainting' | 'surgical-edit' | 'enhancement'`

#### 3. Update `FixStep.tsx` UI
- Add an "Enhance All" button (with Sparkles icon) next to "Fix All"
- New props: `onBatchEnhance`, `isBatchEnhancing`, `batchEnhanceProgress`
- Show enhance progress bar when enhancing
- Count enhanceable images (analyzed images without enhanced versions)
- When both Fix All and Enhance All are available, show both buttons side by side

#### 4. Update `CommandBar.tsx`
- Add "Enhance All" as a secondary action when on the fix step and there are enhanceable images

#### 5. Wire up in `Index.tsx`
- Pass the new `handleBatchEnhance`, `isBatchEnhancing`, `batchEnhanceProgress` props to `FixStep`

### Technical Details

**Enhance flow per image:**
```
1. Call enhance-analyze-image → get EnhancementAnalysis
2. Extract top enhancement opportunities
3. Call generate-enhancement with analysis + main image reference
4. Store result as fixedImage with fixMethod = 'enhancement'
```

**Button logic:**
- "Fix All (N)" — shown when there are FAIL/WARNING images without fixes
- "Enhance All (N)" — shown when there are analyzed images that could benefit from enhancement (PASS images or already-fixed images)
- Both can coexist; they target different image sets

### Files Modified
1. `src/types.ts` — Add `'enhancement'` to `FixMethod`
2. `src/hooks/useAuditSession.ts` — Add batch enhance state + handler
3. `src/components/audit/FixStep.tsx` — Add Enhance All button + progress
4. `src/pages/Index.tsx` — Wire new props
5. `src/components/CommandBar.tsx` — Add enhance action (optional)

