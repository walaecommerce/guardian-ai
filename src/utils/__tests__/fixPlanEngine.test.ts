import { describe, it, expect } from 'vitest';
import { buildFixPlan } from '../fixPlanEngine';
import type { Violation, DeterministicFindingSummary } from '@/types';

const bgViolation: Violation = {
  severity: 'critical',
  category: 'Background',
  message: 'Background is not white',
  recommendation: 'Replace with pure white RGB(255,255,255)',
};

const overlayViolation: Violation = {
  severity: 'warning',
  category: 'Overlay',
  message: 'Promotional badge detected',
  recommendation: 'Remove badge overlay',
  rule_id: 'MAIN_NO_OVERLAY',
};

const occupancyViolation: Violation = {
  severity: 'warning',
  category: 'Occupancy',
  message: 'Product occupies only 60% of frame',
  recommendation: 'Crop tighter so product occupies 85%+',
  rule_id: 'MAIN_OCCUPANCY',
};

const bgFinding: DeterministicFindingSummary = {
  rule_id: 'MAIN_WHITE_BG',
  severity: 'critical',
  passed: false,
  message: 'Background not white',
};

describe('buildFixPlan', () => {
  describe('strategy selection', () => {
    it('MAIN with bg violation → bg-cleanup', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [bgViolation], []);
      expect(plan.strategy).toBe('bg-cleanup');
    });

    it('MAIN with overlay violation → overlay-removal', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [overlayViolation], []);
      expect(plan.strategy).toBe('overlay-removal');
    });

    it('MAIN with occupancy violation → crop-reframe', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [occupancyViolation], []);
      expect(plan.strategy).toBe('crop-reframe');
    });

    it('MAIN with multiple issues → inpaint-edit', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [bgViolation, overlayViolation], []);
      expect(plan.strategy).toBe('inpaint-edit');
    });

    it('MAIN with no violations → bg-cleanup (safe default)', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [], []);
      expect(plan.strategy).toBe('bg-cleanup');
    });

    it('MAIN never defaults to full-regeneration', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [bgViolation, overlayViolation, occupancyViolation], [bgFinding]);
      expect(plan.strategy).not.toBe('full-regeneration');
    });

    it('SECONDARY with overlay → overlay-removal', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], []);
      expect(plan.strategy).toBe('overlay-removal');
    });

    it('SECONDARY without overlay → inpaint-edit', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [bgViolation], []);
      expect(plan.strategy).toBe('inpaint-edit');
    });
  });

  describe('category-aware preservation', () => {
    it('APPAREL preserves garment shape', () => {
      const plan = buildFixPlan('MAIN', 'APPAREL', [bgViolation], []);
      expect(plan.preserve).toContain('garment shape');
      expect(plan.prohibited).toContain('do not alter fabric texture');
    });

    it('FOOD_BEVERAGE preserves packaging text and label claims', () => {
      const plan = buildFixPlan('MAIN', 'FOOD_BEVERAGE', [bgViolation], []);
      expect(plan.preserve).toContain('all packaging text');
      expect(plan.preserve).toContain('label claims');
    });

    it('JEWELRY preserves metal/stone arrangement', () => {
      const plan = buildFixPlan('MAIN', 'JEWELRY', [bgViolation], []);
      expect(plan.preserve).toContain('metal/stone arrangement');
    });

    it('ELECTRONICS preserves ports and controls', () => {
      const plan = buildFixPlan('MAIN', 'ELECTRONICS', [bgViolation], []);
      expect(plan.preserve).toContain('ports');
      expect(plan.preserve).toContain('controls');
    });

    it('SUPPLEMENTS preserves dosage info', () => {
      const plan = buildFixPlan('MAIN', 'SUPPLEMENTS', [bgViolation], []);
      expect(plan.preserve).toContain('dosage info');
    });
  });

  describe('target rule IDs', () => {
    it('collects rule_ids from violations', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [overlayViolation, occupancyViolation], []);
      expect(plan.targetRuleIds).toContain('MAIN_NO_OVERLAY');
      expect(plan.targetRuleIds).toContain('MAIN_OCCUPANCY');
    });

    it('collects rule_ids from failed deterministic findings', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [], [bgFinding]);
      expect(plan.targetRuleIds).toContain('MAIN_WHITE_BG');
    });

    it('deduplicates rule_ids', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [overlayViolation, overlayViolation], []);
      const count = plan.targetRuleIds.filter(id => id === 'MAIN_NO_OVERLAY').length;
      expect(count).toBe(1);
    });
  });

  describe('identity enrichment', () => {
    it('adds brand and label text when identity provided', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [bgViolation], [], {
        brandName: 'TestBrand',
        productName: 'TestProduct',
        dominantColors: ['#ff0000'],
        packagingType: 'bottle',
        shapeDescription: 'cylindrical',
        labelText: ['TestBrand', '500ml'],
        keyVisualFeatures: [],
        productDescriptor: '',
      });
      expect(plan.preserve.some(p => p.includes('TestBrand'))).toBe(true);
      expect(plan.preserve.some(p => p.includes('500ml'))).toBe(true);
    });
  });

  describe('category constraints', () => {
    it('FOOTWEAR has orientation constraint', () => {
      const plan = buildFixPlan('MAIN', 'FOOTWEAR', [bgViolation], []);
      expect(plan.categoryConstraints.some(c => c.includes('45°'))).toBe(true);
    });
  });
});
