// @ts-check
/**
 * Save `template.json` the way it was written (I-106, D-017): when only
 * values changed, replace just those values in the original text, so a
 * hand-formatted file keeps its layout and the diff shows only the change.
 * DOM-free.
 */

/**
 * The text of `updated`, written as a patch of `text` (the JSON of `original`)
 * when the structure is the same and only scalar values changed; otherwise
 * the whole object, 2-space indented.
 * @param {string} text      The original file.
 * @param {any} original     JSON.parse(text)
 * @param {any} updated
 * @returns {string}
 */
export function patchJsonText(text, original, updated) {
  /** @type {Array<{ path: string, value: any }>} */
  const changes = [];
  if (!sameShape(original, updated, [], changes)) return JSON.stringify(updated, null, 2) + '\n';
  if (!changes.length) return text;
  const spans = valueSpans(text);
  const edits = changes.map(({ path, value }) => ({ span: spans.get(path), value }));
  if (edits.some((e) => !e.span)) return JSON.stringify(updated, null, 2) + '\n';
  let out = text;
  for (const { span, value } of edits.sort((a, b) => (b.span?.start ?? 0) - (a.span?.start ?? 0))) {
    if (!span) continue;
    out = out.slice(0, span.start) + JSON.stringify(value) + out.slice(span.end);
  }
  return out;
}

/**
 * Same keys, same array lengths, same container types; scalar differences are collected.
 * @param {any} a @param {any} b @param {Array<string | number>} path
 * @param {Array<{ path: string, value: any }>} changes
 * @returns {boolean}
 */
function sameShape(a, b, path, changes) {
  const kind = (/** @type {any} */ v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (kind(a) === 'object' || kind(b) === 'object' || kind(a) === 'array' || kind(b) === 'array') {
    if (kind(a) !== kind(b)) return false;
    if (kind(a) === 'array') {
      if (a.length !== b.length) return false;
      return a.every((/** @type {any} */ v, /** @type {number} */ i) => sameShape(v, b[i], [...path, i], changes));
    }
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => sameShape(a[k], b[k], [...path, k], changes));
  }
  if (a !== b) changes.push({ path: JSON.stringify(path), value: b });
  return true;
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
