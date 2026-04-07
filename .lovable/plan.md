
Goal: turn AI-balance exhaustion into one clear “audit paused” state, instead of showing multiple overlapping failure UIs.

1. Confirmed root cause
- The edge function already soft-returns `errorType: "payment_required"` for gateway 402s.
- The frontend catches it, but still writes `analysisError` onto each failed asset.
- Because of that, generic failure UI also renders:
  - top credits banner
  - partial-failure panel in `AuditStep`
  - “Audit Failed” card in `AnalysisResults`
  - destructive toast
- So the app no longer truly crashes, but it still looks like a broken flow.

2. Update the audit-state model
- In `src/hooks/useAuditSession.ts`, separate “AI balance exhausted” from normal per-image failures.
- Introduce a dedicated paused-state object, e.g.:
  - `auditPauseReason: 'ai_balance_exhausted' | null`
  - optional metadata like skipped count / failed asset id
- When `analyzeAsset()` detects `payment_required`, stop the batch and set the paused state without treating it like a normal image-analysis failure.
- Avoid storing the 402 message in `analysisError` for that asset, or clear it immediately after stopping the run.

3. Consolidate frontend rendering
- In `src/pages/Index.tsx`, keep a single top-level paused notice for AI balance exhaustion.
- Expand the existing `AICreditsExhaustedBanner` into the primary UX:
  - heading like “Audit Paused”
  - explanation that workspace AI balance ran out
  - optional count of images already analyzed vs remaining
  - CTA copy pointing to `Settings → Cloud & AI balance`
- This banner should represent the state by itself, so users do not also see generic “audit failed” messaging.

4. Suppress duplicate error surfaces during this state
- In `src/components/audit/AuditStep.tsx`
  - hide the red “failed to analyze / Retry Failed” panel when pause reason is AI balance exhaustion
- In `src/components/AnalysisResults.tsx`
  - prevent the “Audit Failed” empty-state card from rendering when all failures are caused by paused AI balance
  - instead show either:
    - partial completed results, if any exist, or
    - a neutral paused placeholder if none were completed
- In `useAuditSession.ts`
  - replace destructive duplicate toasts with one concise pause toast only once per run/retry

5. Handle retry behavior cleanly
- In `handleRetryFailedAnalysis`, reuse the same pause logic.
- If balance is still exhausted, keep the paused state and avoid stacking new failure errors.
- If balance is restored, clear the paused state before retry so the normal audit UI resumes.

6. Keep crash protection in place
- Leave the global `ErrorBoundary` in `src/App.tsx` as a safeguard.
- The fix should not rely on the boundary; it should prevent the audit flow from entering a generic failure path in the first place.

Technical details
- Files to update:
  - `src/hooks/useAuditSession.ts`
  - `src/components/AICreditsExhaustedBanner.tsx`
  - `src/components/audit/AuditStep.tsx`
  - `src/components/AnalysisResults.tsx`
  - `src/pages/Index.tsx`
- Main implementation rule:
  - treat `payment_required` as a batch-level paused state, not as an asset-level analysis failure
- Expected result:
  - no blank screen
  - no stacked red states
  - one clear paused banner/toast
  - already analyzed results remain visible
  - remaining images can be retried later after balance is restored
