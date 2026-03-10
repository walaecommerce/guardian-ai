import { useEffect, useRef, useState } from 'react';
import { LogEntry } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Terminal, Trash2 } from 'lucide-react';

interface ActivityLogProps {
  logs: LogEntry[];
  onClear?: () => void;
}

export function ActivityLog({ logs, onClear }: ActivityLogProps) {
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

  const getMessageColor = (message: string, level: LogEntry['level']) => {
    const upper = message.toUpperCase();
    if (upper.includes('PASS') || upper.includes('✅') || level === 'success') return 'text-green-400';
    if (upper.includes('CRITICAL') || upper.includes('FAIL') || upper.includes('✗') || level === 'error') return 'text-red-400';
    if (upper.includes('WARNING') || upper.includes('RETRY') || upper.includes('⚠') || level === 'warning') return 'text-yellow-400';
    return 'text-gray-300';
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            Activity Log
          </CardTitle>
          {onClear && logs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={logRef}
          className="rounded-lg p-3 font-mono text-sm max-h-[300px] overflow-y-auto"
          style={{ backgroundColor: '#0d1117' }}
        >
          {logs.length === 0 ? (
            <p className="text-gray-500 opacity-50">
              Waiting for activity...
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 mb-1 animate-fade-in"
              >
                <span className="text-gray-500 shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={getMessageColor(log.message, log.level)}>
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
