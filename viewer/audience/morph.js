// @ts-check
/**
 * Morph transitions for pictures between auto-animate slides (I-091).
 *
 * Reveal.js pairs the same picture on two slides by itself, but animates it
 * with a scale transform (a photo distorts when its frame changes shape) and
 * leaves the crop (`object-view-box`) and focus (`object-position`) to jump.
 * `morphMatcher` replaces Reveal's pairing: pictures pair by `morphId`, then
 * by file, then by slot, and are animated by width and height together with
 * their crop, focus and opacity. Every other pair is Reveal's own.
 *
 * `imagePairs` is DOM-free (tested in Node); `morphMatcher` runs inside Reveal.
 */

/**
 * @typedef {object} PictureKey
 * @property {string | null} morphId  The picture's morphId.
 * @property {string} file  The original file address (before a crop fallback).
 * @property {string | null} slot  The slot it fills (data-id), if it is a slot.
 */

/**
 * Pair the pictures of two slides: by morphId, then by file, then by slot.
 * Each picture is used once.
 * @param {PictureKey[]} from @param {PictureKey[]} to
 * @returns {[number, number][]}  Index pairs [from, to].
 */
export function imagePairs(from, to) {
  /** @type {[number, number][]} */
  const pairs = [];
  const usedFrom = new Set();
  const usedTo = new Set();
  /** @param {(a: PictureKey, b: PictureKey) => boolean} same */
  const match = (same) => {
    to.forEach((b, j) => {
      if (usedTo.has(j)) return;
      const i = from.findIndex((a, k) => !usedFrom.has(k) && same(a, b));
      if (i < 0) return;
      usedFrom.add(i);
      usedTo.add(j);
      pairs.push([i, j]);
    });
  };
  match((a, b) => Boolean(a.morphId) && a.morphId === b.morphId);
  // A picture with a morphId pairs only by that name.
  match((a, b) => !a.morphId && !b.morphId && Boolean(a.file) && a.file === b.file);
  match((a, b) => !a.morphId && !b.morphId && Boolean(a.slot) && a.slot === b.slot);
  return pairs;
}

/**
 * The CSS crop of a picture for animating: its object-view-box, or the whole
 * picture (an inset can be animated, `none` cannot).
 * @param {string} value  Computed object-view-box.
 */
export function cropForAnimation(value) {
  return !value || value === 'none' ? 'inset(0% 0% 0% 0%)' : value;
}

/** @param {HTMLImageElement} img @returns {PictureKey} */
function keyOf(img) {
  const slotEl = /** @type {HTMLElement | null} */ (img.closest('[data-id]'));
  return {
    morphId: img.dataset.morphId ?? null,
    file: img.dataset.cropSrc || img.getAttribute('src') || '',
    // Only when the picture is the slot itself, or the slot's only picture.
    slot: slotEl && (slotEl === img || slotEl.querySelectorAll('img').length === 1) ? slotEl.dataset.id ?? null : null,
  };
}

/** Measured on screen, so a picture can move between a slot and an extra image. @param {Element} el */
const onScreen = (el) => el.getBoundingClientRect();

/**
 * Reveal's `autoAnimateMatcher` (called with Reveal's AutoAnimate as `this`).
 * @this {any}
 * @param {HTMLElement} fromSlide @param {HTMLElement} toSlide
 * @returns {{ from: Element, to: Element, options?: any }[]}
 */
export function morphMatcher(fromSlide, toSlide) {
  const isPicture = (/** @type {Element} */ el) => el.nodeName === 'IMG';
  // Reveal's pairs, except pictures (and slots that are pictures): Slipr pairs those.
  const pairs = this.getAutoAnimatePairs(fromSlide, toSlide).filter((/** @type {any} */ p) => !isPicture(p.from) && !isPicture(p.to));

  const fromImgs = /** @type {HTMLImageElement[]} */ ([...fromSlide.querySelectorAll('img')]);
  const toImgs = /** @type {HTMLImageElement[]} */ ([...toSlide.querySelectorAll('img')]);
  for (const [i, j] of imagePairs(fromImgs.map(keyOf), toImgs.map(keyOf))) {
    const from = fromImgs[i];
    const to = toImgs[j];
    const fromCrop = cropForAnimation(getComputedStyle(from).getPropertyValue('object-view-box'));
    const toCrop = cropForAnimation(getComputedStyle(to).getPropertyValue('object-view-box'));
    pairs.push({
      from,
      to,
      options: {
        scale: false,
        measure: onScreen,
        styles: [
          'width', 'height', 'opacity', 'object-position', 'border-radius',
          ...(fromCrop !== toCrop ? [{ property: 'object-view-box', from: fromCrop, to: toCrop }] : []),
        ],
      },
    });
  }
  return pairs;
}

/** Is motion reduced by the reader's settings? */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
