// @ts-check
/**
 * The Focal point dialog (I-026): the picture (cropped as on the slide) with
 * a crosshair, and a wide and a tall frame filled with the picture, so the
 * effect is visible. Click or drag sets the point, arrow keys nudge it
 * (Shift: larger steps), X % / Y % take exact values. Apply stores `focus`
 * as "x% y%" (CSS object-position); "As the layout decides" removes it.
 */
import { h } from '../dom.js';
import { openDialog } from './dialogs.js';
import { applyPictureStyle } from '../../../shared/picture.js';
import { applyCropFallback } from '../../../shared/crop.js';
import { focusValue, moveFocus, parseFocus } from '../shrink-values.js';

/**
 * @param {{ src: string, alt?: string, crop?: any, focus?: string,
 *   onApply: (focus: string | undefined) => void }} options
 *   `src` is the resolved address; `onApply` gets undefined for "as the layout decides".
 */
export function openFocusDialog({ src, alt, crop, focus, onApply }) {
  let point = parseFocus(focus);

  openDialog('Focal point', (close) => {
    /** A picture with the crop, as on the slide. @param {string} cls @param {string} [altText] */
    const picture = (cls, altText = '') => {
      const img = /** @type {HTMLImageElement} */ (h('img', { class: cls, src, alt: altText, draggable: 'false' }));
      applyPictureStyle(img, { crop });
      return img;
    };
    const img = picture('slipr-crop-image slipr-focus-image', alt ?? '');
    const marker = h('span', { class: 'slipr-focus-marker', 'aria-hidden': 'true' });
    const stage = h('div', {
      class: 'slipr-crop-stage slipr-focus-stage',
      tabindex: '0',
      role: 'slider',
      'aria-label': 'Focal point. Click the picture, or move it with the arrow keys.',
    }, [img, marker]);
    const wide = picture('slipr-focus-sample-image');
    const tall = picture('slipr-focus-sample-image');

    /** @type {Record<string, HTMLInputElement>} */
    const fields = {};
    const numberField = (/** @type {'x' | 'y'} */ key, /** @type {string} */ label) => {
      const input = /** @type {HTMLInputElement} */ (h('input', {
        id: `slipr-focus-${key}`, type: 'number', class: 'slipr-input', min: '0', max: '100', step: 'any',
        onchange: () => {
          const v = Number(input.value);
          if (Number.isFinite(v)) set({ ...point, [key]: v / 100 });
        },
      }));
      fields[key] = input;
      return h('label', { class: 'slipr-text-style-field slipr-text-style-number' }, [h('span', { class: 'slipr-label' }, [label]), input]);
    };

    /** Show a point on the picture, in the frames and in the fields. @param {{ x: number, y: number }} p */
    function set(p) {
      point = moveFocus(p, 0, 0);
      const value = focusValue(point);
      Object.assign(marker.style, { left: `${point.x * 100}%`, top: `${point.y * 100}%` });
      wide.style.objectPosition = value;
      tall.style.objectPosition = value;
      fields.x.value = String(Math.round(point.x * 1000) / 10);
      fields.y.value = String(Math.round(point.y * 1000) / 10);
      stage.setAttribute('aria-valuetext', `${fields.x.value}% across, ${fields.y.value}% down`);
    }

    // ---- pointer: click or drag
    const at = (/** @type {PointerEvent} */ e) => {
      const r = img.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stage.focus({ preventScroll: true });
      set(at(e));
      const onMove = (/** @type {PointerEvent} */ ev) => set(at(ev));
      const onUp = () => {
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerup', onUp);
        stage.removeEventListener('pointercancel', onUp);
      };
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic pointer: dragging still works while over the picture.
      }
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onUp);
    });

    // ---- keyboard
    stage.addEventListener('keydown', (e) => {
      const arrows = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });
      if (!(e.key in arrows)) return;
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const step = e.shiftKey ? 0.05 : 0.01;
      set(moveFocus(point, dx * step, dy * step));
    });

    const form = h('form', {
      class: 'slipr-dialog-form slipr-crop-form slipr-focus-form',
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault();
        onApply(focusValue(point));
        close();
      },
    }, [
      h('div', { class: 'slipr-focus-layout' }, [
        stage,
        h('div', { class: 'slipr-focus-samples', 'aria-hidden': 'true' }, [
          h('span', { class: 'slipr-label' }, ['In a wide frame']),
          h('span', { class: 'slipr-focus-sample is-wide' }, [wide]),
          h('span', { class: 'slipr-label' }, ['In a tall frame']),
          h('span', { class: 'slipr-focus-sample is-tall' }, [tall]),
        ]),
      ]),
      h('p', { class: 'slipr-help' }, ['Click the part of the picture that must stay in view; arrow keys move the point. It counts when the picture fills a frame of another shape (Fill the frame, card photos, layouts that fill); a picture shown whole is not changed.']),
      h('div', { class: 'slipr-text-style-row' }, [numberField('x', 'X %'), numberField('y', 'Y %')]),
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: () => { onApply(undefined); close(); } }, ['As the layout decides']),
        h('button', { type: 'button', class: 'slipr-btn', onclick: close }, ['Cancel']),
        h('button', { type: 'submit', class: 'slipr-btn slipr-btn-primary' }, ['Apply']),
      ]),
    ]);
    set(point);
    applyCropFallback(form);
    queueMicrotask(() => stage.focus({ preventScroll: true }));
    return [form];
  }, { wide: true });
}
