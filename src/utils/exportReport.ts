import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ImageAsset } from '@/types';
import { CompetitorData, buildComparisonReport, AIComparisonResult } from '@/components/CompetitorAudit';
import { isManualReviewAsset } from '@/components/ManualReviewLane';
import { extractImageCategory } from '@/utils/imageCategory';
import { formatContentType } from '@/utils/sessionResume';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

// ── JSON Export Schema ──

export interface ExportAssetEntry {
  filename: string;
  type: string;
  content_type?: string;
  score: number | undefined;
  status: string | undefined;
  severity: string | undefined;
  violations: any[];
  fixed: boolean;
  fixed_score: number | undefined;
  fix_method?: string;
  // Unresolved state fields
  unresolved_state?: string;
  unresolved_reason?: string;
  fixability_tier?: string;
  fix_stop_reason?: string;
  fix_attempts_count?: number;
  last_fix_strategy?: string;
  best_attempt_reason?: string;
}

export interface ExportReport {
  timestamp: string;
  listing_title: string;
  overall_status: 'PASS' | 'FAIL';
  total_assets: number;
  passed: number;
  failed: number;
  fixed: number;
  unresolved: number;
  fix_methods?: {
    'bg-segmentation': number;
    'full-regeneration': number;
    'surgical-edit': number;
    'enhancement': number;
  };
  unresolved_summary?: {
    manual_review: number;
    warn_only: number;
    retry_stopped: number;
    auto_fix_failed: number;
    skipped: number;
  };
  assets: ExportAssetEntry[];
  competitive_analysis?: {
    competitor_title: string;
    competitor_url: string;
    your_score: number;
    competitor_score: number;
    your_image_count: number;
    competitor_image_count: number;
    max_allowed: number;
    your_pass_rate: number;
    competitor_pass_rate: number;
    missing_categories: string[];
    competitor_weaknesses: string[];
    recommendations: string[];
    image_count_advantage: 'yours' | 'competitor' | 'tied';
    ai_intelligence?: {
      score_comparison: any;
      image_types_competitor_has_you_dont: any[];
      competitor_violations: any[];
      your_advantages: string[];
      priority_actions: any[];
    };
  };
}

// Legacy compat alias
export type ExportData = ExportReport;

function mapUnresolvedLabel(state: string | undefined): string {
  switch (state) {
    case 'manual_review': return 'Manual Review Required';
    case 'warn_only': return 'Warning — Better Source Needed';
    case 'retry_stopped': return 'Retry Stopped — Preservation Failure';
    case 'auto_fix_failed': return 'Auto-fix Failed After Attempts';
    case 'skipped': return 'Skipped — Safety Rules';
    default: return 'Unresolved';
  }
}

