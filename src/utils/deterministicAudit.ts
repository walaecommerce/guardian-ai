// ── Deterministic (pre-LLM) image audit checks ─────────────────
// These run client-side on raw pixel data before the image is sent
// to the AI model. They produce structured evidence objects.

import { POLICY_REGISTRY, type PolicyRule } from '@/config/policyRegistry';

// ── Evidence Types ──────────────────────────────────────────────

export interface DeterministicEvidence {
  rule_id: string;
  source: string;
  why_triggered: string;
  measured_value: string | number;
  threshold: string | number;
  bounding_box?: { top: number; left: number; width: number; height: number };
  ocr_snippet?: string;
}

export interface DeterministicFinding {
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  passed: boolean;
  message: string;
  evidence: DeterministicEvidence;
}

export interface DeterministicAuditResult {
  policy_status: 'pass' | 'warning' | 'fail';
  findings: DeterministicFinding[];
  quality_indicators: {
    dimensions: { width: number; height: number };
    estimated_sharpness: number;     // 0-100
    edge_crop_risk: boolean;
    estimated_white_bg_pct: number;  // 0-100, for main images
    estimated_occupancy_pct: number; // 0-100
    overlay_heuristic_risk: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function getRule(id: string): PolicyRule {
  return POLICY_REGISTRY.find(r => r.rule_id === id)!;
}

/** Load an image into a canvas and return pixel data */
async function loadImagePixels(imageSource: string | File): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const img = new Image();
  img.crossOrigin = 'anonymous';

  const src = imageSource instanceof File
    ? URL.createObjectURL(imageSource)
    : imageSource;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for audit'));
    img.src = src;
  });

  // Sample at reduced resolution for performance (max 512px)
  const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  if (imageSource instanceof File) URL.revokeObjectURL(src);

  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

// ── Check: Image Dimensions ────────────────────────────────────

function checkDimensions(
  naturalWidth: number,
  naturalHeight: number
): DeterministicFinding {
  const rule = getRule('IMAGE_DIMENSIONS');
  const longest = Math.max(naturalWidth, naturalHeight);
  const shortest = Math.min(naturalWidth, naturalHeight);

  let passed = true;
  let message = `Image is ${naturalWidth}×${naturalHeight}px — meets requirements.`;

  if (shortest < 500) {
    passed = false;
    message = `Image shortest side is ${shortest}px (minimum 500px required).`;
  } else if (longest < 1000) {
    passed = false;
    message = `Image longest side is ${longest}px (1000px+ recommended for zoom).`;
  }

  return {
    rule_id: rule.rule_id,
    severity: rule.severity,
    passed,
    message,
    evidence: {
      rule_id: rule.rule_id,
      source: rule.source,
      why_triggered: passed ? 'Dimensions meet thresholds' : 'Image too small',
      measured_value: `${naturalWidth}×${naturalHeight}`,
      threshold: '1000px longest side / 500px minimum',
    },
  };
}

// ── Check: White Background (main images) ──────────────────────

function checkWhiteBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { finding: DeterministicFinding; pct: number } {
  const rule = getRule('MAIN_WHITE_BG');

  // Sample border pixels (outer 10% band)
  const bandX = Math.max(1, Math.round(width * 0.1));
  const bandY = Math.max(1, Math.round(height * 0.1));
  let whiteCount = 0;
  let totalBorder = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isBorder = x < bandX || x >= width - bandX || y < bandY || y >= height - bandY;
      if (!isBorder) continue;

      totalBorder++;
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // "Near-white" threshold: all channels >= 240
      if (r >= 240 && g >= 240 && b >= 240) whiteCount++;
    }
  }

  const pct = totalBorder > 0 ? Math.round((whiteCount / totalBorder) * 100) : 0;
  const passed = pct >= 85;

  return {
    pct,
    finding: {
      rule_id: rule.rule_id,
      severity: rule.severity,
      passed,
      message: passed
        ? `Background is ${pct}% white — appears compliant.`
        : `Background is only ${pct}% white (85%+ required for main image).`,
      evidence: {
        rule_id: rule.rule_id,
        source: rule.source,
        why_triggered: passed ? 'Border pixels are predominantly white' : 'Non-white pixels detected in border region',
        measured_value: pct,
        threshold: 85,
      },
    },
  };
}

