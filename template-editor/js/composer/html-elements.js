// @ts-check
/**
 * A small reader for layout fragments (I-111). DOM-free, so the composer's
 * model is tested in Node. Layout files are trusted, mostly well-formed
 * template files; this finds their elements, attributes and offsets without
 * a full HTML parser.
 */

/** Elements that never have a closing tag. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * @typedef {object} HtmlElement
 * @property {string} tag             Lower case.
 * @property {Map<string, string>} attrs  Lower-case names; a bare attribute has ''.
 * @property {number} start           Offset of `<`.
 * @property {number} openEnd         Offset just after the opening tag's `>`.
 * @property {number} end             Offset just after the closing tag (or the opening tag of a void element).
 * @property {HtmlElement[]} children
 */

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/**
 * The top-level elements of a fragment, with their descendants.
 * @param {string} html
 * @returns {HtmlElement[]}
 */
export function parseElements(html) {
  /** @type {HtmlElement[]} */
  const roots = [];
  /** @type {HtmlElement[]} */
  const stack = [];
  TAG.lastIndex = 0;
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    if (!m[2]) continue; // a comment
    const tag = m[2].toLowerCase();
    if (m[1]) {
      // A closing tag: close up to the matching open element.
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i < 0) continue;
      for (const open of stack.splice(i)) open.end = m.index + m[0].length;
      continue;
    }
    /** @type {HtmlElement} */
    const el = { tag, attrs: parseAttributes(m[3]), start: m.index, openEnd: m.index + m[0].length, end: m.index + m[0].length, children: [] };
    (stack.at(-1)?.children ?? roots).push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(el);
  }
  for (const open of stack) open.end = html.length;
  return roots;
}

/**
 * Every element of a fragment, depth first.
 * @param {HtmlElement[]} elements
 * @returns {HtmlElement[]}
 */
export function allElements(elements) {
  return elements.flatMap((e) => [e, ...allElements(e.children)]);
}

/**
 * @param {string} text  The attribute part of an opening tag.
 * @returns {Map<string, string>}
 */
export function parseAttributes(text) {
  /** @type {Map<string, string>} */
  const attrs = new Map();
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    attrs.set(m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return attrs;
}

/** @param {string} s */
function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** @param {string} s */
export function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * An element's markup with attributes set (a value) or removed (null) on its
 * opening tag. Set attributes are written in the order given, after the others.
 * @param {string} markup  One element, from its `<`.
 * @param {Record<string, string | null>} changes
 * @returns {string}
 */
export function withAttributes(markup, changes) {
  const [el] = parseElements(markup);
  if (!el) return markup;
  const attrs = new Map(el.attrs);
  for (const [name, value] of Object.entries(changes)) {
    attrs.delete(name);
    if (value !== null) attrs.set(name, value);
  }
  const open = `<${el.tag}${[...attrs].map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')}>`;
  return markup.slice(0, el.start) + open + markup.slice(el.openEnd);
}

/**
 * The class list of an element.
 * @param {HtmlElement} el
 * @returns {string[]}
 */
export function classesOf(el) {
  return (el.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
}
