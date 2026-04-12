import { ProductIdentityCard } from '@/types';

/**
 * A single identity observation from one source image.
 */
export interface IdentityObservation {
  sourceImageId: string;
  sourceImageType: 'MAIN' | 'SECONDARY';
  identity: Partial<ProductIdentityCard>;
}

/**
 * Confidence level per field in the merged profile.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FieldConfidence {
  field: string;
  confidence: ConfidenceLevel;
  sourceCount: number;
  conflict: boolean;
  conflictDetails?: string;
}

/**
 * Multi-image identity profile built from multiple source images.
 */
export interface MultiImageIdentityProfile {
  identity: ProductIdentityCard;
  sourceImageIds: string[];
  fieldConfidence: FieldConfidence[];
  conflicts: string[];
  completeness: number; // 0-100
  isSingleSourceFallback: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Pick the most common value from a string array, preferring non-empty */
function mostCommon(values: string[]): string {
  const filtered = values.filter(v => v && v !== 'Unknown' && v !== 'unknown' && v !== 'N/A');
  if (filtered.length === 0) return values[0] || 'Unknown';
  const freq = new Map<string, number>();
  for (const v of filtered) {
    const lower = v.toLowerCase().trim();
    freq.set(lower, (freq.get(lower) || 0) + 1);
  }
  let best = filtered[0];
  let bestCount = 0;
  for (const [key, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      best = filtered.find(v => v.toLowerCase().trim() === key) || best;
    }
  }
  return best;
}

/** Check if values conflict (more than one distinct non-empty value) */
function hasConflict(values: string[]): boolean {
  const distinct = new Set(
    values
      .filter(v => v && v !== 'Unknown' && v !== 'unknown' && v !== 'N/A')
      .map(v => v.toLowerCase().trim())
  );
  return distinct.size > 1;
}

/** Merge arrays of strings, preferring recurring items */
function mergeStringArrays(arrays: string[][]): string[] {
  const freq = new Map<string, number>();
  for (const arr of arrays) {
    for (const item of arr) {
      const key = item.toLowerCase().trim();
      if (key) freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
  // Sort by frequency desc, then keep original casing from first occurrence
  const allItems = arrays.flat().filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key] of sorted) {
    if (!seen.has(key)) {
      seen.add(key);
      const original = allItems.find(i => i.toLowerCase().trim() === key);
      if (original) result.push(original);
    }
  }
  return result;
}

/** Merge hex color arrays, preferring recurring colors */
function mergeColors(arrays: string[][]): string[] {
  return mergeStringArrays(arrays).slice(0, 5);
}

function fieldConfidence(
  field: string,
  values: string[],
): FieldConfidence {
  const nonEmpty = values.filter(v => v && v !== 'Unknown' && v !== 'unknown');
  const conflict = hasConflict(values);
  let confidence: ConfidenceLevel = 'low';
  if (nonEmpty.length >= 2 && !conflict) confidence = 'high';
  else if (nonEmpty.length >= 1) confidence = conflict ? 'medium' : 'medium';
  if (nonEmpty.length >= 3 && !conflict) confidence = 'high';

  return {
    field,
    confidence,
    sourceCount: nonEmpty.length,
    conflict,
    conflictDetails: conflict
      ? `Conflicting values: ${[...new Set(nonEmpty)].join(' vs ')}`
      : undefined,
  };
}

// ── Main merge function ─────────────────────────────────────────

/**
 * Build a multi-image identity profile from observations across images.
 * The MAIN image observation is always preferred as the primary source.
 */
export function buildIdentityProfile(
  observations: IdentityObservation[],
  listingTitle?: string,
): MultiImageIdentityProfile {
  if (observations.length === 0) {
    return {
      identity: {
        brandName: 'Unknown',
        productName: listingTitle || 'Unknown',
        dominantColors: [],
        packagingType: 'unknown',
        shapeDescription: '',
        labelText: [],
        keyVisualFeatures: [],
        productDescriptor: listingTitle || '',
      },
      sourceImageIds: [],
      fieldConfidence: [],
      conflicts: [],
      completeness: 0,
      isSingleSourceFallback: true,
    };
  }

  const isSingleSource = observations.length === 1;

  // Sort so MAIN is first (primary source)
  const sorted = [...observations].sort((a, b) => {
    if (a.sourceImageType === 'MAIN' && b.sourceImageType !== 'MAIN') return -1;
    if (b.sourceImageType === 'MAIN' && a.sourceImageType !== 'MAIN') return 1;
    return 0;
  });

  const brandValues = sorted.map(o => o.identity.brandName || '');
  const productValues = sorted.map(o => o.identity.productName || '');
  const packagingValues = sorted.map(o => o.identity.packagingType || '');
  const shapeValues = sorted.map(o => o.identity.shapeDescription || '');

  const mergedIdentity: ProductIdentityCard = {
    brandName: mostCommon(brandValues),
    productName: mostCommon(productValues) || listingTitle || 'Unknown',
    dominantColors: mergeColors(sorted.map(o => o.identity.dominantColors || [])),
    packagingType: mostCommon(packagingValues),
    shapeDescription: mostCommon(shapeValues),
    labelText: mergeStringArrays(sorted.map(o => o.identity.labelText || [])),
    keyVisualFeatures: mergeStringArrays(sorted.map(o => o.identity.keyVisualFeatures || [])),
    productDescriptor: sorted[0].identity.productDescriptor || listingTitle || '',
  };

  const confidence: FieldConfidence[] = [
    fieldConfidence('brandName', brandValues),
    fieldConfidence('productName', productValues),
    fieldConfidence('packagingType', packagingValues),
    fieldConfidence('shapeDescription', shapeValues),
  ];

  const conflicts = confidence
    .filter(c => c.conflict)
    .map(c => c.conflictDetails!)
    .filter(Boolean);

  // Completeness: count filled fields
  const fields = [
    mergedIdentity.brandName !== 'Unknown',
    mergedIdentity.productName !== 'Unknown',
    mergedIdentity.dominantColors.length > 0,
    mergedIdentity.packagingType !== 'unknown',
    mergedIdentity.shapeDescription !== '',
    mergedIdentity.labelText.length > 0,
    mergedIdentity.keyVisualFeatures.length > 0,
    mergedIdentity.productDescriptor !== '',
  ];
  const completeness = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  return {
    identity: mergedIdentity,
    sourceImageIds: sorted.map(o => o.sourceImageId),
    fieldConfidence: confidence,
    conflicts,
    completeness,
    isSingleSourceFallback: isSingleSource,
  };
}

/**
 * Convert a legacy single-image ProductIdentityCard to a profile.
 */
export function fromSingleIdentity(
  identity: ProductIdentityCard,
  sourceImageId: string,
): MultiImageIdentityProfile {
  return buildIdentityProfile([{
    sourceImageId,
    sourceImageType: 'MAIN',
    identity,
  }]);
}
