import { useState } from 'react';
import { Shield, BarChart3, Sparkles, Activity, Download, Loader2, Chrome, Menu, LogOut, User, CreditCard, Settings } from 'lucide-react';
import { HeaderNavLink } from './NavLink';
import { NotificationSettings } from './NotificationSettings';
import { CreditsDisplay } from './auth/CreditsDisplay';
import { Button } from './ui/button';
import { createZipBlob } from '@/utils/zipExport';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const EXTENSION_FILES = [
  'manifest.json', 'popup.html', 'popup.js', 'content.js', 'content.css',
  'background.js', 'sidepanel.html', 'sidepanel.js', 'README.md',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
];

export function Header() {
  const [downloading, setDownloading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toast } = useToast();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleDownloadExtension = async () => {
    setDownloading(true);
    try {
      const entries = await Promise.all(
        EXTENSION_FILES.map(async (file) => {
          const res = await fetch(`/guardian-extension/${file}`);
          if (!res.ok) throw new Error(`Failed to fetch ${file}`);
          const blob = await res.blob();
          return { name: `guardian-extension/${file}`, data: blob };
        })
      );
      const zip = await createZipBlob(entries);
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'guardian-extension.zip';
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Extension Downloaded', description: 'Unzip and load as unpacked in chrome://extensions' });
    } catch (e) {
      toast({ title: 'Download Failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-full flex items-center justify-between">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 glow-cyan-sm group-hover:glow-cyan transition-all">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-foreground tracking-tight">AGC Guardian</h1>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            <HeaderNavLink to="/" label="Single Audit" />
            <HeaderNavLink to="/campaign" label="Campaign" icon={<BarChart3 className="w-3.5 h-3.5" />} />
            <HeaderNavLink to="/studio" label="Studio" icon={<Sparkles className="w-3.5 h-3.5" />} />
            <HeaderNavLink to="/tracker" label="Tracker" icon={<Activity className="w-3.5 h-3.5" />} />
          </nav>
        </div>
        
        {/* Right: Credits + Actions + Avatar */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <CreditsDisplay />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExtension}
            disabled={downloading}
            className="hidden lg:flex items-center gap-1.5"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Chrome className="w-3.5 h-3.5" />}
            Extension
            <Download className="w-3 h-3" />
          </Button>

          <NotificationSettings />

          {/* Avatar Dropdown */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-full overflow-hidden border border-white/10 hover:border-primary/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-white/10">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email || user.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem onClick={() => navigate('/pricing')} className="gap-2 cursor-pointer">
                  <CreditCard className="w-4 h-4" />
                  Upgrade Plan
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1">
          <HeaderNavLink to="/" label="Single Audit" />
          <HeaderNavLink to="/campaign" label="Campaign" icon={<BarChart3 className="w-3.5 h-3.5" />} />
          <HeaderNavLink to="/studio" label="Studio" icon={<Sparkles className="w-3.5 h-3.5" />} />
          <HeaderNavLink to="/tracker" label="Tracker" icon={<Activity className="w-3.5 h-3.5" />} />
          <div className="pt-2 sm:hidden">
            <CreditsDisplay />
          </div>
        </div>
      )}
    </header>
  );
}