export function generateExportData(
  assets: ImageAsset[],
  listingTitle: string,
  competitorData?: CompetitorData | null,
  aiComparison?: AIComparisonResult | null,
): ExportReport {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const passCount = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const unresolvedAssets = assets.filter(isManualReviewAsset);
  const fixedCount = assets.filter(a => a.fixedImage).length;
  const failCount = analyzedAssets.filter(a =>
    (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING')
    && !a.fixedImage
    && !unresolvedAssets.some(u => u.id === a.id)
  ).length;

  // Build unresolved summary breakdown
  const unresolvedSummary = { manual_review: 0, warn_only: 0, retry_stopped: 0, auto_fix_failed: 0, skipped: 0 };
  unresolvedAssets.forEach(a => {
    const state = a.unresolvedState || (a.batchFixStatus === 'skipped' ? 'skipped' : 'manual_review');
    if (state in unresolvedSummary) unresolvedSummary[state as keyof typeof unresolvedSummary]++;
  });

  const report: ExportReport = {
    timestamp: new Date().toISOString(),
    listing_title: listingTitle || 'Untitled Listing',
    overall_status: (failCount > 0 || unresolvedAssets.length > 0) ? 'FAIL' : 'PASS',
    total_assets: assets.length,
    passed: passCount,
    failed: failCount,
    fixed: fixedCount,
    unresolved: unresolvedAssets.length,
    assets: assets.map(asset => {
      const violations = asset.analysisResult?.violations || [];
      const hasCritical = violations.some(v => v.severity === 'critical');
      const hasWarning = violations.some(v => v.severity === 'warning');
      const severity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'info';
      const isUnresolved = isManualReviewAsset(asset);
      const contentType = extractImageCategory(asset);

      const entry: ExportAssetEntry = {
        filename: asset.file?.name || asset.name,
        type: asset.type,
        content_type: contentType ? formatContentType(contentType) : undefined,
        score: asset.analysisResult?.overallScore,
        status: asset.analysisResult?.status,
        severity,
        violations: violations.map(v => ({
          severity: v.severity,
          category: v.category,
          message: v.message,
          recommendation: v.recommendation,
        })),
        fixed: !!asset.fixedImage,
        fixed_score: undefined,
        fix_method: asset.fixMethod,
      };

      if (isUnresolved) {
        entry.unresolved_state = mapUnresolvedLabel(asset.unresolvedState);
        entry.unresolved_reason = asset.batchSkipReason || asset.fixStopReason || 'Requires manual review';
        entry.fixability_tier = asset.fixabilityTier;
        entry.fix_stop_reason = asset.fixStopReason;
        entry.fix_attempts_count = asset.fixAttempts?.length;
        entry.last_fix_strategy = asset.lastFixStrategy;
        entry.best_attempt_reason = asset.bestAttemptSelection?.selectedReason;
      }

      return entry;
    }),
  };

  // Aggregate fix method counts
  const fixMethodCounts = { 'bg-segmentation': 0, 'full-regeneration': 0, 'surgical-edit': 0, 'enhancement': 0 };
  assets.filter(a => a.fixedImage && a.fixMethod).forEach(a => {
    if (a.fixMethod && a.fixMethod in fixMethodCounts) {
      fixMethodCounts[a.fixMethod]++;
    }
  });
  const totalFixes = Object.values(fixMethodCounts).reduce((s, c) => s + c, 0);
  if (totalFixes > 0) report.fix_methods = fixMethodCounts;

  // Add unresolved summary if any
  if (unresolvedAssets.length > 0) report.unresolved_summary = unresolvedSummary;

  // Add competitive analysis if competitor data exists
  if (competitorData) {
    const comparison = buildComparisonReport(assets, listingTitle, competitorData);
    report.competitive_analysis = {
      competitor_title: competitorData.title,
      competitor_url: competitorData.url,
      your_score: comparison.yourListing.overallScore,
      competitor_score: comparison.competitor.overallScore,
      your_image_count: comparison.yourListing.imageCount,
      competitor_image_count: comparison.competitor.imageCount,
      max_allowed: 9,
      your_pass_rate: comparison.yourListing.passRate,
      competitor_pass_rate: comparison.competitor.passRate,
      missing_categories: comparison.missingCategories,
      competitor_weaknesses: comparison.competitorWeaknesses,
      recommendations: comparison.recommendations,
      image_count_advantage: comparison.imageCountAdvantage,
      ai_intelligence: aiComparison ? {
        score_comparison: aiComparison.score_comparison,
        image_types_competitor_has_you_dont: aiComparison.image_types_competitor_has_you_dont,
        competitor_violations: aiComparison.competitor_violations,
        your_advantages: aiComparison.your_advantages,
        priority_actions: aiComparison.priority_actions,
      } : undefined,
    };
  }

  return report;
}

export function exportToJSON(data: ExportReport): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const link = document.createElement('a');
  link.href = url;
  link.download = `guardian-report-${ts}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

// ── PDF Summary Export (opens browser print dialog) ──

export function exportToPDFSummary(data: ExportReport): void {
  const hasUnresolved = (data.unresolved ?? 0) > 0;
  const statusColor = data.overall_status === 'PASS' ? '#22c55e' : '#ef4444';
  const dateStr = new Date(data.timestamp).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const rows = data.assets.map(a => {
    const unresolvedBadge = a.unresolved_state
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:10px;margin-left:4px;">${a.unresolved_state}</span>`
      : '';
    return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${a.filename}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${a.type}${a.content_type ? ` <span style="color:#6b7280;font-size:11px;">(${a.content_type})</span>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">${a.score ?? '—'}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">
        <span style="color:${a.status === 'PASS' ? '#22c55e' : '#ef4444'};font-weight:700;">${a.status ?? '—'}</span>
        ${unresolvedBadge}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${a.unresolved_reason || a.violations?.[0]?.message?.substring(0, 60) || '—'}</td>
    </tr>
  `;
  }).join('');

  const unresolvedSection = hasUnresolved && data.unresolved_summary ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#92400e;margin-bottom:8px;">⚠ Unresolved Images (${data.unresolved})</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${data.unresolved_summary.manual_review > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:6px 14px;font-size:12px;"><strong>${data.unresolved_summary.manual_review}</strong> Manual Review</div>` : ''}
        ${data.unresolved_summary.retry_stopped > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:6px 14px;font-size:12px;"><strong>${data.unresolved_summary.retry_stopped}</strong> Retry Stopped</div>` : ''}
        ${data.unresolved_summary.auto_fix_failed > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:6px 14px;font-size:12px;"><strong>${data.unresolved_summary.auto_fix_failed}</strong> Auto-fix Failed</div>` : ''}
        ${data.unresolved_summary.warn_only > 0 ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:6px 14px;font-size:12px;"><strong>${data.unresolved_summary.warn_only}</strong> Warn Only</div>` : ''}
        ${data.unresolved_summary.skipped > 0 ? `<div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;padding:6px 14px;font-size:12px;"><strong>${data.unresolved_summary.skipped}</strong> Skipped</div>` : ''}
      </div>
    </div>
  ` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Guardian Compliance Report</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 40px; color: #1a1a1a; }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #232F3E; }
    .logo { width: 48px; height: 48px; background: #FF9900; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; }
    .title { font-size: 24px; font-weight: 700; color: #232F3E; }
    .subtitle { font-size: 14px; color: #6b7280; }
    .meta { display: flex; gap: 40px; margin-bottom: 24px; }
    .meta-item { font-size: 13px; color: #6b7280; }
    .meta-item strong { color: #1a1a1a; }
    .status-badge { display: inline-block; padding: 8px 24px; border-radius: 8px; font-size: 28px; font-weight: 800; letter-spacing: 2px; color: white; background: ${statusColor}; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #232F3E; color: white; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-bar { display: flex; gap: 24px; margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
    .stat { text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🛡</div>
    <div>
      <div class="title">Amazon Listing Compliance Report</div>
      <div class="subtitle">Generated by Guardian AI</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><strong>Date:</strong> ${dateStr}</div>
    <div class="meta-item"><strong>Listing:</strong> ${data.listing_title}</div>
  </div>

  <div class="status-badge">${data.overall_status}</div>

  <div class="summary-bar">
    <div class="stat"><div class="stat-value">${data.total_assets}</div><div class="stat-label">Total Images</div></div>
    <div class="stat"><div class="stat-value" style="color:#22c55e">${data.passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat"><div class="stat-value" style="color:#ef4444">${data.failed}</div><div class="stat-label">Unfixed</div></div>
    ${data.fixed > 0 ? `<div class="stat"><div class="stat-value" style="color:#3b82f6">${data.fixed}</div><div class="stat-label">Fixed</div></div>` : ''}
    ${(data.unresolved ?? 0) > 0 ? `<div class="stat"><div class="stat-value" style="color:#f59e0b">${data.unresolved}</div><div class="stat-label">Unresolved</div></div>` : ''}
  </div>

  ${unresolvedSection}

  ${data.fix_methods ? `
  <div style="margin-bottom:24px;">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-bottom:8px;">Fix Methods Used</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      ${data.fix_methods['bg-segmentation'] > 0 ? `<div style="background:#ecfeff;border:1px solid #67e8f9;border-radius:8px;padding:8px 16px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#0891b2;">${data.fix_methods['bg-segmentation']}</div><div style="font-size:11px;font-weight:600;color:#0891b2;">A1 · BG Seg</div></div>` : ''}
      ${data.fix_methods['full-regeneration'] > 0 ? `<div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:8px 16px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#7c3aed;">${data.fix_methods['full-regeneration']}</div><div style="font-size:11px;font-weight:600;color:#7c3aed;">A2 · Regen</div></div>` : ''}
      ${data.fix_methods['surgical-edit'] > 0 ? `<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:8px 16px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#059669;">${data.fix_methods['surgical-edit']}</div><div style="font-size:11px;font-weight:600;color:#059669;">T1 · Surgical</div></div>` : ''}
      ${data.fix_methods['enhancement'] > 0 ? `<div style="background:#faf5ff;border:1px solid #c4b5fd;border-radius:8px;padding:8px 16px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#7c3aed;">${data.fix_methods['enhancement']}</div><div style="font-size:11px;font-weight:600;color:#7c3aed;">Enhanced</div></div>` : ''}
    </div>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>Image</th>
        <th>Type</th>
        <th>Score</th>
        <th>Status</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    Generated by Amazon Listing Guardian &bull; ${dateStr}
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }
}

// ── Legacy jsPDF export ──

export function exportToPDF(data: ExportReport): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(35, 47, 62);
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Amazon Listing Guardian', 14, 20);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Compliance Report', 14, 30);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Date: ${new Date(data.timestamp).toLocaleDateString()}`, pageWidth - 14, 50, { align: 'right' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Listing:', 14, 55);
  doc.setFont('helvetica', 'normal');
  const titleLines = doc.splitTextToSize(data.listing_title, pageWidth - 50);
  doc.text(titleLines, 40, 55);

  const summaryY = 70 + (titleLines.length - 1) * 5;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, summaryY, pageWidth - 28, 30, 3, 3, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 20, summaryY + 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const summaryItems: { label: string; value: string; color?: number[] }[] = [
    { label: 'Total', value: String(data.total_assets) },
    { label: 'Passed', value: String(data.passed), color: [34, 139, 34] },
    { label: 'Unfixed', value: String(data.failed), color: [220, 53, 69] },
  ];
  if (data.fixed > 0) summaryItems.push({ label: 'Fixed', value: String(data.fixed), color: [59, 130, 246] });
  if ((data.unresolved ?? 0) > 0) summaryItems.push({ label: 'Review', value: String(data.unresolved), color: [245, 158, 11] });

  let xPos = 20;
  summaryItems.forEach(item => {
    doc.setTextColor(100, 100, 100);
    doc.text(item.label + ':', xPos, summaryY + 22);
    if (item.color) doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    else doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, xPos + 25, summaryY + 22);
    doc.setFont('helvetica', 'normal');
    xPos += 40;
  });

  let currentY = summaryY + 45;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Image Analysis Results', 14, currentY);
  currentY += 8;

  const tableData = data.assets.map(asset => [
    (asset.filename || '').length > 25 ? asset.filename.substring(0, 22) + '...' : asset.filename,
    asset.type + (asset.content_type ? ` (${asset.content_type})` : ''),
    `${asset.score ?? 0}%`,
    asset.unresolved_state ? 'REVIEW' : (asset.status || '—'),
    String((asset.violations || []).length),
  ]);

  doc.autoTable({
    startY: currentY,
    head: [['Image', 'Type', 'Score', 'Status', 'Issues']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [35, 47, 62], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { textColor: [50, 50, 50] },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 40 }, 2: { cellWidth: 20 }, 3: { cellWidth: 25 }, 4: { cellWidth: 20 } },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 15;

  // Unresolved images section
  const unresolvedAssets = data.assets.filter(a => a.unresolved_state);
  if (unresolvedAssets.length > 0) {
    if (currentY > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); currentY = 20; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text(`Unresolved Images (${unresolvedAssets.length})`, 14, currentY);
    currentY += 8;

    const unresolvedData = unresolvedAssets.map(a => [
      (a.filename || '').length > 20 ? a.filename.substring(0, 17) + '...' : a.filename,
      a.content_type || a.type,
      a.unresolved_state || '',
      (a.unresolved_reason || '').length > 45 ? a.unresolved_reason!.substring(0, 42) + '...' : (a.unresolved_reason || ''),
      a.fix_attempts_count != null ? `${a.fix_attempts_count} tries` : '—',
    ]);

    doc.autoTable({
      startY: currentY,
      head: [['Image', 'Content Type', 'State', 'Reason', 'Attempts']],
      body: unresolvedData,
      theme: 'plain',
      headStyles: { fillColor: [254, 243, 199], textColor: [146, 64, 14], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [80, 80, 80] },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 25 }, 2: { cellWidth: 35 }, 3: { cellWidth: 55 }, 4: { cellWidth: 20 } },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // Fix Methods Used section
  if (data.fix_methods) {
    const methodMeta: Record<string, { label: string; color: [number, number, number] }> = {
      'bg-segmentation': { label: 'A1 · BG Seg', color: [8, 145, 178] },
      'full-regeneration': { label: 'A2 · Regen', color: [124, 58, 237] },
      'surgical-edit': { label: 'T1 · Surgical', color: [5, 150, 105] },
      'enhancement': { label: 'Enhanced', color: [124, 58, 237] },
    };

    if (currentY > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Fix Methods Used', 14, currentY);
    currentY += 8;

    const methods = Object.entries(data.fix_methods).filter(([, count]) => count > 0);
    const boxW = 40;
    const boxH = 22;
    const gap = 8;
    let xStart = 14;

    methods.forEach(([method, count]) => {
      const meta = methodMeta[method];
      if (!meta) return;
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(xStart, currentY, boxW, boxH, 2, 2, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(meta.color[0], meta.color[1], meta.color[2]);
      doc.text(String(count), xStart + boxW / 2, currentY + 10, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(meta.label, xStart + boxW / 2, currentY + 18, { align: 'center' });
      xStart += boxW + gap;
    });

    currentY += boxH + 15;
  }

  // Violations detail
  data.assets.forEach(asset => {
    if ((asset.violations || []).length === 0) return;
    if (currentY > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`${asset.filename} - Violations`, 14, currentY);
    currentY += 6;

    const violationData = (asset.violations || []).map((v: any) => [
      (v.severity || '').toUpperCase(),
      v.category || '',
      (v.message || '').length > 50 ? v.message.substring(0, 47) + '...' : v.message || '',
    ]);

    doc.autoTable({
      startY: currentY,
      head: [['Severity', 'Category', 'Message']],
      body: violationData,
      theme: 'plain',
      headStyles: { fillColor: [245, 245, 245], textColor: [50, 50, 50], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [80, 80, 80] },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 35 }, 2: { cellWidth: 100 } },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 10;
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by Amazon Listing Guardian | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  doc.save(`guardian-report-${new Date().toISOString().split('T')[0]}.pdf`);
}
