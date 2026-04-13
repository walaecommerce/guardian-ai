import { useCredits, CreditType } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import { Search, BarChart3, Paintbrush, Sparkles } from 'lucide-react';

export function CreditsDisplay() {
  const { user } = useAuth();
  const { remainingCredits, totalCredits, loading } = useCredits();

  if (!user || loading) return null;

  const credits: { type: CreditType; icon: typeof Search; label: string }[] = [
    { type: 'scrape', icon: Search, label: 'Scrapes' },
    { type: 'analyze', icon: BarChart3, label: 'Analyses' },
    { type: 'fix', icon: Paintbrush, label: 'Fixes' },
    { type: 'enhance', icon: Sparkles, label: 'Enhancements' },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {credits.map(({ type, icon: Icon }) => {
        const remaining = remainingCredits(type);
        const total = totalCredits(type);
        const isLow = remaining === 0;

        return (
          <div
            key={type}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
              isLow
                ? 'bg-destructive/15 text-destructive border border-destructive/20'
                : 'bg-white/5 text-muted-foreground border border-white/10'
            }`}
            title={`${remaining}/${total} ${type} credits`}
          >
            <Icon className="w-3 h-3" />
            <span>{remaining}</span>
          </div>
        );
      })}
    </div>
  );
}
