

# Fix: Improve Amazon import error handling and classification fallback

## Issues Found

1. **Generic error messages**: When scrape-amazon returns 422, the Supabase client throws a `FunctionsHttpError` with "Edge Function returned a non-2xx status code" instead of the actual message ("Amazon blocked the scraping request"). The code throws this before checking the response body.

2. **AbortController not connected**: The 15s timeout creates an AbortController but never passes it to `supabase.functions.invoke`, so scrape requests can hang for 60+ seconds.

3. **Classification fallback works correctly**: Code review confirmed `classifyImage` properly catches `AI_CREDITS_EXHAUSTED` / `RATE_LIMITED` errors and falls back to `{ category: 'UNKNOWN', confidence: 0 }` for other failures. No changes needed here.

## Changes

### 1. Fix error extraction in `src/services/amazonScraper.ts` (~line 280-310)
- Import `FunctionsHttpError` from `@supabase/supabase-js`
- When catching the error, check if it's a `FunctionsHttpError` and extract the response body JSON to get the real error message
- Parse `error.context.json()` to get `{ success, error: "Amazon blocked..." }`
- Fall through to the existing CAPTCHA/blocked detection logic

### 2. Remove dead AbortController code
- Remove the unused `AbortController` and `setTimeout` since `supabase.functions.invoke` doesn't support abort signals
- Instead, rely on the edge function's own 60s timeout (which is appropriate for multi-strategy scraping)

## No backend changes needed.

