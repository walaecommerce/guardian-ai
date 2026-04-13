import { Brain, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { ProductKnowledge } from '@/utils/productKnowledge';

interface KnowledgeInfluenceNoteProps {
  pk: ProductKnowledge | null;
  compact?: boolean;
}

/**
 * Compact note showing when product knowledge influenced audit/fix reasoning.
 */
export function KnowledgeInfluenceNote({ pk, compact = false }: KnowledgeInfluenceNoteProps) {
  if (!pk || !pk.isActionable) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-primary/80">
        <Brain className="w-2.5 h-2.5" />
        Knowledge-guided
      </span>
    );
  }

  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground">
      <Brain className="w-3 h-3 text-primary shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <span className="font-medium text-foreground/80">Product knowledge active</span>
        <p className="leading-snug">
          Using listing context to distinguish legitimate packaging text from overlays.
          {pk.brand && <> Brand "<span className="font-medium">{pk.brand}</span>" text treated as legitimate.</>}
          {pk.supportedClaims.length > 0 && <> {pk.supportedClaims.length} supported claim{pk.supportedClaims.length > 1 ? 's' : ''} recognized.</>}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact fix/enhance preservation note.
 */
export function KnowledgePreservationNote({ pk }: { pk: ProductKnowledge | null }) {
  if (!pk || !pk.isActionable) return null;

  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground">
      <ShieldCheck className="w-3 h-3 text-primary shrink-0 mt-0.5" />
      <span>
        Preserving {pk.brand ? `brand "${pk.brand}", ` : ''}{pk.supportedClaims.length > 0 ? `${pk.supportedClaims.length} valid claims, ` : ''}product identity via listing context.
      </span>
    </div>
  );
}
