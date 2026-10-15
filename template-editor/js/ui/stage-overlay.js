// @ts-check
/**
 * The boxes of a composed layout, drawn over the staged slide in the preview
 * (I-111). Drag a box to move it, drag a handle to resize it; click or Tab to
 * select; arrow keys move by 1 % (Shift: 5 %), Alt + arrow keys resize.
 * Positions are whole percent of the slide, as in the composer's grid.
 *
 * Box elements are kept and updated in place, so a drag survives the
 * re-render that every move causes.
 */
import { clampArea } from '../composer/composer-css.js';

/**
 * @typedef {import('../composer/composer-css.js').Area} Area
 * @typedef {{ id: string, label: string, area: Area, picture: boolean }} OverlayBox
 *
 * @typedef {object} OverlayOptions
 * @property {() => DOMRect | null} getRect          The slide's canvas, in page coordinates.
 * @property {(boxId: string | null) => void} onSelect
 * @property {(boxId: string, area: Area, gesture: string) => void} onChange  Same `gesture` for one drag or one run of key presses.
 */

const HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/**
 * @param {HTMLElement} host  An absolutely positioned element; its parent (positioned) holds the preview frame.
 * @param {OverlayOptions} options
 */
export function createStageOverlay(host, options) {
  host.classList.add('te-stage-overlay');
  const hint = document.createElement('p');
  hint.id = 'te-stage-hint';
  hint.className = 'te-visually-hidden';
  hint.textContent = 'Arrow keys move the box by 1 %, with Shift by 5 %. Alt and the arrow keys change its size. Escape deselects.';
  host.append(hint);

  /** @type {Map<string, HTMLElement>} */
  const elements = new Map();
  /** @type {OverlayBox[]} */
  let boxes = [];
  /** @type {string | null} */
  let selected = null;
  let gestures = 0;
  /** @type {{ boxId: string, handle: string, start: Area, x: number, y: number, gesture: string, pointerId: number } | null} */
  let drag = null;

  /** Place the overlay over the slide's canvas. */
  function reposition() {
    const rect = options.getRect();
    host.hidden = !(rect && host.dataset.active);
    const parent = /** @type {HTMLElement | null} */ (host.parentElement);
    if (!rect || !parent) return;
    const p = parent.getBoundingClientRect();
    Object.assign(host.style, {
      left: `${rect.left - p.left}px`,
      top: `${rect.top - p.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  /** @param {OverlayBox} box */
  function makeBox(box) {
    const el = document.createElement('div');
    el.className = 'te-box';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-describedby', hint.id);
    el.dataset.box = box.id;
    const label = document.createElement('span');
    label.className = 'te-box-label';
    el.append(label);
    for (const h of HANDLES) {
      const handle = document.createElement('span');
      handle.className = `te-handle te-handle--${h}`;
      handle.dataset.handle = h;
      handle.setAttribute('aria-hidden', 'true');
      el.append(handle);
    }
    el.addEventListener('pointerdown', (e) => startDrag(e, box.id));
    el.addEventListener('keydown', (e) => onKey(e, box.id));
    el.addEventListener('focus', () => {
      if (selected !== box.id) options.onSelect(box.id);
    });
    return el;
  }

  /**
   * @param {PointerEvent} e @param {string} boxId
   */
  function startDrag(e, boxId) {
    if (e.button !== 0) return;
    const box = boxes.find((b) => b.id === boxId);
    const el = elements.get(boxId);
    if (!box || !el) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    if (selected !== boxId) options.onSelect(boxId);
    const handle = /** @type {HTMLElement} */ (e.target).dataset?.handle ?? 'move';
    gestures += 1;
    drag = { boxId, handle, start: { ...box.area }, x: e.clientX, y: e.clientY, gesture: `drag:${gestures}`, pointerId: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  }

  host.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rect = options.getRect();
    if (!rect) return;
    const dx = Math.round(((e.clientX - drag.x) / rect.width) * 100);
    const dy = Math.round(((e.clientY - drag.y) / rect.height) * 100);
    const area = resized(drag.start, drag.handle, dx, dy);
    const box = boxes.find((b) => b.id === drag?.boxId);
    if (box && JSON.stringify(area) !== JSON.stringify(box.area)) options.onChange(drag.boxId, area, drag.gesture);
  });
  const endDrag = (/** @type {PointerEvent} */ e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    elements.get(drag.boxId)?.classList.remove('is-dragging');
    drag = null;
  };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);

  /**
   * @param {KeyboardEvent} e @param {string} boxId
   */
  function onKey(e, boxId) {
    if (e.key === 'Escape') {
      options.onSelect(null);
      /** @type {HTMLElement | undefined} */ (elements.get(boxId))?.blur();
      return;
    }
    const dirs = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });
    const dir = dirs[e.key];
    const box = boxes.find((b) => b.id === boxId);
    if (!dir || !box) return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const [dx, dy] = [dir[0] * step, dir[1] * step];
    const area = e.altKey ? resized(box.area, 'se', dx, dy) : resized(box.area, 'move', dx, dy);
    if (JSON.stringify(area) !== JSON.stringify(box.area)) options.onChange(boxId, area, `key:${boxId}:${e.altKey ? 'size' : 'move'}`);
  }

  return {
    /**
     * Show these boxes (or none: the overlay hides).
     * @param {OverlayBox[] | null} next @param {string | null} selection
     */
    update(next, selection) {
      boxes = next ?? [];
      selected = selection;
      host.dataset.active = next ? 'true' : '';
      const keep = new Set(boxes.map((b) => b.id));
      for (const [id, el] of elements) {
        if (!keep.has(id)) {
          el.remove();
          elements.delete(id);
        }
      }
      boxes.forEach((box, i) => {
        let el = elements.get(box.id);
        if (!el) {
          el = makeBox(box);
          elements.set(box.id, el);
        }
        const a = box.area;
        Object.assign(el.style, { left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%`, zIndex: String(i + 1) });
        el.classList.toggle('is-selected', box.id === selected);
        el.classList.toggle('is-picture', box.picture);
        el.setAttribute('aria-pressed', String(box.id === selected));
        el.setAttribute('aria-label', `${box.label}: left ${a.x} %, top ${a.y} %, width ${a.w} %, height ${a.h} %`);
        /** @type {HTMLElement} */ (el.firstElementChild).textContent = box.label;
        // Keep the DOM in box order (Tab order = reading order), without moving a focused or dragged box.
        if (host.children[i + 1] !== el) host.insertBefore(el, host.children[i + 1] ?? null);
      });
      reposition();
    },
    reposition,
    /** Focus a box (after it was selected in the panel). @param {string} id */
    focus(id) {
      elements.get(id)?.focus({ preventScroll: true });
    },
  };
}

/**
 * An area moved (`move`) or resized from an edge or corner by whole percent.
 * @param {Area} start @param {string} handle @param {number} dx @param {number} dy
 * @returns {Area}
 */
export function resized(start, handle, dx, dy) {
  let { x, y, w, h } = start;
  if (handle === 'move') {
    x = Math.min(Math.max(x + dx, 0), 100 - w);
    y = Math.min(Math.max(y + dy, 0), 100 - h);
    return { x, y, w, h };
  }
  if (handle.includes('e')) w = Math.min(Math.max(w + dx, 1), 100 - x);
  if (handle.includes('s')) h = Math.min(Math.max(h + dy, 1), 100 - y);
  if (handle.includes('w')) {
    const nx = Math.min(Math.max(x + dx, 0), x + w - 1);
    w += x - nx;
    x = nx;
  }
  if (handle.includes('n')) {
    const ny = Math.min(Math.max(y + dy, 0), y + h - 1);
    h += y - ny;
    y = ny;
  }
  return clampArea({ x, y, w, h });
}
