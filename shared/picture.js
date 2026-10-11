// @ts-check
/**
 * Picture style and opacity of an image value (D-014, I-084). DOM-free, so
 * both renderers use it: shared/render.js (elements) and shared/blocks.js
 * (HTML strings).
 *
 * A style is the template class `slipr-picture-<id>`. The class is added for
 * any well-formed id: a style the template does not define has no CSS, so
 * the picture is simply unstyled (the validator warns about it).
 */

const STYLE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * @param {any} image  An image value: { src, alt, style?, opacity? }.
 * @returns {{ className: string | null, opacity: string | null }}
 *   The class to add, and the CSS opacity ('0'–'1') when it is not 1.
 */
export function pictureStyle(image) {
  const style = image?.style;
  const className = typeof style === 'string' && STYLE_ID.test(style) ? `slipr-picture-${style}` : null;
  const o = image?.opacity;
  const opacity = typeof o === 'number' && Number.isFinite(o) && o < 1 ? String(Math.max(0, Math.round(o * 1000) / 1000)) : null;
  return { className, opacity };
}

/**
 * The same as HTML attributes for an <img> (leading space included, or '').
 * Safe for HTML: the class matches STYLE_ID and the opacity is a number.
 * @param {any} image
 * @returns {string}
 */
export function pictureAttributes(image) {
  const { className, opacity } = pictureStyle(image);
  return (className ? ` class="${className}"` : '') + (opacity ? ` style="opacity:${opacity}"` : '');
}

/**
 * Apply the style and opacity to an image element.
 * @param {HTMLImageElement} img
 * @param {any} image
 */
export function applyPictureStyle(img, image) {
  const { className, opacity } = pictureStyle(image);
  if (className) img.classList.add(className);
  if (opacity) img.style.opacity = opacity;
}
