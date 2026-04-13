import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Shield, Store, ArrowRight, CheckCircle, Sparkles, BarChart3, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const FEATURES = [
  {
    icon: <Shield className="w-5 h-5 text-primary" />,
    title: 'Compliance Audits',
    desc: "AI scans your product images against Amazon's latest policies.",
  },
  {
    icon: <Sparkles className="w-5 h-5 text-primary" />,
    title: 'Auto-Fix Studio',
    desc: 'Generate policy-compliant replacement images in one click.',
  },
  {
    icon: <BarChart3 className="w-5 h-5 text-primary" />,
    title: 'Campaign Audit',
    desc: 'Audit entire listings by URL — images, titles, and more.',
  },
  {
    icon: <Activity className="w-5 h-5 text-primary" />,
    title: 'Policy Tracker',
    desc: 'Stay ahead of Amazon policy changes with real-time alerts.',
  },
];

export default function Onboarding() {
  const { profile, markOnboardingComplete } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [storeUrl, setStoreUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    try {
      await markOnboardingComplete(storeUrl || undefined);
      toast({ title: 'Welcome aboard!', description: 'Your account is all set.' });
      navigate('/');
    } catch {
      toast({ title: 'Error', description: 'Could not save. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center p-4">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-secondary/5 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="glass-card-elevated p-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-cyan-ring">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
            </h1>
            <p className="text-sm text-muted-foreground">Let's get you set up in under a minute.</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? 'w-10 bg-primary' : 'w-6 bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Step 0: Features overview */}
          {step === 0 && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground text-center">Here's what you can do with Guardian:</p>
              <div className="grid gap-3">
                {FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                    <div className="mt-0.5 shrink-0">{f.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{f.title}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={() => setStep(1)} className="w-full h-11 gap-2 rounded-xl">
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Step 1: Amazon Store URL (optional) */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Store className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Link your Amazon store to enable automated listing audits.
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  placeholder="https://www.amazon.com/stores/YourBrand/page/..."
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  className="h-11 bg-muted/50 border-border placeholder:text-muted-foreground/50 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Optional — you can add this later in Settings.</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleFinish} disabled={saving} className="flex-1 h-11 rounded-xl">
                  Skip for now
                </Button>
                <Button onClick={handleFinish} disabled={saving} className="flex-1 h-11 gap-2 rounded-xl">
                  {saving ? 'Saving...' : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Finish Setup
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Credits reminder */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              You have <span className="text-primary font-semibold">5 scrape</span>, <span className="text-primary font-semibold">10 analyze</span>, and <span className="text-primary font-semibold">2 fix</span> credits on the free plan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
