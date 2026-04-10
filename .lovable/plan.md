

## Remove Remaining Slack References

### Current state
The edge function and all Slack UI/logic were removed in the previous pass. Three references remain:
- `notification_preferences.slack_webhook_url` column in the database
- `slack_webhook_url: null` in the upsert call in `NotificationSettings.tsx` (needed because the column exists)
- Auto-generated `types.ts` references (will update automatically after migration)

### Changes

**1. Database migration — drop `slack_webhook_url` column**
```sql
ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS slack_webhook_url;
```

**2. `src/components/NotificationSettings.tsx` — remove `slack_webhook_url: null` from upsert**
Remove line 79 (`slack_webhook_url: null,`) from the `saveNotificationPrefs` function.

### Files changed
1. `src/components/NotificationSettings.tsx` — remove dead column reference
2. New migration — drop `slack_webhook_url` column

### Verification
After changes, all four grep checks will return zero matches in application code (only the historical migration file will mention the column creation, which is expected and safe).

### Residual risks
- None. The column is unused; dropping it is safe. Historical migration files are read-only artifacts.

