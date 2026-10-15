// @ts-check
/**
 * WCAG AA contrast checks for template tokens (I-106). DOM-free.
 * A pair is checked only when both tokens exist and resolve to opaque colours.
 */
import { parseColor, contrastRatio } from './color.js';

export const AA_TEXT = 4.5;   // normal text
export const AA_LARGE = 3;    // large text, graphics and UI indicators (WCAG 1.4.3, 1.4.11)

/**
 * [foreground, background, minimum, what it is]. Token names without `--slipr-`.
 * @type {ReadonlyArray<[string, string, number, string]>}
 */
export const PAIRS = [
  ['color-text', 'color-bg', AA_TEXT, 'Body text'],
  ['color-text', 'color-surface', AA_TEXT, 'Text on surface'],
  ['color-muted', 'color-bg', AA_TEXT, 'Muted text'],
  ['color-muted', 'color-surface', AA_TEXT, 'Muted text on surface'],
  ['color-primary', 'color-bg', AA_TEXT, 'Headings and links'],
  ['color-on-primary', 'color-primary', AA_TEXT, 'Text on primary'],
  ['color-accent', 'color-bg', AA_LARGE, 'Accent (large text, graphics)'],
  ['color-info', 'color-bg', AA_TEXT, 'Info callout title'],
  ['color-tip', 'color-bg', AA_TEXT, 'Tip callout title'],
  ['color-warning', 'color-bg', AA_TEXT, 'Warning callout title'],
  ['table-header-text', 'table-header-bg', AA_TEXT, 'Table header'],
  ['color-text', 'table-stripe', AA_TEXT, 'Table stripe'],
  ['table-positive', 'color-bg', AA_TEXT, 'Positive numbers'],
  ['table-negative', 'color-bg', AA_TEXT, 'Negative numbers'],
  ['table-strong', 'color-bg', AA_LARGE, 'Table bars and scales'],
  ['tag-cloud-1', 'color-bg', AA_TEXT, 'Tag cloud, lightest terms'],
  ['tag-cloud-2', 'color-bg', AA_LARGE, 'Tag cloud, tier 2'],
  ['tag-cloud-3', 'color-bg', AA_LARGE, 'Tag cloud, tier 3'],
  ['tag-cloud-4', 'color-bg', AA_LARGE, 'Tag cloud, heaviest terms'],
  ...[1, 2, 3, 4, 5, 6].map((n) => /** @type {[string, string, number, string]} */ ([`graph-${n}`, 'color-bg', AA_LARGE, `Graph colour ${n}`])),
];

/**
 * @typedef {object} ContrastResult
 * @property {string} fg      Token name.
 * @property {string} bg      Token name.
 * @property {number} min
 * @property {string} label
 * @property {number} ratio   Rounded down to two decimals, as WCAG tools show it.
 * @property {boolean} pass
 */

/**
 * Check every pair whose tokens exist and are opaque colours.
 * @param {Array<{ name: string, resolved: string | null }>} catalog
 * @returns {ContrastResult[]}
 */
export function checkContrast(catalog) {
  const colors = new Map();
  for (const t of catalog) {
    const c = t.resolved ? parseColor(t.resolved) : null;
    if (c && c.a === 1) colors.set(t.name, c);
  }
  /** @type {ContrastResult[]} */
  const results = [];
  for (const [fgShort, bgShort, min, label] of PAIRS) {
    const fg = `--slipr-${fgShort}`;
    const bg = `--slipr-${bgShort}`;
    if (!colors.has(fg) || !colors.has(bg)) continue;
    const ratio = Math.floor(contrastRatio(colors.get(fg), colors.get(bg)) * 100) / 100;
    results.push({ fg, bg, min, label, ratio, pass: ratio >= min });
  }
  return results;
}
