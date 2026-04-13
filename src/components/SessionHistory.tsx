import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { getSessionActionLabel, humanizeSessionStatus, isStudioSession } from '@/utils/sessionHelpers';
import { formatContentType, inferCurrentStep } from '@/utils/sessionResume';
import {
  History,
  RefreshCw,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Wrench,
  Package,
  ArrowRight,
  Sparkles,
  Eye,
  Crown,
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
  skipped_count: number;
  unresolved_count: number;
  average_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  product_identity?: { origin?: string; [key: string]: any } | null;
}

interface SessionHistoryProps {
  currentSessionId?: string;
  onLoadSession?: (session: EnhancementSession, images: SessionImage[]) => void;
}

// Step badge styling
function getStepBadge(step: string) {
  const styles: Record<string, string> = {
    import: 'bg-muted text-muted-foreground',
    audit: 'bg-primary/10 text-primary border-primary/20',
    fix: 'bg-destructive/10 text-destructive border-destructive/20',
    review: 'bg-success/10 text-success border-success/20',
  };
  return styles[step] || 'bg-muted text-muted-foreground';
}

export function SessionHistory({ currentSessionId, onLoadSession }: SessionHistoryProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<EnhancementSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<EnhancementSession | null>(null);
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([]);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  // Thumbnail cache: sessionId → first N images
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, SessionImage[]>>(new Map());
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
      const sessionList = (data as EnhancementSession[]) || [];
      setSessions(sessionList);

      // Eagerly fetch thumbnails for all sessions (max 5 images each)
      if (sessionList.length > 0) {
        const sessionIds = sessionList.map(s => s.id);
        const { data: imgData } = await supabase
          .from('session_images')
          .select('id, session_id, image_name, image_type, image_category, original_image_url, fixed_image_url, status, analysis_result')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: true });

        if (imgData) {
          const cache = new Map<string, SessionImage[]>();
          for (const img of imgData as (SessionImage & { session_id: string })[]) {
            const sid = (img as any).session_id;
            const existing = cache.get(sid) || [];
            if (existing.length < 5) {
              existing.push(img);
              cache.set(sid, existing);
            }
          }
          setThumbnailCache(cache);
        }
      }
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

  const handleViewDetails = async (session: EnhancementSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSession(session);
    await fetchSessionImages(session.id);
    setShowDetailDialog(true);
  };

  const handleContinueWorking = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/audit?session=${sessionId}`);
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
      setThumbnailCache(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      toast({ title: 'Deleted', description: 'Session removed' });
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Error', description: 'Failed to delete session', variant: 'destructive' });
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getImageStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case 'failed': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case 'fixed': return <Wrench className="h-3.5 w-3.5 text-primary" />;
      default: return <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />;
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
          <CardDescription>Resume work, review results, or export reports</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 && !isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Package className="w-8 h-8 text-primary/30" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">No Sessions Yet</h3>
              <p className="text-sm max-w-xs mx-auto">Start a new audit from the Dashboard or paste an Amazon URL on the Audit page.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const thumbs = thumbnailCache.get(session.id) || [];
                const heroThumb = thumbs.find(t => t.image_type === 'MAIN') || thumbs[0];
                const supportThumbs = thumbs.filter(t => t !== heroThumb).slice(0, 3);
                const step = inferCurrentStep({ ...session, skipped_count: session.skipped_count || 0 });

                return (
                  <div
                    key={session.id}
                    className={`rounded-xl border transition-all hover:shadow-md ${
                      session.id === currentSessionId
                        ? 'border-primary bg-primary/5'
                        : 'border-border/50 hover:border-border'
                    }`}
                  >
                    <div className="p-4 flex gap-4">
                      {/* Thumbnail column */}
                      <div className="flex-shrink-0 flex gap-1.5">
                        {heroThumb ? (
                          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-muted border border-border/50">
                            <img
                              src={heroThumb.original_image_url}
                              alt={heroThumb.image_name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute top-0.5 left-0.5">
                              <Crown className="w-3 h-3 text-primary drop-shadow-sm" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-muted border border-border/50 flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground/30" />
                          </div>
                        )}
                        {supportThumbs.length > 0 && (
                          <div className="hidden sm:flex flex-col gap-1">
                            {supportThumbs.map((t) => (
                              <div
                                key={t.id}
                                className="w-6 h-6 rounded overflow-hidden bg-muted border border-border/30"
                              >
                                <img
                                  src={t.original_image_url}
                                  alt={t.image_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Info column */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${getStepBadge(step)}`}>
                            {step.charAt(0).toUpperCase() + step.slice(1)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-5 px-1.5 ${
                              session.status === 'completed'
                                ? 'bg-success/10 text-success border-success/20'
                                : 'bg-warning/10 text-warning border-warning/20'
                            }`}
                          >
                            {humanizeSessionStatus(session.status)}
                          </Badge>
                          {isStudioSession(session.product_identity) && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] h-5 px-1.5">
                              <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Studio
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-foreground truncate leading-snug">
                          {session.listing_title || 'Untitled Session'}
                        </p>

                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          {session.product_asin && (
                            <span className="font-mono">{session.product_asin}</span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <ImageIcon className="w-3 h-3" /> {session.total_images}
                          </span>
                          {session.passed_count > 0 && (
                            <span className="text-success">✓{session.passed_count}</span>
                          )}
                          {((session.failed_count - session.fixed_count - (session.unresolved_count || 0)) > 0) && (
                            <span className="text-destructive">✗{session.failed_count - session.fixed_count - (session.unresolved_count || 0)}</span>
                          )}
                          {(session.unresolved_count || 0) > 0 && (
                            <span className="text-warning">⚠{session.unresolved_count}</span>
                          )}
                          {session.fixed_count > 0 && (
                            <span className="text-primary">⚡{session.fixed_count}</span>
                          )}
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(session.updated_at || session.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>

                      {/* Score + Actions column */}
                      <div className="flex flex-col items-end justify-between shrink-0">
                        <span className={`text-xl font-bold tabular-nums ${getScoreColor(session.average_score)}`}>
                          {session.average_score !== null ? `${Math.round(session.average_score)}%` : '—'}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                          <Button
                            size="sm"
                            className="h-7 text-xs px-3"
                            onClick={(e) => handleContinueWorking(session.id, e)}
                          >
                            <ArrowRight className="w-3 h-3 mr-1" />
                            Continue Working
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleViewDetails(session, e)}
                          >
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedSession?.listing_title || 'Session Details'}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {selectedSession?.product_asin && (
                <span className="font-mono">{selectedSession.product_asin}</span>
              )}
              {selectedSession && (
                <>
                  <span>·</span>
                  <span>{format(new Date(selectedSession.created_at), 'MMM d, yyyy HH:mm')}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedSession && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Stats row */}
              <div className={`grid grid-cols-2 sm:grid-cols-${3 + (selectedSession.fixed_count > 0 ? 1 : 0) + ((selectedSession.unresolved_count || 0) > 0 ? 1 : 0) + 1} gap-3`}>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold tabular-nums text-foreground">{selectedSession.total_images}</p>
                  <p className="text-xs text-muted-foreground">Images</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className={`text-2xl font-bold tabular-nums ${getScoreColor(selectedSession.average_score)}`}>
                    {selectedSession.average_score !== null ? `${Math.round(selectedSession.average_score)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold tabular-nums text-success">{selectedSession.passed_count}</p>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold tabular-nums text-destructive">{Math.max(0, selectedSession.failed_count - selectedSession.fixed_count - (selectedSession.unresolved_count || 0))}</p>
                  <p className="text-xs text-muted-foreground">Unfixed</p>
                </div>
                {selectedSession.fixed_count > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold tabular-nums text-primary">{selectedSession.fixed_count}</p>
                    <p className="text-xs text-muted-foreground">Fixed</p>
                  </div>
                )}
                {(selectedSession.unresolved_count || 0) > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold tabular-nums text-warning">{selectedSession.unresolved_count}</p>
                    <p className="text-xs text-muted-foreground">Needs Review</p>
                  </div>
                )}
              </div>

              {selectedSession.amazon_url && (
                <a
                  href={selectedSession.amazon_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View on Amazon <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Visual image grid */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Images ({sessionImages.length})</h4>
                {sessionImages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No images recorded for this session</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {sessionImages.map((img) => (
                      <div key={img.id} className="group relative rounded-lg border border-border/50 overflow-hidden bg-muted">
                        <div className="aspect-square">
                          <img
                            src={img.fixed_image_url || img.original_image_url}
                            alt={img.image_name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        {/* Overlay badges */}
                        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                          {img.image_type === 'MAIN' && (
                            <Badge variant="default" className="text-[9px] h-4 px-1 shadow-sm">
                              <Crown className="w-2.5 h-2.5 mr-0.5" /> Hero
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[9px] h-4 px-1 shadow-sm bg-background/80 backdrop-blur-sm">
                            {formatContentType(img.image_category)}
                          </Badge>
                        </div>
                        <div className="absolute top-1.5 right-1.5">
                          {getImageStatusIcon(img.status)}
                        </div>
                        {img.fixed_image_url && (
                          <div className="absolute bottom-1.5 right-1.5">
                            <Badge className="text-[9px] h-4 px-1 bg-primary/90 text-primary-foreground shadow-sm">Fixed</Badge>
                          </div>
                        )}
                        {/* Score overlay */}
                        {img.analysis_result?.overallScore !== undefined && (
                          <div className="absolute bottom-1.5 left-1.5">
                            <span className={`text-xs font-bold tabular-nums drop-shadow-sm ${getScoreColor(img.analysis_result.overallScore)}`}>
                              {img.analysis_result.overallScore}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  onClick={() => {
                    setShowDetailDialog(false);
                    navigate(`/audit?session=${selectedSession.id}`);
                  }}
                  className="flex-1"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {getSessionActionLabel(selectedSession)}
                </Button>
                {selectedSession.amazon_url && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={selectedSession.amazon_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
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
