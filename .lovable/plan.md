

## Admin Role System & Unlimited Access

### Overview
Create a `user_roles` table following security best practices, assign admin role to `avvaruakash@gmail.com`, give admins unlimited credits (bypass credit checks), and build an admin dashboard page.

### Database Changes

**Migration 1: Create user_roles table + helper function**
- Create `app_role` enum: `('admin', 'user')`
- Create `user_roles` table with `user_id` (references auth.users) and `role` columns
- Enable RLS with a `SECURITY DEFINER` function `has_role(user_id, role)` to avoid recursive RLS
- RLS policy: authenticated users can read their own roles
- Insert admin role for `avvaruakash@gmail.com` by looking up their auth.users ID

**Migration 2: Make admin credits unlimited**
- Update `user_credits` rows for the admin user: set `total_credits` to `999999` for all credit types

### Backend Changes

**`supabase/functions/_shared/credits.ts`**
- In `useCredit()`, before checking credits, query `user_roles` to check if user has `admin` role
- If admin, skip credit deduction entirely and return `{ remaining: 999999 }`

### Frontend Changes

**New: `src/hooks/useAdmin.ts`**
- Hook that queries `user_roles` table for current user
- Returns `{ isAdmin, isLoading }`
- Caches result in state

**`src/contexts/AuthContext.tsx`**
- Add `isAdmin` boolean to context by querying `user_roles` after profile fetch
- Expose `isAdmin` from `useAuth()`

**`src/hooks/useCredits.ts`**
- If `isAdmin`, return unlimited credits (bypass checks, always return `hasCredits = true`)

**`src/hooks/useCreditGate.ts`**
- If admin, `guard()` always returns `true`

**New: `src/pages/Admin.tsx`**
- Admin dashboard with tabs:
  - **Users**: List all user profiles with their roles, credits, and session counts
  - **Credits Management**: Adjust any user's credit limits
  - **System Stats**: Total sessions, images analyzed, credits consumed
- Protected: redirects non-admins to `/`

**`src/components/AppSidebar.tsx`**
- Add "Admin" nav item (with Shield icon) visible only when `isAdmin` is true

**`src/App.tsx`**
- Add `/admin` route

### Files to create/modify
| File | Change |
|------|--------|
| Migration SQL | `user_roles` table, `has_role()` function, RLS, seed admin |
| `supabase/functions/_shared/credits.ts` | Skip credit deduction for admins |
| `src/hooks/useAdmin.ts` | New — query admin role |
| `src/contexts/AuthContext.tsx` | Add `isAdmin` to context |
| `src/hooks/useCredits.ts` | Bypass limits for admin |
| `src/hooks/useCreditGate.ts` | Always allow for admin |
| `src/pages/Admin.tsx` | New — admin dashboard |
| `src/components/AppSidebar.tsx` | Add admin nav link |
| `src/App.tsx` | Add `/admin` route |

