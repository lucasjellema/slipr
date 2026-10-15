// @ts-check
/**
 * The Shrink dialog (I-026): the picture's size now, Longest side (px) and
 * Quality (%), and what the WebP will be, recomputed when either changes.
 * Shrink stores the new file (the original stays) and hands its path on.
 */
import { h } from '../dom.js';
import { openDialog } from './dialogs.js';
import { encodeWebp, pictureSize } from '../io/shrink.js';
import { SHRINK_DEFAULTS, formatBytes, savingText, typeOfPath } from '../shrink-values.js';

/**
 * @param {{ src: string, blob: Blob,
 *   save: (webp: Blob) => Promise<string>, onDone: (src: string) => void }} options
 *   `save` stores the WebP and returns its path; `onDone` gets that path.
 */
export function openShrinkDialog({ src, blob, save, onDone }) {
  openDialog('Shrink the picture', (close, setError) => {
    const typeName = (typeOfPath(src) ?? blob.type).replace('image/', '').replace('jpeg', 'JPEG').toUpperCase();
    const now = h('p', { class: 'slipr-help', id: 'slipr-shrink-now' }, [`${src}: ${formatBytes(blob.size)} ${typeName}`]);
    const result = h('p', { class: 'slipr-shrink-result', id: 'slipr-shrink-result', 'aria-live': 'polite' }, ['Working out the new size…']);
    const previewUrl = URL.createObjectURL(blob);
    const thumb = h('img', { class: 'slipr-shrink-thumb', src: previewUrl, alt: '' });

    const side = /** @type {HTMLInputElement} */ (h('input', {
      id: 'slipr-shrink-side', type: 'number', class: 'slipr-input', min: '64', max: '10000', step: '1',
      value: String(SHRINK_DEFAULTS.maxSide),
    }));
    const quality = /** @type {HTMLInputElement} */ (h('input', {
      id: 'slipr-shrink-quality', type: 'range', class: 'slipr-shrink-quality', min: '50', max: '100', step: '1',
      value: String(Math.round(SHRINK_DEFAULTS.quality * 100)),
    }));
    const qualityValue = h('span', { class: 'slipr-picture-opacity-value' }, [`${quality.value}%`]);
    const submit = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'slipr-btn slipr-btn-primary', disabled: true }, ['Shrink']));

    /** @type {Blob | null} */
    let encoded = null;
    let run = 0;
    let timer = 0;

    // The picture's own size: the longest side starts there when it is smaller than the default.
    pictureSize(blob).then((size) => {
      if (!size) return;
      now.textContent = `${src}: ${size.width} × ${size.height} px, ${formatBytes(blob.size)} ${typeName}`;
      const longest = Math.max(size.width, size.height);
      if (longest < SHRINK_DEFAULTS.maxSide) side.value = String(longest);
      side.max = String(longest);
      update();
    });

    /** Encode with the current settings and say what it gives. */
    async function update() {
      const mine = ++run;
      encoded = null;
      submit.disabled = true;
      const maxSide = Number(side.value);
      if (!(maxSide >= 16)) {
        result.textContent = 'Give the longest side in pixels.';
        return;
      }
      result.textContent = 'Working out the new size…';
      try {
        const out = await encodeWebp(blob, { maxSide, quality: Number(quality.value) / 100 });
        if (mine !== run) return;
        const smaller = out.blob.size < blob.size;
        result.textContent = `Becomes ${out.width} × ${out.height} px WebP, ${formatBytes(out.blob.size)} (${savingText(blob.size, out.blob.size)})`
          + (smaller ? '' : '. That is not smaller than the file, so there is nothing to gain. Try a smaller size or a lower quality.');
        result.classList.toggle('is-warning', !smaller);
        if (smaller) {
          encoded = out.blob;
          submit.disabled = false;
        }
      } catch (err) {
        if (mine !== run) return;
        result.textContent = err instanceof Error ? err.message : String(err);
        result.classList.add('is-warning');
      }
    }
    const later = () => {
      clearTimeout(timer);
      timer = window.setTimeout(update, 250);
    };
    side.addEventListener('input', later);
    quality.addEventListener('input', () => { qualityValue.textContent = `${quality.value}%`; later(); });

    const form = h('form', {
      class: 'slipr-dialog-form slipr-shrink-form',
      onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        if (!encoded) return;
        submit.disabled = true;
        try {
          const path = await save(encoded);
          URL.revokeObjectURL(previewUrl);
          close();
          onDone(path);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          submit.disabled = false;
        }
      },
    }, [
      h('div', { class: 'slipr-shrink-head' }, [thumb, now]),
      h('div', { class: 'slipr-text-style-row' }, [
        h('label', { class: 'slipr-text-style-field slipr-text-style-number', for: 'slipr-shrink-side' }, [h('span', { class: 'slipr-label' }, ['Longest side (px)']), side]),
        h('label', { class: 'slipr-picture-opacity-row', for: 'slipr-shrink-quality' }, [h('span', { class: 'slipr-label' }, ['Quality']), quality, qualityValue]),
      ]),
      result,
      h('p', { class: 'slipr-help' }, ['Shrink saves a new WebP file and the picture uses it; alt text, crop and focal point stay. The original file stays in images/, and Ctrl+Z goes back to it.']),
      h('div', { class: 'slipr-dialog-actions' }, [
        h('button', { type: 'button', class: 'slipr-btn', onclick: () => { URL.revokeObjectURL(previewUrl); close(); } }, ['Cancel']),
        submit,
      ]),
    ]);
    update();
    return [form];
  });
}
