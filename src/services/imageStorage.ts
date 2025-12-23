import { supabase } from '@/integrations/supabase/client';

/**
 * Service for uploading and managing images in Supabase Storage
 */

export interface UploadedImage {
  url: string;
  path: string;
}

/**
 * Upload an image to Supabase Storage
 * @param file - The file to upload or a base64 data URL
 * @param sessionId - The session ID to organize uploads
 * @param prefix - Prefix for the filename (e.g., 'original', 'fixed')
 */
export async function uploadImage(
  fileOrBase64: File | string,
  sessionId: string,
  prefix: string = 'image'
): Promise<UploadedImage | null> {
  try {
    let file: File;
    
    if (typeof fileOrBase64 === 'string') {
      // Convert base64 to File
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('session-images')
      .getPublicUrl(data.path);

    return {
      url: urlData.publicUrl,
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
 * Get the public URL for an image path
 */
export function getImageUrl(path: string): string {
  const { data } = supabase.storage
    .from('session-images')
    .getPublicUrl(path);
  return data.publicUrl;
}
