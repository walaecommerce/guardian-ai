import { useState } from 'react';
import { LogEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronUp, ChevronDown, Terminal, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function ActivityPanel({ logs, onClear }: ActivityPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  if (logs.length === 0) return null;

  const lastLog = logs[logs.length - 1];

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return 'text-success';
      case 'error': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'processing': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  if (minimized) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <button
          onClick={() => setMinimized(false)}
          className="mx-auto flex items-center gap-2 px-4 py-1.5 bg-card border border-b-0 border-border rounded-t-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
          style={{ marginLeft: '280px' }}
        >
          <Terminal className="w-3 h-3" />
          Activity Log ({logs.length})
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      'fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border transition-all duration-200',
      expanded ? 'h-72' : 'h-10'
    )} style={{ marginLeft: '0' }}>
      {/* Header bar - always visible */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-border cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{logs.length}</Badge>
          {!expanded && lastLog && (
            <p className={cn('text-xs truncate', getLevelColor(lastLog.level))}>
              {lastLog.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onClear(); }}>
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setMinimized(true); }}>
            <X className="w-3 h-3" />
          </Button>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Log entries */}
      {expanded && (
        <ScrollArea className="h-[calc(100%-2.5rem)]">
          <div className="p-2 space-y-0.5 font-mono text-xs">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2 px-2 py-0.5 rounded hover:bg-muted/30">
                <span className="text-muted-foreground/50 shrink-0 w-16">
                  {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={cn('break-all', getLevelColor(log.level))}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
