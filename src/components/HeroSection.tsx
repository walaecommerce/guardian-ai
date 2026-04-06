import { Sparkles, Shield, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeroSectionProps {
  onTryDemo: () => void;
  onScrollToUpload: () => void;
}

export function HeroSection({ onTryDemo, onScrollToUpload }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-mesh">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-secondary/5 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-primary/3 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 py-20 lg:py-32 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-8">
            <Shield className="w-4 h-4" />
            AI-Powered Amazon Compliance
          </div>

          {/* Main headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-[1.1] tracking-tight">
            <span className="text-primary">Audit & Fix</span> Your
            <br />
            Amazon Listings
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Automatically detect compliance violations in your product images and generate 
            AI-fixed replacements. 
            <span className="text-foreground font-medium"> Prevent suppression. Maximize revenue.</span>
          </p>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-8 mb-10">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">85%+</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Compliance</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-success">5 min</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Per Listing</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-warning">0</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Suppressions</p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={onTryDemo}
              className="px-8 py-6 text-base gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Try Demo
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={onScrollToUpload}
              className="px-8 py-6 text-base gap-2"
            >
              Audit Your Listing
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Feature checklist */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {['White background check', 'Watermark detection', 'Frame occupancy', 'Text consistency'].map(f => (
              <div key={f} className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-success" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
