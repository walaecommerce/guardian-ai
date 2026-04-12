/**
 * Evaluation Harness — Comparison + Reporting
 *
 * Compares actual audit/fix output against benchmark expectations.
 * Reports pass/fail per benchmark with detailed mismatch information.
 */

import type { BenchmarkCase } from './benchmarkDataset';
import type { FixStrategy } from '@/types';

// ── Actual result structure (what the audit/fix pipeline produces) ──

export interface ActualAuditResult {
  productCategory: string | null;
  policyStatus: 'pass' | 'warning' | 'fail';
  ruleIds: string[];
  issueCount: number;
  fixStrategy: FixStrategy | null;
  evidencePresent: boolean;
}

// ── Mismatch types ──

export type MismatchType =
  | 'wrong_category'
  | 'wrong_policy_status'
  | 'missing_expected_rule_id'
  | 'unexpected_no_evidence'
  | 'issue_count_out_of_range'
  | 'wrong_fix_strategy'
  | 'unsafe_main_regeneration';

export interface Mismatch {
  type: MismatchType;
  expected: string;
  actual: string;
  detail?: string;
}

// ── Per-benchmark evaluation result ──

export interface BenchmarkEvalResult {
  benchmarkId: string;
  passed: boolean;
  mismatches: Mismatch[];
}

// ── Summary ──

export interface EvaluationSummary {
  totalBenchmarks: number;
  passed: number;
  failed: number;
  failuresByType: Record<MismatchType, number>;
  results: BenchmarkEvalResult[];
}

// ── Core evaluation logic ──

export function evaluateBenchmark(
  benchmark: BenchmarkCase,
  actual: ActualAuditResult,
): BenchmarkEvalResult {
  const mismatches: Mismatch[] = [];

  // 1. Category check
  if (actual.productCategory && actual.productCategory !== benchmark.expectedProductCategory) {
    mismatches.push({
      type: 'wrong_category',
      expected: benchmark.expectedProductCategory,
      actual: actual.productCategory,
    });
  }

  // 2. Policy status
  if (actual.policyStatus !== benchmark.expectedPolicyStatus) {
    mismatches.push({
      type: 'wrong_policy_status',
      expected: benchmark.expectedPolicyStatus,
      actual: actual.policyStatus,
    });
  }

  // 3. Expected rule IDs present
  for (const ruleId of benchmark.expectedRuleIds) {
    if (!actual.ruleIds.includes(ruleId)) {
      mismatches.push({
        type: 'missing_expected_rule_id',
        expected: ruleId,
        actual: actual.ruleIds.join(', ') || '(none)',
        detail: `Expected rule ${ruleId} was not triggered`,
      });
    }
  }

  // 4. Evidence presence
  if (benchmark.expectedRuleIds.length > 0 && !actual.evidencePresent) {
    mismatches.push({
      type: 'unexpected_no_evidence',
      expected: 'evidence present',
      actual: 'no evidence',
    });
  }

  // 5. Issue count range
  if (benchmark.expectedIssueCountRange) {
    const [min, max] = benchmark.expectedIssueCountRange;
    if (actual.issueCount < min || actual.issueCount > max) {
      mismatches.push({
        type: 'issue_count_out_of_range',
        expected: `${min}-${max}`,
        actual: String(actual.issueCount),
      });
    }
  }

  // 6. Fix strategy
  if (benchmark.expectedFixStrategy !== undefined) {
    if (actual.fixStrategy !== benchmark.expectedFixStrategy) {
      mismatches.push({
        type: 'wrong_fix_strategy',
        expected: benchmark.expectedFixStrategy ?? '(none)',
        actual: actual.fixStrategy ?? '(none)',
      });
    }
  }

  // 7. MAIN safety guard — full-regeneration must not be selected
  if (benchmark.mainSafetyGuard && actual.fixStrategy === 'full-regeneration') {
    mismatches.push({
      type: 'unsafe_main_regeneration',
      expected: 'non-destructive strategy',
      actual: 'full-regeneration',
      detail: 'MAIN image received unsafe full-regeneration strategy',
    });
  }

  return {
    benchmarkId: benchmark.id,
    passed: mismatches.length === 0,
    mismatches,
  };
}

// ── Batch evaluation ──

export function evaluateAll(
  benchmarks: BenchmarkCase[],
  results: Map<string, ActualAuditResult>,
): EvaluationSummary {
  const evalResults: BenchmarkEvalResult[] = [];
  const failuresByType: Record<string, number> = {};

  for (const bm of benchmarks) {
    const actual = results.get(bm.id);
    if (!actual) {
      evalResults.push({
        benchmarkId: bm.id,
        passed: false,
        mismatches: [{
          type: 'wrong_policy_status',
          expected: bm.expectedPolicyStatus,
          actual: '(no result)',
          detail: 'Benchmark was not evaluated — no actual result provided',
        }],
      });
      failuresByType['wrong_policy_status'] = (failuresByType['wrong_policy_status'] || 0) + 1;
      continue;
    }

    const evalResult = evaluateBenchmark(bm, actual);
    evalResults.push(evalResult);

    for (const m of evalResult.mismatches) {
      failuresByType[m.type] = (failuresByType[m.type] || 0) + 1;
    }
  }

  const passed = evalResults.filter(r => r.passed).length;

  return {
    totalBenchmarks: benchmarks.length,
    passed,
    failed: benchmarks.length - passed,
    failuresByType: failuresByType as Record<MismatchType, number>,
    results: evalResults,
  };
}

// ── Formatting helpers ──

export function formatEvaluationSummary(summary: EvaluationSummary): string {
  const lines: string[] = [
    `Evaluation Summary: ${summary.passed}/${summary.totalBenchmarks} passed`,
    '',
  ];

  if (summary.failed > 0) {
    lines.push('Failures by type:');
    for (const [type, count] of Object.entries(summary.failuresByType)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');

    lines.push('Detailed mismatches:');
    for (const r of summary.results.filter(r => !r.passed)) {
      lines.push(`  [${r.benchmarkId}]`);
      for (const m of r.mismatches) {
        lines.push(`    ${m.type}: expected=${m.expected} actual=${m.actual}${m.detail ? ` (${m.detail})` : ''}`);
      }
    }
  }

  return lines.join('\n');
}