// ── Check: Product Occupancy ───────────────────────────────────

function checkOccupancy(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { finding: DeterministicFinding; pct: number } {
  const rule = getRule('MAIN_OCCUPANCY');

  // Non-white pixel ratio as proxy for product coverage
  let nonWhite = 0;
  const total = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r < 240 || g < 240 || b < 240) nonWhite++;
  }

  const pct = Math.round((nonWhite / total) * 100);
  // Heuristic: if product is on white bg, non-white ≈ product area
  // But 85% occupancy means product fills the frame, so a lower non-white %
  // suggests the product is small in frame. We flag if < 50% non-white.
  const passed = pct >= 50;

  return {
    pct,
    finding: {
      rule_id: rule.rule_id,
      severity: rule.severity,
      passed,
      message: passed
        ? `Product occupies approximately ${pct}% of the frame.`
        : `Product appears to occupy only ~${pct}% of the frame (should fill 85%+).`,
      evidence: {
        rule_id: rule.rule_id,
        source: rule.source,
        why_triggered: passed ? 'Sufficient frame fill' : 'Product appears too small in frame',
        measured_value: pct,
        threshold: '50% non-white pixels (proxy for 85% occupancy)',
      },
    },
  };
}

// ── Check: Sharpness (Laplacian variance) ──────────────────────

function checkSharpness(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { finding: DeterministicFinding; score: number } {
  const rule = getRule('IMAGE_SHARPNESS');

  // Convert to grayscale and compute Laplacian variance
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = -4 * gray[idx]
        + gray[idx - 1] + gray[idx + 1]
        + gray[idx - width] + gray[idx + width];
      sum += lap * lap;
      count++;
    }
  }

  const variance = count > 0 ? sum / count : 0;
  // Normalize: typical sharp images > 500 variance, blurry < 100
  const score = Math.min(100, Math.round(variance / 10));
  const passed = score >= 15;

  return {
    score,
    finding: {
      rule_id: rule.rule_id,
      severity: rule.severity,
      passed,
      message: passed
        ? `Sharpness score: ${score}/100 — acceptable.`
        : `Sharpness score: ${score}/100 — image appears blurry.`,
      evidence: {
        rule_id: rule.rule_id,
        source: rule.source,
        why_triggered: passed ? 'Laplacian variance within range' : 'Low Laplacian variance indicates blur',
        measured_value: score,
        threshold: 15,
      },
    },
  };
}

// ── Check: Edge Crop Completeness ──────────────────────────────

function checkEdgeCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number
): DeterministicFinding {
  const rule = getRule('IMAGE_EDGE_CROP');

  // Check if non-white pixels touch the very edge (1px border)
  let edgeNonWhite = 0;
  let edgeTotal = 0;

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      edgeTotal++;
      const idx = (y * width + x) * 4;
      if (data[idx] < 230 || data[idx + 1] < 230 || data[idx + 2] < 230) edgeNonWhite++;
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (const x of [0, width - 1]) {
      edgeTotal++;
      const idx = (y * width + x) * 4;
      if (data[idx] < 230 || data[idx + 1] < 230 || data[idx + 2] < 230) edgeNonWhite++;
    }
  }

  const edgePct = edgeTotal > 0 ? Math.round((edgeNonWhite / edgeTotal) * 100) : 0;
  const risk = edgePct > 30;

  return {
    rule_id: rule.rule_id,
    severity: rule.severity,
    passed: !risk,
    message: risk
      ? `${edgePct}% of edge pixels are non-white — product may be cropped.`
      : `Edge crop check passed (${edgePct}% edge contact).`,
    evidence: {
      rule_id: rule.rule_id,
      source: rule.source,
      why_triggered: risk ? 'Product appears to extend to image edges' : 'Clean edges',
      measured_value: edgePct,
      threshold: '30% edge contact',
    },
  };
}

// ── Check: Simple Overlay/Text Heuristic (main images) ─────────

