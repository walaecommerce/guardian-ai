import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { NotificationSettings } from '@/components/NotificationSettings';

interface DashboardLayoutProps {
  children: ReactNode;
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
            <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground" />
            <div className="md:hidden text-sm font-bold text-foreground">AGC Guardian</div>
            <div className="flex items-center gap-2">
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
