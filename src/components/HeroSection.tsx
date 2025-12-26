import { Sparkles, Shield, Zap, Eye, Brain, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeroSectionProps {
  onTryDemo: () => void;
  onScrollToUpload: () => void;
}

export function HeroSection({ onTryDemo, onScrollToUpload }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-secondary via-secondary/95 to-secondary/90 text-secondary-foreground">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-primary/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="container mx-auto px-4 py-16 lg:py-24 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Feature badges */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary-foreground px-4 py-1.5">
              <Brain className="w-4 h-4 mr-2" />
              Multimodal AI
            </Badge>
            <Badge variant="outline" className="bg-success/10 border-success/30 text-success px-4 py-1.5">
              <Eye className="w-4 h-4 mr-2" />
              Real-time Compliance
            </Badge>
            <Badge variant="outline" className="bg-warning/10 border-warning/30 text-warning px-4 py-1.5">
              <Zap className="w-4 h-4 mr-2" />
              Instant Fixes
            </Badge>
          </div>

          {/* Main headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            <span className="text-primary">AI Compliance Officer</span>
            <br />
            for Amazon Listings
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-secondary-foreground/80 mb-8 max-w-2xl mx-auto leading-relaxed">
            Visually audit your Amazon product images against strict 2025 guidelines and generate compliant creative assets instantly.
            <span className="text-primary font-semibold"> Prevent listing suppression. Maximize revenue.</span>
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-10">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">85%+</p>
              <p className="text-sm text-secondary-foreground/60">Compliance Rate</p>
            </div>
            <div className="text-center border-x border-secondary-foreground/10">
              <p className="text-3xl font-bold text-success">5 min</p>
              <p className="text-sm text-secondary-foreground/60">Per Listing</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-warning">0</p>
              <p className="text-sm text-secondary-foreground/60">Suppressions</p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={onTryDemo}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-6 text-lg font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Try Demo (Pre-loaded)
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={onScrollToUpload}
              className="border-secondary-foreground/20 hover:bg-secondary-foreground/10 text-secondary-foreground px-8 py-6 text-lg"
            >
              <Shield className="w-5 h-5 mr-2" />
              Audit Your Listing
            </Button>
          </div>

          {/* Feature checklist */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-secondary-foreground/70">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Pure white background check
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Badge & watermark detection
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Product frame occupancy
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              OCR text consistency
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
