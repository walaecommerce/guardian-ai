

# Phase 2: Core Pipeline Reliability, Consistency & Security

## Overview

Six targeted fixes addressing schema drift, status vocabulary, OpenAI removal, storage security, notification hardening, and scorecard determinism.

---

## 1. Normalize the analysis/fix contract end-to-end

**Problem**: `analyze-image` returns `spatialAnalysis` at the top level but keeps inner fields in snake_case (`overlay_elements`, `text_zones`, `protected_areas`, `product_zones`). Downstream consumers (`generate-fix`, `verify-image`, frontend) use dual fallback reads (`spatialAnalysis.overlayElements || spatialAnalysis.overlay_elements`). Violation severity from AI comes as `"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"` but the frontend type expects lowercase.

**Changes**:

- **`supabase/functions/analyze-image/index.ts`** — Add a `normalizeSpatialAnalysis()` helper that converts inner fields to camelCase before returning. Also lowercase violation `severity` values. Apply same normalization to `categorySpecificChecks.categoryViolations`.

- **`supabase/functions/generate-fix/index.ts`** — Remove dual-read fallbacks (`spatialAnalysis.overlayElements || spatialAnalysis.overlay_elements`). Read only camelCase fields since the source is now canonical.

- **`supabase/functions/verify-image/index.ts`** — Same: remove dual-read fallbacks on line 143-152. Read only camelCase.

- **`src/hooks/useAuditSession.ts`** — No changes needed (already reads `overlayElements` in camelCase).

- **`src/pages/Session.tsx`** — Same, already reads camelCase.

- **`src/utils/exportReport.ts`** — Remove `openai-inpainting` from `fix_methods` type (ties into goal 3).

---

## 2. Fix session status drift

**Problem**: Dashboard checks `s.status === 'complete'` but the DB writes `'completed'`. CampaignAudit uses a local `ProductStatus` type with `'complete'` — this is a separate local enum, not the DB enhancement_sessions status.

**Changes**:

- **`src/pages/Dashboard.tsx`** line 132 — Change `s.status === 'complete'` to `s.status === 'completed'`.

- **`src/pages/CampaignAudit.tsx`** — The `'complete'` status here is for local `ProductStatus`, not `enhancement_sessions`. It's a self-contained local state machine. Leave it as-is since it doesn't touch the DB status vocabulary. Add a clarifying comment.

---

## 3. Remove OpenAI runtime dependency from generate-fix

**Problem**: Lines 261-569 of `generate-fix` contain the full OpenAI masked inpainting Tier 2 path (~310 lines), including `callOpenAIInpainting()`, `generateMaskPng()`, `encodePng()`, and the branch on `useOpenAIInpainting`.

**Changes**:

- **`supabase/functions/generate-fix/index.ts`** — Remove `generateMaskPng()`, `encodePng()`, `extractRawBase64()`, `callOpenAIInpainting()`, and the `useOpenAIInpainting` branch in the main handler. Remove `useOpenAIInpainting` from the destructured request body. The Gemini surgical-edit path already handles secondary overlay removal.

- **`src/hooks/useAuditSession.ts`** — Remove `shouldUseOpenAIInpainting` logic and `useOpenAIInpainting` from the request body (lines 829-846).

- **`src/pages/Session.tsx`** — Same removal (lines 324-341).

- **`src/types.ts`** — Remove `'openai-inpainting'` from `FixMethod` type.

- **`src/utils/exportReport.ts`** — Remove `'openai-inpainting'` from fix methods interface.

- **`src/pages/Privacy.tsx`** / **`src/pages/Terms.tsx`** — Remove any remaining OpenAI/third-party AI provider references if present. Verify and update as needed.

---

## 4. Make session-images storage private with signed URLs

**Problem**: The `session-images` bucket is public. Images are accessed via `getPublicUrl()`, meaning any URL is world-readable.

**Changes**:

