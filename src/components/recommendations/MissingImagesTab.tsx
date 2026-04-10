import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Loader2, ChevronDown, ChevronUp, Download, Sparkles } from 'lucide-react';
import { MissingImageType } from './types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const priorityStyles: Record<string, string> = {
  HIGH: 'bg-destructive/15 text-destructive border-destructive/30',
  MEDIUM: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  LOW: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
};

interface Props {
  items: MissingImageType[];
  onImageGenerated?: (imageUrl: string, imageType: string) => void;
  listingTitle?: string;
  category?: string;
}

export function MissingImagesTab({ items, onImageGenerated, listingTitle, category }: Props) {
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleGenerate = async (type: string, prompt: string) => {
    setGeneratingImage(type);
    try {
      const finalPrompt = customPrompts[type] || prompt;
      const { data, error } = await supabase.functions.invoke('generate-suggested-image', {
        body: { prompt: finalPrompt, imageType: type, productName: listingTitle, category },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.imageUrl) {
        setGeneratedImages(prev => ({ ...prev, [type]: data.imageUrl }));
        onImageGenerated?.(data.imageUrl, type);
        toast({ title: 'Image Generated', description: `${type} image created` });
      }
    } catch (e) {
      toast({ title: 'Generation Failed', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' });
    } finally {
      setGeneratingImage(null);
    }
  };

  const downloadImage = (url: string, type: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `guardian-${type.toLowerCase()}-${Date.now()}.png`;
    link.click();
  };

  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">✅ All recommended image types are present!</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <Card key={i} className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{item.type.replace(/_/g, ' ')}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityStyles[item.priority]}`}>
                    {item.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.why_it_matters}</p>
                <p className="text-xs text-primary/80 font-medium">
                  Impact: {item.estimated_conversion_impact}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => setEditingPrompt(editingPrompt === item.type ? null : item.type)}
              >
                {editingPrompt === item.type ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {editingPrompt === item.type ? 'Hide' : 'Edit'} prompt
              </button>
              {editingPrompt === item.type && (
                <Textarea
                  className="text-xs min-h-[80px]"
                  value={customPrompts[item.type] ?? item.generation_prompt}
                  onChange={e => setCustomPrompts(prev => ({ ...prev, [item.type]: e.target.value }))}
                />
              )}
            </div>

            {generatedImages[item.type] && (
              <div className="space-y-2">
                <img src={generatedImages[item.type]} alt={`Generated ${item.type}`} className="w-full max-h-48 object-contain rounded-md border" />
                <Button variant="outline" size="sm" className="w-full" onClick={() => downloadImage(generatedImages[item.type], item.type)}>
                  <Download className="w-3 h-3 mr-1" /> Download
                </Button>
              </div>
            )}

            <Button size="sm" className="w-full" disabled={generatingImage === item.type} onClick={() => handleGenerate(item.type, item.generation_prompt)}>
              {generatingImage === item.type ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Generating...</>
              ) : generatedImages[item.type] ? (
                <><Sparkles className="w-3 h-3 mr-1" /> Regenerate</>
              ) : (
                <><ImagePlus className="w-3 h-3 mr-1" /> Generate This Image</>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
