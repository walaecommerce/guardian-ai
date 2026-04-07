import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, BarChart3, Sparkles, Clock, ArrowRight, Plus, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface RecentSession {
  id: string;
  listing_title: string | null;
  average_score: number | null;
  total_images: number;
  status: string;
  created_at: string;
}

const QUICK_ACTIONS = [
  { title: 'New Audit', description: 'Analyze product images for compliance', icon: Search, to: '/audit', color: 'text-primary' },
  { title: 'Campaign Audit', description: 'Audit multiple listings at once', icon: BarChart3, to: '/campaign', color: 'text-violet-400' },
  { title: 'Open Studio', description: 'Generate & enhance product images', icon: Sparkles, to: '/studio', color: 'text-amber-400' },
];

const CREDIT_TYPES = [
  { type: 'scrape' as const, label: 'Scrape', icon: Search },
  { type: 'analyze' as const, label: 'Analyze', icon: BarChart3 },
  { type: 'fix' as const, label: 'Fix', icon: Sparkles },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { remainingCredits, totalCredits, loading: creditsLoading } = useCredits();
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('enhancement_sessions')
        .select('id, listing_title, average_score, total_images, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      setSessions(data || []);
      setLoading(false);
    })();
  }, [user]);

  const getScoreColor = (s: number) => {
    if (s >= 85) return 'text-success';
    if (s >= 70) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor your listing health and jump into actions.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUICK_ACTIONS.map(action => (
          <Link key={action.to} to={action.to}>
            <Card className="border-border/50 hover:border-primary/30 hover:bg-muted/30 transition-all cursor-pointer group">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/15">
                  <action.icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sessions */}
        <div className="lg:col-span-2">
          <Card className="border-border/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Recent Sessions
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                <Link to="/sessions">View All <ArrowRight className="w-3 h-3 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-muted-foreground">No sessions yet.</p>
                  <Button asChild size="sm">
                    <Link to="/audit"><Plus className="w-3.5 h-3.5 mr-1" /> Start Your First Audit</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map(s => (
                    <Link
                      key={s.id}
                      to={`/session/${s.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {s.listing_title || 'Untitled Session'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.total_images} images · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {s.average_score != null && (
                          <span className={`text-lg font-bold ${getScoreColor(s.average_score)}`}>
                            {Math.round(s.average_score)}%
                          </span>
                        )}
                        <Badge variant={s.status === 'complete' ? 'success' : 'secondary'} className="text-[10px]">
                          {s.status}
                        </Badge>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Credits Summary */}
        <div>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                Credits
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {creditsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                CREDIT_TYPES.map(({ type, label, icon: Icon }) => {
                  const remaining = remainingCredits(type);
                  const total = totalCredits(type);
                  const pct = total > 0 ? (remaining / total) * 100 : 0;
                  const isLow = total > 0 && remaining / total <= 0.2;
                  return (
                    <div key={type} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </span>
                        <span className={`font-semibold ${isLow ? 'text-destructive' : 'text-foreground'}`}>
                          {remaining}/{total}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })
              )}
              <Button asChild variant="outline" size="sm" className="w-full mt-2">
                <Link to="/pricing">View Plans</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
