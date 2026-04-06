import { useState } from 'react';
import { ProductIdentityCard } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Fingerprint, ChevronDown, Package, Shapes } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ProductIdentityPanelProps {
  identity: ProductIdentityCard;
}

export function ProductIdentityPanel({ identity }: ProductIdentityPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Card className="glass-card border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="p-4 pb-0">
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              Product Identity
            </CardTitle>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-4 pt-3 space-y-3">
            {/* Brand & Product */}
            <div>
              <p className="text-sm font-bold text-foreground">{identity.brandName}</p>
              <p className="text-xs text-muted-foreground">{identity.productName}</p>
            </div>

            {/* Color Swatches */}
            {identity.dominantColors?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Dominant Colors</p>
                <TooltipProvider>
                  <div className="flex gap-1.5 flex-wrap">
                    {identity.dominantColors.map((color, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger>
                          <div
                            className="w-6 h-6 rounded-full border border-white/10 shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {color}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
            )}

            {/* Packaging & Shape */}
            <div className="flex flex-wrap gap-1.5">
              {identity.packagingType && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Package className="h-3 w-3" />
                  {identity.packagingType}
                </Badge>
              )}
              {identity.shapeDescription && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Shapes className="h-3 w-3" />
                  {identity.shapeDescription}
                </Badge>
              )}
            </div>

            {/* Label Text */}
            {identity.labelText?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Label Text</p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {identity.labelText.map((text, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {text}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Key Features */}
            {identity.keyVisualFeatures?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Key Features</p>
                <ul className="text-xs text-foreground/80 space-y-0.5 list-disc list-inside">
                  {identity.keyVisualFeatures.map((feature, i) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
