

## Phase 4: Retry Intelligence + Safer Escalation

### Overview
Add a retry planner module that uses verification failure details to make smarter retry decisions — tightening constraints, switching strategies, or stopping early when continued attempts are unsafe. MAIN images never casually escalate to full regeneration.

### New Files

**`src/utils/retryPlanner.ts`** — Core retry decision engine
- Export `RetryDecision` type:
  ```typescript
  export interface RetryDecision {
    shouldContinue: boolean;
    nextStrategy: FixStrategy;
    rationale: string;
    tightenedPreserve: string[];
    tightenedProhibited: string[];
    additionalInstructions: string[];
    stopReason?: string;
  }
  ```
- Export `planRetry(params)` function accepting:
  - `imageType`, `category`, `currentStrategy`, `attempt`, `maxAttempts`
  - `verification: VerificationResult` (the failed result)
  - `targetRuleIds: string[]`
  - `previousDecisions: RetryDecision[]` (history for detecting repeated failures)
- Logic:
  - **Identity drift detected** (`productMatch === false`): For MAIN, tighten preserve list, add "DO NOT alter product shape/color/text", reduce permitted scope. If identity drift happened twice, `shouldContinue = false`, `stopReason = "repeated identity drift on MAIN image"`.
  - **Target rules still failing** (`failedChecks` includes target rule keywords): Retry same strategy with rule-specific instructions added. If same rules failed 2+ times with no score improvement, stop.
  - **New violations introduced** (`failedChecks` includes "no_new_violations" or "noNewIssues" score < 70): Tighten prohibited list, add "MUST NOT introduce new issues", narrow permitted edits.
  - **Background/compliance failed but identity OK**: Retry same strategy with stricter compliance language ("pure white RGB(255,255,255) mandatory").
  - **MAIN image escalation guard**: Never set `nextStrategy = 'full-regeneration'` for MAIN. If current strategy already `inpaint-edit` and still failing, stop with reason rather than escalate.
  - **SECONDARY images**: May escalate from `overlay-removal` → `inpaint-edit`, but still never to `full-regeneration` unless explicitly requested.
  - **Strategy tightening order** for MAIN: `bg-cleanup` → `crop-reframe` → `inpaint-edit` → STOP (never `full-regeneration`)

**`src/utils/__tests__/retryPlanner.test.ts`** — Tests covering:
- Identity failure on MAIN → tightened preserve, does NOT escalate to full-regeneration
- Repeated identity failure → `shouldContinue = false`
- Target rule failure → retry with rule-specific instructions
- New violations → tightened prohibited list
- MAIN image never reaches `full-regeneration`
- SECONDARY image may escalate to `inpaint-edit`
- Compliance failure with identity OK → same strategy, stricter wording

### Modified Files

**`src/types.ts`**
- Add `RetryDecision` interface (or re-export from retryPlanner)
- Add optional `retryDecision?: RetryDecision` field to `FixAttempt`

**`src/hooks/useAuditSession.ts`** (retry loop ~lines 968-993)
- Import `planRetry` from `@/utils/retryPlanner`
- After verification fails and before retrying, call `planRetry()` with the verification result, current strategy, attempt number, and history
- If `shouldContinue === false`, log the `stopReason`, break the loop, use best available image
- If continuing, update the fix plan with `nextStrategy`, merge `tightenedPreserve` and `tightenedProhibited` into the plan
- Pass `additionalInstructions` as extra context to generate-fix (append to `previousCritique`)
- Log the retry decision rationale

**`supabase/functions/generate-fix/index.ts`**
- Accept optional `retryInstructions: string[]` in request body
- If present, append a `RETRY CORRECTIONS` section to the prompt:
  ```
  RETRY CORRECTIONS (from previous attempt failure):
  - [instruction 1]
  - [instruction 2]
  ```

### Logic Flow

```text
Attempt N fails verification
        │
        ▼
  planRetry(verification, strategy, attempt, history)
        │
        ├─ shouldContinue = false → log stopReason, break, use best image
        │
        └─ shouldContinue = true
              │
              ├─ Update fixPlan.strategy = nextStrategy
              ├─ Merge tightenedPreserve into fixPlan.preserve
              ├─ Merge tightenedProhibited into fixPlan.prohibited
              ├─ Set retryInstructions = additionalInstructions
              └─ Continue to attempt N+1
```

### Residual Risks
- Stop conditions may terminate too early on borderline cases — mitigated by still returning the best available image
- Retry planner is client-side; server verification remains the safety net
- LLM may still ignore tightened instructions — but narrower scope reduces surface area for drift

### Verification
Will run:
- `rg -n "retry|shouldContinue|stopReason|nextStrategy|tightenedPreserve|tightenedProhibited|additionalInstructions|identity drift|no_new_violations|target_rules_fixed" src supabase -S`
- `rg -n "describe\\(|it\\(|test\\(" src supabase -S`
- `npm run test`
- `npm run typecheck`