function checkOverlayHeuristic(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { finding: DeterministicFinding; risk: boolean } {
  const rule = getRule('MAIN_NO_TEXT_OVERLAY');

  // High-contrast pixel clusters in corners suggest overlays/badges
  const cornerSize = Math.round(Math.min(width, height) * 0.15);
  let highContrastCorner = 0;
  let cornerTotal = 0;

  const corners = [
    { x0: 0, y0: 0 },
    { x0: width - cornerSize, y0: 0 },
    { x0: 0, y0: height - cornerSize },
    { x0: width - cornerSize, y0: height - cornerSize },
  ];

  for (const { x0, y0 } of corners) {
    for (let y = y0; y < Math.min(y0 + cornerSize, height); y++) {
      for (let x = x0; x < Math.min(x0 + cornerSize, width); x++) {
        cornerTotal++;
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        // Non-white AND saturated = likely overlay/badge
        const isWhite = r >= 240 && g >= 240 && b >= 240;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const isSaturated = (maxC - minC) > 60;
        if (!isWhite && isSaturated) highContrastCorner++;
      }
    }
  }

  const pct = cornerTotal > 0 ? Math.round((highContrastCorner / cornerTotal) * 100) : 0;
  const risk = pct > 10;

  return {
    risk,
    finding: {
      rule_id: rule.rule_id,
      severity: rule.severity,
      passed: !risk,
      message: risk
        ? `Possible overlay detected — ${pct}% saturated corner pixels (heuristic).`
        : `No obvious overlay detected (heuristic check).`,
      evidence: {
        rule_id: rule.rule_id,
        source: rule.source,
        why_triggered: risk ? 'Saturated color clusters in image corners' : 'Corners appear clean',
        measured_value: pct,
        threshold: '10% saturated corner pixels',
      },
    },
  };
}

// ── Compute Policy Status ──────────────────────────────────────

export function computePolicyStatus(findings: DeterministicFinding[]): 'pass' | 'warning' | 'fail' {
  const hasCriticalFail = findings.some(f => !f.passed && f.severity === 'critical');
  if (hasCriticalFail) return 'fail';
  const hasWarningFail = findings.some(f => !f.passed && f.severity === 'warning');
  if (hasWarningFail) return 'warning';
  return 'pass';
}

// ── Main Entry Point ───────────────────────────────────────────

export async function runDeterministicAudit(
  imageSource: string | File,
  imageType: 'MAIN' | 'SECONDARY',
  naturalWidth?: number,
  naturalHeight?: number,
): Promise<DeterministicAuditResult> {
  const { data, width, height } = await loadImagePixels(imageSource);

  // Use natural dimensions if provided, else sampled
  const realW = naturalWidth || width;
  const realH = naturalHeight || height;

  const findings: DeterministicFinding[] = [];

  // 1. Dimensions (all images)
  findings.push(checkDimensions(realW, realH));

  // 2. Sharpness (all images)
  const sharpness = checkSharpness(data, width, height);
  findings.push(sharpness.finding);

  // 3. Edge crop (all images)
  findings.push(checkEdgeCrop(data, width, height));

  // Main-image-specific checks
  let whiteBgPct = 0;
  let occupancyPct = 0;
  let overlayRisk = false;

  if (imageType === 'MAIN') {
    const bg = checkWhiteBackground(data, width, height);
    findings.push(bg.finding);
    whiteBgPct = bg.pct;

    const occ = checkOccupancy(data, width, height);
    findings.push(occ.finding);
    occupancyPct = occ.pct;

    const overlay = checkOverlayHeuristic(data, width, height);
    findings.push(overlay.finding);
    overlayRisk = overlay.risk;
  }

  return {
    policy_status: computePolicyStatus(findings),
    findings,
    quality_indicators: {
      dimensions: { width: realW, height: realH },
      estimated_sharpness: sharpness.score,
      edge_crop_risk: findings.find(f => f.rule_id === 'IMAGE_EDGE_CROP')?.passed === false,
      estimated_white_bg_pct: whiteBgPct,
      estimated_occupancy_pct: occupancyPct,
      overlay_heuristic_risk: overlayRisk,
    },
  };
}
