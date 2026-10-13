// @ts-check
/**
 * The crop rectangle in the crop dialog (I-090): moving it, resizing it from
 * a corner and giving it a shape. Fractions of the picture, as in the show
 * format. DOM-free, so it is tested in Node.
 *
 * A shape is a width / height ratio of the shown part; in picture fractions
 * that is `w / h = shape / pictureAspect`.
 */

/** Smallest crop side, as a fraction of the picture. */
export const CROP_MIN = 0.02;

/** The shapes the dialog offers: [value, label, ratio or null]. 'original' uses the picture's own ratio. */
export const CROP_SHAPES = /** @type {const} */ ([
  ['free', 'Free', null],
  ['original', 'Like the picture', null],
  ['1:1', 'Square (1:1)', 1],
  ['4:3', '4:3', 4 / 3],
  ['3:2', '3:2', 3 / 2],
  ['16:9', '16:9', 16 / 9],
  ['3:4', '3:4 (portrait)', 3 / 4],
  ['9:16', '9:16 (portrait)', 9 / 16],
]);

/** @typedef {{ x: number, y: number, w: number, h: number }} Crop */

const r4 = (/** @type {number} */ v) => Math.round(v * 10000) / 10000;

/**
 * The whole picture.
 * @returns {Crop}
 */
export const fullCrop = () => ({ x: 0, y: 0, w: 1, h: 1 });

/**
 * A crop kept inside the picture, at least CROP_MIN on each side, rounded.
 * @param {Crop} c
 * @returns {Crop}
 */
export function clampCrop(c) {
  const w = Math.min(1, Math.max(CROP_MIN, c.w));
  const h = Math.min(1, Math.max(CROP_MIN, c.h));
  return { x: r4(Math.min(1 - w, Math.max(0, c.x))), y: r4(Math.min(1 - h, Math.max(0, c.y))), w: r4(w), h: r4(h) };
}

/**
 * Moved by dx, dy (fractions of the picture), staying inside it.
 * @param {Crop} c @param {number} dx @param {number} dy
 */
export function moveCrop(c, dx, dy) {
  return clampCrop({ ...c, x: c.x + dx, y: c.y + dy });
}

/**
 * The ratio w / h in picture fractions for a shape, or null for free.
 * @param {string} shape  A CROP_SHAPES value.
 * @param {number} pictureAspect  Picture width / height.
 */
export function shapeRatio(shape, pictureAspect) {
  if (shape === 'original') return 1;
  const entry = CROP_SHAPES.find(([v]) => v === shape);
  return entry && entry[2] ? entry[2] / pictureAspect : null;
}

/**
 * Resized by dragging a corner; the opposite corner stays put. With a ratio
 * (picture fractions) the shape is kept, following the larger change.
 * @param {Crop} start @param {string} corner  'nw' | 'ne' | 'sw' | 'se'
 * @param {number} dx @param {number} dy  Pointer movement, fractions of the picture.
 * @param {number | null} ratio
 * @returns {Crop}
 */
export function resizeCrop(start, corner, dx, dy, ratio) {
  const west = corner.includes('w');
  const north = corner.includes('n');
  // The room towards the dragged corner.
  const maxW = west ? start.x + start.w : 1 - start.x;
  const maxH = north ? start.y + start.h : 1 - start.y;
  let w = Math.min(maxW, Math.max(CROP_MIN, start.w + (west ? -dx : dx)));
  let h = Math.min(maxH, Math.max(CROP_MIN, start.h + (north ? -dy : dy)));
  if (ratio) {
    if (Math.abs(w - start.w) / start.w >= Math.abs(h - start.h) / start.h) h = w / ratio;
    else w = h * ratio;
    const scale = Math.min(1, maxW / w, maxH / h);
    w *= scale;
    h *= scale;
  }
  return clampCrop({ x: west ? start.x + start.w - w : start.x, y: north ? start.y + start.h - h : start.y, w, h });
}

/**
 * The crop given a shape: a rectangle of that ratio with the same area and
 * centre as the current crop, made smaller if needed to fit the picture.
 * @param {Crop} c @param {number | null} ratio  Picture fractions; null leaves it.
 * @returns {Crop}
 */
export function shapeCrop(c, ratio) {
  if (!ratio) return clampCrop(c);
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  // As large as the current crop's area allows, then within the picture.
  let w = Math.sqrt(c.w * c.h * ratio);
  let h = w / ratio;
  const scale = Math.min(1, 1 / w, 1 / h);
  w *= scale;
  h *= scale;
  return clampCrop({ x: cx - w / 2, y: cy - h / 2, w, h });
}

/**
 * Resized by the keyboard: grow (or shrink) by `step` keeping the top-left
 * corner, and the shape when there is one.
 * @param {Crop} c @param {number} dw @param {number} dh @param {number | null} ratio
 */
export function growCrop(c, dw, dh, ratio) {
  if (ratio) {
    const d = dw || dh * ratio;
    return resizeCrop(c, 'se', d, d / ratio, ratio);
  }
  return resizeCrop(c, 'se', dw, dh, null);
}
