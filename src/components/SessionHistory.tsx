import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  History, 
  RefreshCw, 
  Trash2, 
  ExternalLink, 
  Image as ImageIcon, 
  CheckCircle2, 
  XCircle, 
  Wrench,
  ChevronRight,
  Package
} from 'lucide-react';

interface SessionImage {
  id: string;
  image_name: string;
  image_type: string;
  image_category: string | null;
  original_image_url: string;
  fixed_image_url: string | null;
  status: string;
  analysis_result: {
    overallScore?: number;
    status?: string;
    violations?: Array<{ severity: string; message: string }>;
  } | null;
}

interface EnhancementSession {
  id: string;
  amazon_url: string | null;
  product_asin: string | null;
  listing_title: string | null;
  total_images: number;
  passed_count: number;
  failed_count: number;
  fixed_count: number;
  average_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SessionHistoryProps {
  currentSessionId?: string;
  onLoadSession?: (session: EnhancementSession, images: SessionImage[]) => void;
}

export function SessionHistory({ currentSessionId, onLoadSession }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<EnhancementSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<EnhancementSession | null>(null);
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([]);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const { toast } = useToast();

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('enhancement_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSessions((data as EnhancementSession[]) || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load session history',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessionImages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('session_images')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setSessionImages((data as SessionImage[]) || []);
    } catch (error) {
      console.error('Error fetching session images:', error);
    }
  };

  const handleViewSession = async (session: EnhancementSession) => {
    setSelectedSession(session);
    await fetchSessionImages(session.id);
    setShowDetailDialog(true);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('enhancement_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({ title: 'Deleted', description: 'Session removed from history' });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete session',
        variant: 'destructive'
      });
    }
  };

  const handleLoadSession = () => {
    if (selectedSession && onLoadSession) {
      onLoadSession(selectedSession, sessionImages);
      setShowDetailDialog(false);
      toast({ title: 'Session Loaded', description: 'You can continue working on this session' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'in_progress': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'archived': return 'bg-muted text-muted-foreground border-muted';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getImageStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'fixed': return <Wrench className="h-4 w-4 text-blue-500" />;
      default: return <ImageIcon className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Session History</CardTitle>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={fetchSessions}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <CardDescription>Browse and continue past enhancement sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No sessions yet</p>
                <p className="text-xs mt-1">Import from Amazon to start</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleViewSession(session)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-accent/50 ${
                      session.id === currentSessionId ? 'border-primary bg-primary/5' : 'border-border/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={getStatusColor(session.status)}>
                            {session.status.replace('_', ' ')}
                          </Badge>
                          {session.product_asin && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {session.product_asin}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">
                          {session.listing_title || 'Untitled Session'}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{session.total_images} images</span>
                          <span className="text-green-500">✓ {session.passed_count}</span>
                          <span className="text-red-500">✗ {session.failed_count}</span>
                          {session.fixed_count > 0 && (
                            <span className="text-blue-500">⚡ {session.fixed_count} fixed</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-lg font-bold ${getScoreColor(session.average_score)}`}>
                          {session.average_score !== null ? `${Math.round(session.average_score)}%` : '-'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Session Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Session Details
            </DialogTitle>
            <DialogDescription>
              {selectedSession?.listing_title || 'Enhancement Session'}
            </DialogDescription>
          </DialogHeader>

          {selectedSession && (
            <div className="flex-1 overflow-auto">
              {/* Session Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">ASIN</p>
                  <p className="font-mono text-sm">{selectedSession.product_asin || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                  <p className={`font-bold ${getScoreColor(selectedSession.average_score)}`}>
                    {selectedSession.average_score !== null ? `${Math.round(selectedSession.average_score)}%` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">{format(new Date(selectedSession.created_at), 'MMM d, yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={getStatusColor(selectedSession.status)}>
                    {selectedSession.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              {selectedSession.amazon_url && (
                <a 
                  href={selectedSession.amazon_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
                >
                  View on Amazon <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Images Grid */}
              <h4 className="font-medium mb-3">Images ({sessionImages.length})</h4>
              {sessionImages.length === 0 ? (
                <p className="text-muted-foreground text-sm">No images in this session</p>
              ) : (
                <Accordion type="single" collapsible className="space-y-2">
                  {sessionImages.map((img, index) => (
                    <AccordionItem key={img.id} value={img.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 w-full">
                          <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                            <img 
                              src={img.original_image_url} 
                              alt={img.image_name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              {getImageStatusIcon(img.status)}
                              <span className="font-medium text-sm">{img.image_name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {img.image_type}
                              </Badge>
                            </div>
                            {img.analysis_result?.overallScore !== undefined && (
                              <p className={`text-sm ${getScoreColor(img.analysis_result.overallScore)}`}>
                                Score: {img.analysis_result.overallScore}%
                              </p>
                            )}
                          </div>
                          {img.fixed_image_url && (
                            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                              Fixed
                            </Badge>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-4 py-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Original</p>
                            <img 
                              src={img.original_image_url}
                              alt="Original"
                              className="w-full rounded-lg border"
                            />
                          </div>
                          {img.fixed_image_url && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">AI Fixed</p>
                              <img 
                                src={img.fixed_image_url}
                                alt="Fixed"
                                className="w-full rounded-lg border"
                              />
                            </div>
                          )}
                        </div>
                        {img.analysis_result?.violations && img.analysis_result.violations.length > 0 && (
                          <div className="mt-2 p-3 bg-muted/50 rounded">
                            <p className="text-xs font-medium mb-2">Violations</p>
                            <ul className="text-xs space-y-1">
                              {img.analysis_result.violations.slice(0, 5).map((v, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className={
                                    v.severity === 'critical' ? 'text-red-500' : 
                                    v.severity === 'warning' ? 'text-yellow-500' : 'text-muted-foreground'
                                  }>
                                    {v.severity === 'critical' ? '●' : v.severity === 'warning' ? '○' : '·'}
                                  </span>
                                  {v.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-6 pt-4 border-t">
                {onLoadSession && (
                  <Button onClick={handleLoadSession} className="flex-1">
                    Continue This Session
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  onClick={() => setShowDetailDialog(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
