// @ts-check
/**
 * Picture style, opacity (D-014, I-084) and crop (I-090) of an image value.
 * DOM-free, so both renderers use it: shared/render.js (elements) and
 * shared/blocks.js (HTML strings).
 *
 * A style is the template class `slipr-picture-<id>`. The class is added for
 * any well-formed id: a style the template does not define has no CSS, so
 * the picture is simply unstyled (the validator warns about it).
 *
 * A crop becomes `object-view-box: inset(…)` and `data-crop="x y w h"`, which
 * shared/crop.js uses where the browser lacks object-view-box. A `morphId`
 * (I-091) becomes `data-morph-id`, which pairs pictures between auto-animate
 * slides (viewer/audience/morph.js).
 */
import { cropInset, normalCrop } from './crop.js';

const STYLE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A morph name (I-091): letters, digits, - and _, up to 60. */
export const MORPH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

/**
 * @param {any} image  An image value: { src, alt, style?, opacity?, crop? }.
 * @returns {{ className: string | null, opacity: string | null, viewBox: string | null, crop: string | null, morphId: string | null }}
 *   The class to add, the CSS opacity ('0'–'1') when it is not 1, for a crop
 *   the object-view-box value and the data-crop numbers, and the morph name.
 */
export function pictureStyle(image) {
  const style = image?.style;
  const className = typeof style === 'string' && STYLE_ID.test(style) ? `slipr-picture-${style}` : null;
  const o = image?.opacity;
  const opacity = typeof o === 'number' && Number.isFinite(o) && o < 1 ? String(Math.max(0, Math.round(o * 1000) / 1000)) : null;
  const c = normalCrop(image?.crop);
  const morphId = typeof image?.morphId === 'string' && MORPH_ID.test(image.morphId) ? image.morphId : null;
  return { className, opacity, viewBox: c ? cropInset(c) : null, crop: c ? `${c.x} ${c.y} ${c.w} ${c.h}` : null, morphId };
}

/**
 * The same as HTML attributes for an <img> (leading space included, or '').
 * Safe for HTML: the class matches STYLE_ID, the morph name MORPH_ID, and
 * opacity and crop are numbers.
 * @param {any} image
 * @returns {string}
 */
export function pictureAttributes(image) {
  const { className, opacity, viewBox, crop, morphId } = pictureStyle(image);
  const css = [opacity ? `opacity:${opacity}` : '', viewBox ? `object-view-box:${viewBox}` : ''].filter(Boolean).join(';');
  return (className ? ` class="${className}"` : '') + (css ? ` style="${css}"` : '') + (crop ? ` data-crop="${crop}"` : '') + (morphId ? ` data-morph-id="${morphId}"` : '');
}

/**
 * Apply the style, opacity and crop to an image element.
 * @param {HTMLImageElement} img
 * @param {any} image
 */
export function applyPictureStyle(img, image) {
  const { className, opacity, viewBox, crop, morphId } = pictureStyle(image);
  if (className) img.classList.add(className);
  if (morphId) img.dataset.morphId = morphId;
  if (opacity) img.style.opacity = opacity;
  if (viewBox && crop) {
    img.style.setProperty('object-view-box', viewBox);
    img.dataset.crop = crop;
  }
}
