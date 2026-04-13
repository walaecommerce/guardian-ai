import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ImageAsset, AnalysisResult, FixAttempt, ProductIdentityCard } from '@/types';
import { refreshSignedUrl } from '@/services/imageStorage';
import { buildAssetFromSessionImage } from '@/utils/sessionAssetHelpers';
import { reconcileSessionCounts, isSessionStale } from '@/utils/sessionReconcile';

interface EnhancementSession {
  id: string;
  amazon_url: string | null;
  product_asin: string | null;
  listing_title: string | null;
  total_images: number;
  passed_count: number;
  failed_count: number;
  fixed_count: number;
  skipped_count: number;
  unresolved_count: number;
  average_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SessionData {
  session: EnhancementSession;
  assets: ImageAsset[];
  assetSessionMap: Map<string, string>;
  productIdentity?: ProductIdentityCard;
}

export function useSessionLoader() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async (sessionId: string): Promise<SessionData | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch session
      const { data: session, error: sessionError } = await supabase
        .from('enhancement_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!session) {
        setError('Session not found');
        return null;
      }

      // Fetch session images
      const { data: images, error: imagesError } = await supabase
        .from('session_images')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (imagesError) throw imagesError;

      // Convert session images to ImageAsset format
      const assetSessionMap = new Map<string, string>();
      const assets: ImageAsset[] = await Promise.all(
        (images || []).map(async (img) => {
          // Resolve signed URLs for private storage
          const signedOriginalUrl = await refreshSignedUrl(img.original_image_url);
          const signedFixedUrl = img.fixed_image_url ? await refreshSignedUrl(img.fixed_image_url) : undefined;

          // Fetch image as File for local operations
          let file: File;
          try {
            const response = await fetch(signedOriginalUrl);
            const blob = await response.blob();
            file = new File([blob], img.image_name, { type: blob.type || 'image/jpeg' });
          } catch {
            file = new File([''], img.image_name, { type: 'image/jpeg' });
          }

          const { asset, assetId } = buildAssetFromSessionImage(img, file, signedOriginalUrl, signedFixedUrl);
          assetSessionMap.set(assetId, img.id);

          return asset;
        })
      );

      // Extract product identity if stored
      const productIdentity = (session as any).product_identity as ProductIdentityCard | undefined;

      // Reconcile stale session counts from actual image rows
      const reconciledCounts = reconcileSessionCounts(images || []);
      const storedCounts = {
        total_images: session.total_images,
        passed_count: session.passed_count,
        failed_count: session.failed_count,
        fixed_count: session.fixed_count,
        skipped_count: session.skipped_count,
        unresolved_count: session.unresolved_count,
      };

      const sessionOut = { ...session } as EnhancementSession;

      if (isSessionStale(storedCounts, reconciledCounts)) {
        console.log('[session-reconcile] Stale counts detected, reconciling', { stored: storedCounts, reconciled: reconciledCounts });
        // Update in-memory session with correct counts
        Object.assign(sessionOut, reconciledCounts);
        // Fire-and-forget DB update to heal the stale row
        supabase.from('enhancement_sessions').update({
          total_images: reconciledCounts.total_images,
          passed_count: reconciledCounts.passed_count,
          failed_count: reconciledCounts.failed_count,
          fixed_count: reconciledCounts.fixed_count,
          skipped_count: reconciledCounts.skipped_count,
          unresolved_count: reconciledCounts.unresolved_count,
        }).eq('id', sessionId).then(() => {});
      }

      return {
        session: sessionOut,
        assets,
        assetSessionMap,
        productIdentity: productIdentity || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      setError(message);
      console.error('Session load error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { loadSession, isLoading, error };
}
