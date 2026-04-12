import { describe, it, expect } from 'vitest';
import { buildFixPlan } from '../fixPlanEngine';
import type { Violation } from '@/types';

// These tests verify that contentType properly influences strategy
// and that the fix plan carries correct data for prompt building.

const overlayViolation: Violation = {
  severity: 'warning',
  category: 'Overlay',
  message: 'Promotional badge detected',
  recommendation: 'Remove badge overlay',
  rule_id: 'MAIN_NO_OVERLAY',
};

const bgViolation: Violation = {
  severity: 'critical',
  category: 'Background',
  message: 'Background is not white',
  recommendation: 'Replace with pure white',
};

describe('content-type-aware fix plan', () => {
  describe('LIFESTYLE content type', () => {
    it('overlay → overlay-removal', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], [], null, 'LIFESTYLE');
      expect(plan.strategy).toBe('overlay-removal');
    });

    it('bg violation → bg-cleanup (light edit allowed)', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [bgViolation], [], null, 'LIFESTYLE');
      expect(plan.strategy).toBe('bg-cleanup');
    });
  });

  describe('INFOGRAPHIC content type', () => {
    it('overlay → overlay-removal', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], [], null, 'INFOGRAPHIC');
      expect(plan.strategy).toBe('overlay-removal');
    });

    it('non-overlay violation → skip (protect text)', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [bgViolation], [], null, 'INFOGRAPHIC');
      expect(plan.strategy).toBe('skip');
    });
  });

  describe('PACKAGING content type', () => {
    it('overlay → overlay-removal', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], [], null, 'PACKAGING');
      expect(plan.strategy).toBe('overlay-removal');
    });

    it('bg violation → bg-cleanup', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [bgViolation], [], null, 'PACKAGING');
      expect(plan.strategy).toBe('bg-cleanup');
    });
  });

  describe('DETAIL content type', () => {
    it('overlay → overlay-removal', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], [], null, 'DETAIL');
      expect(plan.strategy).toBe('overlay-removal');
    });
  });

  describe('PRODUCT_SHOT content type', () => {
    it('bg violation → bg-cleanup', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [bgViolation], [], null, 'PRODUCT_SHOT');
      expect(plan.strategy).toBe('bg-cleanup');
    });
  });

  describe('SIZE_CHART and COMPARISON remain skipped', () => {
    it('SIZE_CHART → skip regardless of violations', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], [], null, 'SIZE_CHART');
      expect(plan.strategy).toBe('skip');
    });

    it('COMPARISON → skip regardless of violations', () => {
      const plan = buildFixPlan('SECONDARY', 'GENERAL', [overlayViolation], [], null, 'COMPARISON');
      expect(plan.strategy).toBe('skip');
    });
  });

  describe('MAIN image unchanged by contentType', () => {
    it('MAIN still uses bg-cleanup for bg violation regardless of contentType', () => {
      const plan = buildFixPlan('MAIN', 'GENERAL', [bgViolation], [], null, 'LIFESTYLE');
      expect(plan.strategy).toBe('bg-cleanup');
    });
  });
});
