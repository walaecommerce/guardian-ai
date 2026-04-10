import { describe, it, expect } from 'vitest';
import { canResumeCampaign, getCampaignStatusLabel } from '../campaignHelpers';

describe('canResumeCampaign', () => {
  it('returns true when pending products exist', () => {
    expect(canResumeCampaign([{ status: 'complete' }, { status: 'pending' }])).toBe(true);
  });
  it('returns false when no pending products', () => {
    expect(canResumeCampaign([{ status: 'complete' }, { status: 'error' }])).toBe(false);
  });
  it('returns false for empty array', () => {
    expect(canResumeCampaign([])).toBe(false);
  });
});

describe('getCampaignStatusLabel', () => {
  it('returns "Completed" for completed status', () => {
    expect(getCampaignStatusLabel('completed')).toBe('Completed');
  });
  it('returns "In Progress" without products', () => {
    expect(getCampaignStatusLabel('in_progress')).toBe('In Progress');
  });
  it('returns remaining count with products', () => {
    const products = [{ status: 'complete' }, { status: 'pending' }, { status: 'pending' }];
    expect(getCampaignStatusLabel('in_progress', products)).toBe('In Progress — 2 remaining');
  });
  it('returns "In Progress" when no pending left', () => {
    const products = [{ status: 'complete' }, { status: 'complete' }];
    expect(getCampaignStatusLabel('in_progress', products)).toBe('In Progress');
  });
});
