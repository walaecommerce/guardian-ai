import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tag, FileText, ShoppingBag } from 'lucide-react';
import type { ListingContext } from '@/utils/listingContext';

interface ListingContextPanelProps {
  context: ListingContext | null;
}

export function ListingContextPanel({ context }: ListingContextPanelProps) {
  if (!context || (!context.brand && context.bullets.length === 0 && !context.description && context.claims.length === 0)) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-muted/30">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <FileText className="h-3 w-3" />
          Listing Context
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-1.5">
        {context.brand && (
          <div className="flex items-center gap-1.5">
            <ShoppingBag className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground font-medium">{context.brand}</span>
          </div>
        )}

        {context.bullets.length > 0 && (
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bullets</span>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {context.bullets.slice(0, 5).map((b, i) => (
                <li key={i} className="truncate">• {b}</li>
              ))}
              {context.bullets.length > 5 && (
                <li className="text-[10px] italic">+{context.bullets.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        {context.claims.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {context.claims.slice(0, 6).map((claim, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                <Tag className="h-2.5 w-2.5 mr-0.5" />
                {claim}
              </Badge>
            ))}
          </div>
        )}

        {context.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 italic">
            {context.description.substring(0, 200)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
