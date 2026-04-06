import {
  Shield, BarChart3, Sparkles, Activity, CreditCard, LogOut, Settings, User, Search, ChevronUp,
} from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useSubscription } from '@/hooks/useSubscription';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NAV_ITEMS = [
  { title: 'Single Audit', url: '/', icon: Search },
  { title: 'Campaign', url: '/campaign', icon: BarChart3 },
  { title: 'Studio', url: '/studio', icon: Sparkles },
  { title: 'Tracker', url: '/tracker', icon: Activity },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { remainingCredits, totalCredits } = useCredits();
  const { plan } = useSubscription();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const creditTypes = [
    { type: 'scrape' as const, label: 'Scrape', icon: Search },
    { type: 'analyze' as const, label: 'Analyze', icon: BarChart3 },
    { type: 'fix' as const, label: 'Fix', icon: Sparkles },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-white/5">
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 shrink-0 group-hover:bg-primary/15 transition-colors">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <span className="text-sm font-bold text-foreground tracking-tight">
              AGC Guardian
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={collapsed ? item.title : undefined}
                  >
                    <Link
                      to={item.url}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive(item.url)
                          ? 'bg-primary/10 text-primary border border-primary/15'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Credits section */}
        {!collapsed && user && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Credits · <span className="capitalize text-primary">{plan}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-3 space-y-2">
                {creditTypes.map(({ type, label, icon: Icon }) => {
                  const remaining = remainingCredits(type);
                  const total = totalCredits(type);
                  const pct = total > 0 ? (remaining / total) * 100 : 0;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Icon className="w-3 h-3" />
                          {label}
                        </span>
                        <span className="text-foreground font-medium">{remaining}/{total}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <Link
                  to="/pricing"
                  className="flex items-center justify-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors"
                >
                  <CreditCard className="w-3 h-3" />
                  Upgrade Plan
                </Link>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="p-3">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white/5 transition-colors text-left">
                <div className="w-7 h-7 rounded-full overflow-hidden border border-white/10 shrink-0">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {profile?.full_name || 'User'}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {profile?.email || user.email}
                    </p>
                  </div>
                )}
                {!collapsed && <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52 bg-card border-white/10">
              <DropdownMenuItem onClick={() => navigate('/pricing')} className="gap-2 cursor-pointer text-sm">
                <CreditCard className="w-4 h-4" />
                Upgrade Plan
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                <Settings className="w-4 h-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/5" />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-sm text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
