/**
 * Reconcile stale session-level counts from actual session_images rows.
 * Used during hydration to self-heal pre-fix sessions.
 */

interface SessionImageRow {
  status: string;
  fixed_image_url: string | null;
  fix_attempts: unknown;
  analysis_result: unknown;
  image_type: string;
}

interface SessionCounts {
  total_images: number;
  passed_count: number;
  failed_count: number;
  fixed_count: number;
  skipped_count: number;
  unresolved_count: number;
}

/**
 * Recompute session aggregate counts from the actual session_images rows.
 * This is the source of truth — top-level session metadata may be stale for older sessions.
 */
export function reconcileSessionCounts(images: SessionImageRow[]): SessionCounts {
  let passed = 0;
  let failed = 0;
  let fixed = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const img of images) {
    const hasAnalysis = img.analysis_result != null && typeof img.analysis_result === 'object';
    const analysisStatus = hasAnalysis ? (img.analysis_result as any)?.status : undefined;
    const hasFixedUrl = !!img.fixed_image_url;
    const isFailed = analysisStatus === 'FAIL' || analysisStatus === 'WARNING';

    if (hasFixedUrl) {
      fixed++;
    }

    if (hasAnalysis) {
      if (isFailed) {
        failed++;
        // Check if skipped/unresolved via fix_attempts metadata
        const fa = img.fix_attempts;
        if (fa && typeof fa === 'object' && !Array.isArray(fa)) {
          const faObj = fa as Record<string, unknown>;
          if (faObj.skipped === true) {
            skipped++;
            unresolved++;
          } else if (faObj.unresolvedState || (faObj.stopReason && !faObj.bestAttemptSelection)) {
            unresolved++;
          }
        }
      } else {
        passed++;
      }
    }
  }

  return {
    total_images: images.length,
    passed_count: passed,
    failed_count: failed,
    fixed_count: fixed,
    skipped_count: skipped,
    unresolved_count: unresolved,
  };
}

/**
 * Compare stored session counts with reconciled counts.
 * Returns true if any count is stale.
 */
export function isSessionStale(
  stored: SessionCounts,
  reconciled: SessionCounts,
): boolean {
  return (
    stored.total_images !== reconciled.total_images ||
    stored.passed_count !== reconciled.passed_count ||
    stored.failed_count !== reconciled.failed_count ||
    stored.fixed_count !== reconciled.fixed_count ||
    stored.skipped_count !== reconciled.skipped_count ||
    stored.unresolved_count !== reconciled.unresolved_count
  );
}
