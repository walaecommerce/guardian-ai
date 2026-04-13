import { useState } from 'react';
import { ProductIdentityCard } from '@/types';
import { MultiImageIdentityProfile } from '@/utils/identityProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Fingerprint, ChevronDown, Package, Shapes, AlertTriangle, CheckCircle2, Images } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ProductIdentityPanelProps {
  identity: ProductIdentityCard;
  profile?: MultiImageIdentityProfile | null;
}

export function ProductIdentityPanel({ identity, profile }: ProductIdentityPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const hasConflicts = profile && profile.conflicts.length > 0;
  const sourceCount = profile?.sourceImageIds.length || 1;

  return (
    <Card className="glass-card border-primary/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="p-4 pb-0">
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              Product Identity
              {profile && (
                <Badge variant="secondary" className="text-[10px] h-4 gap-0.5">
                  <Images className="h-2.5 w-2.5" />
                  {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-4 pt-3 space-y-3">
            {/* Confidence/Completeness bar */}
            {profile && (
              <div className="flex items-center gap-2 text-[10px]">
                {hasConflicts ? (
                  <Badge variant="outline" className="text-[10px] gap-0.5 text-warning border-warning/30">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {profile.conflicts.length} conflict{profile.conflicts.length !== 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-0.5 text-success border-success/30">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Consistent
                  </Badge>
                )}
                <span className="text-muted-foreground">{profile.completeness}% complete</span>
              </div>
            )}

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
                            className="w-6 h-6 rounded-full border border-border shadow-sm"
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

            {/* Conflict details */}
            {hasConflicts && (
              <div className="border-t border-border pt-2">
                <p className="text-[10px] text-warning mb-1">Conflicts detected:</p>
                {profile!.conflicts.map((c, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground">• {c}</p>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
