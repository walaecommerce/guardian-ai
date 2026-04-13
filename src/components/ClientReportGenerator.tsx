import { useState } from 'react';
import { ImageAsset } from '@/types';
import { CATEGORY_RULES, GEMINI_CATEGORY_MAP, type ProductCategory } from '@/config/categoryRules';
import { SuggestionsData } from '@/components/recommendations/types';
import { ScorecardData } from '@/components/ListingScoreCard';
import { AIComparisonResult } from '@/components/CompetitorAudit';
import { isManualReviewAsset } from '@/components/ManualReviewLane';
import { formatContentType } from '@/utils/sessionResume';
import { extractImageCategory } from '@/utils/imageCategory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { FileText, CalendarIcon } from 'lucide-react';

interface ClientReportProps {
  assets: ImageAsset[];
  listingTitle: string;
  productAsin: string | null;
  suggestionsData?: SuggestionsData | null;
  scorecardData?: ScorecardData | null;
  competitorData?: AIComparisonResult | null;
}

type ColorTheme = 'orange' | 'blue' | 'white';

const THEME_COLORS: Record<ColorTheme, { primary: string; primaryLight: string; accent: string; gradient: string }> = {
  orange: { primary: '#FF9900', primaryLight: '#FFF3E0', accent: '#232F3E', gradient: 'linear-gradient(135deg,#FF9900,#FF6600)' },
  blue: { primary: '#1e40af', primaryLight: '#eff6ff', accent: '#1e3a5f', gradient: 'linear-gradient(135deg,#1e40af,#3b82f6)' },
  white: { primary: '#374151', primaryLight: '#f9fafb', accent: '#111827', gradient: 'linear-gradient(135deg,#6b7280,#374151)' },
};

type Section = 'executive' | 'images' | 'recommendations' | 'competitor' | 'appendix';

