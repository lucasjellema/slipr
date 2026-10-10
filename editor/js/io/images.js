// @ts-check
/**
 * Names for images copied into a show folder (E-006): `images/<slug>-<hash8>.<ext>`.
 * The hash is of the file's bytes, so adding the same image twice reuses one
 * file, and different images never collide. DOM-free (Web Crypto exists in
 * browsers and Node).
 */
import { slugify } from './new-show.js';

/** Image types the editor accepts, with the extension it writes. */
export const IMAGE_TYPES = /** @type {Record<string, string>} */ ({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
});

const EXTENSION_TYPES = /** @type {Record<string, string>} */ ({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
});

/** Images larger than this get a "consider compressing" notice. */
export const LARGE_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * The MIME type of an image, from its type or else its file name. null if it is not a supported image.
 * @param {{ type?: string, name?: string }} file
 * @returns {string | null}
 */
export function imageType(file) {
  if (file.type && IMAGE_TYPES[file.type]) return file.type;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1]?.toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) || null;
}

/**
 * Hex SHA-256 of the bytes, first `length` characters.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {number} [length]
 */
export async function shortHash(bytes, length = 8) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

/**
 * Path (relative to show.json) for an image file.
 * Pasted images are usually called "image.png", so they get the slug of `fallbackName`.
 * @param {{ name?: string, type?: string, bytes: ArrayBuffer | Uint8Array }} file
 * @param {string} [fallbackName]  Used when the file name says nothing (pasted images).
 * @returns {Promise<string>}
 */
export async function imagePath(file, fallbackName = 'image') {
  const type = imageType(file);
  if (!type) throw new Error(`"${file.name || 'This file'}" is not a supported image (PNG, JPEG, GIF, WebP, AVIF or SVG).`);
  const base = (file.name ?? '').replace(/\.[a-z0-9]+$/i, '');
  const generic = !base || /^(image|blob|untitled|clipboard)$/i.test(base);
  const slug = slugify(generic ? fallbackName : base).slice(0, 40).replace(/-+$/, '') || 'image';
  return `images/${slug}-${await shortHash(file.bytes)}.${IMAGE_TYPES[type]}`;
}

/**
 * The content part of an image path: "-<hash8>.<ext>". Two paths with the same
 * suffix hold the same image, whatever their slug.
 * @param {string} path  e.g. "images/photo-1a2b3c4d.png"
 * @returns {string | null}
 */
export function contentSuffix(path) {
  return /-[0-9a-f]{8}\.[a-z0-9]+$/.exec(path)?.[0] ?? null;
}
