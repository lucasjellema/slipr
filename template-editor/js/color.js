// @ts-check
/**
 * CSS colours for the template editor (I-106): parse the colours templates
 * use, and WCAG contrast. DOM-free.
 */

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba  Channels 0–255, alpha 0–1. */

/** The named colours templates are likely to use; others count as "not a colour we can check". */
const NAMED = /** @type {Record<string, string>} */ ({
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF',
  yellow: '#FFFF00', orange: '#FFA500', purple: '#800080', gray: '#808080', grey: '#808080',
  silver: '#C0C0C0', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000',
  lime: '#00FF00', aqua: '#00FFFF', cyan: '#00FFFF', fuchsia: '#FF00FF', magenta: '#FF00FF',
  transparent: '#00000000',
});

/**
 * Parse a CSS colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()`,
 * `hsl()` / `hsla()` (comma or space syntax) and basic named colours.
 * @param {string} text
 * @returns {Rgba | null}  null when it is not a colour this module understands.
 */
export function parseColor(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (NAMED[s]) return parseColor(NAMED[s]);
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (/** @type {number} */ i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255) : 1 };
  }
  const fn = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(s);
  if (!fn) return null;
  const parts = fn[2].split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
  if (alpha === null) return null;
  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => number(p, 255));
    if (r === null || g === null || b === null) return null;
    return { r: clamp(r, 255), g: clamp(g, 255), b: clamp(b, 255), a: clamp(alpha, 1) };
  }
  const hue = Number.parseFloat(parts[0].replace(/deg$/, ''));
  const sat = number(parts[1], 1);
  const light = number(parts[2], 1);
  if (!Number.isFinite(hue) || sat === null || light === null) return null;
  return { ...hslToRgb(hue, clamp(sat, 1), clamp(light, 1)), a: clamp(alpha, 1) };
}

/**
 * `#RRGGBB` (upper case), ignoring alpha.
 * @param {Rgba} c
 * @returns {string}
 */
export function toHex(c) {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * WCAG 2 relative luminance.
 * @param {Rgba} c
 * @returns {number}
 */
export function luminance(c) {
  const lin = (/** @type {number} */ v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG 2 contrast ratio of two opaque colours, 1 to 21.
 * @param {Rgba} a @param {Rgba} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A number, or a percentage of `full`.
 * @param {string} part @param {number} full
 * @returns {number | null}
 */
function number(part, full) {
  const pct = part.endsWith('%');
  const n = Number.parseFloat(pct ? part.slice(0, -1) : part);
  if (!Number.isFinite(n) || !/^-?[\d.]+%?$/.test(part)) return null;
  return pct ? (n / 100) * full : n;
}

/** @param {number} v @param {number} max */
function clamp(v, max) {
  return Math.min(max, Math.max(0, v));
}

/** @param {number} v */
function round(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * @param {number} h degrees @param {number} s 0–1 @param {number} l 0–1
 * @returns {{ r: number, g: number, b: number }}
 */
function hslToRgb(h, s, l) {
  const k = (/** @type {number} */ n) => (n + (((h % 360) + 360) % 360) / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}
