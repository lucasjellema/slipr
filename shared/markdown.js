// @ts-check
/**
 * Slipr Markdown: a small, safe Markdown subset with Slipr extensions.
 * Spec: docs/show-format.md → "Markdown subset".
 *
 * Block level: paragraphs, bullet lists (- or *), numbered lists (1.),
 *   nesting by 2-space indent, fenced code blocks (```lang).
 * Inline: **bold**, *italic*, _italic_, `code`, [text](url), \ escapes,
 *   [[glossary-id]] / [[glossary-id|text]], ^[inline popup], [text](#slide-id).
 *
 * Safety: ALL source text is HTML-escaped; only the tags generated here are
 * emitted, and link URLs are restricted to http(s), mailto, relative paths and
 * #fragments. This module is the only sanctioned producer of HTML from show
 * content: callers may assign its output to innerHTML.
 *
 * Mode: in 'audience' mode glossary references become plain text and popups
 * are dropped; in 'reader' mode they become interactive markers that
 * viewer/reader/interactions.js wires up.
 */

/**
 * @typedef {object} MarkdownOptions
 * @property {'audience' | 'reader'} [mode] Default 'audience'.
 * @property {Record<string, { term: string, definition?: string }>} [glossary]
 * @property {(slideId: string) => string} [slideHref] Href for [x](#slide-id) links. Default `#id`.
 */

/**
 * marker: 'bullet' (- * +), 'number' (1. 1)), 'upper' (A. A)), 'lower' (a. a)).
 * @typedef {{ text: string, marker: 'bullet' | 'number' | 'upper' | 'lower', children: ListItem[] }} ListItem
 */

const SAFE_URL = /^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+(\/|$|\?|#))/i;

/**
 * Render Markdown (block level) to HTML.
 * @param {string} src
 * @param {MarkdownOptions} [options]
 * @returns {string}
 */
export function markdown(src, options = {}) {
  const ctx = context(options);
  const lines = normalise(src).split('\n');
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let para = [];
  const flush = () => {
    if (para.length === 1 && SUBHEADING.test(para[0].trim())) {
      // A paragraph that is entirely bold is a subheading (templates style it).
      out.push(`<p class="slipr-md-subheading">${inline(para[0].trim(), ctx)}</p>`);
    } else if (para.length) {
      out.push(`<p>${para.map((l) => inline(l.trim(), ctx)).join('<br>')}</p>`);
    }
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const code = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) code.push(lines[i]);
      const cls = fence[1] ? ` class="language-${escape(fence[1])}"` : '';
      out.push(`<pre><code${cls}>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (LIST_ITEM.test(line) && (para.length === 0 || indentOf(line) === 0)) {
      flush();
      const start = i;
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' && (LIST_ITEM.test(lines[i + 1]) || indentOf(lines[i + 1]) > 0)) i++;
      out.push(renderList(parseListLines(lines.slice(start, i + 1)), ctx));
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join('\n');
}

/**
 * Render a list slot's value to the <li> elements for an existing <ul>/<ol>.
 * Accepts a Markdown list string (non-list lines become items too) or an
 * array of strings (one item each).
 * @param {string | string[]} value
 * @param {MarkdownOptions} [options]
 * @returns {string}
 */
export function markdownListItems(value, options = {}) {
  const ctx = context(options);
  const items = Array.isArray(value)
    ? value.map((text) => ({ text, marker: /** @type {const} */ ('bullet'), children: [] }))
    : parseListLines(normalise(value).split('\n').filter((l) => l.trim() !== ''));
  return items.map((item) => renderItem(item, ctx)).join('');
}

/**
 * Render a single line of inline Markdown (no paragraphs or lists).
 * @param {string} src
 * @param {MarkdownOptions} [options]
 */
export function markdownInline(src, options = {}) {
  return inline(normalise(src), context(options));
}

/**
 * Plain text version of Markdown (for search indexes, titles, alt fallbacks).
 * @param {string} src
 * @param {MarkdownOptions} [options] Only `glossary` is used.
 */
export function markdownToText(src, options = {}) {
  const html = markdown(src, { ...options, mode: 'audience' });
  return unescape(html.replace(/<\/(p|li|pre)>/g, '\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''))
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Escape text for use in HTML content and attribute values. */
export function escape(/** @type {string} */ text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Lists

/** A whole line in bold, with no other text: "**Key findings**". */
const SUBHEADING = /^\*\*(?=\S)(?:[^*]|\*(?!\*))+?\*\*$/;

// Bullets (- * +), numbers (1. / 1)) and single letters (A. / a) …) for letter lists.
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)]|[A-Za-z][.)])\s+(.*)$/;

/** @param {string} line */
function indentOf(line) {
  return /^\s*/.exec(line)?.[0].replace(/\t/g, '  ').length ?? 0;
}

/**
 * Parse consecutive list lines into a tree. Indented non-item lines continue
 * the previous item; unindented non-item lines become items of their own.
 * @param {string[]} lines
 * @returns {ListItem[]}
 */
function parseListLines(lines) {
  /** @type {ListItem[]} */
  const root = [];
  /** Open levels, outermost first; `indent` is the indentation of that level's items. */
  /** @type {{ indent: number, items: ListItem[] }[]} */
  const stack = [{ indent: -1, items: root }];
  /** @type {ListItem | null} */
  let last = null;

  for (const line of lines) {
    const m = LIST_ITEM.exec(line);
    const indent = indentOf(line);
    if (!m && last && indent > 0) {
      last.text += ` ${line.trim()}`; // continuation of the previous item
      continue;
    }
    /** @type {ListItem} */
    const item = { text: m ? m[3] : line.trim(), marker: m ? markerOf(m[2]) : 'bullet', children: [] };

    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
    let level = stack[stack.length - 1];
    if (level.indent === -1) level.indent = indent;
    const parent = level.items[level.items.length - 1];
    if (indent > level.indent && parent) {
      level = { indent, items: parent.children };
      stack.push(level);
    }
    level.items.push(item);
    last = item;
  }
  return root;
}

/** @param {string} token @returns {ListItem['marker']} */
function markerOf(token) {
  if (/^\d/.test(token)) return 'number';
  if (/^[A-Z]/.test(token)) return 'upper';
  if (/^[a-z]/.test(token)) return 'lower';
  return 'bullet';
}

/** @param {ListItem[]} items @param {Ctx} ctx */
function renderList(items, ctx) {
  const marker = items[0]?.marker ?? 'bullet';
  const open = { bullet: '<ul>', number: '<ol>', upper: '<ol type="A">', lower: '<ol type="a">' }[marker];
  const tag = marker === 'bullet' ? 'ul' : 'ol';
  return `${open}${items.map((item) => renderItem(item, ctx)).join('')}</${tag}>`;
}

/** @param {ListItem} item @param {Ctx} ctx */
function renderItem(item, ctx) {
  const nested = item.children.length ? renderList(item.children, ctx) : '';
  return `<li>${inline(item.text.trim(), ctx)}${nested}</li>`;
}

// ---------------------------------------------------------------------------
// Inline

/**
 * @typedef {object} Ctx
 * @property {'audience' | 'reader'} mode
 * @property {Record<string, { term: string }>} glossary
 * @property {(id: string) => string} slideHref
 * @property {{ n: number }} footnotes counter shared across one render call
 */

/** @param {MarkdownOptions} options @returns {Ctx} */
function context(options) {
  return {
    mode: options.mode ?? 'audience',
    glossary: options.glossary ?? {},
    slideHref: options.slideHref ?? ((id) => `#${id}`),
    footnotes: { n: 0 },
  };
}

/**
 * @param {string} src
 * @param {Ctx} ctx
 * @returns {string}
 */
function inline(src, ctx) {
  /** @type {string[]} */
  const tokens = [];
  const stash = (/** @type {string} */ html) => `\u0000${tokens.push(html) - 1}\u0000`;

  let s = src;
  s = s.replace(/\\([\\`*_[\]()#^!|~+-])/g, (_, c) => stash(escape(c)));
  s = s.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escape(code)}</code>`));
  s = replaceBalanced(s, '^[', (content) => (ctx.mode === 'reader' ? stash(footnote(content, ctx)) : ''));
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, id, text) => stash(glossaryTerm(id.trim(), text, ctx)));
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, text, url) => stash(link(text, url, ctx)));
  s = escape(s);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>');
  s = s.replace(/\*(?=[^\s*])([^*])\*/g, '<em>$1</em>');
  s = s.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?![\w])/g, '$1<em>$2</em>');
  // tokens may contain other tokens' markers (none today, but be safe)
  for (let pass = 0; pass < 3 && s.includes('\u0000'); pass++) {
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
  }
  return s;
}

