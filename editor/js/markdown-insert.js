// @ts-check
/**
 * Inserting Slipr's Markdown extensions into a text field (E-008): glossary
 * references, popups and slide links. Each function takes the text and the
 * selection, and returns the new text and the new selection. DOM-free.
 * Syntax: docs/show-format.md, "Markdown subset".
 */

/**
 * @typedef {object} Edit
 * @property {string} text   The new text.
 * @property {number} start  New selection start.
 * @property {number} end    New selection end.
 */

/**
 * Replace the selection with `insert`; the cursor ends at `cursor` (relative to the insert), or after it.
 * @param {string} text @param {number} start @param {number} end @param {string} insert @param {number} [cursor]
 * @returns {Edit}
 */
function replaceSelection(text, start, end, insert, cursor = insert.length) {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  const at = s + cursor;
  return { text: text.slice(0, s) + insert + text.slice(e), start: at, end: at };
}

/**
 * Glossary reference: `[[term]]`, or `[[term|selected text]]` to keep the selected words.
 * @param {string} text @param {number} start @param {number} end @param {string} termId
 * @returns {Edit}
 */
export function insertGlossaryRef(text, start, end, termId) {
  const selected = text.slice(start, end).trim();
  return replaceSelection(text, start, end, selected ? `[[${termId}|${selected}]]` : `[[${termId}]]`);
}

/**
 * Popup (footnote): wraps the selection in `^[…]`, or inserts `^[]` with the cursor inside.
 * @param {string} text @param {number} start @param {number} end
 * @returns {Edit}
 */
export function insertPopup(text, start, end) {
  const selected = text.slice(start, end);
  return selected
    ? replaceSelection(text, start, end, `^[${selected}]`)
    : replaceSelection(text, start, end, '^[]', 2);
}

/**
 * Link to a slide: `[selected text](#slide-id)`, or the slide's title as link text.
 * Square brackets in the title are dropped so the link stays valid.
 * @param {string} text @param {number} start @param {number} end @param {string} slideId @param {string} title
 * @returns {Edit}
 */
export function insertSlideLink(text, start, end, slideId, title) {
  const label = (text.slice(start, end) || title || slideId).replace(/[[\]]/g, '');
  return replaceSelection(text, start, end, `[${label}](#${slideId})`);
}
