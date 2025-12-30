import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ImageAsset, AnalysisResult, FixAttempt } from '@/types';

interface EnhancementSession {
  id: string;
  amazon_url: string | null;
  product_asin: string | null;
  listing_title: string | null;
  total_images: number;
  passed_count: number;
  failed_count: number;
  fixed_count: number;
  average_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SessionData {
  session: EnhancementSession;
  assets: ImageAsset[];
  assetSessionMap: Map<string, string>;
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
          const assetId = Math.random().toString(36).substring(2, 9);
          assetSessionMap.set(assetId, img.id);

          // Fetch image as File for local operations
          let file: File;
          try {
            const response = await fetch(img.original_image_url);
            const blob = await response.blob();
            file = new File([blob], img.image_name, { type: blob.type || 'image/jpeg' });
          } catch {
            // Create a placeholder file if fetch fails
            file = new File([''], img.image_name, { type: 'image/jpeg' });
          }

          const asset: ImageAsset = {
            id: assetId,
            file,
            preview: img.original_image_url,
            type: img.image_type as 'MAIN' | 'SECONDARY',
            name: img.image_name,
            sourceUrl: img.original_image_url,
            analysisResult: img.analysis_result as unknown as AnalysisResult | undefined,
            fixedImage: img.fixed_image_url || undefined,
          };

          return asset;
        })
      );

      return {
        session: session as EnhancementSession,
        assets,
        assetSessionMap,
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
