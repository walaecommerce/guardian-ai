import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Loader2, Crop, Star, GripVertical } from 'lucide-react';
import { ImageAsset } from '@/types';

interface SortableImageCardProps {
  asset: ImageAsset;
  index: number;
  onRemove: (id: string) => void;
  onCrop: (asset: ImageAsset) => void;
  isOverlay?: boolean;
}

const getCategoryColor = (category: string | null) => {
  switch (category) {
    case 'PRODUCT_SHOT': return 'bg-emerald-500 text-white';
    case 'INFOGRAPHIC': return 'bg-blue-500 text-white';
    case 'LIFESTYLE': return 'bg-green-500 text-white';
    case 'PRODUCT_IN_USE': return 'bg-purple-500 text-white';
    case 'SIZE_CHART': return 'bg-orange-500 text-white';
    case 'COMPARISON': return 'bg-yellow-500 text-black';
    case 'PACKAGING': return 'bg-pink-500 text-white';
    case 'DETAIL': return 'bg-cyan-500 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
};

const formatCategory = (category: string | null) => {
  if (!category) return null;
  return category.replace(/_/g, ' ').split(' ').map(w => 
    w.charAt(0) + w.slice(1).toLowerCase()
  ).join(' ');
};

const getOrdinalSuffix = (n: number) => {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
};

export function SortableImageCard({ asset, index, onRemove, onCrop, isOverlay = false }: SortableImageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: asset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  // Extract category from asset name (format: CATEGORY_filename)
  const categoryMatch = asset.name.match(/^(PRODUCT_SHOT|INFOGRAPHIC|LIFESTYLE|PRODUCT_IN_USE|SIZE_CHART|COMPARISON|PACKAGING|DETAIL|UNKNOWN)_/);
  const imageCategory = categoryMatch ? categoryMatch[1] : null;
  
  // Check if this is the landing position (first image in listing)
  const isLandingPosition = asset.type === 'MAIN';
  const position = index + 1;

  // If this is a drag overlay, render a simplified version
  if (isOverlay) {
    return (
      <div className="aspect-square rounded-lg overflow-hidden border-2 border-primary bg-muted shadow-2xl scale-105 rotate-3">
        <img
          src={asset.preview}
          alt={asset.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/10" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group aspect-square rounded-lg overflow-hidden border-2 bg-muted transition-all ${
        isLandingPosition 
          ? 'border-amber-400 ring-2 ring-amber-400/30' 
          : 'border-border'
      } ${isDragging ? 'opacity-40 scale-95' : ''} ${isOver && !isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      {/* Drop indicator overlay */}
      {isOver && !isDragging && (
        <div className="absolute inset-0 bg-primary/20 z-10 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/40 flex items-center justify-center animate-pulse">
            <div className="w-4 h-4 rounded-full bg-primary" />
          </div>
        </div>
      )}
      
      <img
        src={asset.preview}
        alt={asset.name}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="w-5 h-5 text-foreground" />
      </button>
      
      {/* Landing Position Indicator */}
      {isLandingPosition && (
        <div className="absolute -top-1 -left-1 w-6 h-6 bg-amber-400 rounded-br-lg flex items-center justify-center shadow-md" title="Landing Position (First Image)">
          <Star className="w-3.5 h-3.5 text-amber-900 fill-amber-900" />
        </div>
      )}
      
      {/* Position Badge (1st, 2nd, 3rd, etc.) */}
      <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
        isLandingPosition 
          ? 'bg-amber-400 text-amber-900' 
          : 'bg-muted-foreground/80 text-background'
      }`}>
        {isLandingPosition ? '1st • Landing' : `${position}${getOrdinalSuffix(position)}`}
      </div>

      {/* AI Category Badge */}
      {imageCategory && (
        <div className={`absolute top-2 right-8 px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryColor(imageCategory)}`}>
          {formatCategory(imageCategory)}
        </div>
      )}

      {/* Remove Button */}
      <button
        onClick={() => onRemove(asset.id)}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Analysis Status */}
      {asset.isAnalyzing && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Crop Button */}
      <button
        onClick={() => onCrop(asset)}
        className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Crop image"
      >
        <Crop className="w-3 h-3" />
      </button>

      {/* Score Badge */}
      {asset.analysisResult && (
        <div className={`
          absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-bold
          ${asset.analysisResult.overallScore >= 85 
            ? 'bg-success text-success-foreground'
            : asset.analysisResult.overallScore >= 70
            ? 'bg-warning text-warning-foreground'
            : 'bg-destructive text-destructive-foreground'
          }
        `}>
          {asset.analysisResult.overallScore}%
        </div>
      )}
    </div>
  );
}
