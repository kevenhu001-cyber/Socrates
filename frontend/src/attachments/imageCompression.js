import { MAX_IMAGE_DATAURL_CHARS } from './limits.js';
import { reportSwallow } from '../util/reportSwallow.ts';

const MAX_IMAGE_PIXELS = 36_000_000; // ~6000×6000 decoded pixels
const EDGE_STEPS = [2048, 1440, 960];
const QUALITY_STEPS = [0.8, 0.6];

/** Keep the aspect ratio and avoid enlarging an already-small image. */
export function scaledImageDimensions(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function reportCompressionProgress(onProgress, edgeIndex, qualityIndex) {
  if (typeof onProgress !== 'function') return;
  const completed = edgeIndex * QUALITY_STEPS.length + qualityIndex + 1;
  const total = EDGE_STEPS.length * QUALITY_STEPS.length;
  onProgress(Math.min(90, 20 + Math.round(completed * 70 / total)));
}

/** Read an image into a data URL through FileReader. */
export function readFileAsDataUrl(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => resolve({ dataUrl: String(reader.result || ''), size: file.size });
    if (typeof onProgress === 'function') {
      reader.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }
    reader.readAsDataURL(file);
  });
}

/**
 * Re-encode a large source image until its data URL fits the server limit.
 * Decode/encode off the main thread when supported, with an Image/canvas
 * fallback for browsers without OffscreenCanvas.
 */
export async function compressImageFile(file, onProgress) {
  if (!file) return null;
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    const offscreen = await compressWithOffscreenCanvas(file, onProgress);
    if (offscreen) return offscreen;
  }
  return compressWithLegacyCanvas(file, onProgress);
}

async function compressWithOffscreenCanvas(file, onProgress) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    return null;
  }
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > MAX_IMAGE_PIXELS) {
    bitmap.close();
    return null;
  }

  const maxBlobBytes = Math.floor((MAX_IMAGE_DATAURL_CHARS - 64) * 3 / 4);

  try {
    for (let edgeIndex = 0; edgeIndex < EDGE_STEPS.length; edgeIndex += 1) {
      const { width, height } = scaledImageDimensions(sourceWidth, sourceHeight, EDGE_STEPS[edgeIndex]);
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      for (let qualityIndex = 0; qualityIndex < QUALITY_STEPS.length; qualityIndex += 1) {
        try {
          const blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY_STEPS[qualityIndex] });
          if (blob && blob.size <= maxBlobBytes) {
            const dataUrl = await blobToDataUrl(blob, onProgress);
            if (dataUrl && dataUrl.length <= MAX_IMAGE_DATAURL_CHARS) return dataUrl;
          }
        } catch (error) {
          reportSwallow(error, 'attachments.compressWithOffscreenCanvas.qualityStep');
        }
        reportCompressionProgress(onProgress, edgeIndex, qualityIndex);
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

async function decodeLegacyImage(file) {
  if (typeof document === 'undefined' || typeof Image === 'undefined'
      || typeof document.createElement !== 'function') return null;

  let sourceUrl = '';
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    sourceUrl = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('image decode failed'));
      element.src = sourceUrl;
    });
    return { image, sourceUrl };
  } catch (_) {
    revokeSourceUrl(sourceUrl);
    return null;
  }
}

function dataUrlForLegacyCanvas(canvas, quality) {
  let dataUrl;
  try { dataUrl = canvas.toDataURL('image/webp', quality); } catch (_) { dataUrl = ''; }
  if (dataUrl.startsWith('data:image/webp')) return dataUrl;
  try { return canvas.toDataURL('image/jpeg', quality); }
  catch (_) { return ''; }
}

function encodeLegacyImage(image, sourceWidth, sourceHeight, onProgress) {
  for (let edgeIndex = 0; edgeIndex < EDGE_STEPS.length; edgeIndex += 1) {
    const { width, height } = scaledImageDimensions(sourceWidth, sourceHeight, EDGE_STEPS[edgeIndex]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext && canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (let qualityIndex = 0; qualityIndex < QUALITY_STEPS.length; qualityIndex += 1) {
      const dataUrl = dataUrlForLegacyCanvas(canvas, QUALITY_STEPS[qualityIndex]);
      if (dataUrl && dataUrl.length <= MAX_IMAGE_DATAURL_CHARS) return dataUrl;
      reportCompressionProgress(onProgress, edgeIndex, qualityIndex);
    }
  }
  return null;
}

async function compressWithLegacyCanvas(file, onProgress) {
  const decoded = await decodeLegacyImage(file);
  if (!decoded) return null;
  const { image, sourceUrl } = decoded;
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;
  try {
    if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > MAX_IMAGE_PIXELS) return null;
    return encodeLegacyImage(image, sourceWidth, sourceHeight, onProgress);
  } finally {
    revokeSourceUrl(sourceUrl);
  }
}

function revokeSourceUrl(sourceUrl) {
  if (!sourceUrl) return;
  try { URL.revokeObjectURL(sourceUrl); }
  catch (error) { reportSwallow(error, 'attachments.compressWithLegacyCanvas.revokeSourceUrl'); }
}

function blobToDataUrl(blob, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('blobToDataUrl failed'));
    if (typeof onProgress === 'function') {
      reader.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.min(99, 90 + Math.round((event.loaded / event.total) * 9)));
      };
    }
    reader.readAsDataURL(blob);
  });
}
