// @ts-check
/**
 * Custom properties ("tokens") in a template stylesheet (I-106, D-017).
 * DOM-free: the template editor reads and changes token values through
 * these functions only, so everything else in the file stays as written.
 *
 * Only declarations in **top-level `:root` rules** count; `:root` inside
 * `@media` and other rules is left alone. A token's value is changed in place:
 * the text between its colon and semicolon, nothing else.
 */

/**
 * @typedef {object} TokenDecl
 * @property {string} name        `--slipr-color-primary`
 * @property {string} value       The value as written, trimmed (comments inside it kept).
 * @property {number} valueStart  Offset of the value in the stylesheet.
 * @property {number} valueEnd    Offset just after the value.
 * @property {number} index       Order within the stylesheet (0, 1, …).
 * @property {string} group       Label of the comment heading the declaration's group ('' for none).
 * @property {string} groupNote   The rest of that heading comment (after `:` or inside `( )`).
 * @property {string} note        A comment on the same line after the declaration, or a longer comment just above it.
 */

/**
 * @typedef {object} RootRule
 * @property {number} start      Offset where the rule (its selector) starts.
 * @property {number} bodyStart  Offset just after `{`.
 * @property {number} bodyEnd    Offset of the closing `}`.
 */

/**
 * The top-level `:root` rules of a stylesheet.
 * @param {string} css
 * @returns {RootRule[]}
 */
export function rootRules(css) {
  /** @type {RootRule[]} */
  const rules = [];
  let i = 0;
  let preludeStart = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      i = commentEnd(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = stringEnd(css, i);
      continue;
    }
    if (ch === ';') {
      // A top-level statement such as @import or @charset.
      i += 1;
      preludeStart = i;
      continue;
    }
    if (ch === '{') {
      const close = blockEnd(css, i);
      const selector = stripComments(css.slice(preludeStart, i)).trim();
      if (selector === ':root') {
        rules.push({ start: preludeStart + leadingSpace(css.slice(preludeStart, i)), bodyStart: i + 1, bodyEnd: close });
      }
      i = close + 1;
      preludeStart = i;
      continue;
    }
    if (ch === '}') {
      // A stray closing brace: skip it.
      i += 1;
      preludeStart = i;
      continue;
    }
    i += 1;
  }
  return rules;
}

/**
 * The token declarations of a stylesheet, in order.
 * @param {string} css
 * @returns {TokenDecl[]}
 */
export function parseTokens(css) {
  /** @type {TokenDecl[]} */
  const tokens = [];
  for (const rule of rootRules(css)) {
    let group = '';
    let groupNote = '';
    let pendingNote = '';
    let i = rule.bodyStart;
    while (i < rule.bodyEnd) {
      const ch = css[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === '/' && css[i + 1] === '*') {
        const end = commentEnd(css, i);
        const text = css.slice(i + 2, end - 2).trim();
        if (/\n/.test(text) || text.length > 80) {
          pendingNote = text.replace(/\s+/g, ' ');
        } else {
          ({ label: group, note: groupNote } = headingParts(text));
          pendingNote = '';
        }
        i = end;
        continue;
      }
      const semi = declarationEnd(css, i, rule.bodyEnd);
      const decl = css.slice(i, semi);
      const colon = decl.indexOf(':');
      const name = colon === -1 ? '' : decl.slice(0, colon).trim();
      if (name.startsWith('--')) {
        const rawStart = i + colon + 1;
        const lead = leadingSpace(css.slice(rawStart, semi));
        const valueStart = rawStart + lead;
        const valueEnd = semi - trailingSpace(css.slice(valueStart, semi));
        let note = pendingNote;
        // A comment after the semicolon on the same line belongs to this declaration.
        const after = /^;[ \t]*\/\*/.exec(css.slice(semi, semi + 200));
        let next = semi + 1;
        if (after) {
          const start = semi + after[0].length - 2;
          const end = commentEnd(css, start);
          note = css.slice(start + 2, end - 2).trim();
          next = end;
        }
        tokens.push({ name, value: css.slice(valueStart, valueEnd), valueStart, valueEnd, index: tokens.length, group, groupNote, note });
        pendingNote = '';
        i = next;
        continue;
      }
      i = semi + 1;
    }
  }
  return tokens;
}

