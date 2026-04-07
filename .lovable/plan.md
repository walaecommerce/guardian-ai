

# Security & Data Integrity Audit — Implementation Plan

## Current State: Critical Issues Found

After reviewing the entire codebase, database schema, and RLS policies, here is every gap that needs addressing:

---

### Issue 1: Sessions and Reports Have No User Ownership (CRITICAL)

The `enhancement_sessions`, `session_images`, and `compliance_reports` tables have **no `user_id` column**. Their RLS policies are wide open (`true` for all operations) — meaning **any authenticated user can see, edit, and delete any other user's sessions, images, and reports**.

**Fix:**
- Add `user_id uuid` column to `enhancement_sessions`, `session_images`, and `compliance_reports`
- Replace "Anyone can..." RLS policies with user-scoped policies (`auth.uid() = user_id`)
- Update all frontend queries and inserts to include `user_id`

---

### Issue 2: Product Claim Cache Has No Protection (MEDIUM)

The `product_claim_cache` table also uses `true` for all RLS policies. Since this is a shared cache (not user-specific), this is acceptable but should be tightened to prevent unauthorized deletes.

**Fix:**
- Keep SELECT/INSERT open for authenticated users
- Remove DELETE for anonymous/public — restrict to authenticated only

---

### Issue 3: Frontend Queries Don't Filter by User (CRITICAL)

Even after adding `user_id` columns, all current queries (SessionHistory, ReportHistory, useAuditSession) fetch data without filtering by user. Once RLS is fixed, these will return empty or fail.

**Fix (files to update):**
- `src/components/SessionHistory.tsx` — add `.eq('user_id', user.id)` or rely on RLS
- `src/components/ReportHistory.tsx` — same
- `src/hooks/useAuditSession.ts` — pass `user_id` in insert calls
- `src/pages/Session.tsx` — pass `user_id` in insert calls

---

### Issue 4: No Privacy/Terms/Security Pages (LOW-MEDIUM)

The login screen references "terms of service and privacy policy" but no pages exist.

**Fix:**
- Create `/privacy` and `/terms` pages with placeholder content
- Add links from the login screen and Settings page

---

### Issue 5: Edge Functions Don't Validate Auth for Sensitive Operations (MEDIUM)

Most edge functions have `verify_jwt = false` and don't check the caller's identity. Functions that modify user data or consume credits should validate the JWT.

**Fix (priority functions):**
- `generate-fix` — should verify user owns the session
- `generate-enhancement` — same
- `create-checkout` / `customer-portal` — already need auth context
- Leave read-only/public functions (proxy-image, scrape-amazon) as-is

---

### Issue 6: Storage Bucket Has No RLS (LOW)

The `session-images` bucket is public with no upload restrictions. Anyone with the URL can upload files.

**Fix:**
- Add storage policies so only authenticated users can upload to their own folder (`user_id/`)

---

## Implementation Order

| Step | What | Tables/Files Affected |
|------|------|-----------------------|
| 1 | Add `user_id` to `enhancement_sessions`, `compliance_reports` | DB migration |
| 2 | Replace open RLS policies with user-scoped ones | DB migration |
| 3 | Update all frontend inserts to include `user_id` | `useAuditSession.ts`, `Session.tsx` |
| 4 | Update all frontend queries (SessionHistory, ReportHistory) | 2 components |
| 5 | Add auth validation to sensitive edge functions | 3-4 edge functions |
| 6 | Add storage bucket policies | DB migration |
| 7 | Create Privacy Policy & Terms pages | 2 new pages + route updates |

### Technical Details

**Migration SQL (Step 1-2):**
```sql
-- Add user_id columns
ALTER TABLE enhancement_sessions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE compliance_reports ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop open policies, create user-scoped ones
DROP POLICY "Anyone can view sessions" ON enhancement_sessions;
CREATE POLICY "Users view own sessions" ON enhancement_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- (repeat for INSERT, UPDATE, DELETE on all 3 tables)
```

**Frontend pattern (Step 3-4):**
```typescript
// Insert with user_id
const { data: { user } } = await supabase.auth.getUser();
await supabase.from('enhancement_sessions').insert([{
  ...sessionData,
  user_id: user.id,
}]);

// Queries auto-filtered by RLS — no manual .eq() needed
```

**Edge function auth (Step 5):**
```typescript
const { data, error } = await supabase.auth.getClaims(token);
if (error) return new Response('Unauthorized', { status: 401 });
```

---

## Summary

The most critical issue is that **all user data (sessions, reports, images) is globally visible and editable by any user**. Steps 1-4 fix this. Steps 5-7 are hardening measures. The entire plan touches ~10 files and 3 migrations.

