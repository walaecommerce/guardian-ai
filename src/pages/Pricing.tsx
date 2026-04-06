import { Shield, Check, Zap, Crown, Building2, Rocket, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useSubscription';
import { useCredits } from '@/hooks/useCredits';
import { TIERS } from '@/config/subscriptionTiers';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

const ICONS = [Zap, Rocket, Crown, Building2];

export default function Pricing() {
  const { plan: currentPlan, subscribed, startCheckout, openPortal, checkSubscription } = useSubscription();
  const { refresh: refreshCredits } = useCredits();
  const [searchParams] = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  // Handle checkout return
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      toast.success('Subscription activated! Credits are being updated...');
      // Refresh subscription & credits
      setTimeout(() => {
        checkSubscription();
        refreshCredits();
      }, 2000);
    } else if (checkout === 'cancel') {
      toast.info('Checkout cancelled');
    }
  }, [searchParams, checkSubscription, refreshCredits]);

  const handleUpgrade = async (tier: typeof TIERS[number]) => {
    if (!tier.priceId) return;
    setLoadingTier(tier.slug);
    try {
      await startCheckout(tier.priceId);
    } catch (err) {
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoadingTier(null);
    }
  };

  const getButtonConfig = (tier: typeof TIERS[number]) => {
    const isCurrentPlan = tier.slug === currentPlan;
    const tierIndex = TIERS.findIndex(t => t.slug === tier.slug);
    const currentIndex = TIERS.findIndex(t => t.slug === currentPlan);
    const isDowngrade = tierIndex < currentIndex;

    if (isCurrentPlan) return { label: 'Current Plan', disabled: true, action: () => {} };
    if (tier.slug === 'free') return { label: 'Free Plan', disabled: true, action: () => {} };
    if (subscribed && isDowngrade) return { label: 'Manage Plan', disabled: false, action: openPortal };
    return { label: `Upgrade to ${tier.name}`, disabled: false, action: () => handleUpgrade(tier) };
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-16 max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 px-4 py-1.5 text-sm">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Simple Pricing
          </Badge>
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            Choose Your <span className="text-primary">Guardian</span> Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Start free, upgrade when you need more power. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {TIERS.map((tier, i) => {
            const Icon = ICONS[i];
            const btn = getButtonConfig(tier);
            const isLoading = loadingTier === tier.slug;
            const isCurrentPlan = tier.slug === currentPlan;

            return (
              <div
                key={tier.slug}
                className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                  tier.highlight
                    ? 'border-primary/30 bg-primary/[0.03] shadow-[0_0_40px_-12px_hsl(var(--primary)/0.15)]'
                    : isCurrentPlan
                      ? 'border-success/30 bg-success/[0.03]'
                      : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold shadow-lg">
                      {tier.badge}
                    </Badge>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-success text-success-foreground px-3 py-0.5 text-xs font-semibold shadow-lg">
                      Your Plan
                    </Badge>
                  </div>
                )}

                <div className="space-y-4 mb-6">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    tier.highlight ? 'bg-primary/15 text-primary' : 'bg-white/5 text-muted-foreground'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
                    <p className="text-sm text-muted-foreground">{tier.description}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                    <span className="text-sm text-muted-foreground">{tier.period}</span>
                  </div>
                </div>

                {/* Credit summary */}
                <div className="grid grid-cols-3 gap-1 mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-center">
                    <div className="text-xs font-bold text-foreground">{tier.credits.scrape.toLocaleString()}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Scrapes</div>
                  </div>
                  <div className="text-center border-x border-white/5">
                    <div className="text-xs font-bold text-foreground">{tier.credits.analyze.toLocaleString()}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Analyses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold text-foreground">{tier.credits.fix.toLocaleString()}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Fixes</div>
                  </div>
                  </div>
                </div>

                <div className="flex-1 space-y-2.5 mb-6">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${
                        tier.highlight ? 'text-primary' : 'text-success'
                      }`} />
                      <span className="text-sm text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>

                <Button
                  className={`w-full h-11 rounded-xl font-semibold ${
                    tier.highlight
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : ''
                  }`}
                  variant={tier.highlight ? 'default' : 'outline'}
                  disabled={btn.disabled || isLoading}
                  onClick={btn.action}
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                  ) : btn.label}
                </Button>
              </div>
            );
          })}
        </div>

        {subscribed && (
          <div className="text-center mt-8">
            <Button variant="ghost" size="sm" onClick={openPortal} className="text-muted-foreground hover:text-foreground">
              Manage Subscription →
            </Button>
          </div>
        )}

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground">
            All plans include compliance checks against Amazon's latest image & listing policies.
          </p>
        </div>
      </main>
    </div>
  );
}
