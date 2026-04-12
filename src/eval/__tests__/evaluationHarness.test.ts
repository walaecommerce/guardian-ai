import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_CASES,
  getBenchmark,
  getBenchmarksByTag,
  getBenchmarksByCategory,
} from '../benchmarkDataset';
import {
  evaluateBenchmark,
  evaluateAll,
  formatEvaluationSummary,
  type ActualAuditResult,
} from '../evaluationHarness';

// ── Dataset structure tests ──

describe('benchmarkDataset', () => {
  it('has at least 8 seed cases', () => {
    expect(BENCHMARK_CASES.length).toBeGreaterThanOrEqual(8);
  });

  it('all cases have required fields', () => {
    for (const bm of BENCHMARK_CASES) {
      expect(bm.id).toBeTruthy();
      expect(bm.category).toBeTruthy();
      expect(['MAIN', 'SECONDARY']).toContain(bm.imageRole);
      expect(['pass', 'warning', 'fail']).toContain(bm.expectedPolicyStatus);
      expect(Array.isArray(bm.expectedRuleIds)).toBe(true);
      expect(Array.isArray(bm.tags)).toBe(true);
    }
  });

  it('has unique benchmark IDs', () => {
    const ids = BENCHMARK_CASES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getBenchmark returns correct case', () => {
    const bm = getBenchmark('BM-001');
    expect(bm).toBeDefined();
    expect(bm!.category).toBe('FOOD_BEVERAGE');
  });

  it('getBenchmarksByTag filters correctly', () => {
    const mainSafety = getBenchmarksByTag('main-safety');
    expect(mainSafety.length).toBeGreaterThan(0);
    expect(mainSafety.every(b => b.tags.includes('main-safety'))).toBe(true);
  });

  it('getBenchmarksByCategory filters correctly', () => {
    const apparel = getBenchmarksByCategory('APPAREL');
    expect(apparel.length).toBeGreaterThan(0);
    expect(apparel.every(b => b.category === 'APPAREL')).toBe(true);
  });

  it('includes a clean pass case', () => {
    const passCases = BENCHMARK_CASES.filter(b => b.expectedPolicyStatus === 'pass');
    expect(passCases.length).toBeGreaterThan(0);
  });

  it('spans multiple categories', () => {
    const categories = new Set(BENCHMARK_CASES.map(b => b.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });
});

// ── Evaluation logic tests ──

describe('evaluateBenchmark', () => {
  const passBenchmark = getBenchmark('BM-006')!;
  const failBenchmark = getBenchmark('BM-001')!;

  it('reports pass when actual matches expected', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'pass',
      ruleIds: [],
      issueCount: 0,
      fixStrategy: null,
      evidencePresent: false,
    };
    const result = evaluateBenchmark(passBenchmark, actual);
    expect(result.passed).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects wrong category', () => {
    const actual: ActualAuditResult = {
      productCategory: 'ELECTRONICS',
      policyStatus: 'pass',
      ruleIds: [],
      issueCount: 0,
      fixStrategy: null,
      evidencePresent: false,
    };
    const result = evaluateBenchmark(passBenchmark, actual);
    expect(result.passed).toBe(false);
    expect(result.mismatches.some(m => m.type === 'wrong_category')).toBe(true);
  });

  it('detects wrong policy status', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 2,
      fixStrategy: 'bg-cleanup',
      evidencePresent: true,
    };
    const result = evaluateBenchmark(passBenchmark, actual);
    expect(result.mismatches.some(m => m.type === 'wrong_policy_status')).toBe(true);
  });

  it('detects missing expected rule_ids', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: [],
      issueCount: 1,
      fixStrategy: 'bg-cleanup',
      evidencePresent: true,
    };
    const result = evaluateBenchmark(failBenchmark, actual);
    expect(result.mismatches.some(m => m.type === 'missing_expected_rule_id')).toBe(true);
  });

  it('detects unexpected no evidence', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 1,
      fixStrategy: 'bg-cleanup',
      evidencePresent: false,
    };
    const result = evaluateBenchmark(failBenchmark, actual);
    expect(result.mismatches.some(m => m.type === 'unexpected_no_evidence')).toBe(true);
  });

  it('detects issue count out of range', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 10,
      fixStrategy: 'bg-cleanup',
      evidencePresent: true,
    };
    const result = evaluateBenchmark(failBenchmark, actual);
    expect(result.mismatches.some(m => m.type === 'issue_count_out_of_range')).toBe(true);
  });

  it('detects wrong fix strategy', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 2,
      fixStrategy: 'inpaint-edit',
      evidencePresent: true,
    };
    const result = evaluateBenchmark(failBenchmark, actual);
    expect(result.mismatches.some(m => m.type === 'wrong_fix_strategy')).toBe(true);
  });

  it('detects unsafe MAIN full-regeneration', () => {
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 2,
      fixStrategy: 'full-regeneration',
      evidencePresent: true,
    };
    const result = evaluateBenchmark(failBenchmark, actual);
    expect(result.mismatches.some(m => m.type === 'unsafe_main_regeneration')).toBe(true);
  });

  it('target_rules_fixed and no_new_violations influence ranking via fix strategy match', () => {
    // When fix strategy matches expected, it signals correct target rule fixing
    const actual: ActualAuditResult = {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 1,
      fixStrategy: 'bg-cleanup',
      evidencePresent: true,
    };
    const result = evaluateBenchmark(failBenchmark, actual);
    expect(result.mismatches.filter(m => m.type === 'wrong_fix_strategy')).toHaveLength(0);
  });
});

// ── Batch evaluation tests ──

describe('evaluateAll', () => {
  it('produces correct summary for mixed results', () => {
    const results = new Map<string, ActualAuditResult>();

    // BM-006 passes
    results.set('BM-006', {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'pass',
      ruleIds: [],
      issueCount: 0,
      fixStrategy: null,
      evidencePresent: false,
    });

    // BM-001 fails (wrong strategy)
    results.set('BM-001', {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'fail',
      ruleIds: ['MAIN_WHITE_BG'],
      issueCount: 2,
      fixStrategy: 'full-regeneration',
      evidencePresent: true,
    });

    const benchmarks = [getBenchmark('BM-006')!, getBenchmark('BM-001')!];
    const summary = evaluateAll(benchmarks, results);

    expect(summary.totalBenchmarks).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.failuresByType['wrong_fix_strategy']).toBe(1);
    expect(summary.failuresByType['unsafe_main_regeneration']).toBe(1);
  });

  it('handles missing results gracefully', () => {
    const results = new Map<string, ActualAuditResult>();
    const benchmarks = [getBenchmark('BM-001')!];
    const summary = evaluateAll(benchmarks, results);

    expect(summary.failed).toBe(1);
  });
});

// ── Formatting tests ──

describe('formatEvaluationSummary', () => {
  it('produces readable output', () => {
    const results = new Map<string, ActualAuditResult>();
    results.set('BM-006', {
      productCategory: 'FOOD_BEVERAGE',
      policyStatus: 'pass',
      ruleIds: [],
      issueCount: 0,
      fixStrategy: null,
      evidencePresent: false,
    });

    const summary = evaluateAll([getBenchmark('BM-006')!], results);
    const output = formatEvaluationSummary(summary);

    expect(output).toContain('1/1 passed');
  });
});
