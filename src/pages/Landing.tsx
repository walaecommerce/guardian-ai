import { Shield, ScanSearch, Wand2, Users, Sparkles, Bell, FileText, ArrowRight, CheckCircle2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { lovable } from '@/integrations/lovable/index';
import { TIERS } from '@/config/subscriptionTiers';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const features = [
  { icon: ScanSearch, title: 'Instant Compliance Audit', desc: 'Upload or scrape Amazon listings, get pass/fail results in seconds against 50+ rules.' },
  { icon: Wand2, title: 'AI-Powered Fixes', desc: 'One-click image corrections that meet Amazon\'s latest guidelines automatically.' },
  { icon: Users, title: 'Competitor Intelligence', desc: 'Compare your listings side-by-side with top competitors in your category.' },
  { icon: Sparkles, title: 'Studio Image Generation', desc: 'Generate optimized, compliant product images with AI in seconds.' },
  { icon: Bell, title: 'Policy Change Alerts', desc: 'Stay ahead of Amazon guideline updates with real-time notifications.' },
  { icon: FileText, title: 'Detailed Reports', desc: 'Export branded PDF compliance reports for clients and team members.' },
];

const steps = [
  { num: '1', title: 'Upload or Paste URL', desc: 'Upload images or paste your Amazon listing URL to get started.' },
  { num: '2', title: 'AI Analyzes Everything', desc: 'AI checks every image against 50+ Amazon compliance rules instantly.' },
  { num: '3', title: 'Fix & Export', desc: 'Fix issues with one click and export your compliance report.' },
];

const testimonials = [
  { quote: 'Listing Guardian saved us hours of manual compliance checks. Our suppression rate dropped to zero.', name: 'Sarah Chen', role: 'Amazon Seller, 8-figure brand' },
  { quote: 'The AI fix feature is incredible — it corrected our white background issues in seconds.', name: 'Marcus Johnson', role: 'E-commerce Agency Owner' },
  { quote: 'We manage 200+ SKUs and this tool pays for itself every month with the time we save.', name: 'Priya Patel', role: 'Brand Manager, Consumer Electronics' },
];

const stats = [
  { value: '10,000+', label: 'Images Analyzed' },
  { value: '98%', label: 'Compliance Rate' },
  { value: '500+', label: 'Sellers Trust Us' },
];

/* ── Scroll-reveal wrapper ─────────────────────────────────── */

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(el); } },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
    if (result.error) { console.error('OAuth error:', result.error); return; }
    if (result.redirected) return;
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden scroll-smooth">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">Listing Guardian</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => scrollTo('features')} className="hover:text-foreground transition-colors">Features</button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-foreground transition-colors">How It Works</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-foreground transition-colors">Pricing</button>
          </div>
          <Button onClick={handleSignIn} size="sm">Get Started</Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[150px] animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-secondary/5 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        <div className="relative max-w-4xl mx-auto text-center space-y-8">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium">
              <Sparkles className="w-4 h-4" /> AI-Powered Amazon Compliance
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Protect Your Amazon Listings<br />
              <span className="text-primary">Before They Get Suppressed</span>
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              AI-powered image compliance auditing, one-click fixes, and competitor intelligence — all in one platform built for Amazon sellers.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button onClick={handleSignIn} size="lg" className="gap-2 text-base px-8 h-12">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
              <Button onClick={() => scrollTo('features')} variant="outline" size="lg" className="text-base px-8 h-12">
                See How It Works
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/5 bg-card/50">
        <div className="max-w-5xl mx-auto grid grid-cols-3 divide-x divide-white/5">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="py-8 text-center">
                <div className="text-2xl md:text-3xl font-bold text-primary">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything You Need to Stay Compliant</h2>
              <p className="text-muted-foreground mt-3 max-w-xl mx-auto">From automated audits to AI-generated fixes, we cover the entire compliance workflow.</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <Card className="bg-white/[0.03] border-white/5 backdrop-blur-2xl hover:border-primary/20 hover:scale-[1.02] transition-all duration-300">
                  <CardContent className="p-6 space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 md:py-28 px-6 bg-card/30">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How It Works</h2>
              <p className="text-muted-foreground mt-3">Three simple steps to full compliance.</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 150}>
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-primary text-xl font-bold">{s.num}</div>
                  <h3 className="font-semibold text-lg">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 md:py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Trusted by Amazon Sellers</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Reveal key={i} delay={i * 120}>
                <Card className="bg-white/[0.03] border-white/5 backdrop-blur-2xl hover:border-primary/10 transition-colors duration-300">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex gap-1">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-primary text-primary" />)}</div>
                    <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.quote}"</p>
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section id="pricing" className="py-20 md:py-28 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
              <p className="text-muted-foreground mt-3">Start free, upgrade when you're ready.</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((tier, i) => (
              <Reveal key={tier.slug} delay={i * 100}>
                <Card className={`bg-white/[0.03] backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02] ${tier.highlight ? 'border-primary/40 ring-1 ring-primary/20' : 'border-white/5'}`}>
                  <CardContent className="p-6 space-y-4">
                    {tier.badge && (
                      <span className="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{tier.badge}</span>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">{tier.name}</h3>
                      <div className="mt-2"><span className="text-3xl font-bold">{tier.price}</span><span className="text-muted-foreground text-sm">{tier.period}</span></div>
                      <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
                    </div>
                    <ul className="space-y-2">
                      {tier.features.slice(0, 4).map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />{f}
                        </li>
                      ))}
                    </ul>
                    <Button onClick={handleSignIn} variant={tier.highlight ? 'default' : 'outline'} className="w-full" size="sm">
                      {tier.slug === 'free' ? 'Start Free' : 'Get Started'}
                    </Button>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 md:py-28 px-6">
        <Reveal>
          <div className="relative max-w-3xl mx-auto text-center space-y-6">
            <div className="absolute inset-0 -m-10 rounded-3xl bg-primary/5 blur-[80px] pointer-events-none" />
            <h2 className="relative text-3xl md:text-4xl font-bold tracking-tight">Ready to Protect Your Listings?</h2>
            <p className="relative text-muted-foreground">Join hundreds of sellers who trust Listing Guardian to keep their Amazon images compliant.</p>
            <Button onClick={handleSignIn} size="lg" className="relative gap-2 text-base px-8 h-12">
              Start Free <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span>© {new Date().getFullYear()} AGC Listing Guardian</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <button onClick={() => scrollTo('pricing')} className="hover:text-foreground transition-colors">Pricing</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
