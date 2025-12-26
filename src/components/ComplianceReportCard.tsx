import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ImageAsset } from '@/types';
import { useEffect, useState } from 'react';

interface ComplianceReportCardProps {
  assets: ImageAsset[];
  isAnalyzing?: boolean;
}

// Large animated score gauge component
function LargeScoreGauge({ score, size = 140 }: { score: number; size?: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 85) return 'text-success';
    if (s >= 70) return 'text-warning';
    return 'text-destructive';
  };

  const getStrokeColor = (s: number) => {
    if (s >= 85) return 'stroke-success';
    if (s >= 70) return 'stroke-warning';
    return 'stroke-destructive';
  };

  const getGrade = (s: number) => {
    if (s >= 95) return 'A+';
    if (s >= 90) return 'A';
    if (s >= 85) return 'B+';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    return 'F';
  };

  useEffect(() => {
    const duration = 1500;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(score * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="score-gauge relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Background circle */}
        <circle
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={`score-gauge-circle transition-all duration-1000 ${getStrokeColor(score)}`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${getScoreColor(score)}`}>
          {displayScore}
        </span>
        <span className="text-sm text-muted-foreground">/ 100</span>
        <Badge variant="outline" className={`mt-1 ${getScoreColor(score)}`}>
          Grade: {getGrade(score)}
        </Badge>
      </div>
    </div>
  );
}

// Compliance check item with pass/fail indicator
function ComplianceCheckItem({ 
  label, 
  passed, 
  detail,
  loading 
}: { 
  label: string; 
  passed: boolean | null; 
  detail?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      {loading ? (
        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
      ) : passed === null ? (
        <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
      ) : passed ? (
        <CheckCircle className="w-5 h-5 text-success shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-destructive shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && (
          <p className="text-xs text-muted-foreground truncate">{detail}</p>
        )}
      </div>
    </div>
  );
}

export function ComplianceReportCard({ assets, isAnalyzing }: ComplianceReportCardProps) {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  
  if (analyzedAssets.length === 0 && !isAnalyzing) {
    return null;
  }

  // Calculate summary stats
  const passCount = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const failCount = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;
  const avgScore = analyzedAssets.length > 0
    ? Math.round(analyzedAssets.reduce((sum, a) => sum + (a.analysisResult?.overallScore || 0), 0) / analyzedAssets.length)
    : 0;

  // Aggregate violations by category
  const violationsByCategory = new Map<string, { count: number; critical: number }>();
  analyzedAssets.forEach(a => {
    a.analysisResult?.violations.forEach(v => {
      const existing = violationsByCategory.get(v.category) || { count: 0, critical: 0 };
      existing.count++;
      if (v.severity === 'critical') existing.critical++;
      violationsByCategory.set(v.category, existing);
    });
  });

  // Determine pass/fail for each compliance category
  const getBackgroundCheck = () => {
    const bgViolations = analyzedAssets.flatMap(a => 
      a.analysisResult?.violations.filter(v => 
        v.category.toLowerCase().includes('background')
      ) || []
    );
    return bgViolations.length === 0;
  };

  const getTextOverlayCheck = () => {
    const textViolations = analyzedAssets.flatMap(a => 
      a.analysisResult?.violations.filter(v => 
        v.category.toLowerCase().includes('text') || 
        v.category.toLowerCase().includes('badge') ||
        v.category.toLowerCase().includes('watermark')
      ) || []
    );
    return textViolations.length === 0;
  };

  const getOccupancyCheck = () => {
    const occupancyViolations = analyzedAssets.flatMap(a => 
      a.analysisResult?.violations.filter(v => 
        v.category.toLowerCase().includes('occupancy') ||
        v.category.toLowerCase().includes('frame')
      ) || []
    );
    return occupancyViolations.length === 0;
  };

  const getQualityCheck = () => {
    const qualityViolations = analyzedAssets.flatMap(a => 
      a.analysisResult?.violations.filter(v => 
        v.category.toLowerCase().includes('quality') ||
        v.category.toLowerCase().includes('blur') ||
        v.category.toLowerCase().includes('resolution')
      ) || []
    );
    return qualityViolations.length === 0;
  };

  const overallStatus = failCount === 0 && passCount > 0 ? 'COMPLIANT' : 'VIOLATION';

  return (
    <Card className="border-2 border-primary/20 shadow-lg">
      <CardHeader className="pb-4 bg-gradient-to-r from-secondary/5 to-transparent">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Compliance Report Card
          </CardTitle>
          <Badge 
            variant={overallStatus === 'COMPLIANT' ? 'default' : 'destructive'}
            className={`text-sm px-4 py-1 ${overallStatus === 'COMPLIANT' ? 'bg-success' : ''}`}
          >
            {overallStatus}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Score Section */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 space-y-4">
            {/* Pass/Fail counts */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-success/10 rounded-lg p-3 text-center">
                <p className="text-3xl font-bold text-success">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-3xl font-bold text-destructive">{failCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-3xl font-bold text-muted-foreground">
                  {assets.filter(a => a.fixedImage).length}
                </p>
                <p className="text-xs text-muted-foreground">Fixed</p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Overall Compliance</span>
                <span className="font-medium">{avgScore}%</span>
              </div>
              <Progress value={avgScore} className="h-2" />
            </div>
          </div>

          {/* Large Score Gauge */}
          {analyzedAssets.length > 0 && (
            <LargeScoreGauge score={avgScore} size={140} />
          )}
        </div>

        {/* Compliance Checklist */}
        <div className="border rounded-lg p-4 bg-card">
          <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
            Amazon Image Standards Check
          </h4>
          <ComplianceCheckItem 
            label="Pure White Background (RGB 255,255,255)" 
            passed={analyzedAssets.length > 0 ? getBackgroundCheck() : null}
            detail={isAnalyzing ? "Checking..." : undefined}
            loading={isAnalyzing}
          />
          <ComplianceCheckItem 
            label="No Unauthorized Text/Badges/Watermarks" 
            passed={analyzedAssets.length > 0 ? getTextOverlayCheck() : null}
            loading={isAnalyzing}
          />
          <ComplianceCheckItem 
            label="Product Occupancy (85%+ Frame)" 
            passed={analyzedAssets.length > 0 ? getOccupancyCheck() : null}
            loading={isAnalyzing}
          />
          <ComplianceCheckItem 
            label="Image Quality & Clarity" 
            passed={analyzedAssets.length > 0 ? getQualityCheck() : null}
            loading={isAnalyzing}
          />
        </div>

        {/* Violation Categories */}
        {violationsByCategory.size > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Issues Found
            </h4>
            <div className="flex flex-wrap gap-2">
              {Array.from(violationsByCategory.entries()).map(([category, data]) => (
                <Badge 
                  key={category} 
                  variant={data.critical > 0 ? 'destructive' : 'secondary'}
                  className="flex items-center gap-1"
                >
                  {data.critical > 0 ? (
                    <XCircle className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  {category}: {data.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Shield icon for export
function Shield({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
