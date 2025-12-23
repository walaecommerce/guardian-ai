import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface FixActivityLogProps {
  entries: string[];
  className?: string;
}

export function FixActivityLog({ entries, className }: FixActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const getEntryStyle = (entry: string) => {
    if (entry.startsWith('✓') || entry.startsWith('✅') || entry.includes('PASS')) {
      return 'text-success';
    }
    if (entry.startsWith('✗') || entry.startsWith('❌') || entry.includes('FAIL')) {
      return 'text-destructive';
    }
    if (entry.startsWith('⚠️') || entry.includes('Warning')) {
      return 'text-warning';
    }
    if (entry.startsWith('🔍') || entry.startsWith('📊') || entry.startsWith('🔬')) {
      return 'text-primary';
    }
    return 'text-muted-foreground';
  };

  const getPrefix = (entry: string) => {
    if (entry.startsWith('✓') || entry.startsWith('✅')) return '';
    if (entry.startsWith('✗') || entry.startsWith('❌')) return '';
    if (entry.startsWith('⚠️')) return '';
    if (entry.startsWith('🔍') || entry.startsWith('📊') || entry.startsWith('🔬')) return '';
    if (entry.startsWith('→') || entry.startsWith('├') || entry.startsWith('└')) return '';
    return '› ';
  };

  return (
    <div 
      ref={scrollRef}
      className={cn(
        "bg-card/50 backdrop-blur-sm rounded-lg p-3 font-mono text-xs max-h-[200px] overflow-y-auto border border-border/50",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/30">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
          AI Verification Log
        </span>
      </div>
      
      {entries.length === 0 ? (
        <div className="text-muted-foreground/50 italic">
          Waiting for verification to start...
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry, idx) => (
            <div 
              key={idx}
              className={cn(
                "leading-relaxed transition-opacity duration-200",
                getEntryStyle(entry),
                idx === entries.length - 1 && "font-medium"
              )}
            >
              {getPrefix(entry)}{entry}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
