import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  Image as ImageIcon,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Wrench,
  ExternalLink,
  Package,
} from 'lucide-react';

interface MediaImage {
  id: string;
  image_name: string;
  image_type: string;
  image_category: string | null;
  original_image_url: string;
  fixed_image_url: string | null;
  status: string;
  created_at: string;
  session_id: string;
  analysis_result: any;
}

interface SessionInfo {
  id: string;
  listing_title: string | null;
  product_asin: string | null;
  created_at: string;
}

const Media = () => {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSession, setFilterSession] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sessionsRes, imagesRes] = await Promise.all([
        supabase
          .from('enhancement_sessions')
          .select('id, listing_title, product_asin, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('session_images')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (sessionsRes.data) setSessions(sessionsRes.data as SessionInfo[]);
      if (imagesRes.data) setImages(imagesRes.data as MediaImage[]);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load media library', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getSessionTitle = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    return session?.listing_title || session?.product_asin || 'Unknown Session';
  };

  const getSessionLabel = (s: SessionInfo) => {
    const title = (s.listing_title || 'Untitled').substring(0, 25);
    const suffix = s.product_asin || format(new Date(s.created_at), 'MMM d');
    return `${title} · ${suffix}`;
  };

  const filteredImages = images.filter(img => {
    if (filterSession !== 'all' && img.session_id !== filterSession) return false;
    if (filterStatus !== 'all' && img.status !== filterStatus) return false;
    if (filterCategory !== 'all' && img.image_category !== filterCategory) return false;
    if (searchQuery && !img.image_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'fixed': return <Wrench className="h-4 w-4 text-blue-500" />;
      default: return <ImageIcon className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'fixed': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Media Library</h1>
            <p className="text-sm text-muted-foreground">
              Browse all images across your audit sessions.
            </p>
          </div>
          <Badge variant="secondary" className="font-mono">
            {filteredImages.length} images
          </Badge>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-0 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search images..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterSession} onValueChange={setFilterSession}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Sessions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sessions</SelectItem>
              {sessions.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {getSessionLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="PRODUCT_SHOT">Product Shot</SelectItem>
              <SelectItem value="INFOGRAPHIC">Infographic</SelectItem>
              <SelectItem value="LIFESTYLE">Lifestyle</SelectItem>
              <SelectItem value="PACKAGING">Packaging</SelectItem>
              <SelectItem value="SIZE_CHART">Size Chart</SelectItem>
              <SelectItem value="COMPARISON">Comparison</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Image Grid */}
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading media...</div>
        ) : filteredImages.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-primary/30" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No Images Found</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {images.length === 0
                ? 'Import your first Amazon listing to start building your media library.'
                : 'No images match your current filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredImages.map(img => (
              <div
                key={img.id}
                className="group relative rounded-xl overflow-hidden border border-border/50 bg-card hover:border-primary/30 transition-colors"
              >
                <div className="aspect-square">
                  <img
                    src={img.fixed_image_url || img.original_image_url}
                    alt={img.image_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Status badge */}
                <div className="absolute top-1.5 right-1.5">
                  {getStatusIcon(img.status)}
                </div>

                {/* Type badge */}
                <Badge className="absolute top-1.5 left-1.5 text-[9px] px-1 py-0 bg-black/60 text-white border-0">
                  {img.image_type}
                </Badge>

                {/* Bottom info */}
                <div className="p-2 space-y-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {img.image_category || img.image_name}
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-[9px] ${getStatusColor(img.status)}`}>
                      {img.status}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">
                      {formatDistanceToNow(new Date(img.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {getSessionTitle(img.session_id)}
                  </p>
                </div>

                {/* Fixed overlay */}
                {img.fixed_image_url && (
                  <div className="absolute top-8 right-1.5">
                    <Badge className="text-[8px] bg-blue-500/80 text-white border-0 px-1 py-0">
                      FIXED
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Media;
