import { AuditStep } from '@/hooks/useAuditSession';

/**
 * Infer the best audit step to resume from based on session data.
 */
export function inferCurrentStep(session: {
  total_images: number;
  passed_count: number;
  failed_count: number;
  fixed_count: number;
  status: string;
  product_identity?: Record<string, any> | null;
}): AuditStep {
  // If we explicitly stored the last step, prefer that
  const stored = (session.product_identity as any)?.lastStep;
  if (stored && ['import', 'audit', 'fix', 'review'].includes(stored)) {
    return stored as AuditStep;
  }

  // Infer from data
  const hasImages = session.total_images > 0;
  const hasResults = session.passed_count > 0 || session.failed_count > 0;
  const hasFixed = session.fixed_count > 0;
  const allAnalyzed = hasResults && (session.passed_count + session.failed_count) >= session.total_images;

  if (!hasImages) return 'import';
  if (!hasResults) return 'import'; // images imported but not yet audited
  if (session.failed_count > 0 && session.fixed_count < session.failed_count) return 'fix';
  if (hasFixed || (allAnalyzed && session.status === 'completed')) return 'review';
  return 'audit';
}

/**
 * Format a content type label from an image category code.
 */
export function formatContentType(category: string | null | undefined): string {
  if (!category) return 'Unknown';
  const map: Record<string, string> = {
    PRODUCT_SHOT: 'Product Shot',
    LIFESTYLE: 'Lifestyle',
    INFOGRAPHIC: 'Infographic',
    DETAIL: 'Detail',
    PACKAGING: 'Packaging',
    SIZE_CHART: 'Size Chart',
    COMPARISON: 'Comparison',
    PRODUCT_IN_USE: 'Product In Use',
    SWATCH: 'Swatch',
    UNKNOWN: 'Unknown',
  };
  return map[category] || category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