/**
 * Change the value of a token in place: the **last** top-level `:root`
 * declaration of `name` (the one that wins). Nothing else changes.
 * @param {string} css
 * @param {string} name
 * @param {string} value  Checked with `checkValue()` first; throws when it is not safe.
 * @returns {string}
 */
export function setTokenValue(css, name, value) {
  const problem = checkValue(value);
  if (problem) throw new Error(`${name}: ${problem}`);
  const decl = parseTokens(css).filter((t) => t.name === name).pop();
  if (!decl) throw new Error(`${name} is not declared in a :root rule of this stylesheet.`);
  return css.slice(0, decl.valueStart) + value.trim() + css.slice(decl.valueEnd);
}

/**
 * Why a value cannot be written into a stylesheet as is, or null when it can.
 * Guards the file, not CSS validity: no `;`, braces or comment markers, and
 * balanced quotes and brackets.
 * @param {string} value
 * @returns {string | null}
 */
export function checkValue(value) {
  const v = String(value ?? '').trim();
  if (v === '') return 'The value is empty.';
  if (/[;{}]/.test(v)) return 'A value cannot contain ; { or }.';
  if (v.includes('/*') || v.includes('*/')) return 'A value cannot contain a comment.';
  if (/[<>]/.test(v)) return 'A value cannot contain < or >.';
  /** @type {string | null} */
  let quote = null;
  let depth = 0;
  for (let i = 0; i < v.length; i += 1) {
    const ch = v[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')' && --depth < 0) return 'A ) has no matching (.';
  }
  if (quote) return 'A quote is not closed.';
  if (depth !== 0) return 'A ( is not closed.';
  return null;
}

/**
 * The token a value refers to when the whole value is one `var()`, else null.
 * @param {string} value
 * @returns {string | null}
 */
export function linkedToken(value) {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,[^]*)?\)$/.exec(String(value).trim());
  return m ? m[1] : null;
}

/**
 * Follow `var()` links to a token's final value.
 * @param {string} name
 * @param {Map<string, string>} values  Token name → value as written.
 * @returns {string | null}  null when the chain ends at an unknown token or loops.
 */
export function resolveToken(name, values) {
  const seen = new Set();
  let current = name;
  while (!seen.has(current)) {
    seen.add(current);
    const value = values.get(current);
    if (value === undefined) return null;
    const next = linkedToken(value);
    if (!next) return value;
    if (!values.has(next)) {
      const fallback = /^var\(\s*--[\w-]+\s*,\s*([^]*)\)$/.exec(value.trim());
      return fallback ? fallback[1].trim() : null;
    }
    current = next;
  }
  return null;
}

/**
 * Font families declared with `@font-face` (top level), in order, without duplicates.
 * @param {string} css
 * @returns {string[]}
 */
export function fontFaceFamilies(css) {
  const families = [];
  for (const m of stripComments(css).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family\s*:\s*(["']?)([^;"']+)\1/.exec(m[1]);
    if (family && !families.includes(family[2].trim())) families.push(family[2].trim());
  }
  return families;
}

/**
 * @typedef {object} FontFace
 * @property {string} family  Letters, digits, spaces and hyphens.
 * @property {string} src     Path relative to the stylesheet, e.g. `assets/fonts/brand.woff2`.
 * @property {string} [weight]  `400`, `700`, `100 900` … (default `400`)
 * @property {'normal' | 'italic'} [style]
 */

/**
 * Insert an `@font-face` rule above the first top-level `:root` rule (or at the end).
 * @param {string} css
 * @param {FontFace} face
 * @returns {string}
 */
export function addFontFace(css, face) {
  const family = cleanFamily(face.family);
  if (!family) throw new Error('A font needs a family name (letters, digits, spaces or hyphens).');
  if (!/^[\w./-]+\.(woff2|woff|ttf|otf)$/i.test(face.src) || face.src.includes('..')) {
    throw new Error(`"${face.src}" is not a font file path inside the template.`);
  }
  const weight = /^\d{3}( \d{3})?$/.test(face.weight ?? '') ? face.weight : '400';
  const style = face.style === 'italic' ? 'italic' : 'normal';
  const format = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[face.src.split('.').pop()?.toLowerCase() ?? ''];
  const rule = [
    '@font-face {',
    `  font-family: "${family}";`,
    `  src: url("${face.src}") format("${format}");`,
    `  font-weight: ${weight};`,
    `  font-style: ${style};`,
    '  font-display: swap;',
    '}',
    '',
  ].join('\n');
  const first = rootRules(css)[0];
  if (!first) return css.replace(/\s*$/, '\n\n') + rule;
  return css.slice(0, first.start) + rule + '\n' + css.slice(first.start);
}

/**
 * A family name as it may appear in a font stack: letters, digits, spaces and hyphens.
 * @param {string} family
 * @returns {string}
 */
export function cleanFamily(family) {
  return String(family ?? '').replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * Is this a relative path (not a URL with a scheme, not root-relative, not a fragment)?
 * @param {string} path
 */
export function isRelativePath(path) {
  return path !== '' && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(path);
}

/**
 * Replace each relative `url()` in a stylesheet with `resolve(path)`.
 * @param {string} css
 * @param {(path: string) => string} resolve
 * @returns {string}
 */
export function rewriteCssUrls(css, resolve) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, _q, path) => (
    isRelativePath(path.trim()) ? `url("${resolve(path.trim())}")` : whole
  ));
}

