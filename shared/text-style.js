// @ts-check
/**
 * The look of a text element on a slide (D-016, I-089). DOM-free, so it is
 * tested in Node and shared by the renderer and the editor.
 *
 * Only known keys are read, and only checked values are emitted: enum values
 * from fixed tables, clamped numbers, and #rgb / #rrggbb colors. No string
 * from the show reaches CSS unchecked. Lengths are percentages of the slide
 * width (`cqw`: the templates make `.slipr-slide` an inline-size container).
 */

/** The template's fonts first (D-016: palette and fonts first), then the platform's. */
export const TEXT_FONTS = /** @type {const} */ ({
  heading: 'var(--slipr-font-heading, system-ui, sans-serif)',
  body: 'var(--slipr-font-body, system-ui, sans-serif)',
  mono: 'var(--slipr-font-code, ui-monospace, Consolas, Menlo, monospace)',
  system: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
});

/** Named sizes: the template's `--slipr-size-*`, with the default template's values as fallback (cqw). */
export const TEXT_SIZES = /** @type {const} */ ({
  small: { variable: '--slipr-size-small', fallback: 1.2 },
  body: { variable: '--slipr-size-body', fallback: 2.2 },
  subtitle: { variable: '--slipr-size-subtitle', fallback: 2.1 },
  title: { variable: '--slipr-size-title', fallback: 3.6 },
  hero: { variable: '--slipr-size-title-hero', fallback: 5.2 },
});

const ALIGN = ['left', 'center', 'right'];
const VALIGN = /** @type {Record<string, string>} */ ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' });
const BORDER_STYLES = ['solid', 'dashed', 'dotted'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Ranges of the numeric style fields (as in the schema). */
export const TEXT_STYLE_RANGES = /** @type {const} */ ({
  size: [0.5, 20],
  backgroundOpacity: [0, 1],
  borderWidth: [0, 5],
  radius: [0, 50],
  outlineWidth: [0, 2],
  padding: [0, 10],
});

/** @param {unknown} v @returns {v is string} */
export const isHexColor = (v) => typeof v === 'string' && HEX.test(v);

/**
 * A number within a style field's range, or null.
 * @param {unknown} v @param {keyof typeof TEXT_STYLE_RANGES} key
 */
function num(v, key) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const [min, max] = TEXT_STYLE_RANGES[key];
  return Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;
}

/** @param {number} n */
const cqw = (n) => `${n}cqw`;

/**
 * A hex color with an alpha as rgba(), so a fill's opacity does not fade the text.
 * @param {string} hex  #rgb or #rrggbb
 * @param {number} alpha 0–1
 * @returns {string}
 */
export function hexToRgba(hex, alpha) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * CSS declarations for a text element's box, as [property, value] pairs
 * (kebab-case properties, for `style.setProperty`). Layout of the box
 * (position, flex column) is the renderer's; this is only the look.
 * @param {any} style  The `style` of a text overlay (may be absent).
 * @returns {[string, string][]}
 */
export function textStyleDeclarations(style) {
  const s = style && typeof style === 'object' && !Array.isArray(style) ? style : {};
  /** @type {[string, string][]} */
  const out = [];

  const font = TEXT_FONTS[/** @type {keyof typeof TEXT_FONTS} */ (s.font)] ?? TEXT_FONTS.body;
  out.push(['font-family', font]);

  const named = TEXT_SIZES[/** @type {keyof typeof TEXT_SIZES} */ (typeof s.size === 'string' ? s.size : 'body')];
  const size = num(s.size, 'size');
  if (size !== null) out.push(['font-size', cqw(size)]);
  else if (named) out.push(['font-size', `var(${named.variable}, ${cqw(named.fallback)})`]);

  out.push(['font-weight', s.bold === true ? '700' : '400']);
  out.push(['font-style', s.italic === true ? 'italic' : 'normal']);
  if (s.underline === true) out.push(['text-decoration', 'underline']);
  out.push(['text-transform', s.uppercase === true ? 'uppercase' : 'none']);
  out.push(['text-align', ALIGN.includes(s.align) ? s.align : 'left']);
  out.push(['justify-content', VALIGN[s.valign] ?? VALIGN.top]);
  if (isHexColor(s.color)) out.push(['color', s.color]);

  if (isHexColor(s.background)) {
    const alpha = num(s.backgroundOpacity, 'backgroundOpacity') ?? 1;
    out.push(['background-color', hexToRgba(s.background, alpha)]);
  }
  const border = num(s.borderWidth, 'borderWidth');
  if (border) {
    const color = isHexColor(s.borderColor) ? s.borderColor : 'currentColor';
    out.push(['border', `${cqw(border)} ${BORDER_STYLES.includes(s.borderStyle) ? s.borderStyle : 'solid'} ${color}`]);
  }
  const radius = num(s.radius, 'radius');
  if (radius) out.push(['border-radius', cqw(radius)]);
  const outline = num(s.outlineWidth, 'outlineWidth');
  if (outline) {
    // Painted behind the fill (paint-order), so half the stroke shows: twice the width.
    out.push(['-webkit-text-stroke', `${cqw(Math.round(outline * 2000) / 1000)} ${isHexColor(s.outlineColor) ? s.outlineColor : '#ffffff'}`]);
    out.push(['paint-order', 'stroke fill']);
  }
  const padding = num(s.padding, 'padding');
  if (padding) out.push(['padding', cqw(padding)]);
  return out;
}

/**
 * A style without unknown keys, invalid values or defaults: what the editor
 * stores. Returns undefined when nothing is left.
 * @param {any} style
 * @returns {Record<string, any> | undefined}
 */
export function cleanTextStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return undefined;
  /** @type {Record<string, any>} */
  const out = {};
  if (style.font in TEXT_FONTS && style.font !== 'body') out.font = style.font;
  if (typeof style.size === 'string' && style.size in TEXT_SIZES && style.size !== 'body') out.size = style.size;
  else if (num(style.size, 'size') !== null) out.size = num(style.size, 'size');
  for (const key of ['bold', 'italic', 'underline', 'uppercase']) if (style[key] === true) out[key] = true;
  if (ALIGN.includes(style.align) && style.align !== 'left') out.align = style.align;
  if (style.valign in VALIGN && style.valign !== 'top') out.valign = style.valign;
  if (isHexColor(style.color)) out.color = style.color;
  if (isHexColor(style.background)) {
    out.background = style.background;
    const alpha = num(style.backgroundOpacity, 'backgroundOpacity');
    if (alpha !== null && alpha < 1) out.backgroundOpacity = alpha;
  }
  const border = num(style.borderWidth, 'borderWidth');
  if (border) {
    out.borderWidth = border;
    if (BORDER_STYLES.includes(style.borderStyle) && style.borderStyle !== 'solid') out.borderStyle = style.borderStyle;
    if (isHexColor(style.borderColor)) out.borderColor = style.borderColor;
  }
  const radius = num(style.radius, 'radius');
  if (radius) out.radius = radius;
  const outline = num(style.outlineWidth, 'outlineWidth');
  if (outline) {
    out.outlineWidth = outline;
    if (isHexColor(style.outlineColor)) out.outlineColor = style.outlineColor;
  }
  const padding = num(style.padding, 'padding');
  if (padding) out.padding = padding;
  return Object.keys(out).length ? out : undefined;
}
