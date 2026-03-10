import { useState } from 'react';
import { Shield, Zap, BarChart3, Sparkles, Activity, Download, Loader2, Chrome } from 'lucide-react';
import { HeaderNavLink } from './NavLink';
import { NotificationSettings } from './NotificationSettings';
import { Button } from './ui/button';
import { createZipBlob } from '@/utils/zipExport';
import { useToast } from '@/hooks/use-toast';

const EXTENSION_FILES = [
  'manifest.json', 'popup.html', 'popup.js', 'content.js', 'content.css',
  'background.js', 'sidepanel.html', 'sidepanel.js', 'README.md',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
];

export function Header() {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

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

  return (
    <header className="bg-secondary text-secondary-foreground shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-secondary-foreground">
                  Amazon Listing Guardian
                </h1>
                <p className="text-sm text-secondary-foreground/70">
                  AI-Powered Compliance & Optimization
                </p>
              </div>
            </a>
            <nav className="hidden md:flex items-center gap-1 ml-4">
              <HeaderNavLink to="/" label="Single Audit" />
              <HeaderNavLink to="/campaign" label="Campaign Audit" icon={<BarChart3 className="w-3.5 h-3.5" />} />
              <HeaderNavLink to="/studio" label="Studio" icon={<Sparkles className="w-3.5 h-3.5" />} />
              <HeaderNavLink to="/tracker" label="Tracker" icon={<Activity className="w-3.5 h-3.5" />} />
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadExtension}
              disabled={downloading}
              className="hidden sm:flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Chrome className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">Chrome Extension</span>
              <Download className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadExtension}
              disabled={downloading}
              className="sm:hidden text-primary"
              title="Download Chrome Extension"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Chrome className="w-4 h-4" />}
            </Button>
            <NotificationSettings />
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-secondary-foreground/80">
                Powered by Gemini AI
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}