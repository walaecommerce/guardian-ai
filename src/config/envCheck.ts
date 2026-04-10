/**
 * Startup environment validation.
 * Logs warnings for missing critical config — never throws.
 */
const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const;

export function checkEnv(): void {
  for (const key of REQUIRED_VARS) {
    const val = import.meta.env[key];
    if (!val || val === 'undefined') {
      console.warn(`[env-check] Missing required env var: ${key}`);
    }
  }
}