/**
 * The relative `url()` paths of a stylesheet, in order, without duplicates.
 * @param {string} css
 * @returns {string[]}
 */
export function cssUrls(css) {
  const paths = [];
  for (const m of stripComments(css).matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
    const path = m[2].trim();
    if (isRelativePath(path) && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

/**
 * Replace each relative `src`, `href` and `poster` attribute in an HTML fragment.
 * @param {string} html
 * @param {(path: string) => string} resolve
 * @returns {string}
 */
export function rewriteHtmlUrls(html, resolve) {
  return html.replace(/\b(src|href|poster)=(["'])([^"']*)\2/g, (whole, attr, q, path) => (
    isRelativePath(path) ? `${attr}=${q}${resolve(path)}${q}` : whole
  ));
}

/**
 * The relative `src`, `href` and `poster` paths of an HTML fragment.
 * @param {string} html
 * @returns {string[]}
 */
export function htmlUrls(html) {
  const paths = [];
  for (const m of html.matchAll(/\b(?:src|href|poster)=(["'])([^"']*)\1/g)) {
    if (isRelativePath(m[2]) && !paths.includes(m[2])) paths.push(m[2]);
  }
  return paths;
}

// ---------------------------------------------------------------------------

/**
 * A heading comment split into a short label and the rest:
 * "Data tables (I-104)" → "Data tables"; "Style guide: keep in sync" → "Style guide" + "keep in sync".
 * @param {string} text
 */
function headingParts(text) {
  const clean = text.replace(/\s*\((?:[A-Z]-\d+(?:,\s*)?)+\)/g, '').replace(/,\s*[A-Z]-\d+(?=\))/g, '').trim();
  const m = /^([^:(]+?)\s*(?::\s*|\(\s*)([^]*?)\)?$/.exec(clean);
  if (m && m[2]) return { label: m[1].trim(), note: m[2].trim() };
  return { label: clean, note: '' };
}

/** @param {string} css @param {number} i  Offset of `/*`. @returns {number} Offset after the comment. */
function commentEnd(css, i) {
  const end = css.indexOf('*/', i + 2);
  return end === -1 ? css.length : end + 2;
}

/** @param {string} css @param {number} i  Offset of the opening quote. @returns {number} Offset after the string. */
function stringEnd(css, i) {
  const quote = css[i];
  let j = i + 1;
  while (j < css.length && css[j] !== quote && css[j] !== '\n') {
    if (css[j] === '\\') j += 1;
    j += 1;
  }
  return j + 1;
}

/** @param {string} css @param {number} open  Offset of `{`. @returns {number} Offset of the matching `}`. */
function blockEnd(css, open) {
  let depth = 0;
  let i = open;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      i = commentEnd(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = stringEnd(css, i);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return i;
    i += 1;
  }
  return css.length;
}

/**
 * Offset of the `;` that ends a declaration starting at `i` (or `limit`).
 * @param {string} css @param {number} i @param {number} limit
 */
function declarationEnd(css, i, limit) {
  let depth = 0;
  while (i < limit) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      i = commentEnd(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = stringEnd(css, i);
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ';' && depth <= 0) return i;
    i += 1;
  }
  return limit;
}

/** @param {string} css */
function stripComments(css) {
  return css.replace(/\/\*[^]*?\*\//g, '');
}

/** @param {string} s */
function leadingSpace(s) {
  return s.length - s.trimStart().length;
}

/** @param {string} s */
function trailingSpace(s) {
  return s.length - s.trimEnd().length;
}
