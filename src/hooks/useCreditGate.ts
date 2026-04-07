import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Hook that checks if user has credits and shows upgrade toast if not.
 * Returns { canUse, guard } where guard() returns true if action is allowed.
 */
export function useCreditGate() {
  const { hasCredits } = useCredits();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const guard = useCallback((type: 'scrape' | 'analyze' | 'fix'): boolean => {
    if (isAdmin) return true;
    if (hasCredits(type)) return true;

    const labels = { scrape: 'Scrape', analyze: 'Analysis', fix: 'Fix' };
    toast.error(`No ${labels[type]} credits remaining`, {
      description: 'Upgrade your plan to continue.',
      action: {
        label: 'View Plans',
        onClick: () => navigate('/pricing'),
      },
      duration: 5000,
    });
    return false;
  }, [hasCredits, isAdmin, navigate]);

  return { guard, hasCredits };
}
