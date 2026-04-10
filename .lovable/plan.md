

# Phase 2 Remaining Gaps — Fix Plan

## 1. Drop old public storage policies (new migration)

The Phase 2 migration only dropped `"Public read session images"` and `"Anyone can view session images"`, but the original migration (`20251223113050`) created four policies with different names that still exist on `storage.objects`:

- `"Public read access for session images"`
- `"Anyone can upload session images"`
- `"Anyone can update session images"`
- `"Anyone can delete session images"`

**Fix**: New migration that drops all four by exact name using `DROP POLICY IF EXISTS`.

```sql
DROP POLICY IF EXISTS "Public read access for session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete session images" ON storage.objects;
```

## 2. Fix severity normalization in analyze-image

**Current**: Line 581 does `(s || 'info').toLowerCase()` — this maps `CRITICAL` → `critical`, `HIGH` → `high`, `MEDIUM` → `medium`, etc. But the frontend canonical enum is only `critical | warning | info`.

**Fix**: Replace the `normalizeSeverity` function (line 581) with a proper mapping:

```typescript
const normalizeSeverity = (s: string): 'critical' | 'warning' | 'info' => {
  const upper = (s || '').toUpperCase();
  if (upper === 'CRITICAL' || upper === 'HIGH') return 'critical';
  if (upper === 'MEDIUM' || upper === 'WARNING') return 'warning';
  return 'info'; // LOW, INFO, NONE, or unknown
};
```

Also apply it to `derivedSeverity` on line 605:

```typescript
severity: normalizeSeverity(derivedSeverity),
```

**File**: `supabase/functions/analyze-image/index.ts` (lines 581 and 605)

## 3. Server-side notification gating in send-slack-notification

**Current**: The edge function loads `slack_webhook_url` from DB but does not check `notify_on` or `min_severity`. The client-side `sendSlackNotification()` helper does the type-gating, but that's not authoritative.

**Fix**: Update `send-slack-notification/index.ts` to:
- Load `slack_webhook_url`, `notify_on`, and `min_severity` from the DB
- For non-test notifications, check `notify_on[typeMap[type]]` — if disabled, return `{ skipped: true }` with 200
- Check `min_severity` against the notification type's implied severity (critical_violation → critical, score_dropped → warning, others → info)
- For `type === 'test'`, skip the gating and always send
- Keep returning 400 if no webhook is configured

**File**: `supabase/functions/send-slack-notification/index.ts`

---

## Files changed

1. **New migration** — drop 4 old public storage policies
2. **`supabase/functions/analyze-image/index.ts`** — proper severity mapping + apply to derivedSeverity
3. **`supabase/functions/send-slack-notification/index.ts`** — server-side notify_on and min_severity enforcement

## Verification checks (will run after)

1. `rg -n "Public read access for session images|Anyone can upload session images|Anyone can update session images|Anyone can delete session images" supabase/migrations -S`
2. `rg -n "severity: derivedSeverity|normalizeSeverity|CRITICAL|HIGH|MEDIUM|LOW|NONE" supabase/functions/analyze-image/index.ts -S`
3. `rg -n "notify_on|min_severity|slack_webhook_url" supabase/functions/send-slack-notification/index.ts src/components/NotificationSettings.tsx -S`

