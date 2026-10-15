// @ts-check
/**
 * The token list of the template editor (I-106): every custom property the
 * template's stylesheets declare in a top-level `:root` rule, with its kind,
 * tab, group and links. DOM-free.
 */
import { parseTokens, resolveToken, linkedToken } from './css-tokens.js';
import { parseColor } from './color.js';

/** @typedef {'theme' | 'reader'} SheetId */
/** @typedef {'color' | 'font' | 'size' | 'other'} TokenKind */

/**
 * @typedef {object} Token
 * @property {string} name
 * @property {SheetId} sheet       The stylesheet with the winning declaration (the one that is edited).
 * @property {string} value        As written.
 * @property {string | null} resolved  After following `var()` links; null when the chain breaks.
 * @property {string | null} linked   The token the value is just a `var()` of.
 * @property {TokenKind} kind
 * @property {string} group
 * @property {string} groupNote
 * @property {string} note
 * @property {string} label        A readable name: `--slipr-table-header-bg` → "Table header bg".
 */

/** The tabs of the token panel, in order. */
export const TABS = /** @type {const} */ ([
  { id: 'color', label: 'Colours' },
  { id: 'font', label: 'Type' },
  { id: 'size', label: 'Sizes' },
  { id: 'other', label: 'Other' },
]);

/**
 * Build the token list from both stylesheets: theme first, then reader, each
 * in file order. A token declared more than once is listed once, at its first
 * place, with its last (winning) declaration.
 * @param {{ theme: string, reader?: string | null }} sheets
 * @returns {Token[]}
 */
export function buildCatalog(sheets) {
  /** @type {Array<{ sheet: SheetId, decl: import('./css-tokens.js').TokenDecl }>} */
  const all = [
    ...parseTokens(sheets.theme ?? '').map((decl) => ({ sheet: /** @type {SheetId} */ ('theme'), decl })),
    ...parseTokens(sheets.reader ?? '').map((decl) => ({ sheet: /** @type {SheetId} */ ('reader'), decl })),
  ];
  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {Map<string, { sheet: SheetId, decl: import('./css-tokens.js').TokenDecl }>} */
  const winner = new Map();
  /** @type {string[]} */
  const order = [];
  for (const entry of all) {
    if (!winner.has(entry.decl.name)) order.push(entry.decl.name);
    winner.set(entry.decl.name, entry);
    values.set(entry.decl.name, entry.decl.value);
  }
  const first = new Map();
  for (const entry of all) if (!first.has(entry.decl.name)) first.set(entry.decl.name, entry.decl);

  return order.map((name) => {
    const { sheet, decl } = /** @type {{ sheet: SheetId, decl: import('./css-tokens.js').TokenDecl }} */ (winner.get(name));
    const heading = first.get(name);
    const resolved = resolveToken(name, values);
    return {
      name,
      sheet,
      value: decl.value,
      resolved,
      linked: linkedToken(decl.value),
      kind: tokenKind(name, resolved),
      group: heading.group,
      groupNote: heading.groupNote,
      note: decl.note || heading.note,
      label: tokenLabel(name),
    };
  });
}

/**
 * What kind of value a token holds, from its name and resolved value.
 * @param {string} name @param {string | null} resolved
 * @returns {TokenKind}
 */
export function tokenKind(name, resolved) {
  const v = (resolved ?? '').trim();
  if (/-font(-|$)/.test(name) && !/size|weight/.test(name)) return 'font';
  if (v && parseColor(v)) return 'color';
  if (/^(?:-?[\d.]+(?:px|rem|em|cqw|cqh|cqi|vw|vh|vmin|vmax|pt|ch|ex|%)?|(?:calc|clamp|min|max)\(.*\))$/.test(v)) return 'size';
  if (/color|colour|-bg$|-text$/.test(name) && /^(?:rgb|hsl|color-mix|#)/.test(v)) return 'color';
  return 'other';
}

/**
 * A readable label: the name without `--` and its first segment, in words.
 * @param {string} name
 * @returns {string}
 */
export function tokenLabel(name) {
  const words = name.replace(/^--/, '').split('-');
  const rest = words.length > 1 ? words.slice(1) : words;
  const text = rest.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Token name → value as written, for resolving.
 * @param {Token[]} catalog
 * @returns {Map<string, string>}
 */
export function tokenValues(catalog) {
  return new Map(catalog.map((t) => [t.name, t.value]));
}

/**
 * The tokens a token may link to: the others of the same kind, without
 * tokens that (through links) already depend on it, so no loop is offered.
 * @param {Token[]} catalog @param {string} name
 * @returns {Token[]}
 */
export function linkCandidates(catalog, name) {
  const self = catalog.find((t) => t.name === name);
  if (!self) return [];
  const byName = new Map(catalog.map((t) => [t.name, t]));
  const dependsOnSelf = (/** @type {Token} */ t) => {
    const seen = new Set();
    let current = t;
    while (current?.linked && !seen.has(current.name)) {
      if (current.linked === name) return true;
      seen.add(current.name);
      current = /** @type {Token} */ (byName.get(current.linked));
    }
    return false;
  };
  return catalog.filter((t) => t.name !== name && t.kind === self.kind && !dependsOnSelf(t));
}

/**
 * The tokens that use this one, directly or through other links.
 * @param {Token[]} catalog @param {string} name
 * @returns {string[]}
 */
export function dependents(catalog, name) {
  const out = [];
  const queue = [name];
  while (queue.length) {
    const current = queue.shift();
    for (const t of catalog) {
      if (t.linked === current && !out.includes(t.name) && t.name !== name) {
        out.push(t.name);
        queue.push(t.name);
      }
    }
  }
  return out;
}
