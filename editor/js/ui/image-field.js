// @ts-check
/**
 * The image area used by image slots and reader image blocks (E-006): a
 * preview, and three ways to add an image: drop a file on it, paste (Ctrl+V
 * while it has focus, or the Paste button), or choose a file.
 */
import { h } from '../dom.js';
import { imageFileFrom, readClipboardImage } from '../image-input.js';
import { showBanner } from './dialogs.js';

/**
 * Run an image action and report failures as a banner.
 * @param {() => Promise<void>} action
 */
export function runImage(action) {
  action().catch((err) => showBanner(err instanceof Error ? err.message : String(err), 'error'));
}

/**
 * @param {{ label: string, image: { src?: string, alt?: string } | undefined,
 *   resolveAsset?: (src: string) => string, onFile: (file: File) => void }} options
 * @returns {HTMLElement}
 */
export function imageField({ label, image, resolveAsset, onFile }) {
  const add = (/** @type {File | null} */ file) => {
    if (!file) {
      showBanner('There is no image to add. Copy an image, or drop an image file.', 'info', { timeout: 4000 });
      return;
    }
    onFile(file);
  };

  const fileInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml',
    hidden: true,
    onchange: () => {
      add(fileInput.files?.[0] ?? null);
      fileInput.value = '';
    },
  }));

  const preview = image?.src
    ? h('img', { class: 'slipr-image-thumb', src: resolveAsset?.(image.src) ?? image.src, alt: image.alt ?? '' })
    : h('span', { class: 'slipr-image-empty' }, ['No image yet']);

  const zone = h('div', {
    class: 'slipr-image-zone',
    tabindex: '0',
    role: 'group',
    'aria-label': `${label}: drop an image here, or press Ctrl+V to paste one`,
    ondragover: (/** @type {DragEvent} */ e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      zone.classList.add('is-dragover');
    },
    ondragleave: () => zone.classList.remove('is-dragover'),
    ondrop: (/** @type {DragEvent} */ e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      add(imageFileFrom(e.dataTransfer));
    },
    onpaste: (/** @type {ClipboardEvent} */ e) => {
      e.preventDefault();
      add(imageFileFrom(e.clipboardData));
    },
  }, [
    preview,
    h('div', { class: 'slipr-image-actions' }, [
      h('span', { class: 'slipr-help' }, ['Drop an image here, or paste with Ctrl+V']),
      h('div', { class: 'slipr-image-buttons' }, [
        h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click() }, ['Choose…']),
        h('button', {
          type: 'button',
          class: 'slipr-btn slipr-btn-sm',
          title: 'Paste an image from the clipboard',
          onclick: () => runImage(async () => add(await readClipboardImage())),
        }, ['Paste']),
      ]),
    ]),
    fileInput,
  ]);
  return zone;
}
