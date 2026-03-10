import { Shield, Zap, BarChart3, Sparkles, Activity } from 'lucide-react';
import { HeaderNavLink } from './NavLink';

export function Header() {
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
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
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
