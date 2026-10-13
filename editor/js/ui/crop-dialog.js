// @ts-check
/**
 * The crop dialog (I-090): the whole picture with the crop as a rectangle.
 * Drag the rectangle to move it, a corner handle to resize it; arrow keys
 * move it (Shift: larger steps), Alt+arrows resize it. A shape (free, the
 * picture's own, 1:1, 4:3, …) keeps the proportions while resizing. Left /
 * Top / Width / Height in % for exact values. Apply stores the crop as one
 * undo step; "Whole picture" removes it.
 */
import { h } from '../dom.js';
import { openDialog } from './dialogs.js';
import { CROP_SHAPES, clampCrop, fullCrop, growCrop, moveCrop, resizeCrop, shapeCrop, shapeRatio } from '../crop-values.js';
import { normalCrop } from '../../../shared/crop.js';

/**
 * @param {{ src: string, alt?: string, crop?: any,
 *   onApply: (crop: { x: number, y: number, w: number, h: number } | undefined) => void }} options
 *   `src` is the resolved address; `onApply` gets undefined for the whole picture.
 */
export function openCropDialog({ src, alt, crop, onApply }) {
  /** @type {import('../crop-values.js').Crop} */
  let current = normalCrop(crop) ?? fullCrop();
  let shape = 'free';
  let aspect = 1; // the picture's width / height, known once it has loaded

  openDialog('Crop the picture', (close) => {
    const img = /** @type {HTMLImageElement} */ (h('img', { class: 'slipr-crop-image', src, alt: alt ?? '', draggable: 'false' }));
    const box = h('div', {
      class: 'slipr-crop-box',
      tabindex: '0',
      role: 'group',
      'aria-label': 'Crop. Drag or arrow keys to move it, a corner or Alt+arrows to resize it.',
    }, ['nw', 'ne', 'sw', 'se'].map((corner) => h('span', { class: `slipr-crop-handle is-${corner}`, 'data-corner': corner, 'aria-hidden': 'true' })));
    const stage = h('div', { class: 'slipr-crop-stage' }, [img, box]);

    /** @type {Record<string, HTMLInputElement>} */
    const fields = {};
    const numberField = (/** @type {'x' | 'y' | 'w' | 'h'} */ key, /** @type {string} */ label) => {
      const input = /** @type {HTMLInputElement} */ (h('input', {
        id: `slipr-crop-${key}`, type: 'number', class: 'slipr-input', min: '0', max: '100', step: 'any',
        onchange: () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          const next = { ...current, [key]: v / 100 };
          // Typing a size keeps the shape: the other side follows.
          const ratio = shapeRatio(shape, aspect);
          if (ratio && key === 'w') next.h = next.w / ratio;
          if (ratio && key === 'h') next.w = next.h * ratio;
          set(clampCrop(next));
        },
      }));
      fields[key] = input;
      return h('label', { class: 'slipr-text-style-field slipr-text-style-number' }, [h('span', { class: 'slipr-label' }, [label]), input]);
    };

    const shapeSelect = /** @type {HTMLSelectElement} */ (h('select', {
      id: 'slipr-crop-shape', class: 'slipr-select',
      onchange: () => {
        shape = shapeSelect.value;
        set(shapeCrop(current, shapeRatio(shape, aspect)));
      },
    }, CROP_SHAPES.map(([value, label]) => h('option', { value }, [label]))));

    /** Draw the rectangle and the fields for the current crop. @param {import('../crop-values.js').Crop} c */
    function set(c) {
      current = c;
      Object.assign(box.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
      for (const key of /** @type {const} */ (['x', 'y', 'w', 'h'])) fields[key].value = String(Math.round(c[key] * 1000) / 10);
    }

    // ---- pointer: move, or resize from a corner
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      box.focus({ preventScroll: true });
      const corner = /** @type {HTMLElement} */ (e.target).dataset.corner ?? null;
      const rect = img.getBoundingClientRect();
      const start = { ...current };
      const x0 = e.clientX;
      const y0 = e.clientY;
      const onMove = (/** @type {PointerEvent} */ ev) => {
        const dx = (ev.clientX - x0) / rect.width;
        const dy = (ev.clientY - y0) / rect.height;
        set(corner ? resizeCrop(start, corner, dx, dy, shapeRatio(shape, aspect)) : moveCrop(start, dx, dy));
      };
      const onUp = () => {
        box.removeEventListener('pointermove', onMove);
        box.removeEventListener('pointerup', onUp);
        box.removeEventListener('pointercancel', onUp);
      };
      try {
        box.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic pointer: dragging still works while over the box.
      }
      box.addEventListener('pointermove', onMove);
      box.addEventListener('pointerup', onUp);
      box.addEventListener('pointercancel', onUp);
    });

    // ---- keyboard
    box.addEventListener('keydown', (e) => {
      const arrows = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });
      if (!(e.key in arrows)) return;
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const step = e.shiftKey ? 0.05 : 0.01;
      set(e.altKey ? growCrop(current, dx * step, dy * step, shapeRatio(shape, aspect)) : moveCrop(current, dx * step, dy * step));
    });

    img.addEventListener('load', () => {
      aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    });

    const form = h('form', {
      class: 'slipr-dialog-form slipr-crop-form',
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault();
        onApply(normalCrop(current) ?? undefined);
        close();
      },
    }, [
      stage,
      h('p', { class: 'slipr-help' }, ['Drag the frame to move it and a corner to resize it; arrow keys move it, Alt+arrows resize it. The file itself is not changed.']),
      h('div', { class: 'slipr-text-style-row' }, [
        h('label', { class: 'slipr-text-style-field' }, [h('span', { class: 'slipr-label' }, ['Shape']), shapeSelect]),
        numberField('x', 'Left %'),
        numberField('y', 'Top %'),
        numberField('w', 'Width %'),
        numberField('h', 'Height %'),
      ]),
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: () => { shape = 'free'; shapeSelect.value = 'free'; set(fullCrop()); } }, ['Whole picture']),
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
        h('button', { type: 'submit', class: 'slipr-btn slipr-btn-primary' }, ['Apply']),
      ]),
    ]);
    set(current);
    queueMicrotask(() => box.focus({ preventScroll: true }));
    return [form];
  }, { wide: true });
}
