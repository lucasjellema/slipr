// @ts-check
/**
 * The show grid's model (I-081): how slides are grouped, how a selection grows,
 * how arrow keys move through the grid. DOM-free.
 *
 * The grid shows slides in show order, split into **chapter runs**: consecutive
 * slides with the same chapter, exactly as reader mode groups them
 * (viewer/reader/personalize.js). A chapter that comes back later in the show
 * starts a second run, marked as continued.
 */

/**
 * @typedef {object} SlideRun
 * @property {string | null} chapterId
 * @property {any | null} chapter     The entry from show.chapters, or null.
 * @property {{ slide: any, index: number }[]} slides
 * @property {boolean} continued      The chapter already had a run earlier in the show.
 */

/**
 * @param {any} show
 * @returns {SlideRun[]}
 */
export function slideRuns(show) {
  const byId = new Map((show?.chapters ?? []).map((/** @type {any} */ c) => [c.id, c]));
  /** @type {SlideRun[]} */
  const runs = [];
  const seen = new Set();
  (show?.slides ?? []).forEach((/** @type {any} */ slide, /** @type {number} */ index) => {
    const chapterId = slide.chapter ?? null;
    const last = runs.at(-1);
    if (last && last.chapterId === chapterId) {
      last.slides.push({ slide, index });
      return;
    }
    runs.push({ chapterId, chapter: chapterId ? byId.get(chapterId) ?? null : null, slides: [{ slide, index }], continued: chapterId !== null && seen.has(chapterId) });
    if (chapterId) seen.add(chapterId);
  });
  return runs;
}

/**
 * Chapters that no slide belongs to (shown separately, as drop targets).
 * @param {any} show
 * @returns {any[]}
 */
export function emptyChapters(show) {
  const used = new Set((show?.slides ?? []).map((/** @type {any} */ s) => s.chapter).filter(Boolean));
  return (show?.chapters ?? []).filter((/** @type {any} */ c) => !used.has(c.id));
}

/**
 * The ids from `anchorId` to `toId` (inclusive, either direction), in show order.
 * @param {string[]} orderedIds
 * @param {string} anchorId
 * @param {string} toId
 * @returns {string[]}
 */
export function selectRange(orderedIds, anchorId, toId) {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(toId);
  if (a === -1 || b === -1) return b === -1 ? [] : [toId];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(from, to + 1);
}

/**
 * The index to focus after a navigation key in a grid of `count` cards with
 * `columns` per row (the grid flows across chapter runs as one sequence).
 * @param {string} key
 * @param {number} index
 * @param {number} count
 * @param {number} columns
 * @returns {number | null}  null for keys that do not move.
 */
export function gridMove(key, index, count, columns) {
  if (count === 0) return null;
  const clamp = (/** @type {number} */ i) => Math.max(0, Math.min(count - 1, i));
  switch (key) {
    case 'ArrowRight': return clamp(index + 1);
    case 'ArrowLeft': return clamp(index - 1);
    case 'ArrowDown': return clamp(index + Math.max(1, columns));
    case 'ArrowUp': return clamp(index - Math.max(1, columns));
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
