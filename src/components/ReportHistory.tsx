import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { History, Trash2, Eye, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ComplianceReport {
  id: string;
  created_at: string;
  amazon_url: string | null;
  product_asin: string | null;
  listing_title: string | null;
  total_images: number;
  passed_count: number;
  failed_count: number;
  average_score: number | null;
  report_data: Record<string, unknown>;
  fixed_images_count: number;
}

interface ReportHistoryProps {
  onLoadReport?: (report: ComplianceReport) => void;
}

export const ReportHistory = ({ onLoadReport }: ReportHistoryProps) => {
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);

  const fetchReports = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('compliance_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setReports(data as ComplianceReport[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('compliance_reports')
      .delete()
      .eq('id', id);

    if (!error) {
      setReports(prev => prev.filter(r => r.id !== id));
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'bg-muted text-muted-foreground';
    if (score >= 85) return 'bg-green-500/20 text-green-600';
    if (score >= 70) return 'bg-yellow-500/20 text-yellow-600';
    return 'bg-red-500/20 text-red-600';
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4" />
          Report History
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={fetchReports} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[200px]">
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No reports saved yet
            </p>
          ) : (
            <div className="space-y-2">
              {reports.map(report => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getScoreColor(report.average_score)}>
                        {report.average_score?.toFixed(0) ?? 'N/A'}%
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {report.product_asin || 'Manual Upload'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(report.created_at), 'MMM d, h:mm a')} • 
                      {report.passed_count}✓ {report.failed_count}✗
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSelectedReport(report)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Report?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this compliance report.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(report.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Report Detail Dialog */}
        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Compliance Report Details</DialogTitle>
            </DialogHeader>
            {selectedReport && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">
                      {format(new Date(selectedReport.created_at), 'PPpp')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ASIN</p>
                    <p className="font-medium">{selectedReport.product_asin || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Listing Title</p>
                    <p className="font-medium text-sm">
                      {selectedReport.listing_title || 'Not specified'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">
                      {selectedReport.average_score?.toFixed(0) ?? 'N/A'}%
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Score</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{selectedReport.total_images}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{selectedReport.passed_count}</p>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{selectedReport.failed_count}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </Card>
                </div>

                {selectedReport.amazon_url && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Amazon URL</p>
                    <a
                      href={selectedReport.amazon_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
                    >
                      {selectedReport.amazon_url}
                    </a>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Report Data</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[200px]">
                    {JSON.stringify(selectedReport.report_data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
