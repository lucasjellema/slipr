// @ts-check
/**
 * "Go to slide" in the slide list: which slides match what the user typed.
 * DOM-free, so it can be tested with node --test.
 */

/**
 * @typedef {object} SlideEntry
 * @property {number} number   1-based slide number.
 * @property {string} title
 * @property {string} [layout]
 * @property {string} [chapter] Chapter title.
 */

/** @param {string} text */
const fold = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Slide numbers that match a query. A number matches that slide exactly
 * ("12"); text matches title, layout or chapter, every word somewhere
 * ("ai act" matches "AI Act", "text" matches all slides with layout text).
 * An empty query matches everything.
 * @param {SlideEntry[]} entries
 * @param {string} query
 * @returns {number[]}
 */
export function matchSlides(entries, query) {
  const q = fold(query.trim());
  if (!q) return entries.map((e) => e.number);
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    return entries.some((e) => e.number === n) ? [n] : [];
  }
  const words = q.split(/\s+/);
  return entries
    .filter((e) => {
      const hay = fold(`${e.title} ${e.layout ?? ''} ${e.chapter ?? ''}`);
      return words.every((w) => hay.includes(w));
    })
    .map((e) => e.number);
}

/**
 * Index of the slide to select after a navigation key, or null for other keys.
 * @param {string} key       KeyboardEvent.key
 * @param {number} current   Index of the selected slide (-1 if none).
 * @param {number} count     Number of slides.
 * @param {number} [page]    Slides per PageUp / PageDown.
 * @returns {number | null}
 */
export function navigateIndex(key, current, count, page = 5) {
  if (count === 0) return null;
  const clamp = (/** @type {number} */ i) => Math.max(0, Math.min(count - 1, i));
  switch (key) {
    case 'ArrowUp': return clamp(current - 1);
    case 'ArrowDown': return clamp(current + 1);
    case 'PageUp': return clamp(current - page);
    case 'PageDown': return clamp(current + page);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/**
 * The `toIndex` for moveSlide when a slide is dropped before or after another
 * (E-003). moveSlide takes the final position after removal, so dropping
 * further down the list is one less than the target's index.
 * @param {number} from    Index of the dragged slide.
 * @param {number} target  Index of the slide it is dropped on.
 * @param {boolean} after  Dropped on the lower half (after the target).
 * @returns {number}
 */
export function dropIndex(from, target, after) {
  const position = after ? target + 1 : target;   // insertion point in the current list
  return from < position ? position - 1 : position;
}
