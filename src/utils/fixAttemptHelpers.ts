import type { FixAttempt, BestAttemptSelection } from '@/types';

/**
 * Get a human-readable label for why a retry was triggered.
 */
export function getRetryReasonLabel(attempt: FixAttempt): string | null {
  if (!attempt.retryDecision) return null;

  const rd = attempt.retryDecision;
  const reasons: string[] = [];

  if (rd.additionalInstructions.some(i => i.toLowerCase().includes('identity'))) {
    reasons.push('Identity drift detected');
  }
  if (rd.additionalInstructions.some(i => i.toLowerCase().includes('new violations') || i.toLowerCase().includes('no_new_violations'))) {
    reasons.push('New violations introduced');
  }
  if (rd.additionalInstructions.some(i => i.toLowerCase().includes('target') || i.toLowerCase().includes('compliance'))) {
    reasons.push('Insufficient compliance score');
  }

  if (reasons.length === 0 && rd.rationale) {
    return rd.rationale.length > 60 ? rd.rationale.substring(0, 57) + '…' : rd.rationale;
  }

  return reasons.join('; ') || null;
}

/**
 * Get a summary label for the selection rationale.
 */
export function getSelectionLabel(selection: BestAttemptSelection | undefined, attempts: FixAttempt[]): string {
  if (!selection) {
    // If there's a single passing attempt, that's the reason
    const passing = attempts.filter(a => a.status === 'passed');
    if (passing.length === 1) {
      return `Attempt ${passing[0].attempt} passed verification on first try`;
    }
    if (attempts.length === 1) {
      return 'Single attempt — used directly';
    }
    return 'First passing attempt selected';
  }
  return selection.selectedReason;
}

/**
 * Get a compact strategy label.
 */
export function getStrategyLabel(strategy: string | undefined): string {
  if (!strategy) return '';
  const map: Record<string, string> = {
    'bg-cleanup': 'Background Cleanup',
    'crop-reframe': 'Crop & Reframe',
    'overlay-removal': 'Overlay Removal',
    'inpaint-edit': 'Inpaint Edit',
    'full-regeneration': 'Full Regeneration',
  };
  return map[strategy] || strategy.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Score delta between two consecutive attempts.
 */
export function getScoreDelta(attempts: FixAttempt[], index: number): number | null {
  if (index === 0) return null;
  const curr = attempts[index]?.verification?.score;
  const prev = attempts[index - 1]?.verification?.score;
  if (curr === undefined || prev === undefined) return null;
  return curr - prev;
}
