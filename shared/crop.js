// @ts-check
/**
 * Image cropping (I-090): which part of a picture is shown. A crop is
 * `{ x, y, w, h }`, fractions of the original picture; the file is never
 * changed.
 *
 * Rendering: `object-view-box: inset(…)` where the browser supports it
 * (sharp, also for SVG, and animatable for I-091); elsewhere
 * applyCropFallback() draws the cropped part on a canvas once the picture has
 * loaded. Either way the cropped part takes the picture's place, and `fit` /
 * `focus` apply to it.
 *
 * Everything above applyCropFallback() is DOM-free (tested in Node).
 */

/** Crops this close to the whole picture count as no crop. */
const FULL = 0.0005;

/**
 * A usable crop, clamped to the picture and rounded to 4 decimals, or null
 * for no crop (absent, invalid, or the whole picture).
 * @param {any} crop
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function normalCrop(crop) {
  if (!crop || typeof crop !== 'object') return null;
  const n = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  let [x, y, w, h] = [n(crop.x), n(crop.y), n(crop.w), n(crop.h)];
  if ([x, y, w, h].some(Number.isNaN) || w <= 0 || h <= 0) return null;
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, w);
  h = Math.min(1 - y, h);
  if (w <= 0 || h <= 0) return null;
  if (x < FULL && y < FULL && w > 1 - FULL && h > 1 - FULL) return null;
  const r = (/** @type {number} */ v) => Math.round(v * 10000) / 10000;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

/**
 * The CSS `inset()` for `object-view-box`: top, right, bottom, left in %.
 * @param {{ x: number, y: number, w: number, h: number }} c
 */
export function cropInset(c) {
  const p = (/** @type {number} */ v) => `${Math.round(Math.max(0, v) * 100000) / 1000}%`;
  return `inset(${p(c.y)} ${p(1 - c.x - c.w)} ${p(1 - c.y - c.h)} ${p(c.x)})`;
}

/**
 * A point on the whole picture as a position on the shown (cropped) part.
 * Outside the crop it is below 0 or above 1.
 * @param {{ x: number, y: number }} point
 * @param {any} crop
 */
export function toShown(point, crop) {
  const c = normalCrop(crop);
  if (!c) return { x: point.x, y: point.y };
  return { x: (point.x - c.x) / c.w, y: (point.y - c.y) / c.h };
}

/**
 * A position on the shown (cropped) part as a point on the whole picture.
 * @param {{ x: number, y: number }} point
 * @param {any} crop
 */
export function toPicture(point, crop) {
  const c = normalCrop(crop);
  if (!c) return { x: point.x, y: point.y };
  return { x: c.x + point.x * c.w, y: c.y + point.y * c.h };
}

/** Is a shown position inside the crop? @param {{ x: number, y: number }} p */
export const isShown = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

// ---------------------------------------------------------------------------
// Browser fallback

/** Longest side of a fallback bitmap, in pixels. */
const MAX_SIDE = 2400;

/** @type {boolean | null} */
let nativeSupport = null;

/** Does this browser crop with `object-view-box`? */
export function supportsObjectViewBox() {
  if (nativeSupport === null) {
    nativeSupport = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('object-view-box', 'inset(0%)');
  }
  return nativeSupport;
}

/**
 * Without `object-view-box`: replace every cropped picture in `root` by its
 * cropped part, drawn on a canvas once the picture has loaded. Safe to call
 * repeatedly (each picture is done once) and a no-op where CSS crops.
 * @param {ParentNode | null | undefined} root
 * @param {{ force?: boolean }} [options]  force: also where CSS crops (to check the fallback).
 */
export function applyCropFallback(root, options = {}) {
  if (!root || typeof root.querySelectorAll !== 'function' || (supportsObjectViewBox() && !options.force)) return;
  for (const img of /** @type {NodeListOf<HTMLImageElement>} */ (root.querySelectorAll('img[data-crop]:not([data-crop-src])'))) {
    const [x, y, w, h] = String(img.dataset.crop).split(' ').map(Number);
    const crop = normalCrop({ x, y, w, h });
    if (!crop) continue;
    img.dataset.cropSrc = img.currentSrc || img.src;
    const draw = () => {
      try {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh) return;
        const sw = nw * crop.w;
        const sh = nh * crop.h;
        // Vector pictures are drawn at a decent size, bitmaps at their own resolution (at most MAX_SIDE).
        const vector = /\.svg($|[?#])|^data:image\/svg/i.test(img.dataset.cropSrc ?? '');
        const longest = Math.max(sw, sh);
        const scale = Math.min(MAX_SIDE / longest, vector ? Math.max(1, 1600 / longest) : 1);
        const canvas = img.ownerDocument.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, nw * crop.x, nh * crop.y, sw, sh, 0, 0, canvas.width, canvas.height);
        img.style.removeProperty('object-view-box');
        img.src = canvas.toDataURL(/\.jpe?g($|\?)/i.test(img.dataset.cropSrc ?? '') ? 'image/jpeg' : 'image/png', 0.92);
      } catch (err) {
        // A picture from another server that may not be read back (CORS): shown uncropped.
        console.info('Slipr: could not crop', img.dataset.cropSrc, err);
      }
    };
    if (img.complete && img.naturalWidth) draw();
    else img.addEventListener('load', draw, { once: true });
  }
}
