// @ts-check
/**
 * Move and resize a slide's extra images (I-083) and text elements (I-089) on
 * the audience preview.
 *
 * A layer of boxes, one per overlay, sits on the preview canvas. Click a box
 * to select it; drag it to move; drag a corner handle to resize (an image
 * keeps its aspect ratio unless Shift is held; a text box resizes freely
 * unless Shift is held). Keyboard: arrow keys move (Shift: larger steps),
 * Alt+arrows resize (an image keeps its ratio; for a text box Alt+Left/Right
 * change the width, Alt+Up/Down the height), Delete removes, Esc deselects.
 * Double-click a text box to edit its text in the Slide tab. A drag
 * moves the box locally and stores the result on release, so it is one undo
 * step; a burst of key presses is one step too (coalesced).
 *
 * The preview re-renders after every change, so the selection lives here, not
 * in the DOM: `mountOverlayEditor` is called again on each render.
 */
import { h } from '../dom.js';
import { overlayBox, resizedOverlayBox, OVERLAY_MIN_SIZE } from '../actions.js';

/** @type {{ slideId: string | null, index: number }} */
let selection = { slideId: null, index: -1 };

/**
 * Select an extra image (for example the one just added), or none.
 * @param {string | null} slideId @param {number} [index]
 */
export function selectOverlay(slideId, index = -1) {
  selection = { slideId, index };
}

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * Select an extra image from outside the preview (the Slide tab), and let the
 * preview redraw. Not for use during a drag: the redraw replaces the boxes.
 * @param {string | null} slideId @param {number} [index]
 */
export function showOverlaySelected(slideId, index = -1) {
  selectOverlay(slideId, index);
  for (const fn of listeners) fn();
}

/** Call fn when showOverlaySelected changes the selection. @param {() => void} fn */
export function onOverlaySelection(fn) {
  listeners.add(fn);
}

/** The selected extra image of a slide, or -1. @param {string} slideId */
export function selectedOverlay(slideId) {
  return selection.slideId === slideId ? selection.index : -1;
}

/**
 * Focus a text element's text area in the Slide tab once the form has
 * re-rendered (after adding one, or a double-click on the preview).
 * @param {number} index @param {{ select?: boolean }} [options]
 */
export function focusOverlayText(index, options = {}) {
  setTimeout(() => {
    const area = /** @type {HTMLTextAreaElement | null} */ (document.getElementById(`slipr-overlay-text-${index}`));
    if (!area) return;
    area.focus({ preventScroll: true });
    area.scrollIntoView({ block: 'nearest' });
    if (options.select) area.select();
  }, 50);
}

/**
 * Mark the selected overlay's row in the Slide tab and scroll it into view,
 * so its fields are ready to edit (keyboard focus stays on the preview). Does
 * nothing when the Slide tab is not shown.
 * @param {number} index  -1: none selected.
 */
export function revealOverlayRow(index) {
  for (const row of document.querySelectorAll('.slipr-overlay-row.is-selected')) row.classList.remove('is-selected');
  if (index < 0) return;
  const row = /** @type {HTMLElement | null} */ (document.querySelector(`.slipr-overlay-row[data-overlay-index="${index}"]`));
  if (!row) return;
  row.classList.add('is-selected');
  // Scroll only when part of the row is out of sight, then bring its head to the top.
  let pane = row.parentElement;
  while (pane && !(pane.scrollHeight > pane.clientHeight && /auto|scroll/.test(getComputedStyle(pane).overflowY))) pane = pane.parentElement;
  const view = pane ? pane.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const rect = row.getBoundingClientRect();
  if (rect.top < view.top || rect.bottom > view.bottom) {
    // No animation for reduced motion, or in a hidden page (where it would not run at all).
    const instant = document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'start', behavior: instant ? 'auto' : 'smooth' });
  }
}

/** @param {number} n */
const pct =(n) => `${Math.round(n * 100000) / 1000}%`;

