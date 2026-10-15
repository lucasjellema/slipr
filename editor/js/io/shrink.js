// @ts-check
/**
 * Shrink a picture to WebP in the browser (I-026): read it with
 * createImageBitmap, draw it at most `maxSide` pixels on its longest side on
 * an OffscreenCanvas (or a <canvas> where that is missing), and encode it as
 * WebP. No libraries; the sizes come from shrink-values.js.
 */
import { shrinkSize } from '../shrink-values.js';

/**
 * The pixel size of a picture, or null when the browser cannot read it.
 * Never waits more than 3 s (a hidden tab may never decode).
 * @param {Blob} blob
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export async function pictureSize(blob) {
  const read = async () => {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  };
  try {
    return await Promise.race([read(), new Promise((resolve) => setTimeout(() => resolve(null), 3000))]);
  } catch {
    return null;
  }
}

/**
 * Encode a picture as WebP, at most `maxSide` on its longest side.
 * @param {Blob} blob  PNG, JPEG, WebP or AVIF.
 * @param {{ maxSide: number, quality: number }} options  quality 0–1.
 * @returns {Promise<{ blob: Blob, width: number, height: number, sourceWidth: number, sourceHeight: number }>}
 * @throws When the picture cannot be read, or the browser cannot write WebP.
 */
export async function encodeWebp(blob, { maxSide, quality }) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('The browser cannot read this picture.');
  }
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const { width, height } = shrinkSize(sourceWidth, sourceHeight, maxSide);
  try {
    let out;
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      out = await canvas.convertToBlob({ type: 'image/webp', quality });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      out = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be encoded.'))), 'image/webp', quality));
    }
    // A browser without a WebP encoder silently returns PNG.
    if (out.type !== 'image/webp') throw new Error('This browser cannot save WebP pictures. Try Chrome, Edge or Firefox.');
    return { blob: out, width, height, sourceWidth, sourceHeight };
  } finally {
    bitmap.close();
  }
}
