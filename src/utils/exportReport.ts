import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ImageAsset } from '@/types';
import { CompetitorData, buildComparisonReport, AIComparisonResult } from '@/components/CompetitorAudit';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

// ── JSON Export Schema (matches user spec exactly) ──

export interface ExportReport {
  timestamp: string;
  listing_title: string;
  overall_status: 'PASS' | 'FAIL';
  total_assets: number;
  passed: number;
  failed: number;
  assets: {
    filename: string;
    type: string;
    score: number | undefined;
    status: string | undefined;
    severity: string | undefined;
    violations: any[];
    fixed: boolean;
    fixed_score: number | undefined;
  }[];
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

export function generateExportData(
  assets: ImageAsset[],
  listingTitle: string,
  competitorData?: CompetitorData | null,
  aiComparison?: AIComparisonResult | null,
): ExportReport {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const passCount = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const failCount = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;

  const report: ExportReport = {
    timestamp: new Date().toISOString(),
    listing_title: listingTitle || 'Untitled Listing',
    overall_status: failCount > 0 ? 'FAIL' : 'PASS',
    total_assets: assets.length,
    passed: passCount,
    failed: failCount,
    assets: analyzedAssets.map(asset => {
      const violations = asset.analysisResult?.violations || [];
      const hasCritical = violations.some(v => v.severity === 'critical');
      const hasWarning = violations.some(v => v.severity === 'warning');
      const severity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'info';

      return {
        filename: asset.file?.name || asset.name,
        type: asset.type,
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
      };
    }),
  };

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
  const statusColor = data.overall_status === 'PASS' ? '#22c55e' : '#ef4444';
  const dateStr = new Date(data.timestamp).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const rows = data.assets.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${a.filename}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${a.type}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">${a.score ?? '—'}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">
        <span style="color:${a.status === 'PASS' ? '#22c55e' : '#ef4444'};font-weight:700;">${a.status ?? '—'}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${a.violations?.[0]?.message?.substring(0, 60) || '—'}</td>
    </tr>
  `).join('');

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
    <div class="stat"><div class="stat-value" style="color:#ef4444">${data.failed}</div><div class="stat-label">Failed</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Image</th>
        <th>Type</th>
        <th>Score</th>
        <th>Status</th>
        <th>Top Violation</th>
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

// ── Legacy jsPDF export (kept for backward compat) ──

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

  const summaryItems = [
    { label: 'Total', value: String(data.total_assets) },
    { label: 'Passed', value: String(data.passed), color: [34, 139, 34] },
    { label: 'Failed', value: String(data.failed), color: [220, 53, 69] },
  ];

  let xPos = 20;
  summaryItems.forEach(item => {
    doc.setTextColor(100, 100, 100);
    doc.text(item.label + ':', xPos, summaryY + 22);
    if (item.color) doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    else doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, xPos + 25, summaryY + 22);
    doc.setFont('helvetica', 'normal');
    xPos += 45;
  });

  let currentY = summaryY + 45;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Image Analysis Results', 14, currentY);
  currentY += 8;

  const tableData = data.assets.map(asset => [
    (asset.filename || '').length > 25 ? asset.filename.substring(0, 22) + '...' : asset.filename,
    asset.type,
    `${asset.score ?? 0}%`,
    asset.status || '—',
    String((asset.violations || []).length),
  ]);

  doc.autoTable({
    startY: currentY,
    head: [['Image', 'Type', 'Score', 'Status', 'Issues']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [35, 47, 62], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { textColor: [50, 50, 50] },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 30 }, 2: { cellWidth: 25 }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 } },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 15;

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
