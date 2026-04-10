/**
 * Severity ordering and badge styling helpers.
 * Extracted from AnalysisResults.tsx for testability.
 */

export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0, critical: 0,
  HIGH: 1, high: 1,
  MEDIUM: 2, medium: 2, warning: 2,
  LOW: 3, low: 3,
  info: 4,
};

export const getSeverityBadgeClass = (severity: string): string => {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL') return 'bg-red-500 text-white';
  if (s === 'HIGH') return 'bg-orange-500 text-white';
  if (s === 'MEDIUM' || s === 'WARNING') return 'bg-yellow-500 text-black';
  return 'bg-blue-500 text-white';
};
