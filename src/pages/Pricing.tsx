import { Shield, Check, Zap, Crown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';


const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    icon: <Zap className="w-5 h-5" />,
    description: 'Get started with basic audits',
    features: [
      '10 scrape credits / month',
      '20 analyze credits / month',
      '5 fix credits / month',
      'Single image audit',
      'Basic compliance checks',
      'Community support',
    ],
    cta: 'Current Plan',
    disabled: true,
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    icon: <Crown className="w-5 h-5" />,
    description: 'For serious Amazon sellers',
    badge: 'Most Popular',
    features: [
      '100 scrape credits / month',
      '500 analyze credits / month',
      '50 fix credits / month',
      'Campaign batch audit',
      'AI Studio image generation',
      'Policy change alerts',
      'Export PDF reports',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    disabled: false,
    highlight: true,
  },
  {
    name: 'Business',
    price: '$99',
    period: '/month',
    icon: <Building2 className="w-5 h-5" />,
    description: 'For agencies & large catalogs',
    features: [
      'Unlimited scrape credits',
      'Unlimited analyze credits',
      '200 fix credits / month',
      'Everything in Pro',
      'Client report branding',
      'Team member seats',
      'API access',
      'Dedicated support',
    ],
    cta: 'Contact Sales',
    disabled: false,
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-16 max-w-6xl">
        {/* Header section */}
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

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                plan.highlight
                  ? 'border-primary/30 bg-primary/[0.03] shadow-[0_0_40px_-12px_hsl(187_100%_50%/0.15)]'
                  : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold shadow-lg">
                    {plan.badge}
                  </Badge>
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  plan.highlight ? 'bg-primary/15 text-primary' : 'bg-white/5 text-muted-foreground'
                }`}>
                  {plan.icon}
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
              </div>

              <div className="flex-1 space-y-3 mb-6">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${
                      plan.highlight ? 'text-primary' : 'text-success'
                    }`} />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                className={`w-full h-11 rounded-xl font-semibold ${
                  plan.highlight
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : ''
                }`}
                variant={plan.highlight ? 'default' : 'outline'}
                disabled={plan.disabled}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground">
            All plans include compliance checks against Amazon's latest image & listing policies.
          </p>
        </div>
      </main>
    </div>
  );
}
