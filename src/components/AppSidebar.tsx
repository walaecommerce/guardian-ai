import {
  Shield, BarChart3, Sparkles, Activity, CreditCard, LogOut, Settings, User, Search, ChevronUp, History, Image, ShieldCheck, Home,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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

const WORKSPACE_ITEMS = [
  { title: 'Home', url: '/', icon: Home },
  { title: 'Audit', url: '/audit', icon: Search },
  { title: 'Campaign', url: '/campaign', icon: BarChart3 },
  { title: 'Sessions', url: '/sessions', icon: History },
  { title: 'Media', url: '/media', icon: Image },
];

const TOOLS_ITEMS = [
  { title: 'Studio', url: '/studio', icon: Sparkles },
  { title: 'Tracker', url: '/tracker', icon: Activity },
];

function NavGroup({
  label,
  items,
  collapsed,
  currentPath,
}: {
  label: string;
  items: typeof WORKSPACE_ITEMS;
  collapsed: boolean;
  currentPath: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = currentPath === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={collapsed ? item.title : undefined}
                >
                  <Link
                    to={item.url}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? 'bg-primary/10 text-primary border border-primary/15'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut, isAdmin } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
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
        <NavGroup label="Workspace" items={WORKSPACE_ITEMS} collapsed={collapsed} currentPath={location.pathname} />
        <NavGroup label="Tools" items={TOOLS_ITEMS} collapsed={collapsed} currentPath={location.pathname} />

        {/* Admin nav link */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === '/admin'} tooltip={collapsed ? 'Admin' : undefined}>
                    <Link
                      to="/admin"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        location.pathname === '/admin'
                          ? 'bg-primary/10 text-primary border border-primary/15'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>Admin Panel</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="p-3 space-y-1">
        <ThemeToggle collapsed={collapsed} />
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
                <div className="w-7 h-7 rounded-full overflow-hidden border border-border shrink-0">
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
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuItem onClick={() => navigate('/pricing')} className="gap-2 cursor-pointer text-sm">
                <CreditCard className="w-4 h-4" />
                Upgrade Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2 cursor-pointer text-sm">
                <Settings className="w-4 h-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
