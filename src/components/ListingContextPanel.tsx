import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tag, FileText, ShoppingBag, ChevronDown, ChevronUp, Brain, ShieldCheck, Package } from 'lucide-react';
import type { ListingContext } from '@/utils/listingContext';
import { deriveProductKnowledge, type ProductKnowledge } from '@/utils/productKnowledge';

interface ListingContextPanelProps {
  context: ListingContext | null;
}

function ProductKnowledgeSection({ pk }: { pk: ProductKnowledge }) {
  if (!pk.isActionable) return null;

  return (
    <div className="space-y-1.5 pt-1.5 border-t border-border/50">
      <div className="flex items-center gap-1.5">
        <Brain className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[10px] text-primary font-semibold uppercase tracking-wider">Derived Knowledge</span>
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 ml-auto">
          {pk.completeness}%
        </Badge>
      </div>

      {/* Identity summary */}
      <p className="text-xs text-foreground font-medium leading-snug">{pk.identitySummary}</p>

      {/* Product type hint */}
      {pk.productTypeHint && (
        <div className="flex items-center gap-1.5">
          <Package className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground">Type: <span className="font-medium text-foreground/80">{pk.productTypeHint.replace(/_/g, ' ')}</span></span>
        </div>
      )}

      {/* Allowed text cues */}
      {pk.allowedTextCues.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Allowed packaging text:</span>
          <div className="flex flex-wrap gap-1">
            {pk.allowedTextCues.slice(0, 6).map((cue, i) => (
              <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400">
                <ShieldCheck className="h-2 w-2 mr-0.5" />
                {cue}
              </Badge>
            ))}
            {pk.allowedTextCues.length > 6 && (
              <span className="text-[9px] text-muted-foreground">+{pk.allowedTextCues.length - 6}</span>
            )}
          </div>
        </div>
      )}

      {/* Supported claims */}
      {pk.supportedClaims.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Supported claims:</span>
          <div className="flex flex-wrap gap-1">
            {pk.supportedClaims.slice(0, 5).map((claim, i) => (
              <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                <Tag className="h-2 w-2 mr-0.5" />
                {claim}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Key attributes */}
      {pk.attributeHints.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Key attributes:</span>
          <ul className="text-[10px] text-muted-foreground space-y-0">
            {pk.attributeHints.slice(0, 4).map((hint, i) => (
              <li key={i} className="truncate">• {hint}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ListingContextPanel({ context }: ListingContextPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!context || (!context.brand && context.bullets.length === 0 && !context.description && context.claims.length === 0)) {
    return null;
  }

  const pk = deriveProductKnowledge(context);

  return (
    <Card className="border-border/50 bg-muted/30">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="py-2 px-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3 w-3" />
              Listing Context
              {pk.isActionable && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 ml-1 bg-primary/10 border-primary/30 text-primary">
                  <Brain className="h-2 w-2 mr-0.5" />
                  Knowledge Active
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              {context.brand && (
                <span className="text-[10px] text-foreground/70 font-medium mr-1">{context.brand}</span>
              )}
              {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
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

            {/* Derived Product Knowledge */}
            <ProductKnowledgeSection pk={pk} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