/** @param {string} id @param {string | undefined} text @param {Ctx} ctx */
function glossaryTerm(id, text, ctx) {
  const entry = ctx.glossary[id];
  const label = escape(text?.trim() || entry?.term || id);
  if (ctx.mode !== 'reader') return label;
  return `<button type="button" class="slipr-term" data-term="${escape(id)}">${label}</button>`;
}

/** @param {string} content @param {Ctx} ctx */
function footnote(content, ctx) {
  const n = ++ctx.footnotes.n;
  const body = inline(content.trim(), { ...ctx, mode: 'reader' });
  return `<button type="button" class="slipr-footnote-ref" data-footnote="${n}" aria-label="Note ${n}">${n}</button>`
    + `<span class="slipr-footnote" data-footnote="${n}" hidden>${body}</span>`;
}

/** @param {string} text @param {string} url @param {Ctx} ctx */
function link(text, url, ctx) {
  const label = inline(text, { ...ctx, footnotes: ctx.footnotes });
  if (!SAFE_URL.test(url) || /^\s*(javascript|data|vbscript):/i.test(url)) return label;
  if (url.startsWith('#') && url.length > 1) {
    const slideId = url.slice(1).split('/')[0];
    return `<a href="${escape(ctx.slideHref(url.slice(1)))}" data-slide-link="${escape(slideId)}">${label}</a>`;
  }
  const external = /^https?:/i.test(url);
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${escape(url)}"${attrs}>${label}</a>`;
}

/**
 * Replace every `open … ]` construct (e.g. "^[ … ]") whose brackets balance.
 * @param {string} s @param {string} open @param {(content: string) => string} fn
 */
function replaceBalanced(s, open, fn) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf(open, i);
    if (start === -1) break;
    let depth = 1;
    let j = start + open.length;
    for (; j < s.length && depth > 0; j++) {
      if (s[j] === '[') depth++;
      else if (s[j] === ']') depth--;
    }
    if (depth !== 0) break;
    out += s.slice(i, start) + fn(s.slice(start + open.length, j - 1));
    i = j;
  }
  return out + s.slice(i);
}

/** @param {string} src */
function normalise(src) {
  return String(src ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

/** @param {string} html */
function unescape(html) {
  return html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
