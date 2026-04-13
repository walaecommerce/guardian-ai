/**
 * Helpers for session status labels and workflow state.
 */

import { ImageAsset } from '@/types';
import { isManualReviewAsset } from '@/components/ManualReviewLane';

/** Compute unresolved/skipped counts from current assets for session persistence.
 *  Uses the same isManualReviewAsset predicate as ReviewStep/export to stay consistent. */
export function computeUnresolvedCounts(currentAssets: ImageAsset[]): { skipped_count: number; unresolved_count: number } {
  let skipped = 0;
  let unresolved = 0;
  for (const a of currentAssets) {
    if (isManualReviewAsset(a)) {
      unresolved++;
      if (a.batchFixStatus === 'skipped' || a.fixabilityTier === 'manual_review' || a.fixabilityTier === 'warn_only') {
        skipped++;
      }
    }
  }
  return { skipped_count: skipped, unresolved_count: unresolved };
}

/** Returns a human-readable label for session status */
export function humanizeSessionStatus(status: string): string {
  switch (status) {
    case 'in_progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'archived': return 'Archived';
    default: return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

/** Returns a contextual CTA label for a session based on its state */
export function getSessionActionLabel(session: {
  status: string;
  failed_count: number;
  fixed_count: number;
  total_images: number;
}): string {
  if (session.status === 'in_progress') {
    if (session.failed_count > 0 && session.fixed_count < session.failed_count) {
      return 'Continue Fixing';
    }
    return 'Continue Working';
  }
  if (session.failed_count > 0 && session.fixed_count < session.failed_count) {
    return 'Review & Fix Issues';
  }
  return 'Review Session';
}

/** Determines if a session originated from Studio */
export function isStudioSession(productIdentity: any): boolean {
  return productIdentity?.origin === 'studio';
}
