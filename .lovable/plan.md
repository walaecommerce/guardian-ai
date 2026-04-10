

# Phase 5: Production Hardening, Durable Media, Tests & Operational Safety

## Overview

Six workstreams: durable generated media, regression tests, shared edge function validation, operational event logging, idempotency guards, and release guardrails.

---

## 1. Durable Generated Media

**Problem**: Studio generates images (base64) but stores `image_url: null` in `studio_generations`. History loads with `image: ''`. Cross-device history shows metadata only — no actual images.

**Fix**:
- After generating an image in Studio, upload the base64 image to the `session-images` storage bucket under a `studio/{userId}/` prefix using the existing `uploadImage` helper from `imageStorage.ts`.
- Store the **storage path** in `studio_generations.image_url` column (already exists, currently always null).
- When loading history, resolve `image_url` paths to signed URLs using `getImageUrl`.
- Same pattern for fix images: the `generate-fix` edge function returns base64 → the client already uploads to storage via `uploadImage`. Verify the storage path is written to `session_images.fixed_image_url` (appears to already work).

**Files changed**:
- `src/pages/Studio.tsx` — after generation, upload base64 to storage, save path to DB; on history load, resolve signed URLs.
- `src/services/imageStorage.ts` — no changes needed (existing helpers sufficient).

---

## 2. Regression Tests (Vitest)

**Problem**: Zero test files exist. No test runner configured.

**Fix**:
- Add `vitest` + `@testing-library/react` as devDependencies.
- Add `"test": "vitest run"` script to package.json.
- Add `vitest.config.ts` with path aliases matching vite.config.ts.
- Create test files for deterministic logic:

| Test file | Covers |
|---|---|
| `src/utils/__tests__/titleAnalyzer.test.ts` | Title rule compliance (char limit, prohibited chars, promotional phrases, caps, pipe format) |
| `src/utils/__tests__/imageCategory.test.ts` | `extractImageCategory`, `extractProductCategory`, `getDominantProductCategory` |
| `src/components/__tests__/severityHelpers.test.ts` | `SEVERITY_ORDER` mapping, `getSeverityBadgeClass` (extract to testable module first) |
| `supabase/functions/_shared/__tests__/validation.test.ts` | Shared `parseAndValidate` helper (Deno test) |

---

## 3. Shared Edge Function Validation & Error Contracts

**Problem**: Each edge function does ad-hoc `if (!field) throw new Error(...)` with inconsistent error shapes.

**Fix**:
- Create `supabase/functions/_shared/validation.ts` with:
  - `parseJsonBody(req)` — safe JSON parse with 400 on malformed body
  - `requireFields(body, fields[])` — returns 400 with `{ error, missing_fields }` if any missing
  - `errorResponse(status, message, corsHeaders, details?)` — standard `{ error, details?, status }` shape
  - `successResponse(data, corsHeaders)` — standard success wrapper
- Apply to the 5 highest-value functions: `analyze-image`, `generate-suggestions`, `listing-scorecard`, `generate-studio-image`, `send-slack-notification`.
- Keep existing logic intact; just replace the input parsing / error throw patterns.

**Files changed**:
- `supabase/functions/_shared/validation.ts` (new)
- 5 edge function `index.ts` files (import shared helpers, replace ad-hoc patterns)

---

## 4. Operational Event Log

**Problem**: No durable visibility into important app actions/failures.

**Fix**:
- Create `app_events` table via migration:
```sql
CREATE TABLE public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
-- Users see own events
CREATE POLICY "Users view own events" ON public.app_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Users create own events
CREATE POLICY "Users create own events" ON public.app_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Admins see all
CREATE POLICY "Admins view all events" ON public.app_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
```
- Create `src/services/eventLog.ts` — thin client helper: `logEvent(type, metadata)` that inserts into `app_events` (fire-and-forget, never throws).
- Instrument key flows:
  - `useAuditSession.ts`: audit_started, audit_completed, audit_failed
  - `Studio.tsx`: studio_generation_started, studio_generation_completed, studio_generation_failed
  - `NotificationSettings.tsx` / slack send: notification_sent, notification_failed
  - Session fix flows: fix_generated, fix_applied

---

## 5. Idempotency / Duplicate-Write Protection

**Problem**: Double-clicks or retries can create duplicate `studio_generations`, `notification_log`, or `campaign_audits` rows.

**Fix**:
- **Studio**: Add `isGenerating` guard already exists but the DB insert can fire twice if analyze completes fast. Add a `useRef` insert-lock so `analyzeGenerated` only inserts once per generation ID.
- **Notification send**: Add `idempotency_key` column (nullable text, unique) to `notification_log`. Client generates a deterministic key from `{type}_{timestamp_rounded_to_minute}_{userId}`. Insert uses `onConflict: 'idempotency_key'` to skip duplicates.
- **Campaign audits**: Add a `useRef` submission lock in `CampaignAudit.tsx` to prevent double-submit.

**Migration**: Add `idempotency_key` column + unique index to `notification_log`.

---

## 6. Release Guardrails

**Problem**: No test script, no type-check script, no CI.

**Fix**:
- Add to `package.json` scripts:
  - `"test": "vitest run"`
  - `"typecheck": "tsc --noEmit"`
  - `"ci": "npm run typecheck && npm run test && npm run build"`
- Create `.github/workflows/ci.yml`:
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: oven-sh/setup-bun@v2
        - run: bun install --frozen-lockfile
        - run: bun run typecheck
        - run: bun run test
        - run: bun run build
  ```
- Add `src/config/envCheck.ts` — validates `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set at app startup, logs a warning if missing.

---

## Files Changed Summary

| Area | Files |
|---|---|
| Durable media | `src/pages/Studio.tsx` |
| Tests | `vitest.config.ts`, `src/utils/__tests__/titleAnalyzer.test.ts`, `src/utils/__tests__/imageCategory.test.ts`, `src/components/__tests__/severityHelpers.test.ts` |
| Shared validation | `supabase/functions/_shared/validation.ts` (new), 5 edge function files |
| Event log | Migration (new table), `src/services/eventLog.ts` (new), `src/hooks/useAuditSession.ts`, `src/pages/Studio.tsx`, notification flows |
| Idempotency | Migration (notification_log column), `src/pages/Studio.tsx`, `src/pages/CampaignAudit.tsx` |
| Release guardrails | `package.json`, `.github/workflows/ci.yml` (new), `src/config/envCheck.ts` (new), `vitest.config.ts` (new) |

## Migrations

1. `app_events` table + RLS
2. `notification_log.idempotency_key` column + unique index

## Risks

- Studio image upload adds a storage write per generation — minor latency increase (~1s). Acceptable.
- `app_events` table will grow unbounded. Add a 90-day cleanup cron later if needed (out of scope for this phase).
- Severity helpers are currently inline in `AnalysisResults.tsx` — will extract to a small testable module. Minor refactor.

