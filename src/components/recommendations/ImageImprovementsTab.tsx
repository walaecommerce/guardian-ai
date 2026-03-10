import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, Image as ImageIcon } from 'lucide-react';
import { ImageImprovement } from './types';
import { ImageAsset } from '@/types';

interface Props {
  items: ImageImprovement[];
  assets: ImageAsset[];
  onApplyFix?: (assetId: string, prompt: string) => void;
}

export function ImageImprovementsTab({ items, assets, onApplyFix }: Props) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">✅ No image-specific improvements needed!</p>;
  }

  // Try to match improvement to an asset by type
  const findAsset = (imageType: string) => {
    const lower = imageType.toLowerCase();
    return assets.find(a => a.name.toLowerCase().includes(lower));
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const matchedAsset = findAsset(item.image_type);
        return (
          <Card key={i}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-3">
                {matchedAsset ? (
                  <img src={matchedAsset.preview} alt={item.image_type} className="w-16 h-16 object-cover rounded border shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.image_type.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-start gap-1.5">
                      <Badge variant="destructive" className="text-[10px] shrink-0 mt-0.5">Issue</Badge>
                      <p className="text-xs">{item.current_issue}</p>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Badge variant="default" className="text-[10px] shrink-0 mt-0.5 bg-green-600">Fix</Badge>
                      <p className="text-xs text-muted-foreground">{item.specific_recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
              {matchedAsset && onApplyFix && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onApplyFix(matchedAsset.id, item.example_prompt_for_ai_generation)}
                >
                  <Wand2 className="w-3 h-3 mr-1" /> Apply Fix with AI
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