- **Migration**: Set `session-images` bucket to private by updating `public` to `false` in `storage.buckets`. Add an RLS storage policy allowing authenticated users to access only paths under their own session IDs (via a join to `enhancement_sessions.user_id`).

- **`src/services/imageStorage.ts`** — Replace `getPublicUrl()` with `createSignedUrl()` (e.g. 1-hour expiry). Update `uploadImage()` to return signed URLs. Update `getImageUrl()` to return signed URLs.

- **`src/hooks/useSessionLoader.ts`** — When loading session images, generate signed URLs for `original_image_url` and `fixed_image_url` instead of using stored public URLs directly. Add a helper that detects stored URLs from the bucket and re-signs them.

- **`src/pages/Media.tsx`** — Same: use signed URLs when rendering `original_image_url` / `fixed_image_url`.

---

## 5. Server-side notification preferences with RLS

**Problem**: Slack webhook URLs are stored in localStorage and passed to the edge function as arbitrary client payload.

**Changes**:

- **Migration**: Create `notification_preferences` table:
  ```sql
  CREATE TABLE public.notification_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    slack_webhook_url text,
    email_address text,
    notify_on jsonb NOT NULL DEFAULT '{"auditComplete":true,"criticalViolations":true,"scoreDropped":true,"fixGenerated":false}',
    min_severity text NOT NULL DEFAULT 'any',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
  -- User-scoped RLS policies (SELECT, INSERT, UPDATE, DELETE)
  ```

- **`src/components/NotificationSettings.tsx`** — Replace localStorage reads/writes with Supabase queries to `notification_preferences`. Keep the UI the same.

- **`src/pages/Settings.tsx`** — Same: read/write from DB instead of localStorage.

- **`supabase/functions/send-slack-notification/index.ts`** — Stop accepting `webhookUrl` from the request body for normal use. Instead, look up the authenticated user's `notification_preferences` row server-side. For test notifications, accept a `type: 'test'` flag and use the stored webhook. Return 400 if no webhook is configured.

---

## 6. Remove nondeterministic scorecard behavior

**Problem**: Line 158 of `listing-scorecard/index.ts` uses `Math.random()` to randomly filter diversity suggestions.

**Changes**:

- **`supabase/functions/listing-scorecard/index.ts`** — Replace the random filter with a deterministic check based on which categories are actually missing from the user's image set.

---

## Files changed (summary)

### Edge functions
- `supabase/functions/analyze-image/index.ts` — Normalize spatial + severity
- `supabase/functions/generate-fix/index.ts` — Remove OpenAI path, remove dual-read fallbacks
- `supabase/functions/verify-image/index.ts` — Remove dual-read fallbacks
- `supabase/functions/listing-scorecard/index.ts` — Deterministic recommendations
- `supabase/functions/send-slack-notification/index.ts` — Server-side webhook lookup

### Frontend
- `src/hooks/useAuditSession.ts` — Remove OpenAI inpainting flag
- `src/pages/Session.tsx` — Remove OpenAI inpainting flag
- `src/pages/Dashboard.tsx` — Fix `'complete'` → `'completed'`
- `src/pages/Media.tsx` — Use signed URLs
- `src/components/NotificationSettings.tsx` — Server-side prefs
- `src/pages/Settings.tsx` — Server-side prefs
- `src/services/imageStorage.ts` — Signed URLs
- `src/hooks/useSessionLoader.ts` — Signed URLs
- `src/types.ts` — Remove `'openai-inpainting'` from FixMethod
- `src/utils/exportReport.ts` — Remove openai-inpainting from fix methods

### Migrations
1. Make `session-images` bucket private + add storage RLS policies
2. Create `notification_preferences` table with RLS

### Verification checks (will run after implementation)
1. `rg -n "status === 'complete'" src supabase -S`
2. `rg -n "OPENAI_API_KEY|openai|OpenAI" src supabase -S`
3. `rg -n "getPublicUrl" src -S`
4. `rg -n "webhookUrl" src supabase -S`
5. `rg -n "Math.random\(" supabase/functions/listing-scorecard/index.ts src -S`

