import { useState } from 'react';
import { ImageAsset } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { FileText } from 'lucide-react';

interface ClientReportProps {
  assets: ImageAsset[];
  listingTitle: string;
  productAsin: string | null;
}

export function ClientReportGenerator({ assets, listingTitle, productAsin }: ClientReportProps) {
  const [open, setOpen] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [agencyLogo, setAgencyLogo] = useState('');

  const analyzedAssets = assets.filter(a => a.analysisResult);
  if (analyzedAssets.length === 0) return null;

  const scores = analyzedAssets.map(a => a.analysisResult!.overallScore);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passed = analyzedAssets.filter(a => a.analysisResult!.status === 'PASS').length;
  const failed = analyzedAssets.length - passed;
  const allViolations = analyzedAssets.flatMap(a => a.analysisResult!.violations || []);
  const status = failed === 0 ? 'PASS' : 'FAIL';

  const generateReport = () => {
    const brandName = agencyName || 'Guardian AI';
    const brandLogo = agencyLogo || '';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build image rows for page 2
    const imageRows = analyzedAssets.map((asset, i) => {
      const r = asset.analysisResult!;
      const scoreColor = r.overallScore >= 85 ? '#22c55e' : r.overallScore >= 70 ? '#eab308' : '#ef4444';
      const violations = (r.violations || []).map(v => {
        const sevColor = v.severity === 'critical' ? '#ef4444' : v.severity === 'warning' ? '#eab308' : '#3b82f6';
        return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
          <span style="background:${sevColor};color:#fff;font-size:9px;padding:1px 6px;border-radius:3px;text-transform:uppercase">${v.severity}</span>
          <span style="font-size:11px;color:#374151">${v.message}</span>
        </div>`;
      }).join('');

      const beforeAfter = asset.fixedImage
        ? `<div style="margin-top:8px;display:flex;gap:8px;align-items:center">
            <div style="text-align:center"><div style="font-size:9px;color:#6b7280;margin-bottom:2px">BEFORE</div><img src="${asset.preview}" style="width:80px;height:80px;object-fit:contain;border:1px solid #e5e7eb;border-radius:4px"></div>
            <div style="font-size:16px;color:#9ca3af">→</div>
            <div style="text-align:center"><div style="font-size:9px;color:#22c55e;margin-bottom:2px">AFTER</div><img src="${asset.fixedImage}" style="width:80px;height:80px;object-fit:contain;border:1px solid #22c55e;border-radius:4px"></div>
          </div>`
        : '';

      return `<div style="display:flex;gap:16px;padding:14px 0;border-bottom:1px solid #f3f4f6;page-break-inside:avoid">
        <div style="flex-shrink:0">
          <img src="${asset.preview}" style="width:100px;height:100px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px" />
          <div style="text-align:center;margin-top:4px">
            <span style="font-size:10px;background:#f3f4f6;padding:1px 6px;border-radius:3px">${asset.type}</span>
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:13px;font-weight:600;color:#111827">${asset.name}</span>
            <span style="font-size:20px;font-weight:700;color:${scoreColor}">${r.overallScore}%</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;color:#fff;background:${r.status === 'PASS' ? '#22c55e' : '#ef4444'}">${r.status}</span>
          </div>
          ${violations || '<div style="font-size:11px;color:#22c55e">✅ No violations</div>'}
          ${beforeAfter}
        </div>
      </div>`;
    }).join('');

    // Build recommendations for page 3
    const recommendations = analyzedAssets
      .flatMap(a => a.analysisResult!.fixRecommendations || [])
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 10);

    const recRows = recommendations.map((rec, i) => {
      const effort = i < 3 ? 'LOW' : i < 7 ? 'MEDIUM' : 'HIGH';
      const effortColor = effort === 'LOW' ? '#22c55e' : effort === 'MEDIUM' ? '#eab308' : '#ef4444';
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 12px;font-weight:600;color:#6366f1;font-size:14px">${i + 1}</td>
        <td style="padding:8px 12px;font-size:12px;color:#374151">${rec}</td>
        <td style="padding:8px 12px;text-align:center"><span style="font-size:10px;padding:2px 8px;border-radius:3px;background:${effortColor}20;color:${effortColor};font-weight:600">${effort}</span></td>
      </tr>`;
    }).join('');

    // Missing image types
    const categories = new Set(assets.map(a => a.name.split('_')[0]));
    const allTypes = ['PRODUCT_SHOT', 'LIFESTYLE', 'INFOGRAPHIC', 'DETAIL', 'SIZE_CHART', 'PACKAGING', 'COMPARISON', 'PRODUCT_IN_USE'];
    const missing = allTypes.filter(t => !categories.has(t));
    const missingRows = missing.map(t =>
      `<div style="display:inline-block;margin:3px;padding:4px 12px;background:#fef2f2;color:#ef4444;border-radius:4px;font-size:11px;font-weight:500">${t.replace(/_/g, ' ')}</div>`
    ).join('');

    // Appendix JSON
    const jsonData = JSON.stringify({
      listing_title: listingTitle,
      asin: productAsin,
      audit_date: dateStr,
      overall_score: avgScore,
      status,
      total_images: analyzedAssets.length,
      passed, failed,
      assets: analyzedAssets.map(a => ({
        name: a.name, type: a.type,
        score: a.analysisResult!.overallScore,
        status: a.analysisResult!.status,
        violations: a.analysisResult!.violations,
      })),
    }, null, 2);

    const logoHtml = brandLogo
      ? `<img src="${brandLogo}" style="height:40px;object-fit:contain" />`
      : `<div style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${brandName}</div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${brandName} — Compliance Audit Report</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; padding: 24mm 20mm; page-break-after: always; position: relative; }
  .page:last-child { page-break-after: auto; }
  .watermark { position: absolute; bottom: 16mm; right: 20mm; font-size: 9px; color: #d1d5db; }

  /* Cover */
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cover-badge { display: inline-block; padding: 16px 48px; border-radius: 12px; font-size: 32px; font-weight: 800; letter-spacing: 2px; margin: 24px 0; }
  .cover-badge.pass { background: #dcfce7; color: #16a34a; border: 3px solid #22c55e; }
  .cover-badge.fail { background: #fef2f2; color: #dc2626; border: 3px solid #ef4444; }
  .metrics { display: flex; gap: 24px; margin-top: 32px; }
  .metric-card { flex: 1; padding: 20px; border-radius: 10px; background: #f9fafb; border: 1px solid #e5e7eb; text-align: center; }
  .metric-value { font-size: 36px; font-weight: 800; }
  .metric-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }

  /* Table */
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #e5e7eb; }

  /* Appendix */
  pre { background: #1e1e2e; color: #a6e3a1; padding: 16px; border-radius: 8px; font-size: 9px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; max-height: none; overflow: visible; }

  @media print {
    body { background: white; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<!-- PAGE 1: Executive Summary -->
<div class="page cover">
  <div style="margin-bottom:40px">${logoHtml}</div>
  <h1 style="font-size:28px;font-weight:300;color:#374151;margin-bottom:8px">Amazon Listing Compliance Audit</h1>
  <div style="font-size:14px;color:#6b7280;margin-bottom:32px">${dateStr}</div>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 32px;margin-bottom:16px;width:100%;max-width:480px">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Product</div>
    <div style="font-size:16px;font-weight:600;color:#111827;line-height:1.4">${listingTitle || 'Untitled Listing'}</div>
    ${productAsin ? `<div style="font-size:12px;color:#6b7280;margin-top:4px">ASIN: ${productAsin}</div>` : ''}
  </div>

  <div class="cover-badge ${status.toLowerCase()}">${status}</div>

  <div class="metrics">
    <div class="metric-card">
      <div class="metric-value" style="color:#6366f1">${analyzedAssets.length}</div>
      <div class="metric-label">Images Audited</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color:${avgScore >= 85 ? '#22c55e' : avgScore >= 70 ? '#eab308' : '#ef4444'}">${avgScore}%</div>
      <div class="metric-label">Compliance Score</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color:${allViolations.length > 0 ? '#ef4444' : '#22c55e'}">${allViolations.length}</div>
      <div class="metric-label">Issues Found</div>
    </div>
  </div>

  <div style="margin-top:48px;display:flex;gap:32px;font-size:12px;color:#9ca3af">
    <div>✅ ${passed} Passed</div>
    <div>❌ ${failed} Failed</div>
    <div>📸 ${assets.length}/9 Slots Used</div>
  </div>
  <div class="watermark">Generated by ${brandName}</div>
</div>

<!-- PAGE 2: Image Analysis -->
<div class="page">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
    <div style="width:4px;height:24px;background:#6366f1;border-radius:2px"></div>
    <h2 style="font-size:20px;font-weight:700">Image-by-Image Analysis</h2>
  </div>
  ${imageRows}
  <div class="watermark">Generated by ${brandName}</div>
</div>

<!-- PAGE 3: Recommendations -->
<div class="page">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
    <div style="width:4px;height:24px;background:#6366f1;border-radius:2px"></div>
    <h2 style="font-size:20px;font-weight:700">Recommendations</h2>
  </div>

  <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px">Priority Actions</h3>
  <table>
    <thead><tr><th style="width:40px">#</th><th>Action</th><th style="width:80px;text-align:center">Effort</th></tr></thead>
    <tbody>${recRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#22c55e;font-size:12px">✅ No recommendations — listing is fully compliant</td></tr>'}</tbody>
  </table>

  ${missing.length > 0 ? `
  <div style="margin-top:32px">
    <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px">Missing Image Types</h3>
    <p style="font-size:12px;color:#6b7280;margin-bottom:8px">Amazon allows 9 images. These content types are not present in your listing:</p>
    <div>${missingRows}</div>
  </div>` : ''}

  <div class="watermark">Generated by ${brandName}</div>
</div>

<!-- PAGE 4: Appendix -->
<div class="page">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
    <div style="width:4px;height:24px;background:#6366f1;border-radius:2px"></div>
    <h2 style="font-size:20px;font-weight:700">Appendix</h2>
  </div>

  <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:8px">Audit Methodology</h3>
  <div style="font-size:12px;color:#6b7280;line-height:1.6;margin-bottom:24px">
    This audit was performed using ${brandName}'s AI-powered compliance engine. Each image is analyzed against Amazon's official product image guidelines using multi-modal AI vision (Google Gemini). The system checks five compliance dimensions: background purity, text overlay detection, product occupancy, image quality, and content consistency. Scores are computed per-image and averaged for the overall listing score. A threshold of 85% is required to pass. Images scoring below this threshold are flagged with specific violation details and remediation recommendations.
  </div>

  <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:8px">Full Audit Data (JSON)</h3>
  <pre>${jsonData.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>

  <div style="margin-top:32px;text-align:center;padding-top:24px;border-top:1px solid #e5e7eb">
    ${logoHtml}
    <div style="font-size:11px;color:#9ca3af;margin-top:8px">
      ${brandName} — Amazon Listing Compliance & Optimization Platform
    </div>
    <div style="font-size:10px;color:#d1d5db;margin-top:4px">
      Report generated ${dateStr} • Confidential
    </div>
  </div>
</div>

</body>
</html>`;

    // Open in new window and trigger print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      // Wait for images to load before printing
      printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 500);
      };
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Client Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Client Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Generate a professional 4-page PDF audit report. Optionally white-label it with your agency branding.
          </p>
          <div className="space-y-2">
            <Label htmlFor="agency-name">Agency / Brand Name (optional)</Label>
            <Input
              id="agency-name"
              placeholder="e.g. Ecommerce Wala"
              value={agencyName}
              onChange={e => setAgencyName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-logo">Logo URL (optional)</Label>
            <Input
              id="agency-logo"
              placeholder="https://yoursite.com/logo.png"
              value={agencyLogo}
              onChange={e => setAgencyLogo(e.target.value)}
            />
          </div>
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <div>📄 Page 1 — Executive Summary with score & metrics</div>
            <div>🖼️ Page 2 — Image-by-image analysis with violations</div>
            <div>💡 Page 3 — Priority recommendations & missing types</div>
            <div>📋 Page 4 — Appendix with full JSON data</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={generateReport}>
            <FileText className="w-4 h-4 mr-2" />
            Generate & Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
