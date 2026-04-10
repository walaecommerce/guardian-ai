/**
 * Helpers for campaign workflow state.
 */

/** Determines if a campaign can be resumed based on its product statuses */
export function canResumeCampaign(products: Array<{ status: string }>): boolean {
  return products.some(p => p.status === 'pending');
}

/** Returns a human-readable campaign status label */
export function getCampaignStatusLabel(status: string, products?: Array<{ status: string }>): string {
  if (status === 'in_progress') {
    if (products && canResumeCampaign(products)) {
      const pending = products.filter(p => p.status === 'pending').length;
      return `In Progress — ${pending} remaining`;
    }
    return 'In Progress';
  }
  if (status === 'completed') return 'Completed';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
