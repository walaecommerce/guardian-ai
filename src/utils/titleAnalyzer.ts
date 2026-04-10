/**
 * Deterministic Amazon title compliance analyzer.
 * Runs structured rules from titleRules.ts and returns pass/fail per rule.
 */

import { TITLE_RULES, TitleRule, TitleRuleResult } from '@/config/titleRules';

export interface TitleRuleFinding {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  message: string;
  guidance: string;
  severity: 'critical' | 'warning' | 'info';
  reference: string;
}

export interface TitleComplianceResult {
  passed: boolean;
  score: number; // 0-100
  findings: TitleRuleFinding[];
  criticalCount: number;
  warningCount: number;
}

export function analyzeTitleCompliance(title: string, category?: string): TitleComplianceResult {
  if (!title || !title.trim()) {
    return {
      passed: false,
      score: 0,
      findings: [],
      criticalCount: 0,
      warningCount: 0,
    };
  }

  const findings: TitleRuleFinding[] = TITLE_RULES.map((rule: TitleRule) => {
    const result: TitleRuleResult = rule.check(title, category);
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      passed: result.passed,
      message: result.message,
      guidance: rule.guidance,
      severity: rule.severity,
      reference: rule.reference,
    };
  });

  const criticalCount = findings.filter(f => !f.passed && f.severity === 'critical').length;
  const warningCount = findings.filter(f => !f.passed && f.severity === 'warning').length;
  const passedCount = findings.filter(f => f.passed).length;
  const total = findings.length;
  const score = total > 0 ? Math.round((passedCount / total) * 100) : 100;
  const passed = criticalCount === 0;

  return { passed, score, findings, criticalCount, warningCount };
}
