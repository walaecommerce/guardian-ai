

## Add Credits Usage Breakdown Chart to Settings

### Problem
The Billing tab shows current credit balances but no historical consumption data. There's no `credit_usage_log` table to track when credits were consumed.

### Plan

#### 1. Create `credit_usage_log` table (migration)

New table to record each credit consumption event:

```sql
CREATE TABLE public.credit_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_type text NOT NULL,  -- 'scrape' | 'analyze' | 'fix'
  consumed_at timestamptz NOT NULL DEFAULT now(),
  edge_function text           -- which function consumed it
);

ALTER TABLE public.credit_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage" ON public.credit_usage_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service can insert" ON public.credit_usage_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_usage_log_user_date ON public.credit_usage_log (user_id, consumed_at DESC);
```

#### 2. Log credit consumption in edge functions

Update `supabase/functions/_shared/credits.ts` — after successfully decrementing a credit in `useCredit()`, insert a row into `credit_usage_log` with the user_id, credit_type, and timestamp.

#### 3. Create `useCreditsHistory` hook

New hook `src/hooks/useCreditsHistory.ts` that:
- Queries `credit_usage_log` for the last 30 days
- Groups by day + credit_type
- Returns data shaped for Recharts: `{ date: string, scrape: number, analyze: number, fix: number }[]`

#### 4. Add usage chart to Settings Billing tab

Add a new Card below the existing "Credit Usage" card in `BillingTab` inside `src/pages/Settings.tsx`:
- Uses `ChartContainer` from `src/components/ui/chart.tsx` with a stacked `BarChart`
- Three color-coded bars: Scrapes, Analyses, Fixes
- X-axis: dates (last 30 days, grouped by day)
- Tooltip showing breakdown per day
- Empty state when no usage data exists

### Files to modify
- **Migration** — new `credit_usage_log` table
- **`supabase/functions/_shared/credits.ts`** — insert log row on consumption
- **`src/hooks/useCreditsHistory.ts`** — new hook to fetch/aggregate usage
- **`src/pages/Settings.tsx`** — add chart Card to BillingTab

