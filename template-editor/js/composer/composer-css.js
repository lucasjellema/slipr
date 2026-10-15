// @ts-check
/**
 * The layout composer's blocks in a template stylesheet (I-111, D-019).
 * DOM-free.
 *
 * The composer owns the text between its markers and nothing else:
 *
 *   /* slipr-composer:begin <id> · … *\/
 *   …rules…
 *   /* slipr-composer:end <id> *\/
 *
 * `base` holds the grid shared by every composed layout; each composed
 * layout has a block named after its id with its background and box areas.
 */

/** The grid has this many tracks each way: a box is placed in whole percent. */
export const GRID = 100;

/**
 * @typedef {object} Area  A box's place, in percent of the slide.
 * @property {number} x  Left edge, 0 … 99.
 * @property {number} y  Top edge, 0 … 99.
 * @property {number} w  Width, 1 … 100 - x.
 * @property {number} h  Height, 1 … 100 - y.
 */

/**
 * @typedef {object} BoxStyle
 * @property {string} id              The box id (`data-box`).
 * @property {Area} area
 * @property {string | null} [fit]    object-fit for pictures: contain, cover or fill.
 */

/** @param {string} id */
const escapeRe = (id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where a block is: offsets of its begin marker's start and its end marker's end.
 * @param {string} css @param {string} id
 * @returns {{ start: number, end: number } | null}
 */
export function findBlock(css, id) {
  const begin = new RegExp(`/\\*\\s*slipr-composer:begin ${escapeRe(id)}(?=[\\s*·])[\\s\\S]*?\\*/`).exec(css);
  if (!begin) return null;
  const endRe = new RegExp(`/\\*\\s*slipr-composer:end ${escapeRe(id)}\\s*\\*/`, 'g');
  endRe.lastIndex = begin.index;
  const end = endRe.exec(css);
  if (!end) return null;
  return { start: begin.index, end: end.index + end[0].length };
}

/**
 * The text inside a block (between its markers), or null.
 * @param {string} css @param {string} id
 */
export function blockText(css, id) {
  const at = findBlock(css, id);
  if (!at) return null;
  const text = css.slice(at.start, at.end);
  return text.slice(text.indexOf('*/') + 2, text.lastIndexOf('/*'));
}

/**
 * The stylesheet with a block set (replaced in place, or appended at the
 * end) or removed (`body` null).
 * @param {string} css @param {string} id @param {string | null} body  Rules, without markers.
 * @returns {string}
 */
export function setBlock(css, id, body) {
  const at = findBlock(css, id);
  if (body === null) {
    if (!at) return css;
    let start = at.start;
    let end = at.end;
    // Take the block's own blank line along.
    while (start > 0 && css[start - 1] === '\n' && css[start - 2] === '\n') start -= 1;
    if (css[end] === '\n') end += 1;
    return css.slice(0, start) + css.slice(end);
  }
  const what = id === 'base' ? 'the grid of composed layouts' : `layout "${id}"`;
  const text = `/* slipr-composer:begin ${id} · ${what}, made with the template editor's layout composer (I-111). Edit it there, or keep its format: grid-area, background and object-fit values are read back. */\n${body.trim()}\n/* slipr-composer:end ${id} */`;
  if (at) return css.slice(0, at.start) + text + css.slice(at.end);
  return `${css.replace(/\s*$/, '')}\n\n${text}\n`;
}

/**
 * The shared rules of composed layouts: a 100 × 100 grid over the whole
 * slide; every box sits in its area whatever the look it copies says about
 * position; reader mode on a narrow screen gets one column without pictures.
 * @returns {string}
 */
export function baseBlock() {
  return `.slipr-composed {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(${GRID}, minmax(0, 1fr));
  grid-template-rows: repeat(${GRID}, minmax(0, 1fr));
  padding: 0;
  gap: 0;
}
.slipr-composed > [data-box] {
  position: relative;
  inset: auto;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  min-width: 0;
  min-height: 0;
  margin: 0;
  transform: none;
}
.slipr-composed > :is(img, video)[data-box] { width: 100%; height: 100%; object-fit: contain; }
.slipr-composed > .slipr-composed-picture { pointer-events: none; }
.slipr-composed-figure { display: flex; flex-direction: column; gap: 1cqw; overflow: hidden; }
.slipr-composed-figure > [data-slot] { flex: 1; min-height: 0; width: 100%; }
.slipr-composed-cards { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 1.5cqw; }
@container (max-width: 640px) {
  .slipr-mode-reader .slipr-composed {
    position: static;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
  }
  .slipr-mode-reader .slipr-composed > [data-box] { grid-area: auto; }
  .slipr-mode-reader .slipr-composed > .slipr-composed-picture { display: none; }
  .slipr-mode-reader .slipr-composed > img[data-box] { height: auto; max-height: 60vh; }
  .slipr-mode-reader .slipr-composed-figure { min-height: 40vh; }
  .slipr-mode-reader .slipr-composed-cards { grid-auto-flow: row; }
}`;
}

/**
 * A layout's block body.
 * @param {string} id  Layout id.
 * @param {{ background: string | null, boxes: BoxStyle[] }} layout
 * @returns {string}
 */
export function layoutBlock(id, layout) {
  const root = `.slipr-composed--${id}`;
  const lines = [];
  if (layout.background) lines.push(`${root} { background: var(${layout.background}); }`);
  for (const box of layout.boxes) {
    const a = clampArea(box.area);
    const fit = box.fit ? ` object-fit: ${box.fit};` : '';
    lines.push(`${root} > [data-box="${box.id}"] { grid-area: ${a.y + 1} / ${a.x + 1} / ${a.y + a.h + 1} / ${a.x + a.w + 1};${fit} }`);
  }
  return lines.join('\n');
}

/**
 * What a layout's block says: its background token and box areas.
 * @param {string} css @param {string} id
 * @returns {{ background: string | null, boxes: Map<string, { area: Area, fit: string | null }> } | null}
 */
export function readLayoutBlock(css, id) {
  const text = blockText(css, id);
  if (text === null) return null;
  /** @type {Map<string, { area: Area, fit: string | null }>} */
  const boxes = new Map();
  let background = null;
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = rule.exec(text); m; m = rule.exec(text)) {
    const selector = m[1].trim();
    const body = m[2];
    const box = /\[data-box=["']?([^"'\]]+)["']?\]/.exec(selector);
    if (!box) {
      const bg = /background(?:-color)?\s*:\s*var\(\s*(--[\w-]+)\s*\)/.exec(body);
      if (bg) background = bg[1];
      continue;
    }
    const area = /grid-area\s*:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/.exec(body);
    const fit = /object-fit\s*:\s*(contain|cover|fill)/.exec(body);
    if (!area) continue;
    const [r1, c1, r2, c2] = area.slice(1).map(Number);
    boxes.set(box[1], { area: clampArea({ x: c1 - 1, y: r1 - 1, w: c2 - c1, h: r2 - r1 }), fit: fit ? fit[1] : null });
  }
  return { background, boxes };
}

/**
 * An area inside the slide, in whole percent, at least 1 × 1.
 * @param {Area} area
 * @returns {Area}
 */
export function clampArea(area) {
  const round = (/** @type {number} */ n, /** @type {number} */ fallback) => (Number.isFinite(n) ? Math.round(n) : fallback);
  const x = Math.min(Math.max(round(area.x, 0), 0), GRID - 1);
  const y = Math.min(Math.max(round(area.y, 0), 0), GRID - 1);
  const w = Math.min(Math.max(round(area.w, 10), 1), GRID - x);
  const h = Math.min(Math.max(round(area.h, 10), 1), GRID - y);
  return { x, y, w, h };
}
