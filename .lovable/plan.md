

# Phase 4: Durable SaaS Persistence & Workflow Consolidation

## Overview

Six areas: Tracker → Supabase, Campaign Audit history → Supabase, Studio history → Supabase, Notification log → Supabase, workflow drift reduction, and localStorage audit.

---

## 1. New database tables (one migration)

A single migration creates four new tables:

### `tracked_products`
```sql
CREATE TABLE tracked_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asin text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  added_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, asin)
);
```

### `tracker_audits`
```sql
CREATE TABLE tracker_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id uuid NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scores jsonb NOT NULL DEFAULT '{}',
  violations_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PASS',
  fix_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### `campaign_audits`
```sql
CREATE TABLE campaign_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  client text NOT NULL DEFAULT '',
  score integer NOT NULL DEFAULT 0,
  products_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### `studio_generations`
```sql
CREATE TABLE studio_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template text NOT NULL,
  product_name text NOT NULL,
  prompt text,
  score integer,
  status text NOT NULL DEFAULT 'generated',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### `notification_log`
```sql
CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

All five tables get RLS enabled with user-scoped SELECT/INSERT/UPDATE/DELETE policies.

Tracker alerts stay in-memory/localStorage — they are ephemeral UI dismissals, not product data.

---

## 2. Tracker persistence (`src/pages/Tracker.tsx`)

- Replace `loadTracker()` / `saveTracker()` with Supabase queries against `tracked_products` + `tracker_audits`.
- On mount: fetch user's tracked products with their audits via a join or two queries.
- `addProduct`: insert into `tracked_products`, then run audit.
- `runAudit`: insert audit record into `tracker_audits`.
- `removeProduct`: delete from `tracked_products` (cascade deletes audits).
- Keep alert dismissals in local state (ephemeral UI).
- Remove `localStorage` usage for `TRACKER_KEY`. Keep `ALERTS_KEY` in localStorage (ephemeral dismissals = noncritical).

---

## 3. Campaign Audit persistence (`src/pages/CampaignAudit.tsx`)

- Replace `getSavedCampaigns()` / `saveCampaign()` with Supabase queries against `campaign_audits`.
- On mount: fetch user's campaigns ordered by `created_at DESC`, limit 20.
- After campaign completes: insert row with `summary` as JSONB (strip large base64 image data from assets before storing).
- `loadCampaign`: fetch from Supabase by id instead of date key.
- Remove `localStorage` usage for `CAMPAIGNS_KEY`.

---

## 4. Studio history persistence (`src/pages/Studio.tsx`)

- Replace `getHistory()` / `saveHistory()` with Supabase queries against `studio_generations`.
- After image generation + analysis: insert row with metadata (template, product_name, prompt, score, status). Store `image_url` if the image is uploaded to storage; otherwise store null (the full base64 was already being truncated in localStorage anyway).
- On mount: fetch user's recent generations (limit 20) for history display.
- Remove `localStorage` usage for `HISTORY_KEY`.

---

## 5. Notification log persistence (`src/components/NotificationSettings.tsx`)

- Replace `getNotificationLog()` / `addNotificationLog()` with Supabase queries against `notification_log`.
- `addNotificationLog`: insert row server-side.
- `getNotificationLog`: fetch user's recent log entries (limit 10).
- Update any consumers of the notification log to use async queries.
- Remove `localStorage` usage for `LOG_KEY`.

---

## 6. ComplianceHistory → already redundant

`ComplianceHistory` (`guardian-audits` key) duplicates what `enhancement_sessions` already stores in Supabase. The main audit flow already persists sessions to `enhancement_sessions` + `session_images`.

- Remove localStorage persistence from `saveAuditToHistory` and `getAuditHistory`.
- Replace `ComplianceHistory` data source with a query to `compliance_reports` or `enhancement_sessions` (which already exist).
- The `getScoreTrend` function should query the DB instead.

---

## 7. Workflow drift reduction — shared asset transformation helper

**Problem**: `useSessionLoader` and `useAuditSession` both build `ImageAsset` objects from different sources with slightly different logic (e.g., session loader doesn't set `contentHash`, audit session uses different ID generation patterns, competitor audit uses `split('_')[0]` for categories).

**Fix**: Create `src/utils/sessionAssetHelpers.ts` with:

- `buildAssetFromSessionImage(img, signedUrl, signedFixedUrl)` — used by `useSessionLoader`
- `buildAssetFromDownload(file, category, sourceUrl, contentHash, isMain)` — used by `useAuditSession` import flows
- `buildCompetitorAsset(file, category, sourceUrl, contentHash, isMain)` — or reuse above

Both hooks call the same helper, ensuring consistent asset shape. Also fix the remaining `a.name.split('_')[0]` calls in `useAuditSession.ts` (lines 1240, 1252, 1336) and `CompetitorAudit.tsx` to use `extractImageCategory`.

---

## 8. Policy update cache — keep in localStorage

`usePolicyUpdates.ts` caches policy updates in localStorage with a TTL. This is a performance cache, not product data. The actual policy check calls the edge function which does real research. **Keep as-is** — this is appropriate noncritical cache usage.

---

## 9. Remaining localStorage audit

After all changes, remaining localStorage usage:

| Key | File | Status |
|-----|------|--------|
| Supabase auth session | `client.ts` | Required by Supabase SDK |
| `guardian-tracker-alerts` | `Tracker.tsx` | Ephemeral UI dismissals — keep |
| Policy cache | `usePolicyUpdates.ts` | Performance cache with TTL — keep |

Everything else moves to Supabase.

---

## Files changed summary

### New files
- `src/utils/sessionAssetHelpers.ts` — shared asset builders

### New migration
- `supabase/migrations/YYYYMMDD_phase4_persistence_tables.sql` — 5 tables + RLS

### Modified files
- `src/pages/Tracker.tsx` — Supabase-backed persistence
- `src/pages/CampaignAudit.tsx` — Supabase-backed campaign history
- `src/pages/Studio.tsx` — Supabase-backed generation history
- `src/components/NotificationSettings.tsx` — Supabase-backed notification log
- `src/components/ComplianceHistory.tsx` — Query from `enhancement_sessions`/`compliance_reports` instead of localStorage
- `src/hooks/useSessionLoader.ts` — Use shared asset helper
- `src/hooks/useAuditSession.ts` — Use shared asset helper, fix remaining `split('_')[0]`

### No env changes needed

### Risks
- ComplianceHistory migration: existing localStorage history won't migrate automatically. New audits will persist to DB; old localStorage entries are lost (acceptable since `enhancement_sessions` already has the data).
- Studio images: full base64 is not stored in DB (too large). Only metadata persists. The actual generated image would need storage bucket upload for cross-device image viewing — will store metadata-only for now (matching current localStorage behavior which already truncated images).

