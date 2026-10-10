// @ts-check
/**
 * Hotspot editor for reader image blocks (E-006). Click on the image to place
 * a hotspot; drag a numbered marker to move it; with a marker focused, the
 * arrow keys nudge it (Shift: bigger steps) and Delete removes it. Below the
 * image, each hotspot has a title and Markdown text. "+ Add hotspot" places
 * one in the middle for keyboard users. Coordinates are fractions 0–1 of the
 * image, as in the show format.
 */
import { h } from '../dom.js';

/** Selected hotspot per block id, so a re-render keeps the selection. */
const selected = new Map();

const STEP = 0.01;
const BIG_STEP = 0.05;

/**
 * @param {{ store: import('../store.js').EditorStore, slideId: string, block: any }} options
 * @returns {HTMLElement}
 */
export function hotspotEditor({ store, slideId, block }) {
  const blockId = block.id;
  const spots = Array.isArray(block.hotspots) ? block.hotspots : [];
  const current = Math.min(selected.get(blockId) ?? -1, spots.length - 1);
  const ids = { slideId, blockId };

  /** Focus a control of hotspot `index` after the form re-rendered. */
  const focusLater = (/** @type {number} */ index, /** @type {'marker' | 'title'} */ what) => {
    queueMicrotask(() => {
      const el = document.querySelector(`[data-hotspot-${what}="${CSS.escape(blockId)}:${index}"]`);
      if (el instanceof HTMLElement) el.focus({ preventScroll: what === 'marker' });
      // A new hotspot's default title is selected, so typing replaces it.
      if (el instanceof HTMLInputElement) el.select();
    });
  };
  /** @type {HTMLElement[]} */
  const markers = [];
  /** @type {HTMLElement[]} */
  const rowEls = [];
  /** Select a hotspot: remembered across re-renders, shown without one. */
  const select = (/** @type {number} */ index) => {
    selected.set(blockId, index);
    markers.forEach((m, i) => m.classList.toggle('is-selected', i === index));
    rowEls.forEach((r, i) => r.classList.toggle('is-selected', i === index));
  };

  const add = (/** @type {number} */ x, /** @type {number} */ y) => {
    const index = spots.length;
    select(index);
    store.dispatch('addHotspot', { ...ids, x, y });
    focusLater(index, 'title');
  };

  const remove = (/** @type {number} */ index) => {
    select(Math.min(index, spots.length - 2));
    store.dispatch('deleteHotspot', { ...ids, index });
  };

  // ---- the image with markers ----
  const img = /** @type {HTMLImageElement} */ (h('img', {
    class: 'slipr-hs-image',
    src: block.image?.src ? store.state.resolveAsset?.(block.image.src) ?? block.image.src : '',
    alt: block.image?.alt ?? '',
    draggable: 'false',
  }));
  const frame = h('div', { class: 'slipr-hs-frame' }, [img]);

  /** Fractions of the image for a pointer position. */
  const fraction = (/** @type {PointerEvent | MouseEvent} */ e) => {
    const r = img.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  img.addEventListener('click', (e) => {
    const { x, y } = fraction(e);
    add(x, y);
  });

  spots.forEach((/** @type {any} */ spot, /** @type {number} */ index) => {
    const marker = /** @type {HTMLButtonElement} */ (h('button', {
      type: 'button',
      class: `slipr-hs-marker ${index === current ? 'is-selected' : ''}`,
      style: `left:${spot.x * 100}%;top:${spot.y * 100}%`,
      'data-hotspot-marker': `${blockId}:${index}`,
      'aria-label': `Hotspot ${index + 1}: ${spot.title}. Arrow keys move it, Delete removes it.`,
      title: spot.title,
    }, [String(index + 1)]));

    // Drag: move the marker locally, store the position on release (one undo step).
    /** @type {{ x: number, y: number, moved: boolean } | null} */
    let drag = null;
    marker.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        marker.setPointerCapture(e.pointerId);
      } catch {
        // Not a live pointer (e.g. a synthetic event): dragging still works while over the marker.
      }
      drag = { x: spot.x, y: spot.y, moved: false };
      // Never scroll while dragging: positions are measured against the image.
      marker.focus({ preventScroll: true });
    });
    marker.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { x, y } = fraction(e);
      drag = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), moved: true };
      marker.style.left = `${drag.x * 100}%`;
      marker.style.top = `${drag.y * 100}%`;
    });
    marker.addEventListener('pointerup', () => {
      const done = drag;
      drag = null;
      select(index);
      if (done?.moved) {
        store.dispatch('updateHotspot', { ...ids, index, patch: { x: done.x, y: done.y } });
        focusLater(index, 'marker');
      }
    });
    marker.addEventListener('click', (e) => e.stopPropagation());
    marker.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? BIG_STEP : STEP;
      const moves = /** @type {Record<string, [number, number]>} */ ({
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      });
      if (moves[e.key]) {
        e.preventDefault();
        select(index);
        const [dx, dy] = moves[e.key];
        store.dispatch('updateHotspot', { ...ids, index, patch: { x: spot.x + dx, y: spot.y + dy } }, {
          coalesceKey: `hotspot-move-${blockId}-${index}`,
        });
        focusLater(index, 'marker');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(index);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        select(index);
        focusLater(index, 'title');
      }
    });
    marker.addEventListener('focus', () => select(index));
    markers.push(marker);
    frame.append(marker);
  });

  // ---- one row per hotspot ----
  const rows = spots.map((/** @type {any} */ spot, /** @type {number} */ index) =>
    h('li', { class: `slipr-hs-row ${index === current ? 'is-selected' : ''}` }, [
      h('span', { class: 'slipr-hs-number', 'aria-hidden': 'true' }, [String(index + 1)]),
      h('div', { class: 'slipr-hs-fields' }, [
        h('input', {
          type: 'text',
          class: 'slipr-input slipr-input-sm',
          value: spot.title,
          placeholder: 'Title (shown in the popup)',
          'aria-label': `Hotspot ${index + 1}: title`,
          'data-hotspot-title': `${blockId}:${index}`,
          onfocus: () => select(index),
          oninput: (/** @type {Event} */ e) => {
            const title = /** @type {HTMLInputElement} */ (e.target).value;
            // An empty title is invalid in the format; keep the old one until there is text.
            if (title.trim()) store.dispatch('updateHotspot', { ...ids, index, patch: { title } }, { coalesceKey: `hotspot-title-${blockId}-${index}` });
          },
        }),
        h('textarea', {
          class: 'slipr-textarea slipr-textarea-sm',
          placeholder: 'Popup text (Markdown)',
          'aria-label': `Hotspot ${index + 1}: popup text`,
          onfocus: () => select(index),
          oninput: (/** @type {Event} */ e) => {
            const md = /** @type {HTMLTextAreaElement} */ (e.target).value;
            store.dispatch('updateHotspot', { ...ids, index, patch: { md } }, { coalesceKey: `hotspot-md-${blockId}-${index}` });
          },
        }, [spot.md ?? '']),
      ]),
      h('button', {
        type: 'button',
        class: 'slipr-item-btn slipr-item-btn-danger',
        title: `Delete hotspot ${index + 1}`,
        'aria-label': `Delete hotspot ${index + 1}`,
        onclick: () => remove(index),
      }, ['🗑']),
    ])
  );

  rowEls.push(...rows);

  return h('div', { class: 'slipr-hs-editor' }, [
    h('div', { class: 'slipr-hs-head' }, [
      h('span', { class: 'slipr-label' }, [`Hotspots (${spots.length})`]),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => add(0.5, 0.5) }, ['+ Add hotspot']),
    ]),
    h('p', { class: 'slipr-help' }, [
      'Click on the image to add a hotspot. Drag a number to move it. With a number selected, the arrow keys nudge it (Shift: bigger steps) and Delete removes it.',
    ]),
    frame,
    spots.length ? h('ol', { class: 'slipr-hs-list' }, rows) : null,
  ]);
}
