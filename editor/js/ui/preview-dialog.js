// @ts-check
/**
 * The enlarged preview (I-103): the live preview in a modal dialog that fills
 * almost the whole window, to place, size and edit extra images and text
 * elements more precisely. It is the same preview (ui/preview.js) with the
 * same overlay editing (ui/overlay-editor.js), plus the Slide tab's "Extra
 * images and text" section beside it (ui/overlay-list.js), so a text element
 * can be written and styled without closing the dialog. Every change goes
 * through the store: the side pane and the form follow.
 */

import { h, isTypingEcho, rerenderKeepingFocus } from '../dom.js';
import { mountPreview } from './preview.js';
import { buildOverlaySection } from './overlay-list.js';

/** Store actions that are typing in the panel (no re-render: it would lose the caret). */
const TYPING_ACTIONS = new Set(['updateOverlay']);

/** Closes the open enlarged preview, if any. @type {(() => void) | null} */
let closeCurrent = null;

/**
 * Open the enlarged preview, or close it when it is open.
 * @param {import('../store.js').EditorStore} store
 */
export function togglePreviewDialog(store) {
  if (closeCurrent) closeCurrent();
  else openPreviewDialog(store);
}

/**
 * @param {import('../store.js').EditorStore} store
 */
export function openPreviewDialog(store) {
  if (closeCurrent) return;
  const previewHost = h('div', { class: 'slipr-preview-dialog-main' });
  const panel = h('aside', { class: 'slipr-preview-dialog-panel', 'aria-label': 'Extra images and text' });
  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', {
    class: 'slipr-preview-dialog',
    'aria-label': 'Enlarged preview',
  }, [h('div', { class: 'slipr-preview-dialog-body' }, [previewHost, panel])]));

  const preview = mountPreview(previewHost, store, { enlarged: { onClose: () => close() } });

  function renderPanel() {
    const state = store.state;
    const slide = state.show?.slides?.find((/** @type {any} */ s) => s.id === state.selectedSlideId);
    // Overlays are placed on the audience view; reader mode needs the whole width.
    const show = Boolean(slide) && state.previewMode === 'audience';
    panel.hidden = !show;
    dialog.classList.toggle('has-panel', show);
    panel.replaceChildren(...(show ? [buildOverlaySection(slide, store, { idPrefix: 'slipr-big-overlay' })] : []));
  }

  const unsubscribe = store.subscribe((event) => {
    const { changedKeys } = event;
    if (!['show', 'selectedSlideId', 'previewMode', 'template'].some((k) => changedKeys.includes(k))) return;
    if (isTypingEcho(panel, event, TYPING_ACTIONS)) return;
    rerenderKeepingFocus(panel, renderPanel);
  });

  // Closing does not wait for the dialog's `close` event, which a hidden page may never get.
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    preview.destroy();
    unsubscribe();
    dialog.remove();
    closeCurrent = null;
    // Back to the button that opened it (the side pane may have re-rendered it).
    /** @type {HTMLElement | null} */ (document.querySelector('.slipr-preview-enlarge'))?.focus();
  }
  closeCurrent = close;
  // Esc (a selected box on the slide takes the first Esc to deselect).
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('close', close);

  renderPanel();
  document.body.append(dialog);
  dialog.showModal();
  // Start on the slide: its selected box, else the close button (not the first ‹ button).
  const box = /** @type {HTMLElement | null} */ (dialog.querySelector('.slipr-overlay-box.is-selected'));
  (box ?? /** @type {HTMLElement | null} */ (dialog.querySelector('.slipr-preview-close')))?.focus();
}
