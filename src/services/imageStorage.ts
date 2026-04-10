import { supabase } from '@/integrations/supabase/client';

/**
 * Service for uploading and managing images in Supabase Storage.
 * The session-images bucket is private; all access uses signed URLs.
 */

export interface UploadedImage {
  url: string;
  path: string;
}

const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Upload an image to Supabase Storage and return a signed URL.
 */
export async function uploadImage(
  fileOrBase64: File | string,
  sessionId: string,
  prefix: string = 'image'
): Promise<UploadedImage | null> {
  try {
    let file: File;
    
    if (typeof fileOrBase64 === 'string') {
      const response = await fetch(fileOrBase64);
      const blob = await response.blob();
      const ext = fileOrBase64.includes('image/png') ? 'png' : 'jpg';
      file = new File([blob], `${prefix}.${ext}`, { type: blob.type || 'image/jpeg' });
    } else {
      file = fileOrBase64;
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const path = `${sessionId}/${prefix}_${timestamp}_${randomId}.${ext}`;

    const { data, error } = await supabase.storage
      .from('session-images')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    // Get signed URL (bucket is private)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('session-images')
      .createSignedUrl(data.path, SIGNED_URL_EXPIRY);

    if (urlError || !urlData?.signedUrl) {
      console.error('Signed URL error:', urlError);
      return null;
    }

    return {
      url: urlData.signedUrl,
      path: data.path
    };
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

/**
 * Upload multiple images for a session
 */
export async function uploadSessionImages(
  files: Array<{ file: File; prefix: string }>,
  sessionId: string
): Promise<Map<string, UploadedImage>> {
  const results = new Map<string, UploadedImage>();
  
  for (const { file, prefix } of files) {
    const result = await uploadImage(file, sessionId, prefix);
    if (result) {
      results.set(prefix, result);
    }
  }
  
  return results;
}

/**
 * Delete images for a session
 */
export async function deleteSessionImages(sessionId: string): Promise<boolean> {
  try {
    const { data: files, error: listError } = await supabase.storage
      .from('session-images')
      .list(sessionId);

    if (listError) {
      console.error('List error:', listError);
      return false;
    }

    if (files && files.length > 0) {
      const paths = files.map(f => `${sessionId}/${f.name}`);
      const { error: deleteError } = await supabase.storage
        .from('session-images')
        .remove(paths);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Delete failed:', error);
    return false;
  }
}

/**
 * Get a signed URL for an image path (private bucket).
 */
export async function getImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('session-images')
    .createSignedUrl(path, SIGNED_URL_EXPIRY);
  if (error || !data?.signedUrl) {
    console.error('getImageUrl signed URL error:', error);
    return '';
  }
  return data.signedUrl;
}

/**
 * Given a stored URL (which may be a stale public URL), extract the storage
 * path and return a fresh signed URL. Falls back to the original URL if
 * the path cannot be extracted.
 */
export async function refreshSignedUrl(storedUrl: string): Promise<string> {
  if (!storedUrl) return '';
  // Detect bucket path from Supabase storage URL pattern
  const match = storedUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/session-images\/(.+?)(?:\?|$)/);
  if (match) {
    const path = decodeURIComponent(match[1]);
    return getImageUrl(path);
  }
  // Not a storage URL — return as-is (e.g. external Amazon URL)
  return storedUrl;
}
