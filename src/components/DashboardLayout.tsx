import { ReactNode } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { NotificationCenter } from '@/components/NotificationCenter';
import { NotificationSettings } from '@/components/NotificationSettings';
import { CreditsDisplay } from '@/components/auth/CreditsDisplay';
import { ChevronRight } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/audit': 'Audit',
  '/campaign': 'Campaign',
  '/sessions': 'Sessions',
  '/media': 'Media',
  '/studio': 'Studio',
  '/tracker': 'Tracker',
  '/settings': 'Settings',
  '/pricing': 'Plans',
  '/admin': 'Admin',
  '/test-checklist': 'Test Checklist',
};

function Breadcrumbs() {
  const location = useLocation();
  const path = location.pathname;

  // Session detail pages
  const sessionMatch = path.match(/^\/session\/(.+)/);
  if (sessionMatch) {
    return (
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/sessions" className="hover:text-foreground transition-colors">Sessions</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">Detail</span>
      </nav>
    );
  }

  const label = ROUTE_LABELS[path];
  if (!label || path === '/') return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
      <ChevronRight className="w-3 h-3" />
      <span className="text-foreground font-medium">{label}</span>
    </nav>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-40 h-12 flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground" />
              <div className="md:hidden text-sm font-bold text-foreground">AGC Guardian</div>
              <div className="hidden md:block">
                <Breadcrumbs />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <CreditsDisplay />
              </div>
              <NotificationCenter />
              <NotificationSettings />
            </div>
          </header>
          {/* Page content — add bottom padding on mobile for tab bar */}
          <main className="flex-1 pb-16 md:pb-0">
            {children}
          </main>
        </div>
        {/* Mobile bottom tab bar */}
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
