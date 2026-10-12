// @ts-check
/**
 * Slot value shapes for the slide form. DOM-free, so it can be tested with node --test.
 *
 * The form must write the value shape the format requires (docs/show-format.md,
 * "Slot value types"). Slot types without a real editor yet are read-only (E-010).
 * Quote, code and cards values are built by card-values.js (E-004, I-035).
 */

/** Slot types with an editable input in the slide form. */
const EDITABLE = new Set(['text', 'richtext', 'list', 'image', 'quote', 'code', 'cards', 'web']);

/**
 * Decide how the slide form edits a slot.
 * Without a slot definition the kind follows the value: strings are edited as text,
 * anything else is read-only.
 * @param {string | undefined} slotType
 * @param {any} [value]
 * @returns {'text' | 'textarea' | 'image' | 'quote' | 'code' | 'cards' | 'web' | 'readonly'}
 */
export function slotEditorKind(slotType, value) {
  if (slotType === undefined) {
    return value === undefined || typeof value === 'string' ? 'text' : 'readonly';
  }
  if (!EDITABLE.has(slotType)) return 'readonly';
  if (slotType === 'image' || slotType === 'quote' || slotType === 'code' || slotType === 'cards' || slotType === 'web') return slotType;
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
  if (slotType === 'code' && typeof value?.code === 'string') {
    const lines = value.code.split('\n').length;
    return `${value.language ?? 'code'}, ${lines} line${lines === 1 ? '' : 's'}`;
  }
  return JSON.stringify(value);
}
