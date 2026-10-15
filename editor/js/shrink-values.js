// @ts-check
/**
 * Shrinking pictures to WebP and their focal point (I-026). DOM-free, so it
 * can be tested with `node --test`; the encoding itself is in io/shrink.js.
 */

/** Defaults of the Shrink dialog (Lucas, 2026-10-15). */
export const SHRINK_DEFAULTS = Object.freeze({ maxSide: 2400, quality: 0.85 });

/** A picture over this size (or over maxSide pixels) gets the offer to shrink it when added. */
export const OFFER_BYTES = 1024 * 1024;

/** Types the editor can shrink: SVG scales by itself and GIF may be animated. */
const SHRINKABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

/**
 * Can a picture of this MIME type be shrunk?
 * @param {string | null | undefined} type
 */
export function canShrink(type) {
  return SHRINKABLE.has(String(type ?? ''));
}

/**
 * The MIME type of an image path, from its extension, or null.
 * @param {string} path
 * @returns {string | null}
 */
export function typeOfPath(path) {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(path ?? ''))?.[1]?.toLowerCase();
  const types = /** @type {Record<string, string>} */ ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml',
  });
  return (ext && types[ext]) || null;
}

/**
 * The size to draw a picture at: at most `maxSide` on its longest side, keeping
 * its proportions, never larger than it is.
 * @param {number} width
 * @param {number} height
 * @param {number} maxSide
 * @returns {{ width: number, height: number }}
 */
export function shrinkSize(width, height, maxSide) {
  const longest = Math.max(width, height);
  const limit = Math.max(1, Math.round(maxSide));
  if (!(longest > limit)) return { width, height };
  const scale = limit / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Should adding this picture offer to shrink it?
 * @param {{ type: string | null, bytes: number, width?: number, height?: number }} picture
 * @param {number} [maxSide]
 */
export function shouldOfferShrink({ type, bytes, width = 0, height = 0 }, maxSide = SHRINK_DEFAULTS.maxSide) {
  return canShrink(type) && (bytes > OFFER_BYTES || Math.max(width, height) > maxSide);
}

/**
 * The name to give a shrunk picture: the slug of the original without its
 * content hash, so `images/team-photo-1a2b3c4d.jpg` becomes `team-photo`
 * (io/images.js adds the new hash and `.webp`).
 * @param {string} path
 * @returns {string}
 */
export function shrunkBaseName(path) {
  const file = String(path ?? '').split(/[/\\]/).pop() ?? '';
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/-[0-9a-f]{8}$/, '') || 'image';
}

/**
 * A file size for people: "840 B", "214 KB", "3.4 MB".
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * "−91 %" for a file that went from `before` to `after` bytes.
 * @param {number} before
 * @param {number} after
 */
export function savingText(before, after) {
  if (!(before > 0)) return '';
  const change = Math.round((after / before - 1) * 100);
  return change < 0 ? `−${-change} %` : `+${change} %`;
}

// ---- focal point

/** @typedef {{ x: number, y: number }} Point  Fractions 0–1 of the (cropped) picture. */

const X_WORDS = /** @type {Record<string, number>} */ ({ left: 0, center: 0.5, right: 1 });
const Y_WORDS = /** @type {Record<string, number>} */ ({ top: 0, center: 0.5, bottom: 1 });

/**
 * The focal point of a `focus` value (CSS object-position), as fractions.
 * Keywords and percentages are read; anything else (px, calc) counts as the
 * middle. No focus: the middle.
 * @param {unknown} focus
 * @returns {Point}
 */
export function parseFocus(focus) {
  const point = { x: 0.5, y: 0.5 };
  if (typeof focus !== 'string') return point;
  const parts = focus.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2);
  const pct = (/** @type {string} */ s) => (/^-?\d+(\.\d+)?%$/.test(s) ? clamp01(parseFloat(s) / 100) : null);
  if (parts.length === 1) {
    const [a] = parts;
    if (a in Y_WORDS && !(a in X_WORDS)) point.y = Y_WORDS[a];
    else if (a in X_WORDS) point.x = X_WORDS[a];
    else point.x = pct(a) ?? 0.5;
    return point;
  }
  let [a, b] = parts;
  // "top left" means the same as "left top".
  if ((a in Y_WORDS && !(a in X_WORDS)) || (b in X_WORDS && !(b in Y_WORDS))) [a, b] = [b, a];
  point.x = a in X_WORDS ? X_WORDS[a] : pct(a) ?? 0.5;
  point.y = b in Y_WORDS ? Y_WORDS[b] : pct(b) ?? 0.5;
  return point;
}

/**
 * The `focus` value to store for a point: "x% y%", to 0.1 %.
 * @param {Point} point
 * @returns {string}
 */
export function focusValue({ x, y }) {
  const pct = (/** @type {number} */ v) => `${Math.round(clamp01(v) * 1000) / 10}%`;
  return `${pct(x)} ${pct(y)}`;
}

/**
 * A point moved by dx, dy (fractions), kept on the picture.
 * @param {Point} point
 * @param {number} dx
 * @param {number} dy
 * @returns {Point}
 */
export function moveFocus(point, dx, dy) {
  return { x: clamp01(point.x + dx), y: clamp01(point.y + dy) };
}

/** @param {number} v */
function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}
