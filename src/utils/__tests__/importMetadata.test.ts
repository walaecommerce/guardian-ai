import { describe, it, expect } from 'vitest';
import {
  buildImportMetadata,
  needsHeroConfirmation,
  autoConfirmSingleImage,
  confirmHeroImage,
  applyHeroSelection,
  isAuditGated,
  ImportMetadata,
} from '@/utils/importMetadata';
import { ImageAsset } from '@/types';

function makeAsset(id: string, type: 'MAIN' | 'SECONDARY' = 'SECONDARY'): ImageAsset {
  return {
    id,
    file: new File([''], 'test.jpg'),
    preview: 'blob:test',
    type,
    name: `img_${id}`,
  };
}

function makeMeta(overrides: Partial<ImportMetadata> = {}): ImportMetadata {
  return {
    sourceUrl: 'https://amazon.com/dp/B0TEST',
    resolvedAsin: 'B0TEST',
    variantSignals: [],
    importedImageUrls: ['url1', 'url2'],
    coverageNotes: [],
    heroConfirmed: false,
    confirmedHeroAssetId: null,
    importedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('importMetadata', () => {
  describe('buildImportMetadata', () => {
    it('creates metadata with heroConfirmed=false', () => {
      const meta = buildImportMetadata('https://amazon.com/dp/B0X', 'B0X', ['u1', 'u2']);
      expect(meta.heroConfirmed).toBe(false);
      expect(meta.confirmedHeroAssetId).toBeNull();
      expect(meta.importedImageUrls).toEqual(['u1', 'u2']);
    });
  });

  describe('needsHeroConfirmation', () => {
    it('returns false with no metadata', () => {
      expect(needsHeroConfirmation([makeAsset('a')], null)).toBe(false);
    });

    it('returns false for single image', () => {
      const meta = makeMeta();
      expect(needsHeroConfirmation([makeAsset('a')], meta)).toBe(false);
    });

    it('returns true for multiple images when not confirmed', () => {
      const meta = makeMeta();
      expect(needsHeroConfirmation([makeAsset('a'), makeAsset('b')], meta)).toBe(true);
    });

    it('returns false when already confirmed', () => {
      const meta = makeMeta({ heroConfirmed: true, confirmedHeroAssetId: 'a' });
      expect(needsHeroConfirmation([makeAsset('a'), makeAsset('b')], meta)).toBe(false);
    });
  });

  describe('autoConfirmSingleImage', () => {
    it('auto-confirms when only one asset exists', () => {
      const meta = makeMeta();
      const result = autoConfirmSingleImage([makeAsset('solo')], meta);
      expect(result).not.toBeNull();
      expect(result!.heroConfirmed).toBe(true);
      expect(result!.confirmedHeroAssetId).toBe('solo');
    });

    it('returns null for multiple assets', () => {
      const meta = makeMeta();
      const result = autoConfirmSingleImage([makeAsset('a'), makeAsset('b')], meta);
      expect(result).toBeNull();
    });

    it('returns null if already confirmed', () => {
      const meta = makeMeta({ heroConfirmed: true, confirmedHeroAssetId: 'solo' });
      const result = autoConfirmSingleImage([makeAsset('solo')], meta);
      expect(result).toBeNull();
    });
  });

  describe('confirmHeroImage', () => {
    it('marks hero as confirmed', () => {
      const meta = makeMeta();
      const result = confirmHeroImage(meta, 'chosen');
      expect(result.heroConfirmed).toBe(true);
      expect(result.confirmedHeroAssetId).toBe('chosen');
    });
  });

  describe('applyHeroSelection', () => {
    it('moves confirmed hero to first position as MAIN', () => {
      const assets = [makeAsset('a', 'MAIN'), makeAsset('b'), makeAsset('c')];
      const result = applyHeroSelection(assets, 'b');
      expect(result[0].id).toBe('b');
      expect(result[0].type).toBe('MAIN');
      expect(result[1].type).toBe('SECONDARY');
      expect(result[2].type).toBe('SECONDARY');
    });

    it('returns assets unchanged if hero not found', () => {
      const assets = [makeAsset('a'), makeAsset('b')];
      const result = applyHeroSelection(assets, 'nonexistent');
      expect(result).toEqual(assets);
    });
  });

  describe('isAuditGated', () => {
    it('returns true when hero not confirmed with multiple images', () => {
      const meta = makeMeta();
      expect(isAuditGated([makeAsset('a'), makeAsset('b')], meta)).toBe(true);
    });

    it('returns false after hero confirmation', () => {
      const meta = makeMeta({ heroConfirmed: true, confirmedHeroAssetId: 'a' });
      expect(isAuditGated([makeAsset('a'), makeAsset('b')], meta)).toBe(false);
    });

    it('returns false with no metadata', () => {
      expect(isAuditGated([makeAsset('a'), makeAsset('b')], null)).toBe(false);
    });

    it('returns false for single image', () => {
      const meta = makeMeta();
      expect(isAuditGated([makeAsset('a')], meta)).toBe(false);
    });
  });
});
