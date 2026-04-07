import { Home, Search, History, Sparkles, Activity, Image } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { title: 'Home', url: '/', icon: Home },
  { title: 'Audit', url: '/audit', icon: Search },
  { title: 'Sessions', url: '/sessions', icon: History },
  { title: 'Studio', url: '/studio', icon: Sparkles },
  { title: 'More', url: '/media', icon: Image },
];

export function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around h-14 px-1">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors min-w-0',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('w-5 h-5', active && 'text-primary')} />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
