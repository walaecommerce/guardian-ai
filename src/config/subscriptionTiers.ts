export interface SubscriptionTier {
  name: string;
  slug: string;
  price: string;
  period: string;
  description: string;
  priceId: string | null; // null for free
  productId: string | null;
  highlight: boolean;
  badge?: string;
  credits: {
    scrape: number;
    analyze: number;
    fix: number;
  };
  features: string[];
}

export const TIERS: SubscriptionTier[] = [
  {
    name: 'Free',
    slug: 'free',
    price: '$0',
    period: '/month',
    description: 'Try it out',
    priceId: null,
    productId: null,
    highlight: false,
    credits: { scrape: 5, analyze: 10, fix: 2 },
    features: [
      '5 scrape credits / month',
      '10 analyze credits / month',
      '2 fix credits / month',
      'Single image audit',
      'Basic compliance checks',
    ],
  },
  {
    name: 'Starter',
    slug: 'starter',
    price: '$29',
    period: '/month',
    description: 'Solo sellers (1-2 brands)',
    priceId: 'price_1TJA0gK7EbmlgD7cWaWYpBIw',
    productId: 'prod_UHjTdlsO5RUwtK',
    highlight: false,
    credits: { scrape: 50, analyze: 100, fix: 20 },
    features: [
      '50 scrape credits / month',
      '100 analyze credits / month',
      '20 fix credits / month',
      'Campaign batch audit',
      'Export PDF reports',
      'Email support',
    ],
  },
  {
    name: 'Pro',
    slug: 'pro',
    price: '$79',
    period: '/month',
    description: 'Growing brands (5-20 SKUs)',
    priceId: 'price_1TJA14K7EbmlgD7czD2dnASz',
    productId: 'prod_UHjUUnk2kWv6VF',
    highlight: true,
    badge: 'Most Popular',
    credits: { scrape: 200, analyze: 500, fix: 100 },
    features: [
      '200 scrape credits / month',
      '500 analyze credits / month',
      '100 fix credits / month',
      'AI Studio image generation',
      'Policy change alerts',
      'Priority support',
    ],
  },
  {
    name: 'Agency',
    slug: 'agency',
    price: '$199',
    period: '/month',
    description: 'Agencies managing large catalogs',
    priceId: 'price_1TJA1bK7EbmlgD7cfbHfM2A3',
    productId: 'prod_UHjUHD5BsRtLHe',
    highlight: false,
    credits: { scrape: 1000, analyze: 2500, fix: 500 },
    features: [
      '1,000 scrape credits / month',
      '2,500 analyze credits / month',
      '500 fix credits / month',
      'Everything in Pro',
      'Client report branding',
      'Dedicated support',
    ],
  },
];

export function getTierByPlan(plan: string): SubscriptionTier {
  return TIERS.find(t => t.slug === plan) || TIERS[0];
}
