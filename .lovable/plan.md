

## Admin Panel Enhancements

Three additions to `src/pages/Admin.tsx`: activity timeline, credits consumed fix, and role management.

### 1. Fix Credits Consumed Stat

**Problem**: The current query `supabase.from('credit_usage_log').select('id')` returns row count, but the admin RLS policy only surfaces rows visible to the admin — which should be all rows. However, the admin bypass logs usage without deducting credits, so the count may be 0 if no logging occurred. The real fix: sum `used_credits` from `user_credits` table instead, which accurately reflects total consumption.

**Change in `fetchAll()`**: Replace `credit_usage_log` count with a sum of `used_credits` across all `user_credits` rows. This is already fetched via `creditsRes`.

### 2. Activity Timeline Tab

Add a fourth tab "Activity" showing recent actions across all users.

**Data source**: Fetch the last 50 rows from `credit_usage_log` (already has admin SELECT policy), joined with user profiles to show who did what.

**UI**: A vertical timeline list showing:
- User name/email
- Action type (scrape/analyze/fix) with colored badge
- Edge function name
- Relative timestamp (e.g., "2 hours ago")

**RLS**: Already covered — `Admins can view all usage` policy exists on `credit_usage_log`.

### 3. Admin Role Assignment/Revocation

Add a "Role" action column to the Users table.

**UI changes in Users tab**:
- Add an "Actions" column
- For non-admin users: "Make Admin" button
- For admin users (except self): "Revoke Admin" button
- Self row: no action (prevent self-demotion)
- Confirmation dialog before role changes

**Functions**:
- `toggleAdmin(userId, currentRole)`: If user, insert into `user_roles`; if admin, delete from `user_roles`
- RLS already permits admin INSERT and DELETE on `user_roles`

### Files Modified

| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Add Activity tab, fix stats calculation, add role toggle buttons |

No database migrations needed — all required RLS policies already exist.

### Technical Details

**Stats fix** (in `fetchAll`):
```
totalCreditsUsed = creditsRes.data.reduce((sum, c) => sum + c.used_credits, 0)
```

**Activity timeline fetch**:
```
supabase.from('credit_usage_log')
  .select('id, user_id, credit_type, edge_function, consumed_at')
  .order('consumed_at', { ascending: false })
  .limit(50)
```
Map `user_id` to user profile names client-side from already-fetched profiles.

**Role toggle**:
- Grant: `supabase.from('user_roles').insert({ user_id, role: 'admin' })`
- Revoke: `supabase.from('user_roles').delete().eq('user_id', id).eq('role', 'admin')`

