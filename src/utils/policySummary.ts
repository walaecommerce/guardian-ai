/**
 * Policy summary helper for surfacing policy version, rule provenance,
 * and active audit context in the UI.
 */

import { POLICY_VERSION, POLICY_REGISTRY, getApplicableRules, getSourceTierLabel, type PolicyRule, type SourceTier } from '@/config/policyRegistry';
import { CATEGORY_RULES, type ProductCategory } from '@/config/categoryRules';

export interface PolicySummary {
  policyVersion: string;
  category: ProductCategory;
  categoryLabel: string;
  categoryIcon: string;
  totalApplicableRules: number;
  deterministicRuleCount: number;
  hybridRuleCount: number;
  llmRuleCount: number;
  universalRuleCount: number;
  categorySpecificRuleCount: number;
  complianceRuleCount: number;
  optimizationRuleCount: number;
  sources: PolicySourceEntry[];
}

export interface PolicySourceEntry {
  label: string;
  url: string | null;
  ruleCount: number;
  tier?: SourceTier;
}

/** Build a UI-friendly policy summary for the current audit context. */
export function getPolicySummary(
  imageType: 'main' | 'secondary',
  category: ProductCategory,
): PolicySummary {
  const rules = getApplicableRules(imageType, category);
  const catMeta = CATEGORY_RULES[category];

  const deterministicRuleCount = rules.filter(r => r.check_type === 'deterministic').length;
  const hybridRuleCount = rules.filter(r => r.check_type === 'hybrid').length;
  const llmRuleCount = rules.filter(r => r.check_type === 'llm').length;
  const universalRuleCount = rules.filter(r => r.category === 'universal').length;
  const categorySpecificRuleCount = rules.length - universalRuleCount;

  const complianceRuleCount = rules.filter(r => r.source_tier !== 'optimization_playbook').length;
  const optimizationRuleCount = rules.filter(r => r.source_tier === 'optimization_playbook').length;

  // Aggregate unique sources
  const sourceMap = new Map<string, { url: string | null; count: number; tier?: SourceTier }>();
  for (const r of rules) {
    const key = r.source;
    const existing = sourceMap.get(key);
    if (existing) {
      existing.count++;
      if (!existing.url && r.source_url) existing.url = r.source_url;
    } else {
      sourceMap.set(key, { url: r.source_url || null, count: 1, tier: r.source_tier });
    }
  }

  const sources: PolicySourceEntry[] = Array.from(sourceMap.entries())
    .map(([label, v]) => ({ label, url: v.url, ruleCount: v.count, tier: v.tier }))
    .sort((a, b) => b.ruleCount - a.ruleCount);

  return {
    policyVersion: POLICY_VERSION,
    category,
    categoryLabel: catMeta?.name || category,
    categoryIcon: catMeta?.icon || '📦',
    totalApplicableRules: rules.length,
    deterministicRuleCount,
    hybridRuleCount,
    llmRuleCount,
    universalRuleCount,
    categorySpecificRuleCount,
    complianceRuleCount,
    optimizationRuleCount,
    sources,
  };
}

/** Get a compact check-type label for display. */
export function getCheckTypeLabel(checkType: PolicyRule['check_type']): string {
  switch (checkType) {
    case 'deterministic': return 'Pre-check';
    case 'hybrid': return 'Hybrid';
    case 'llm': return 'AI Analysis';
  }
}

/** Get check-type badge styling. */
export function getCheckTypeBadgeClass(checkType: PolicyRule['check_type']): string {
  switch (checkType) {
    case 'deterministic': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'hybrid': return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    case 'llm': return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  }
}

/** Get a rule's scope label (universal vs category-specific). */
export function getRuleScopeLabel(rule: PolicyRule): string {
  return rule.category === 'universal' ? 'Universal' : `${rule.category}`;
}