/**
 * @param {HTMLElement} slideEl   The rendered slide (audience mode).
 * @param {any} slide
 * @param {import('../store.js').EditorStore} store
 * @param {{ focus?: boolean }} [options]  Focus the selected box (it had focus before the re-render).
 */
export function mountOverlayEditor(slideEl, slide, store, options = {}) {
  const canvas = /** @type {HTMLElement | null} */ (slideEl.querySelector('.slipr-canvas'));
  const overlays = Array.isArray(slide.overlays) ? slide.overlays : [];
  if (!canvas || !overlays.length) return;
  const slideId = slide.id;
  if (selectedOverlay(slideId) >= overlays.length) selectOverlay(null);

  const layer = h('div', { class: 'slipr-overlay-handles' });
  canvas.append(layer);

  /** @type {HTMLElement[]} */
  let boxes = [];

  const place = (/** @type {HTMLElement} */ el, /** @type {{ x: number, y: number, w: number, h: number }} */ b) => {
    Object.assign(el.style, { left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) });
  };
  /** @param {number} index @param {any} patch @param {string} [burst] Key presses of one kind coalesce into one undo step. */
  const update = (index, patch, burst) => {
    store.dispatch('updateOverlay', { slideId, index, patch }, burst ? { coalesceKey: `overlay-${burst}-${slideId}-${index}` } : undefined);
  };

  function draw() {
    const selected = selectedOverlay(slideId);
    boxes = overlays.map((/** @type {any} */ o, /** @type {number} */ i) => {
      const isSelected = i === selected;
      const isText = typeof o.text === 'string';
      const name = isText ? `Text element ${i + 1}${o.text.trim() ? `: ${o.text.trim().slice(0, 60)}` : ''}` : `Extra image ${i + 1}${o.image?.alt ? `: ${o.image.alt}` : ''}`;
      const box = h('div', {
        class: `slipr-overlay-box ${isText ? 'is-text' : ''} ${isSelected ? 'is-selected' : ''}`,
        tabindex: '0',
        role: 'button',
        'aria-pressed': isSelected ? 'true' : 'false',
        'aria-label': `${name}. Drag or arrow keys to move, a corner or Alt+arrows to resize, Delete to remove${isText ? ', double-click to edit the text' : ''}.`,
        title: isText ? `Text element ${i + 1}: double-click to edit` : o.image?.alt || `Extra image ${i + 1}`,
        'data-index': String(i),
      }, isSelected ? ['nw', 'ne', 'sw', 'se'].map((corner) => h('span', { class: `slipr-overlay-handle is-${corner}`, 'data-corner': corner, 'aria-hidden': 'true' })) : []);
      place(box, o);
      return box;
    });
    layer.replaceChildren(...boxes);
  }

  /** Select a box and draw the handles, keeping keyboard focus on it. @param {number} index */
  function select(index) {
    selectOverlay(index < 0 ? null : slideId, index);
    draw();
    if (index >= 0) boxes[index]?.focus({ preventScroll: true });
    revealOverlayRow(index);
  }

  // ---------------------------------------------------------------- pointer
  canvas.addEventListener('pointerdown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const boxEl = /** @type {HTMLElement | null} */ (target.closest('.slipr-overlay-box'));
    if (!boxEl) {
      if (selectedOverlay(slideId) >= 0) select(-1);
      return;
    }
    e.preventDefault();
    const index = Number(boxEl.dataset.index);
    const corner = target.dataset.corner ?? null;
    if (selectedOverlay(slideId) !== index) select(index);
    const el = boxes[index];
    el.focus({ preventScroll: true });

    const rect = canvas.getBoundingClientRect();
    const start = { ...overlayBox(overlays[index]) };
    const px = (/** @type {PointerEvent} */ ev) => ({ x: (ev.clientX - rect.left) / rect.width, y: (ev.clientY - rect.top) / rect.height });
    const p0 = px(e);
    let current = start;
    let moved = false;

    const onMove = (/** @type {PointerEvent} */ ev) => {
      const p = px(ev);
      const dx = p.x - p0.x;
      const dy = p.y - p0.y;
      if (!moved && Math.abs(dx) < 0.003 && Math.abs(dy) < 0.003) return;
      moved = true;
      // Images keep their ratio unless Shift is held; text boxes the other way round.
      const keepAspect = typeof overlays[index]?.text === 'string' ? ev.shiftKey : !ev.shiftKey;
      current = corner ? resizedOverlayBox(start, corner, dx, dy, keepAspect) : overlayBox({ ...start, x: start.x + dx, y: start.y + dy });
      place(el, current);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      if (moved) update(index, current);
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // No capture (e.g. a synthetic pointer): the drag still works while the pointer stays on the box.
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  });

  // ---------------------------------------------------------------- keyboard
  layer.addEventListener('keydown', (e) => {
    const boxEl = /** @type {HTMLElement} */ (e.target).closest?.('.slipr-overlay-box');
    if (!(boxEl instanceof HTMLElement)) return;
    const index = Number(boxEl.dataset.index);
    // The latest values: several key presses can come before the preview re-renders.
    const live = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.overlays;
    const o = live?.[index];
    if (!o) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const done = () => { e.preventDefault(); e.stopPropagation(); };

    if (e.key in arrows) {
      done();
      if (selectedOverlay(slideId) !== index) selectOverlay(slideId, index);
      const [dx, dy] = arrows[/** @type {keyof typeof arrows} */ (e.key)];
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.altKey && typeof o.text === 'string') {
        // A text box: Left / Right change the width, Up / Down the height.
        if (dx) update(index, { w: Math.max(OVERLAY_MIN_SIZE, o.w + dx * step) }, 'resize');
        else update(index, { h: Math.max(OVERLAY_MIN_SIZE, o.h + dy * step) }, 'resize');
      } else if (e.altKey) {
        // Right / Up grow, Left / Down shrink, keeping the aspect ratio.
        const grow = dx > 0 || dy < 0 ? 1 : -1;
        const w = Math.max(OVERLAY_MIN_SIZE, o.w + grow * step);
        update(index, { w, h: (o.h / o.w) * w }, 'resize');
      } else {
        update(index, { x: o.x + dx * step, y: o.y + dy * step }, 'move');
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      done();
      selectOverlay(null);
      store.dispatch('deleteOverlay', { slideId, index });
    } else if (e.key === 'Escape') {
      done();
      select(-1);
      boxEl.blur();
    } else if (e.key === 'Enter' && typeof o.text === 'string' && selectedOverlay(slideId) === index) {
      // The keyboard way to a double-click: edit the selected text.
      done();
      store.setActiveTab('slide');
      focusOverlayText(index, { select: true });
    } else if (e.key === 'Enter' || e.key === ' ') {
      done();
      select(index);
    }
  });
  layer.addEventListener('dblclick', (e) => {
    const boxEl = /** @type {HTMLElement} */ (e.target).closest?.('.slipr-overlay-box');
    if (!(boxEl instanceof HTMLElement) || !boxEl.classList.contains('is-text')) return;
    e.preventDefault();
    store.setActiveTab('slide');
    focusOverlayText(Number(boxEl.dataset.index), { select: true });
  });
  layer.addEventListener('focusin', (e) => {
    const boxEl = /** @type {HTMLElement} */ (e.target).closest?.('.slipr-overlay-box');
    if (boxEl instanceof HTMLElement && selectedOverlay(slideId) !== Number(boxEl.dataset.index)) select(Number(boxEl.dataset.index));
  });

  draw();
  const selected = selectedOverlay(slideId);
  // The preview attaches the slide after this returns: focus once it is in the page.
  if (options.focus && selected >= 0) queueMicrotask(() => boxes[selected]?.focus({ preventScroll: true }));
}
