import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, PartyPopper, Search, BarChart3, Sparkles } from 'lucide-react';
import { getTierByPlan } from '@/config/subscriptionTiers';

interface SuccessModalProps {
  open: boolean;
  onClose: () => void;
  plan: string;
}

export function CheckoutSuccessModal({ open, onClose, plan }: SuccessModalProps) {
  const firedRef = useRef(false);
  const tier = getTierByPlan(plan);

  useEffect(() => {
    if (open && !firedRef.current) {
      firedRef.current = true;
      // Fire confetti bursts
      const end = Date.now() + 1500;
      const colors = ['#00d4ff', '#00ffcc', '#ffffff'];

      (function frame() {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors,
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
    if (!open) firedRef.current = false;
  }, [open]);

  const creditItems = [
    { icon: Search, label: 'Scrapes', value: tier.credits.scrape },
    { icon: BarChart3, label: 'Analyses', value: tier.credits.analyze },
    { icon: Sparkles, label: 'Fixes', value: tier.credits.fix },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-white/10 text-center p-0 overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-[hsl(var(--success))] to-primary" />

        <div className="p-8 space-y-6">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center animate-scale-in">
            <PartyPopper className="w-8 h-8 text-primary" />
          </div>

          {/* Headline */}
          <div className="space-y-2 animate-fade-in">
            <h2 className="text-2xl font-bold text-foreground">
              Welcome to <span className="text-primary">{tier.name}</span>!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your subscription is active. Here are your new monthly credits:
            </p>
          </div>

          {/* Credits grid */}
          <div className="grid grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: '150ms' }}>
            {creditItems.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/5"
              >
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold text-foreground">
                  {value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : value}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>

          {/* Checkmarks */}
          <div className="space-y-2 text-left animate-fade-in" style={{ animationDelay: '300ms' }}>
            {['Credits refreshed & ready to use', 'Subscription managed via Stripe', 'Cancel or change anytime'].map((text) => (
              <div key={text} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            Start Auditing →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