export function ClientReportGenerator({
  assets, listingTitle, productAsin,
  suggestionsData, scorecardData, competitorData,
}: ClientReportProps) {
  const [open, setOpen] = useState(false);
  const [agencyName, setAgencyName] = useState('Guardian AI');
  const [agencyLogo, setAgencyLogo] = useState('');
  const [clientName, setClientName] = useState('');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [colorTheme, setColorTheme] = useState<ColorTheme>('orange');
  const [sections, setSections] = useState<Record<Section, boolean>>({
    executive: true, images: true, recommendations: true, competitor: false, appendix: true,
  });

  const analyzedAssets = assets.filter(a => a.analysisResult);
  if (analyzedAssets.length === 0) return null;

  const toggleSection = (s: Section) => setSections(prev => ({ ...prev, [s]: !prev[s] }));

  const unresolvedAssets = analyzedAssets.filter(isManualReviewAsset);
  const scores = analyzedAssets.map(a => a.analysisResult!.overallScore);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passed = analyzedAssets.filter(a => a.analysisResult!.status === 'PASS').length;
  const fixedCount = analyzedAssets.filter(a => a.fixedImage).length;
  const failed = analyzedAssets.length - passed - unresolvedAssets.filter(a => a.analysisResult!.status !== 'PASS').length;
  const allViolations = analyzedAssets.flatMap(a => a.analysisResult!.violations || []);
  const status = (failed === 0 && unresolvedAssets.length === 0) ? 'PASS' : 'FAIL';

  const generateReport = () => {
    const theme = THEME_COLORS[colorTheme];
    const brandName = agencyName || 'Guardian AI';
    const dateStr = format(reportDate, 'MMMM d, yyyy');

    const logoHtml = agencyLogo
      ? `<img src="${agencyLogo}" style="height:48px;object-fit:contain" />`
      : `<div style="font-size:28px;font-weight:800;background:${theme.gradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent">${brandName}</div>`;

    // Health score
    const WEIGHTS: Record<string, number> = { compliance: 0.30, completeness: 0.20, diversity: 0.15, textReadability: 0.15, emotionalAppeal: 0.10, brandConsistency: 0.10 };
    const healthScore = scorecardData
      ? Math.round(
          scorecardData.compliance * WEIGHTS.compliance +
          scorecardData.completeness * WEIGHTS.completeness +
          scorecardData.diversity * WEIGHTS.diversity +
          scorecardData.textReadability * WEIGHTS.textReadability +
          scorecardData.emotionalAppeal * WEIGHTS.emotionalAppeal +
          scorecardData.brandConsistency * WEIGHTS.brandConsistency
        )
      : avgScore;

    const scoreColor = (s: number) => s >= 85 ? '#22c55e' : s >= 70 ? '#eab308' : '#ef4444';

    // ── Page builders ──

    const buildCover = () => `
<div class="page cover">
  <div style="margin-bottom:48px">${logoHtml}</div>
  <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${theme.primary};margin-bottom:16px">Amazon Listing Compliance Audit</div>
  <h1 style="font-size:32px;font-weight:300;color:${theme.accent};margin-bottom:8px;max-width:500px;line-height:1.3">${listingTitle || 'Product Listing'}</h1>
  ${productAsin ? `<div style="font-size:13px;color:#9ca3af;margin-bottom:32px">ASIN: ${productAsin}</div>` : '<div style="margin-bottom:32px"></div>'}
  ${clientName ? `<div style="font-size:14px;color:#6b7280;margin-bottom:8px">Prepared for: <strong style="color:${theme.accent}">${clientName}</strong></div>` : ''}
  <div style="font-size:13px;color:#9ca3af;margin-bottom:40px">Audited by ${brandName} • ${dateStr}</div>
  <div class="cover-badge ${status.toLowerCase()}" style="border-color:${status === 'PASS' ? '#22c55e' : '#ef4444'}">${status}</div>
  <div class="watermark">${brandName} • Confidential</div>
</div>`;

    const buildExecutive = () => {
      const dimRows = scorecardData ? [
        { name: 'Compliance', score: scorecardData.compliance, weight: '30%' },
        { name: 'Completeness', score: scorecardData.completeness, weight: '20%' },
        { name: 'Image Diversity', score: scorecardData.diversity, weight: '15%' },
        { name: 'Text Readability', score: scorecardData.textReadability, weight: '15%' },
        { name: 'Emotional Appeal', score: scorecardData.emotionalAppeal, weight: '10%' },
        { name: 'Brand Consistency', score: scorecardData.brandConsistency, weight: '10%' },
      ].map(d => `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 12px;font-size:12px;font-weight:500">${d.name}</td>
        <td style="padding:8px 12px;text-align:center"><span style="font-weight:700;color:${scoreColor(d.score)}">${d.score}</span>/100</td>
        <td style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af">${d.weight}</td>
      </tr>`).join('') : '';

      const actions = (scorecardData?.priorityActions || []).slice(0, 3).map((a, i) =>
        `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:10px">
          <span style="background:${theme.primary};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i + 1}</span>
          <span style="font-size:12px;color:#374151;line-height:1.5">${a}</span>
        </div>`
      ).join('');

      return `
<div class="page">
  <div class="section-header" style="border-left-color:${theme.primary}">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Executive Summary</h2>
  </div>
  <div class="metrics">
    <div class="metric-card">
      <div class="metric-value" style="color:${theme.primary}">${analyzedAssets.length}</div>
      <div class="metric-label">Images Audited</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color:${scoreColor(healthScore)}">${healthScore}%</div>
      <div class="metric-label">Health Score</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color:${allViolations.length ? '#ef4444' : '#22c55e'}">${allViolations.length}</div>
      <div class="metric-label">Issues Found</div>
    </div>
    ${unresolvedAssets.length > 0 ? `<div class="metric-card">
      <div class="metric-value" style="color:#f59e0b">${unresolvedAssets.length}</div>
      <div class="metric-label">Needs Review</div>
    </div>` : ''}
  </div>
  ${dimRows ? `
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin:28px 0 12px">Score Dimensions</h3>
  <table><thead><tr><th>Dimension</th><th style="text-align:center">Score</th><th style="text-align:center">Weight</th></tr></thead>
  <tbody>${dimRows}</tbody></table>` : ''}
  ${actions ? `
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin:28px 0 12px">Top Priority Actions</h3>
  ${actions}` : ''}
  <div class="watermark">${brandName}</div>
</div>`;
    };

    const buildImages = () => {
      const rows = analyzedAssets.map(asset => {
        const r = asset.analysisResult!;
        const sc = scoreColor(r.overallScore);
        const violations = (r.violations || []).map(v => {
          const sevColor = v.severity === 'critical' ? '#ef4444' : v.severity === 'warning' ? '#eab308' : '#3b82f6';
          return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="background:${sevColor};color:#fff;font-size:9px;padding:1px 6px;border-radius:3px;text-transform:uppercase">${v.severity}</span>
            <span style="font-size:11px;color:#374151">${v.message}</span>
          </div>`;
        }).join('');

        const fixStamp = asset.fixedImage
          ? `<div style="margin-top:8px;display:flex;gap:8px;align-items:center">
              <div style="text-align:center"><div style="font-size:9px;color:#6b7280;margin-bottom:2px">BEFORE</div><img src="${asset.preview}" style="width:70px;height:70px;object-fit:contain;border:1px solid #e5e7eb;border-radius:4px"></div>
              <div style="font-size:14px;color:#9ca3af">→</div>
              <div style="text-align:center"><div style="font-size:9px;color:#22c55e;margin-bottom:2px;font-weight:600">✓ FIXED</div><img src="${asset.fixedImage}" style="width:70px;height:70px;object-fit:contain;border:1px solid #22c55e;border-radius:4px"></div>
            </div>` : '';

        return `<div style="display:flex;gap:16px;padding:14px 0;border-bottom:1px solid #f3f4f6;page-break-inside:avoid">
          <div style="flex-shrink:0">
            <img src="${asset.preview}" style="width:120px;height:120px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px" />
            <div style="text-align:center;margin-top:4px">
              <span style="font-size:10px;background:${asset.type === 'MAIN' ? theme.primaryLight : '#f3f4f6'};color:${asset.type === 'MAIN' ? theme.primary : '#6b7280'};padding:2px 8px;border-radius:3px;font-weight:600">${asset.type}</span>
            </div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:13px;font-weight:600;color:#111827">${asset.name}</span>
              <span style="font-size:22px;font-weight:700;color:${sc}">${r.overallScore}%</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;color:#fff;background:${r.status === 'PASS' ? '#22c55e' : '#ef4444'}">${r.status}</span>
            </div>
            ${violations || '<div style="font-size:11px;color:#22c55e">✅ No violations</div>'}
            ${fixStamp}
          </div>
        </div>`;
      }).join('');

      return `
<div class="page">
  <div class="section-header" style="border-left-color:${theme.primary}">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Image-by-Image Analysis</h2>
  </div>
  ${rows}
  <div class="watermark">${brandName}</div>
</div>`;
    };

    const unresolvedLabel = (state?: string) => {
      switch (state) {
        case 'manual_review': return 'Manual Review Required';
        case 'warn_only': return 'Warning — Better Source Needed';
        case 'retry_stopped': return 'Retry Stopped — Preservation Failure';
        case 'auto_fix_failed': return 'Auto-fix Failed After Attempts';
        case 'skipped': return 'Skipped — Safety Rules';
        default: return 'Needs Review';
      }
    };

    const unresolvedColor = (state?: string) => {
      switch (state) {
        case 'retry_stopped': case 'auto_fix_failed': return '#ef4444';
        case 'manual_review': return '#f59e0b';
        case 'warn_only': return '#eab308';
        default: return '#6b7280';
      }
    };

    const buildUnresolved = () => {
      if (unresolvedAssets.length === 0) return '';
      const rows = unresolvedAssets.map(asset => {
        const contentType = formatContentType(extractImageCategory(asset));
        const state = asset.unresolvedState;
        const reason = asset.batchSkipReason || asset.fixStopReason || '';
        const attempts = asset.fixAttempts?.length || 0;
        const lastStrategy = asset.lastFixStrategy;
        const stateLabel = unresolvedLabel(state);
        const color = unresolvedColor(state);

        return `<div style="display:flex;gap:16px;padding:14px 0;border-bottom:1px solid #f3f4f6;page-break-inside:avoid">
          <div style="flex-shrink:0">
            <img src="${asset.preview}" style="width:80px;height:80px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px" />
            <div style="text-align:center;margin-top:4px">
              <span style="font-size:10px;background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:3px;font-weight:600">${asset.type}</span>
            </div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:13px;font-weight:600;color:#111827">${asset.name}</span>
              ${contentType ? `<span style="font-size:10px;padding:2px 8px;border-radius:3px;background:#f3f4f6;color:#6b7280">${contentType}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;color:#fff;background:${color}">${stateLabel}</span>
            </div>
            ${reason ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px">Reason: ${reason}</div>` : ''}
            ${attempts > 0 ? `<div style="font-size:10px;color:#9ca3af">${attempts} fix attempt${attempts !== 1 ? 's' : ''} tried${lastStrategy ? ` · Last strategy: ${lastStrategy}` : ''}</div>` : ''}
          </div>
        </div>`;
      }).join('');

      return `
<div class="page">
  <div class="section-header" style="border-left-color:#f59e0b">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Items Requiring Review</h2>
  </div>
  <div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;font-size:12px;color:#92400e;line-height:1.5">
    ${unresolvedAssets.length} image${unresolvedAssets.length !== 1 ? 's' : ''} could not be automatically fixed and require manual attention.
    These are not generic failures — each has a specific reason why automated correction was not safe or possible.
  </div>
  ${rows}
  <div class="watermark">${brandName}</div>
</div>`;
    };

    const buildRecommendations = () => {
      if (!suggestionsData) {
        // Fallback to basic recommendations
        const recs = analyzedAssets.flatMap(a => a.analysisResult!.fixRecommendations || [])
          .filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 8);
        const rows = recs.map((rec, i) => `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 12px;font-weight:600;color:${theme.primary};font-size:14px">${i + 1}</td>
          <td style="padding:8px 12px;font-size:12px;color:#374151">${rec}</td>
        </tr>`).join('');
        return `
<div class="page">
  <div class="section-header" style="border-left-color:${theme.primary}">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Recommendations</h2>
  </div>
  <table><thead><tr><th style="width:40px">#</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="watermark">${brandName}</div>
</div>`;
      }

      const missingRows = (suggestionsData.missing_image_types || []).map(m =>
        `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 12px;font-size:12px;font-weight:600">${m.type.replace(/_/g, ' ')}</td>
          <td style="padding:8px 12px"><span style="font-size:10px;padding:2px 8px;border-radius:3px;background:${m.priority === 'HIGH' ? '#fef2f2' : m.priority === 'MEDIUM' ? '#fefce8' : '#eff6ff'};color:${m.priority === 'HIGH' ? '#ef4444' : m.priority === 'MEDIUM' ? '#eab308' : '#3b82f6'};font-weight:600">${m.priority}</span></td>
          <td style="padding:8px 12px;font-size:11px;color:#6b7280">${m.estimated_conversion_impact}</td>
        </tr>`
      ).join('');

      const quickWins = (suggestionsData.quick_wins || []).map((q, i) =>
        `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;page-break-inside:avoid">
          <span style="width:18px;height:18px;border:2px solid #d1d5db;border-radius:3px;flex-shrink:0;margin-top:1px"></span>
          <div>
            <span style="font-size:12px;font-weight:500">${q.action}</span>
            <span style="font-size:10px;margin-left:6px;padding:1px 6px;border-radius:3px;background:${q.effort === 'LOW' ? '#dcfce7' : q.effort === 'MEDIUM' ? '#fefce8' : '#fef2f2'};color:${q.effort === 'LOW' ? '#16a34a' : q.effort === 'MEDIUM' ? '#ca8a04' : '#dc2626'}">${q.effort}</span>
            <div style="font-size:10px;color:#9ca3af;margin-top:2px">${q.how_to_do_it}</div>
          </div>
        </div>`
      ).join('');

      const titleRows = (suggestionsData.title_improvements || []).map(t =>
        `<div style="margin-bottom:12px;padding:10px;background:#f9fafb;border-radius:6px;page-break-inside:avoid">
          <div style="font-size:11px;color:#ef4444;font-weight:600;margin-bottom:4px">Issue: ${t.issue}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:2px">Current: ${t.current_example}</div>
          <div style="font-size:11px;color:#16a34a;font-weight:500">Suggested: ${t.suggested_fix}</div>
        </div>`
      ).join('');

      return `
<div class="page">
  <div class="section-header" style="border-left-color:${theme.primary}">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Recommendations</h2>
  </div>
  ${suggestionsData.overall_strategy ? `<div style="background:${theme.primaryLight};border-left:3px solid ${theme.primary};padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;font-size:12px;color:#374151;line-height:1.5">${suggestionsData.overall_strategy}</div>` : ''}
  ${missingRows ? `
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin-bottom:10px">Missing Image Types</h3>
  <table style="margin-bottom:24px"><thead><tr><th>Type</th><th style="width:80px">Priority</th><th>Conversion Impact</th></tr></thead><tbody>${missingRows}</tbody></table>` : ''}
  ${quickWins ? `<h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin-bottom:10px">Quick Wins Checklist</h3><div style="margin-bottom:24px">${quickWins}</div>` : ''}
  ${titleRows ? `<h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin-bottom:10px">Title Improvements</h3>${titleRows}` : ''}
  <div class="watermark">${brandName}</div>
</div>`;
    };

    const buildCompetitor = () => {
      if (!competitorData) return '';
      const sc = competitorData.score_comparison;
      return `
<div class="page">
  <div class="section-header" style="border-left-color:${theme.primary}">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Competitor Analysis</h2>
  </div>
  <div class="metrics">
    <div class="metric-card">
      <div class="metric-value" style="color:${scoreColor(sc?.your_score || 0)}">${sc?.your_score || 0}%</div>
      <div class="metric-label">Your Score</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color:${scoreColor(sc?.competitor_score || 0)}">${sc?.competitor_score || 0}%</div>
      <div class="metric-label">Competitor Score</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color:${theme.primary}">${sc?.winner === 'you' ? '✓ YOU' : sc?.winner === 'competitor' ? '✗ THEM' : 'TIE'}</div>
      <div class="metric-label">Winner</div>
    </div>
  </div>
  ${(competitorData.your_advantages || []).length ? `
  <h3 style="font-size:14px;font-weight:600;color:#16a34a;margin:24px 0 10px">Your Advantages</h3>
  ${competitorData.your_advantages.map(a => `<div style="padding:8px 12px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534;margin-bottom:6px">✓ ${a}</div>`).join('')}` : ''}
  ${(competitorData.priority_actions || []).length ? `
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin:24px 0 10px">Priority Actions</h3>
  ${competitorData.priority_actions.map((a: any, i: number) => `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
    <span style="background:${a.impact === 'HIGH' ? '#ef4444' : a.impact === 'MEDIUM' ? '#eab308' : '#3b82f6'};color:#fff;font-size:9px;padding:2px 8px;border-radius:3px;flex-shrink:0;margin-top:2px">${a.impact}</span>
    <div><div style="font-size:12px;font-weight:500">${a.action}</div><div style="font-size:10px;color:#9ca3af">${a.reason}</div></div>
  </div>`).join('')}` : ''}
  <div class="watermark">${brandName}</div>
</div>`;
    };

    const buildAppendix = () => {
      const jsonData = JSON.stringify({
        listing_title: listingTitle,
        asin: productAsin,
        audit_date: dateStr,
        overall_score: avgScore,
        health_score: healthScore,
        status,
        total_images: analyzedAssets.length,
        passed, failed,
        scorecard: scorecardData || null,
        assets: analyzedAssets.map(a => ({
          name: a.name, type: a.type,
          score: a.analysisResult!.overallScore,
          status: a.analysisResult!.status,
          violations: a.analysisResult!.violations,
        })),
      }, null, 2);

      return `
<div class="page">
  <div class="section-header" style="border-left-color:${theme.primary}">
    <h2 style="font-size:20px;font-weight:700;color:${theme.accent}">Appendix</h2>
  </div>
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin-bottom:8px">Audit Methodology</h3>
  <div style="font-size:12px;color:#6b7280;line-height:1.6;margin-bottom:24px">
    This audit was performed using ${brandName} powered by Google Gemini 3.1 Pro and Nano Banana 2.
    Analysis covers Amazon's current image requirements including background compliance,
    text overlay detection, product occupancy, content consistency, and policy violations.
    Each image is scored 0–100 across multiple compliance dimensions. A threshold of 85% is
    required to pass. The Listing Health Score is a weighted composite of six quality dimensions.
  </div>
  ${(() => {
    // Detect primary category from analyzed assets
    const categories = analyzedAssets
      .map(a => a.analysisResult?.productCategory)
      .filter(Boolean) as string[];
    const primaryCat = categories.length > 0
      ? (categories.sort((a, b) =>
          categories.filter(v => v === b).length - categories.filter(v => v === a).length
        )[0])
      : null;
    const catKey = primaryCat ? (GEMINI_CATEGORY_MAP[primaryCat] || primaryCat) : null;
    const catRules = catKey ? CATEGORY_RULES[catKey as ProductCategory] : null;
    if (!catRules) return '';
    return `
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin-bottom:8px;margin-top:16px">
    ${catRules.icon} Category-Specific Compliance Notes — ${catRules.name}
  </h3>
  <ul style="font-size:12px;color:#6b7280;line-height:1.8;list-style:disc;padding-left:20px;margin-bottom:24px">
    ${catRules.report_notes.map(n => `<li>${n}</li>`).join('')}
  </ul>`;
  })()}
  <h3 style="font-size:14px;font-weight:600;color:${theme.accent};margin-bottom:8px">Full Audit Data</h3>
  <pre>${jsonData.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  <div style="margin-top:32px;text-align:center;padding-top:24px;border-top:1px solid #e5e7eb">
    ${logoHtml}
    <div style="font-size:11px;color:#9ca3af;margin-top:8px">${brandName} — Amazon Listing Compliance & Optimization</div>
    <div style="font-size:10px;color:#d1d5db;margin-top:4px">Report generated ${dateStr} • Confidential</div>
  </div>
</div>`;
    };

    // ── Assemble pages ──
    const pages = [buildCover()];
    if (sections.executive) pages.push(buildExecutive());
    if (sections.images) pages.push(buildImages());
    if (sections.recommendations) pages.push(buildRecommendations());
    if (sections.competitor && competitorData) pages.push(buildCompetitor());
    if (sections.appendix) pages.push(buildAppendix());

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
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cover-badge { display: inline-block; padding: 16px 48px; border-radius: 12px; font-size: 32px; font-weight: 800; letter-spacing: 2px; margin: 24px 0; }
  .cover-badge.pass { background: #dcfce7; color: #16a34a; border: 3px solid #22c55e; }
  .cover-badge.fail { background: #fef2f2; color: #dc2626; border: 3px solid #ef4444; }
  .metrics { display: flex; gap: 20px; margin: 24px 0; }
  .metric-card { flex: 1; padding: 20px; border-radius: 10px; background: #f9fafb; border: 1px solid #e5e7eb; text-align: center; }
  .metric-value { font-size: 36px; font-weight: 800; }
  .metric-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; border-left: 4px solid ${theme.primary}; padding-left: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  pre { background: #1e1e2e; color: #a6e3a1; padding: 16px; border-radius: 8px; font-size: 9px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  @media print {
    body { margin: 0; background: white; }
    .no-print { display: none !important; }
    .page { page-break-after: always; padding: 40px; }
  }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => setTimeout(() => printWindow.print(), 500);
    }
    setOpen(false);
  };

  const sectionItems: { key: Section; label: string; desc: string }[] = [
    { key: 'executive', label: 'Executive Summary', desc: 'Metrics, health score, priority actions' },
    { key: 'images', label: 'Image Analysis', desc: 'Per-image scores, violations, fixes' },
    { key: 'recommendations', label: 'Recommendations', desc: 'Missing types, quick wins, title fixes' },
    { key: 'competitor', label: 'Competitor Analysis', desc: 'Side-by-side comparison data' },
    { key: 'appendix', label: 'Appendix', desc: 'Full JSON data & methodology' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Client Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Generate Client Report
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Branding */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Agency Branding</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agency-name" className="text-xs">Agency Name</Label>
                <Input id="agency-name" placeholder="Guardian AI" value={agencyName} onChange={e => setAgencyName(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-name" className="text-xs">Client Name</Label>
                <Input id="client-name" placeholder="e.g. Acme Corp" value={clientName} onChange={e => setClientName(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agency-logo" className="text-xs">Agency Logo URL (optional)</Label>
              <Input id="agency-logo" placeholder="https://yoursite.com/logo.png" value={agencyLogo} onChange={e => setAgencyLogo(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs">Report Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-sm", !reportDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {reportDate ? format(reportDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={reportDate} onSelect={d => d && setReportDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Include Sections</h4>
            {sectionItems.map(s => (
              <label key={s.key} className="flex items-start gap-3 cursor-pointer py-1">
                <Checkbox checked={sections[s.key]} onCheckedChange={() => toggleSection(s.key)} className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Color Theme */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Color Theme</h4>
            <RadioGroup value={colorTheme} onValueChange={v => setColorTheme(v as ColorTheme)} className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="orange" />
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-[#FF9900]" />
                  <span className="text-sm">Guardian Orange</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="blue" />
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-[#1e40af]" />
                  <span className="text-sm">Professional Blue</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="white" />
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-[#6b7280] border" />
                  <span className="text-sm">Clean White</span>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Preview */}
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground mb-1">Report Preview</div>
            <div>📄 Cover — {agencyName || 'Guardian AI'} branding, PASS/FAIL badge</div>
            {sections.executive && <div>📊 Executive Summary — Health score, 6 dimensions</div>}
            {sections.images && <div>🖼️ Image Analysis — {analyzedAssets.length} images with violations</div>}
            {sections.recommendations && <div>💡 Recommendations — Missing types, quick wins, title fixes</div>}
            {sections.competitor && competitorData && <div>⚔️ Competitor Analysis — Side-by-side comparison</div>}
            {sections.appendix && <div>📋 Appendix — Full JSON data & methodology</div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={generateReport}>
            <FileText className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
