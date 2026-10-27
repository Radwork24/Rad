/**
 * Rad Image Utilities
 * Provides image compression and processing to prevent exceeding
 * Firestore (1MB limit) and browser localStorage (5MB limit)
 * while maintaining crystal-clear visual quality for multimodal chat input.
 */

export interface ProcessedImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
}

/**
 * Compresses an image data URL using an HTML5 Canvas.
 * Resizes images exceeding maxWidth/maxHeight and encodes as JPEG with quality parameter.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const originalLength = dataUrl.length;

        // If already compact (< 300KB) and within max dimensions, keep untouched
        if (width <= maxWidth && height <= maxHeight && originalLength < 300000) {
          console.log(
            `📸 [Rad Image] Image is already compact (${Math.round(originalLength / 1024)} KB, ${width}x${height}). Kept as is.`
          );
          resolve(dataUrl);
          return;
        }

        // Calculate aspect-ratio preserved dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.warn('📸 [Rad Image] Canvas 2d context unavailable, using original data URL.');
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        console.log(
          `📸 [Rad Image] Successfully compressed image from ${Math.round(originalLength / 1024)} KB to ${Math.round(compressed.length / 1024)} KB (${width}x${height}). Fits cleanly in Firestore & LocalStorage.`
        );
        resolve(compressed);
      };

      img.onerror = (e) => {
        console.warn('📸 [Rad Image] Image load error during compression, using original:', e);
        resolve(dataUrl);
      };

      img.src = dataUrl;
    } catch (err) {
      console.warn('📸 [Rad Image] Compression exception, fallback to original:', err);
      resolve(dataUrl);
    }
  });
}

/**
 * Reads a File object as a compressed base64 data URL.
 */
export async function readFileAsCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`📸 [Rad Image] Reading file: "${file.name}" (${file.type}, ${Math.round(file.size / 1024)} KB)`);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error('Failed to read image data URL'));
        return;
      }
      const compressed = await compressImageDataUrl(rawDataUrl);
      resolve(compressed);
    };
    reader.onerror = (err) => {
      console.error('❌ [Rad Image] FileReader error:', err);
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}
