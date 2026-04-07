

## Plan: Update All Edge Functions to Latest Gemini Models

### Current State
- **Backend** (`_shared/models.ts`): Uses `gemini-2.5-flash` (LLM) and `gemini-2.5-flash-image` (image gen)
- **Client** (`src/config/models.ts`): Uses `gemini-3.1-pro-preview` with `google/` prefixes (Lovable gateway format)
- **6 edge functions** have model names **hardcoded** instead of using the shared config

### What Changes

**Model Updates:**
| Role | Current | New |
|------|---------|-----|
| Analysis/LLM | `gemini-2.5-flash` | `gemini-3.1-pro` |
| Verification | `gemini-2.5-flash` | `gemini-3.1-pro` |
| Image Generation | `gemini-2.5-flash-image` | `gemini-3-flash-image` |
| Image Editing | `gemini-2.5-flash-image` | `gemini-3-flash-image` |

### Files to Update

1. **`supabase/functions/_shared/models.ts`** — Update all 4 model names to latest versions

2. **`src/config/models.ts`** — Update client-side model names (keep `google/` prefix for Lovable gateway compatibility)

3. **Fix 6 hardcoded edge functions** — Replace inline model strings with `MODELS.*` imports or correct model names:
   - `generate-suggestions/index.ts` — `google/gemini-3.1-pro-preview` → `gemini-3.1-pro`
   - `compare-listings/index.ts` — `google/gemini-3.1-pro-preview` → `gemini-3.1-pro`
   - `listing-scorecard/index.ts` — `google/gemini-2.5-flash` → `gemini-3.1-pro`
   - `generate-suggested-image/index.ts` — `gemini-2.5-flash-image` → `gemini-3-flash-image`
   - `check-policy-updates/index.ts` — `google/gemini-3.1-pro-preview` → `gemini-3.1-pro`
   - `listing-suggestions/index.ts` — `google/gemini-3.1-pro-preview` → `gemini-3.1-pro`

4. **Redeploy** all affected edge functions

### Important Notes
- Edge functions call `generativelanguage.googleapis.com` directly (not Lovable gateway), so model names must **not** have `google/` prefix
- Several functions currently have `google/` prefix which may cause 404 errors — this fix resolves that too

