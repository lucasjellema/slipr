// @ts-check
/**
 * Slot value shapes for the slide form. DOM-free, so it can be tested with node --test.
 *
 * The form must write the value shape the format requires (docs/show-format.md,
 * "Slot value types"). Slot types without a real editor yet are read-only (E-010).
 * Quote, code and cards values are built by card-values.js (E-004, I-035).
 */

/** Slot types with an editable input in the slide form. */
const EDITABLE = new Set(['text', 'richtext', 'list', 'image', 'quote', 'code', 'cards', 'web', 'pdf', 'map', 'graph', 'table', 'tag-cloud']);

/**
 * Decide how the slide form edits a slot.
 * Without a slot definition the kind follows the value: strings are edited as text,
 * anything else is read-only.
 * @param {string | undefined} slotType
 * @param {any} [value]
 * @returns {'text' | 'textarea' | 'image' | 'quote' | 'code' | 'cards' | 'web' | 'pdf' | 'map' | 'graph' | 'table' | 'tag-cloud' | 'readonly'}
 */
export function slotEditorKind(slotType, value) {
  if (slotType === undefined) {
    return value === undefined || typeof value === 'string' ? 'text' : 'readonly';
  }
  if (!EDITABLE.has(slotType)) return 'readonly';
  if (slotType === 'image' || slotType === 'quote' || slotType === 'code' || slotType === 'cards' || slotType === 'web' || slotType === 'pdf' || slotType === 'map' || slotType === 'graph' || slotType === 'table' || slotType === 'tag-cloud') return slotType;
  return slotType === 'text' ? 'text' : 'textarea';
}

/**
 * Text shown in a textarea for a `richtext` or `list` value.
 * An array list is shown one item per line.
 * @param {any} value
 * @returns {string}
 */
export function textareaText(value) {
  if (Array.isArray(value)) return value.join('\n');
  return typeof value === 'string' ? value : '';
}

/**
 * Value to store for a `text` or `richtext` slot. Empty text removes the slot.
 * @param {string} text
 * @returns {string | undefined}
 */
export function textValue(text) {
  return text === '' ? undefined : text;
}

/**
 * Value to store for a `list` slot. A list that was an array stays an array
 * (one item per non-empty line); otherwise it is a Markdown string.
 * @param {any} previous
 * @param {string} text
 * @returns {string | string[] | undefined}
 */
export function listValue(previous, text) {
  if (Array.isArray(previous)) {
    const items = text.split('\n').filter((line) => line.trim() !== '');
    return items.length ? items : undefined;
  }
  return textValue(text);
}

/**
 * Value to store for an `image` slot: `{ src, alt, … }`, keeping other fields
 * such as `fit` and `focus`. An empty `src` removes the slot; an empty `alt`
 * is left out (the validator warns about it); a field changed to undefined is removed.
 * @param {any} previous
 * @param {{ src?: string, alt?: string }} change
 * @returns {Record<string, any> | undefined}
 */
export function imageValue(previous, change) {
  const base = previous !== null && typeof previous === 'object' && !Array.isArray(previous)
    ? { ...previous }
    : typeof previous === 'string' ? { src: previous } : {};
  const next = { ...base, ...change };
  if (!next.src) return undefined;
  if (!next.alt) delete next.alt;
  // A field changed to undefined (e.g. fit back to the template default) is removed.
  for (const [key, value] of Object.entries(change)) if (value === undefined) delete next[key];
  return next;
}

/**
 * A morph name (I-091) as typed, cleaned to what the format allows: spaces
 * become "-", other characters are dropped, at most 60. Empty: undefined.
 * @param {string} text
 * @returns {string | undefined}
 */
export function cleanMorphId(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '').replace(/^[-_]+/, '').slice(0, 60);
  return s || undefined;
}

/**
 * A graph's read-only summary (I-074: graphs are edited in show.json for now).
 * @param {any} value
 * @returns {string}
 */
export function graphSummary(value) {
  const n = Array.isArray(value?.nodes) ? value.nodes.length : 0;
  const e = Array.isArray(value?.edges) ? value.edges.length : 0;
  const s = Array.isArray(value?.steps) ? value.steps.length : 0;
  const counts = `${n} node${n === 1 ? '' : 's'}, ${e} link${e === 1 ? '' : 's'}`;
  const parts = typeof value?.data === 'string'
    ? [`Graph from ${value.data}`, ...(n || e ? [`plus ${counts}`] : [])]
    : [`Graph: ${counts}`];
  if (s) parts.push(`${s} step${s === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/**
 * A map's read-only summary (I-075: maps are edited in show.json for now).
 * @param {any} value
 * @returns {string}
 */
export function mapSummary(value) {
  const m = Array.isArray(value?.markers) ? value.markers.length : 0;
  const l = Array.isArray(value?.layers) ? value.layers.length : 0;
  const s = Array.isArray(value?.steps) ? value.steps.length : 0;
  const parts = [`Map: ${m} place${m === 1 ? '' : 's'}`];
  if (l) parts.push(`${l} layer${l === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} step${s === 1 ? '' : 's'}`);
  const tiles = value?.tiles === 'none' ? 'no tiles'
    : typeof (value?.tiles?.url ?? value?.tiles) === 'string' ? `tiles from ${String(value.tiles.url ?? value.tiles).replace(/^https:\/\/([^/]+).*$/, '$1')}`
      : 'OpenStreetMap tiles';
  parts.push(tiles);
  return `${parts.join(', ')}. Edit it in show.json.`;
}

/**
 * Short read-only summary of a slot value that has no editor yet.
 * @param {string | undefined} slotType
 * @param {any} value
 * @returns {string}
 */
export function describeValue(slotType, value) {
  if (value === undefined || value === null || value === '') return '(empty)';
  if (slotType === 'cards' && Array.isArray(value)) {
    return `${value.length} card${value.length === 1 ? '' : 's'}`;
  }
  if (slotType === 'quote' && typeof value?.text === 'string') {
    return value.source ? `“${value.text}” (${value.source})` : `“${value.text}”`;
  }
  if (slotType === 'graph' && value && typeof value === 'object') return graphSummary(value);
  if (slotType === 'map' && value && typeof value === 'object') return mapSummary(value);
  if (slotType === 'code' && typeof value?.code === 'string') {
    const lines = value.code.split('\n').length;
    return `${value.language ?? 'code'}, ${lines} line${lines === 1 ? '' : 's'}`;
  }
  return JSON.stringify(value);
}
