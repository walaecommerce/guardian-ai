/**
 * Evidence-first audit UI helpers.
 * Maps violation evidence to displayable structures and groups findings.
 */

import type { Violation, DeterministicFindingSummary } from '@/types';
import { getPolicyRule, getSourceTierLabel, getSourceTierBadgeClass, type SourceTier, type PolicySurface } from '@/config/policyRegistry';

// ── Finding source types ──

export type FindingSource = 'deterministic' | 'llm' | 'category-specific' | 'consistency';

export interface EvidenceDisplay {
  ruleId: string | null;
  source: string | null;
  sourceUrl: string | null;
  sourceTier: SourceTier | null;
  surfaces: PolicySurface[] | null;
  whyTriggered: string | null;
  measuredValue: string | number | null;
  threshold: string | number | null;
  ocrSnippet: string | null;
  boundingBoxSummary: string | null;
  findingSource: FindingSource;
  fixLikelihood: string | null;
}

export interface FindingGroup {
  label: string;
  priority: number;
  items: Array<{ violation: Violation; evidence: EvidenceDisplay }>;
}

// ── Classify finding source ──

export function classifyFindingSource(violation: Violation, deterministicRuleIds: Set<string>): FindingSource {
  const ruleId = violation.rule_id || violation.evidence?.rule_id;
  if (ruleId && deterministicRuleIds.has(ruleId)) return 'deterministic';

  if (ruleId) {
    const rule = getPolicyRule(ruleId);
    if (rule) {
      if (rule.check_type === 'deterministic') return 'deterministic';
      if (rule.category !== 'universal') return 'category-specific';
    }
  }

  const cat = violation.category?.toLowerCase() || '';
  if (cat.includes('consistency') || cat.includes('identity') || cat.includes('conflict')) return 'consistency';

  return 'llm';
}

// ── Extract evidence display from a violation ──

export function extractEvidence(violation: Violation, deterministicRuleIds: Set<string>): EvidenceDisplay {
  const ev = violation.evidence;
  const ruleId = violation.rule_id || ev?.rule_id || null;
  const findingSource = classifyFindingSource(violation, deterministicRuleIds);

  let sourceLabel: string | null = null;
  let sourceUrl: string | null = null;
  let sourceTier: SourceTier | null = null;
  let surfaces: PolicySurface[] | null = null;
  if (ruleId) {
    const rule = getPolicyRule(ruleId);
    if (rule) {
      sourceLabel = rule.source;
      sourceUrl = rule.source_url || null;
      sourceTier = rule.source_tier || null;
      surfaces = rule.surfaces || null;
    }
  }
  if (ev?.source) sourceLabel = ev.source;

  let boundingBoxSummary: string | null = null;
  if (ev?.bounding_box) {
    const bb = ev.bounding_box;
    boundingBoxSummary = `Region: top ${Math.round(bb.top * 100)}%, left ${Math.round(bb.left * 100)}%, ${Math.round(bb.width * 100)}%×${Math.round(bb.height * 100)}%`;
  }

  let fixLikelihood: string | null = null;
  if (ruleId) {
    const rule = getPolicyRule(ruleId);
    if (rule?.fix_guidance) {
      if (rule.check_type === 'deterministic') fixLikelihood = 'Auto-fixable';
      else if (rule.check_type === 'hybrid') fixLikelihood = 'Likely fixable';
      else fixLikelihood = 'AI-assisted fix';
    }
  }

  return {
    ruleId,
    source: sourceLabel,
    sourceUrl,
    sourceTier,
    surfaces,
    whyTriggered: ev?.why_triggered || null,
    measuredValue: ev?.measured_value ?? null,
    threshold: ev?.threshold ?? null,
    ocrSnippet: ev?.ocr_snippet || null,
    boundingBoxSummary,
    findingSource,
    fixLikelihood,
  };
}

// ── Group violations into display buckets ──

export function groupFindings(
  violations: Violation[],
  deterministicRuleIds: Set<string>
): FindingGroup[] {
  const groups: Record<string, FindingGroup> = {
    critical: { label: 'Hard Policy Failures', priority: 0, items: [] },
    warning: { label: 'Warnings', priority: 1, items: [] },
    consistency: { label: 'Consistency Issues', priority: 2, items: [] },
    optimization: { label: 'Optimization Suggestions', priority: 3, items: [] },
    info: { label: 'Informational', priority: 4, items: [] },
  };

  for (const v of violations) {
    const evidence = extractEvidence(v, deterministicRuleIds);
    const entry = { violation: v, evidence };

    if (evidence.findingSource === 'consistency') {
      groups.consistency.items.push(entry);
    } else if (evidence.sourceTier === 'optimization_playbook') {
      groups.optimization.items.push(entry);
    } else if (v.severity === 'critical') {
      groups.critical.items.push(entry);
    } else if (v.severity === 'warning') {
      groups.warning.items.push(entry);
    } else {
      groups.info.items.push(entry);
    }
  }

  return Object.values(groups)
    .filter(g => g.items.length > 0)
    .sort((a, b) => a.priority - b.priority);
}

// ── Build deterministic rule ID set from findings ──

export function buildDeterministicRuleIdSet(findings?: DeterministicFindingSummary[]): Set<string> {
  const set = new Set<string>();
  if (!findings) return set;
  for (const f of findings) set.add(f.rule_id);
  return set;
}

// ── Source label helpers ──

export function getSourceBadgeLabel(source: FindingSource): string {
  switch (source) {
    case 'deterministic': return 'Pre-check';
    case 'llm': return 'AI Analysis';
    case 'category-specific': return 'Category Rule';
    case 'consistency': return 'Consistency';
  }
}

export function getSourceBadgeClass(source: FindingSource): string {
  switch (source) {
    case 'deterministic': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'llm': return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'category-specific': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'consistency': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
  }
}

// ── Surface label helpers ──

const SURFACE_SHORT_LABELS: Record<PolicySurface, string> = {
  LISTING_MAIN: 'Main',
  LISTING_SECONDARY: 'Secondary',
  APLUS: 'A+',
  BRAND_STORY: 'Brand Story',
  BRAND_STORE: 'Brand Store',
  VIDEO: 'Video',
  '360': '360°',
};

export function getSurfaceLabels(surfaces: PolicySurface[] | null): string[] {
  if (!surfaces || surfaces.length === 0) return [];
  return surfaces.map(s => SURFACE_SHORT_LABELS[s] || s);
}

// Re-export tier helpers for convenience
export { getSourceTierLabel, getSourceTierBadgeClass };
