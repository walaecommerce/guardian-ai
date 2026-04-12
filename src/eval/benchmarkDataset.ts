/**
 * Evaluation Harness — Benchmark Dataset
 *
 * Lightweight benchmark cases for measuring audit/fix quality over time.
 * Each case defines expected outcomes so regressions are visible.
 */

import type { FixStrategy } from '@/types';

export interface BenchmarkCase {
  id: string;
  category: string;
  imageRole: 'MAIN' | 'SECONDARY';
  inputDescription: string;
  expectedProductCategory: string;
  expectedPolicyStatus: 'pass' | 'warning' | 'fail';
  expectedRuleIds: string[];
  expectedIssueCountRange?: [number, number];
  expectedFixStrategy?: FixStrategy | null;
  /** If true, full-regeneration must NOT be selected for this case */
  mainSafetyGuard?: boolean;
  notes: string;
  tags: string[];
}

// ── Seed benchmark set ──────────────────────────────────────────

export const BENCHMARK_CASES: BenchmarkCase[] = [
  // 1. MAIN white background failure — Food
  {
    id: 'BM-001',
    category: 'FOOD_BEVERAGE',
    imageRole: 'MAIN',
    inputDescription: 'Food product on a kitchen counter (non-white background), label facing forward, good resolution.',
    expectedProductCategory: 'FOOD_BEVERAGE',
    expectedPolicyStatus: 'fail',
    expectedRuleIds: ['MAIN_WHITE_BG'],
    expectedIssueCountRange: [1, 4],
    expectedFixStrategy: 'bg-cleanup',
    mainSafetyGuard: true,
    notes: 'Classic BG failure. Fix should swap background, not regenerate product.',
    tags: ['background', 'main-safety', 'food'],
  },

  // 2. Occupancy / framing — Apparel
  {
    id: 'BM-002',
    category: 'APPAREL',
    imageRole: 'MAIN',
    inputDescription: 'T-shirt on white background but only fills 40% of frame with excessive whitespace.',
    expectedProductCategory: 'APPAREL',
    expectedPolicyStatus: 'fail',
    expectedRuleIds: ['MAIN_OCCUPANCY'],
    expectedIssueCountRange: [1, 3],
    expectedFixStrategy: 'crop-reframe',
    mainSafetyGuard: true,
    notes: 'Should crop/reframe, not regenerate the garment.',
    tags: ['occupancy', 'framing', 'apparel'],
  },

  // 3. Overlay / badge — Electronics
  {
    id: 'BM-003',
    category: 'ELECTRONICS',
    imageRole: 'MAIN',
    inputDescription: 'Bluetooth speaker on white BG with "BEST SELLER" promotional badge and watermark overlay.',
    expectedProductCategory: 'ELECTRONICS',
    expectedPolicyStatus: 'fail',
    expectedRuleIds: ['MAIN_NO_TEXT_OVERLAY'],
    expectedIssueCountRange: [1, 4],
    expectedFixStrategy: 'overlay-removal',
    mainSafetyGuard: true,
    notes: 'Badge/watermark removal without altering product.',
    tags: ['overlay', 'badge', 'electronics'],
  },

  // 4. Category-specific — Jewelry mannequin
  {
    id: 'BM-004',
    category: 'JEWELRY',
    imageRole: 'MAIN',
    inputDescription: 'Gold necklace displayed on a black velvet mannequin bust, dark background.',
    expectedProductCategory: 'JEWELRY',
    expectedPolicyStatus: 'fail',
    expectedRuleIds: ['MAIN_WHITE_BG', 'JEWELRY_NO_MANNEQUIN'],
    expectedIssueCountRange: [2, 5],
    expectedFixStrategy: 'inpaint-edit',
    mainSafetyGuard: true,
    notes: 'Multiple issues: BG + mannequin. Should inpaint, not full-regen.',
    tags: ['category-specific', 'jewelry', 'mannequin', 'background'],
  },

  // 5. Consistency / identity — General
  {
    id: 'BM-005',
    category: 'GENERAL_MERCHANDISE',
    imageRole: 'MAIN',
    inputDescription: 'Correct white BG, good framing, but product color in image contradicts listing title (blue vs red).',
    expectedProductCategory: 'GENERAL_MERCHANDISE',
    expectedPolicyStatus: 'warning',
    expectedRuleIds: ['IMAGE_TITLE_MATCH'],
    expectedIssueCountRange: [1, 3],
    expectedFixStrategy: null,
    mainSafetyGuard: true,
    notes: 'Identity mismatch — fix should not attempt color change on MAIN.',
    tags: ['consistency', 'identity', 'title-match'],
  },

  // 6. Clean pass — Food
  {
    id: 'BM-006',
    category: 'FOOD_BEVERAGE',
    imageRole: 'MAIN',
    inputDescription: 'Sealed snack bag on pure white background, label forward, fills 90% of frame, 2000px, sharp.',
    expectedProductCategory: 'FOOD_BEVERAGE',
    expectedPolicyStatus: 'pass',
    expectedRuleIds: [],
    expectedIssueCountRange: [0, 0],
    expectedFixStrategy: null,
    mainSafetyGuard: false,
    notes: 'Should pass all checks cleanly.',
    tags: ['clean', 'pass', 'food'],
  },

  // 7. Low resolution warning — Apparel secondary
  {
    id: 'BM-007',
    category: 'APPAREL',
    imageRole: 'SECONDARY',
    inputDescription: 'Lifestyle image of model wearing jacket, 480px wide, slightly soft focus.',
    expectedProductCategory: 'APPAREL',
    expectedPolicyStatus: 'warning',
    expectedRuleIds: ['IMAGE_DIMENSIONS'],
    expectedIssueCountRange: [1, 3],
    expectedFixStrategy: null,
    mainSafetyGuard: false,
    notes: 'Resolution warning on secondary — no fix strategy expected.',
    tags: ['resolution', 'secondary', 'apparel'],
  },

  // 8. Multiple MAIN violations — Supplements
  {
    id: 'BM-008',
    category: 'SUPPLEMENTS',
    imageRole: 'MAIN',
    inputDescription: 'Supplement bottle with loose pills scattered around it on a wooden table, "50% OFF" badge.',
    expectedProductCategory: 'SUPPLEMENTS',
    expectedPolicyStatus: 'fail',
    expectedRuleIds: ['MAIN_WHITE_BG', 'MAIN_NO_TEXT_OVERLAY'],
    expectedIssueCountRange: [3, 7],
    expectedFixStrategy: 'inpaint-edit',
    mainSafetyGuard: true,
    notes: 'Multiple issues requiring surgical approach, not full-regen.',
    tags: ['multi-violation', 'supplements', 'main-safety'],
  },
];

/** Get a benchmark by ID */
export function getBenchmark(id: string): BenchmarkCase | undefined {
  return BENCHMARK_CASES.find(b => b.id === id);
}

/** Get benchmarks filtered by tag */
export function getBenchmarksByTag(tag: string): BenchmarkCase[] {
  return BENCHMARK_CASES.filter(b => b.tags.includes(tag));
}

/** Get benchmarks filtered by category */
export function getBenchmarksByCategory(category: string): BenchmarkCase[] {
  return BENCHMARK_CASES.filter(b => b.category === category);
}
