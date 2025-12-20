import { useEffect, useRef } from 'react';
import { LogEntry } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Terminal } from 'lucide-react';

interface ActivityLogProps {
  logs: LogEntry[];
}

export function ActivityLog({ logs }: ActivityLogProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return 'text-success';
      case 'warning':
        return 'text-warning';
      case 'error':
        return 'text-destructive';
      case 'processing':
        return 'text-primary';
      default:
        return 'text-terminal-foreground';
    }
  };

  const getLevelPrefix = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'error':
        return '✗';
      case 'processing':
        return '⟳';
      default:
        return '›';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={logRef}
          className="terminal-log h-48 overflow-y-auto"
        >
          {logs.length === 0 ? (
            <p className="text-muted-foreground opacity-50">
              Waiting for activity...
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 mb-1 animate-fade-in"
              >
                <span className="text-muted-foreground/60 shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={`shrink-0 ${getLevelColor(log.level)}`}>
                  {getLevelPrefix(log.level)}
                </span>
                <span className={getLevelColor(log.level)}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
