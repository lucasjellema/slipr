// @ts-check
/**
 * Save `template.json` the way it was written (I-106, D-017): when only
 * values changed, replace just those values in the original text, so a
 * hand-formatted file keeps its layout and the diff shows only the change.
 * DOM-free.
 */

/**
 * The text of `updated`, written as a patch of `text` (the JSON of `original`):
 * unchanged parts keep their text; a changed value is replaced in place; an
 * object or array whose keys or length changed is written again, reusing the
 * text of the members it kept (array members are matched by value, then by
 * `id` or `name`) and writing new members in the style of their neighbours
 * (one line, or one member per line at the same indentation; objects of plain
 * values on one line when the file writes them so) (I-111).
 * @param {string} text      The original file.
 * @param {any} original     JSON.parse(text)
 * @param {any} updated
 * @returns {string}
 */
export function patchJsonText(text, original, updated) {
  if (deepEqual(original, updated)) return text;
  const spans = valueSpans(text);
  const root = spans.get('[]');
  if (!root) return JSON.stringify(updated, null, 2) + '\n';
  compact = /^[ \t]*\{ "[^\n{}[\]]*\},?[ \t]*$/m.test(text);
  return text.slice(0, root.start) + patchNode(text, spans, [], original, updated) + text.slice(root.end);
}

/** Does the file write objects of plain values on one line (`{ "name": "title", "type": "text" }`)? */
let compact = false;

/** @typedef {Map<string, { start: number, end: number }>} Spans */

/** @param {any} v @returns {'array' | 'object' | 'scalar'} */
const kindOf = (v) => (Array.isArray(v) ? 'array' : v !== null && typeof v === 'object' ? 'object' : 'scalar');

/**
 * The new text of the value at `path`.
 * @param {string} text @param {Spans} spans
 * @param {Array<string | number>} path @param {any} a @param {any} b
 * @returns {string}
 */
function patchNode(text, spans, path, a, b) {
  const span = /** @type {{ start: number, end: number }} */ (spans.get(JSON.stringify(path)));
  const src = text.slice(span.start, span.end);
  if (deepEqual(a, b)) return src;
  const indent = lineIndent(text, span.start);
  const kind = kindOf(a);
  if (kind !== kindOf(b) || kind === 'scalar') return fresh(b, indent);
  const oldKeys = kind === 'array' ? a.map((/** @type {any} */ _, /** @type {number} */ i) => i) : Object.keys(a);
  const newKeys = kind === 'array' ? b.map((/** @type {any} */ _, /** @type {number} */ i) => i) : Object.keys(b);
  // Same keys (or length): patch the changed members inside the original text.
  if (oldKeys.length === newKeys.length && oldKeys.every((k, i) => k === newKeys[i])) {
    let out = src;
    const edits = oldKeys
      .filter((k) => !deepEqual(a[k], b[k]))
      .map((k) => ({ at: /** @type {{ start: number, end: number }} */ (spans.get(JSON.stringify([...path, k]))), text: patchNode(text, spans, [...path, k], a[k], b[k]) }))
      .sort((p, q) => q.at.start - p.at.start);
    for (const e of edits) out = out.slice(0, e.at.start - span.start) + e.text + out.slice(e.at.end - span.start);
    return out;
  }
  const multiline = src.includes('\n');
  const childIndent = memberIndent(text, spans, path, oldKeys, indent, multiline);
  /** @type {string[]} */
  const members = [];
  if (kind === 'object') {
    for (const k of newKeys) {
      members.push(`${JSON.stringify(k)}: ${k in a ? patchNode(text, spans, [...path, k], a[k], b[k]) : fresh(b[k], childIndent)}`);
    }
  } else {
    const used = new Set();
    for (const v of b) {
      let j = a.findIndex((/** @type {any} */ o, /** @type {number} */ k) => !used.has(k) && deepEqual(o, v));
      const key = kindOf(v) === 'object' ? ('id' in v ? 'id' : 'name' in v ? 'name' : null) : null;
      if (j < 0 && key) j = a.findIndex((/** @type {any} */ o, /** @type {number} */ k) => !used.has(k) && kindOf(o) === 'object' && o[key] === v[key]);
      if (j >= 0) used.add(j);
      members.push(j >= 0 ? patchNode(text, spans, [...path, j], a[j], v) : fresh(v, childIndent));
    }
  }
  const [open, close] = kind === 'array' ? ['[', ']'] : ['{', '}'];
  if (!members.length) return open + close;
  if (!multiline) {
    const pad = /^[{[]\s/.test(src) ? ' ' : '';
    return `${open}${pad}${members.join(', ')}${pad}${close}`;
  }
  return `${open}\n${members.map((m) => childIndent + m).join(',\n')}\n${indent}${close}`;
}

/**
 * The indentation of a container's members: that of its first member, or one step more than the container.
 * @param {string} text @param {Spans} spans
 * @param {Array<string | number>} path @param {Array<string | number>} keys
 * @param {string} indent @param {boolean} multiline
 */
function memberIndent(text, spans, path, keys, indent, multiline) {
  if (!multiline) return indent;
  const first = keys.length ? spans.get(JSON.stringify([...path, keys[0]])) : null;
  if (first) {
    const lineStart = text.lastIndexOf('\n', first.start - 1) + 1;
    const before = text.slice(lineStart, first.start);
    // An object member's span starts at its value: the line starts with the key.
    const ws = /^[ \t]*/.exec(before)?.[0] ?? '';
    if (ws.length) return ws;
  }
  return `${indent}  `;
}

/**
 * The whitespace at the start of the line that `offset` is on.
 * @param {string} text @param {number} offset
 */
function lineIndent(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '';
}

/**
 * A value written 2-space indented, continuing at `indent`.
 * @param {any} value @param {string} indent
 */
function fresh(value, indent) {
  const kind = kindOf(value);
  if (kind === 'scalar') return JSON.stringify(value);
  /** @type {Array<[string, any]>} */
  const entries = kind === 'array' ? value.map((/** @type {any} */ v) => ['', v]) : Object.entries(value);
  if (!entries.length) return kind === 'array' ? '[]' : '{}';
  const member = (/** @type {[string, any]} */ [k, v], /** @type {string} */ at) => `${kind === 'object' ? `${JSON.stringify(k)}: ` : ''}${fresh(v, at)}`;
  if (compact && kind === 'object' && entries.every(([, v]) => kindOf(v) === 'scalar')) {
    return `{ ${entries.map((e) => member(e, indent)).join(', ')} }`;
  }
  const [open, close] = kind === 'array' ? ['[', ']'] : ['{', '}'];
  const inner = `${indent}  `;
  return `${open}\n${entries.map((e) => inner + member(e, inner)).join(',\n')}\n${indent}${close}`;
}

/** @param {any} a @param {any} b @returns {boolean} */
function deepEqual(a, b) {
  if (a === b) return true;
  if (kindOf(a) === 'scalar' || kindOf(a) !== kindOf(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
}

/**
 * Where each value of a JSON text is: path (as JSON of the key array) → offsets.
 * @param {string} text
 * @returns {Map<string, { start: number, end: number }>}
 */
export function valueSpans(text) {
  /** @type {Map<string, { start: number, end: number }>} */
  const spans = new Map();
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i += 1; };
  const str = () => {
    i += 1;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i += 1;
  };
  /** @param {Array<string | number>} path */
  const value = (path) => {
    ws();
    const start = i;
    const ch = text[i];
    if (ch === '{') {
      i += 1;
      ws();
      while (text[i] !== '}' && i < text.length) {
        const keyStart = i;
        str();
        const key = JSON.parse(text.slice(keyStart, i));
        ws();
        i += 1; // :
        value([...path, key]);
        ws();
        if (text[i] === ',') { i += 1; ws(); }
      }
      i += 1;
    } else if (ch === '[') {
      i += 1;
      ws();
      let n = 0;
      while (text[i] !== ']' && i < text.length) {
        value([...path, n]);
        n += 1;
        ws();
        if (text[i] === ',') { i += 1; ws(); }
      }
      i += 1;
    } else if (ch === '"') {
      str();
    } else {
      while (i < text.length && !/[\s,\]}]/.test(text[i])) i += 1;
    }
    spans.set(JSON.stringify(path), { start, end: i });
  };
  value([]);
  return spans;
}
