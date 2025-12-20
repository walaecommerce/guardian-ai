import { useState } from 'react';
import { ArrowRight, Download, Eye, Filter, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageAsset } from '@/types';

interface BatchComparisonViewProps {
  assets: ImageAsset[];
  onViewDetails: (asset: ImageAsset) => void;
  onDownload: (imageUrl: string, filename: string) => void;
}

type FilterOption = 'all' | 'fixed' | 'unfixed' | 'failed';
type SortOption = 'name' | 'score' | 'type';

export function BatchComparisonView({ assets, onViewDetails, onDownload }: BatchComparisonViewProps) {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const analyzedAssets = assets.filter(a => a.analysisResult);
  
  // Apply filters
  const filteredAssets = analyzedAssets.filter(asset => {
    switch (filter) {
      case 'fixed':
        return !!asset.fixedImage;
      case 'unfixed':
        return !asset.fixedImage && asset.analysisResult?.status === 'FAIL';
      case 'failed':
        return asset.analysisResult?.status === 'FAIL';
      default:
        return true;
    }
  });

  // Apply sorting
  const sortedAssets = [...filteredAssets].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.analysisResult?.overallScore || 0) - (a.analysisResult?.overallScore || 0);
      case 'type':
        return a.type.localeCompare(b.type);
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const fixedCount = analyzedAssets.filter(a => a.fixedImage).length;
  const failedCount = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;

  if (analyzedAssets.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Eye className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-2">No Comparisons Yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Run an audit and generate fixes to see before/after comparisons here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Before / After Comparison</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {fixedCount}/{failedCount} Fixed
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Images</SelectItem>
                  <SelectItem value="fixed">Fixed Only</SelectItem>
                  <SelectItem value="unfixed">Needs Fix</SelectItem>
                  <SelectItem value="failed">Failed Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort:</span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="score">Score</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 gap-4">
        {sortedAssets.map((asset) => (
          <ComparisonCard
            key={asset.id}
            asset={asset}
            onViewDetails={onViewDetails}
            onDownload={onDownload}
          />
        ))}
      </div>
      
      {sortedAssets.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No images match the current filter.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ComparisonCard({ 
  asset, 
  onViewDetails, 
  onDownload 
}: { 
  asset: ImageAsset; 
  onViewDetails: (asset: ImageAsset) => void;
  onDownload: (imageUrl: string, filename: string) => void;
}) {
  const result = asset.analysisResult;
  const hasFix = !!asset.fixedImage;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Original Image */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-muted-foreground">Original</span>
              <Badge 
                variant={result?.status === 'PASS' ? 'default' : 'destructive'}
                className="text-xs"
              >
                {result?.status === 'PASS' ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> PASS</>
                ) : (
                  <><XCircle className="w-3 h-3 mr-1" /> FAIL</>
                )}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Score: {result?.overallScore}%
              </span>
            </div>
            <div className="relative aspect-square bg-muted rounded-lg overflow-hidden max-w-[200px]">
              <img
                src={asset.preview}
                alt={asset.name}
                className="w-full h-full object-cover"
              />
              <Badge
                variant={asset.type === 'MAIN' ? 'default' : 'secondary'}
                className="absolute bottom-2 left-2 text-xs"
              >
                {asset.type}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2 truncate max-w-[200px]">
              {asset.name}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center pt-12">
            <div className={`p-2 rounded-full ${hasFix ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
              <ArrowRight className="w-5 h-5" />
            </div>
          </div>

          {/* Fixed Image */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {hasFix ? 'AI Fixed' : 'No Fix Yet'}
              </span>
              {hasFix && (
                <Badge variant="outline" className="text-xs text-success border-success">
                  Compliant
                </Badge>
              )}
            </div>
            <div className="relative aspect-square bg-muted rounded-lg overflow-hidden max-w-[200px]">
              {hasFix ? (
                <img
                  src={asset.fixedImage}
                  alt={`${asset.name} - Fixed`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">
                    {result?.status === 'PASS' ? 'Already Compliant' : 'Pending Fix'}
                  </span>
                </div>
              )}
            </div>
            {hasFix && (
              <p className="text-xs text-success mt-2">
                AI-corrected version
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(asset)}
            >
              <Eye className="w-4 h-4 mr-1" />
              Details
            </Button>
            {hasFix && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(asset.fixedImage!, `${asset.name}-fixed.jpg`)}
              >
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
            )}
          </div>
        </div>

        {/* Violations summary */}
        {result && result.violations.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">
              {result.violations.length} issue{result.violations.length !== 1 ? 's' : ''} found:
            </p>
            <div className="flex flex-wrap gap-1">
              {result.violations.slice(0, 4).map((v, i) => (
                <Badge 
                  key={i} 
                  variant={v.severity === 'critical' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {v.category}
                </Badge>
              ))}
              {result.violations.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{result.violations.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
