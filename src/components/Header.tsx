import { Shield, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-secondary text-secondary-foreground shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-secondary-foreground/80">
              Powered by Gemini AI
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
