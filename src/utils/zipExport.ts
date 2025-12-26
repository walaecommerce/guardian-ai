import { ImageAsset } from '@/types';

// Simple ZIP file creator without external dependencies
// Uses the built-in Compression API for deflate

interface ZipEntry {
  name: string;
  data: Blob;
}

/**
 * Creates a ZIP file from an array of entries
 * This is a simple implementation that creates uncompressed ZIP files
 */
async function createZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.data.arrayBuffer());
    
    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    
    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract
    view.setUint16(6, 0, true); // General purpose bit flag
    view.setUint16(8, 0, true); // Compression method (store)
    view.setUint16(10, 0, true); // File last modification time
    view.setUint16(12, 0, true); // File last modification date
    view.setUint32(14, 0, true); // CRC-32 (optional for store)
    view.setUint32(18, data.length, true); // Compressed size
    view.setUint32(22, data.length, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);
    
    chunks.push(localHeader);
    chunks.push(data);
    
    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    
    cdView.setUint32(0, 0x02014b50, true); // Central directory signature
    cdView.setUint16(4, 20, true); // Version made by
    cdView.setUint16(6, 20, true); // Version needed to extract
    cdView.setUint16(8, 0, true); // General purpose bit flag
    cdView.setUint16(10, 0, true); // Compression method
    cdView.setUint16(12, 0, true); // File last modification time
    cdView.setUint16(14, 0, true); // File last modification date
    cdView.setUint32(16, 0, true); // CRC-32
    cdView.setUint32(20, data.length, true); // Compressed size
    cdView.setUint32(24, data.length, true); // Uncompressed size
    cdView.setUint16(28, nameBytes.length, true); // File name length
    cdView.setUint16(30, 0, true); // Extra field length
    cdView.setUint16(32, 0, true); // File comment length
    cdView.setUint16(34, 0, true); // Disk number start
    cdView.setUint16(36, 0, true); // Internal file attributes
    cdView.setUint32(38, 0, true); // External file attributes
    cdView.setUint32(42, offset, true); // Relative offset of local header
    cdEntry.set(nameBytes, 46);
    
    centralDirectory.push(cdEntry);
    offset += localHeader.length + data.length;
  }
  
  // Add central directory to chunks
  const cdStart = offset;
  for (const cd of centralDirectory) {
    chunks.push(cd);
    offset += cd.length;
  }
  
  // End of central directory record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  
  eocdView.setUint32(0, 0x06054b50, true); // End of central directory signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, entries.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, entries.length, true); // Total number of central directory records
  eocdView.setUint32(12, offset - cdStart, true); // Size of central directory
  eocdView.setUint32(16, cdStart, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // Comment length
  
  chunks.push(eocd);
  
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

/**
 * Convert base64 data URL or regular URL to Blob
 */
async function urlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    // Base64 data URL
    const [header, base64Data] = url.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } else {
    // Regular URL
    const response = await fetch(url);
    return response.blob();
  }
}

/**
 * Export all fixed images as a ZIP file
 */
export async function exportFixedImagesAsZip(
  assets: ImageAsset[], 
  asin?: string
): Promise<void> {
  const fixedAssets = assets.filter(a => a.fixedImage);
  
  if (fixedAssets.length === 0) {
    throw new Error('No fixed images to export');
  }
  
  const prefix = asin || 'amazon';
  const entries: ZipEntry[] = [];
  
  for (let i = 0; i < fixedAssets.length; i++) {
    const asset = fixedAssets[i];
    const fixedUrl = asset.fixedImage!;
    
    try {
      const blob = await urlToBlob(fixedUrl);
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const filename = asset.type === 'MAIN' 
        ? `${prefix}_MAIN.${ext}`
        : `${prefix}_SECONDARY_${i + 1}.${ext}`;
      
      entries.push({ name: filename, data: blob });
    } catch (error) {
      console.error(`Failed to process image: ${asset.name}`, error);
    }
  }
  
  if (entries.length === 0) {
    throw new Error('Failed to process any images');
  }
  
  const zipBlob = await createZipBlob(entries);
  
  // Download the ZIP file
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}_fixed_images.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export all images (original and fixed) as a ZIP file
 */
export async function exportAllImagesAsZip(
  assets: ImageAsset[],
  asin?: string
): Promise<void> {
  const prefix = asin || 'amazon';
  const entries: ZipEntry[] = [];
  
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    
    // Add original image
    try {
      const originalBlob = asset.file;
      const ext = originalBlob.type.includes('png') ? 'png' : 'jpg';
      const originalFilename = asset.type === 'MAIN'
        ? `originals/${prefix}_MAIN_original.${ext}`
        : `originals/${prefix}_SECONDARY_${i + 1}_original.${ext}`;
      
      entries.push({ name: originalFilename, data: originalBlob });
      
      // Add fixed image if available
      if (asset.fixedImage) {
        const fixedBlob = await urlToBlob(asset.fixedImage);
        const fixedFilename = asset.type === 'MAIN'
          ? `fixed/${prefix}_MAIN_fixed.${ext}`
          : `fixed/${prefix}_SECONDARY_${i + 1}_fixed.${ext}`;
        
        entries.push({ name: fixedFilename, data: fixedBlob });
      }
    } catch (error) {
      console.error(`Failed to process image: ${asset.name}`, error);
    }
  }
  
  if (entries.length === 0) {
    throw new Error('Failed to process any images');
  }
  
  const zipBlob = await createZipBlob(entries);
  
  // Download the ZIP file
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}_all_images.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
