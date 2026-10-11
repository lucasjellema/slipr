// @ts-check
/**
 * The Slide tab's "Extra images" section (I-083): images placed freely on the
 * slide, in front of the layout. One row per image (picture, alt text, appear
 * one by one, stacking order, remove) and a drop zone to add one. Placing and
 * sizing happens on the audience preview (ui/overlay-editor.js).
 */
import { h } from '../dom.js';
import { addImageToOverlay, addOverlayImage } from '../image-input.js';
import { imageField, runImage } from './image-field.js';
import { selectOverlay, showOverlaySelected } from './overlay-editor.js';

const EFFECTS = ['fade-in', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'fade-in-then-semi-out', 'semi-fade-out', 'grow', 'shrink'];

/** @param {number} n */
const pct = (n) => `${Math.round(n * 100)}%`;

/**
 * @param {any} slide
 * @param {import('../store.js').EditorStore} store
 * @returns {HTMLElement}
 */
export function buildOverlaySection(slide, store) {
  const overlays = Array.isArray(slide.overlays) ? slide.overlays : [];
  const slideId = slide.id;
  const resolveAsset = store.state.resolveAsset;
  const toPreview = () => {
    if (store.state.previewMode !== 'audience') store.setPreviewMode('audience');
  };

  const rows = overlays.map((/** @type {any} */ o, /** @type {number} */ i) => {
    const fragment = o.fragment === true ? 'true' : typeof o.fragment === 'string' ? o.fragment : '';
    return h('li', { class: 'slipr-overlay-row' }, [
      h('div', { class: 'slipr-overlay-row-head' }, [
        h('span', { class: 'slipr-overlay-row-title' }, [`Image ${i + 1}${i === overlays.length - 1 && overlays.length > 1 ? ' (in front)' : ''}`]),
        h('span', { class: 'slipr-help', title: 'Position and size on the slide. Change them on the preview.' }, [
          `at ${pct(o.x)}, ${pct(o.y)} · ${pct(o.w)} × ${pct(o.h)}`,
        ]),
        h('div', { class: 'slipr-overlay-row-tools' }, [
          h('button', {
            type: 'button', class: 'slipr-item-btn', title: 'Select it on the preview, to move and resize it',
            'aria-label': `Select image ${i + 1} on the preview`,
            onclick: () => { toPreview(); showOverlaySelected(slideId, i); queueFocus(); },
          }, ['⌖']),
          h('button', {
            type: 'button', class: 'slipr-item-btn', title: 'Bring forward', 'aria-label': `Bring image ${i + 1} forward`,
            disabled: i === overlays.length - 1 ? true : undefined,
            onclick: () => store.dispatch('moveOverlay', { slideId, index: i, toIndex: i + 1 }),
          }, ['▲']),
          h('button', {
            type: 'button', class: 'slipr-item-btn', title: 'Send backward', 'aria-label': `Send image ${i + 1} backward`,
            disabled: i === 0 ? true : undefined,
            onclick: () => store.dispatch('moveOverlay', { slideId, index: i, toIndex: i - 1 }),
          }, ['▼']),
          h('button', {
            type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove this image from the slide (the file stays)',
            'aria-label': `Remove image ${i + 1}`,
            onclick: () => { selectOverlay(null); store.dispatch('deleteOverlay', { slideId, index: i }); },
          }, ['🗑']),
        ]),
      ]),
      imageField({
        label: `Extra image ${i + 1}`,
        image: o.image,
        resolveAsset,
        onFile: (file) => runImage(() => addImageToOverlay(store, { slideId, index: i, file })),
      }),
      h('label', { class: 'slipr-label', for: `slipr-overlay-alt-${i}` }, ['Alt text']),
      h('input', {
        id: `slipr-overlay-alt-${i}`,
        type: 'text',
        class: 'slipr-input',
        value: o.image?.alt ?? '',
        placeholder: 'What the image shows',
        oninput: (/** @type {Event} */ e) => {
          const alt = /** @type {HTMLInputElement} */ (e.target).value;
          store.dispatch('updateOverlay', { slideId, index: i, patch: { image: { ...o.image, alt } } }, { coalesceKey: `overlay-alt-${slideId}-${i}` });
        },
      }),
      h('label', { class: 'slipr-label', for: `slipr-overlay-fragment-${i}` }, ['In audience mode']),
      h('select', {
        id: `slipr-overlay-fragment-${i}`,
        class: 'slipr-select',
        onchange: (/** @type {Event} */ e) => {
          const v = /** @type {HTMLSelectElement} */ (e.target).value;
          store.dispatch('updateOverlay', { slideId, index: i, patch: { fragment: v === '' ? undefined : v === 'true' ? true : v } });
        },
      }, [
        h('option', { value: '', selected: fragment === '' ? true : undefined }, ['Visible from the start']),
        h('option', { value: 'true', selected: fragment === 'true' ? true : undefined }, ['Appears on the next click']),
        ...EFFECTS.map((style) => h('option', { value: style, selected: fragment === style ? true : undefined }, [`Appears on the next click: ${style}`])),
      ]),
    ]);
  });

  return h('fieldset', { class: 'slipr-fieldset slipr-overlays-form' }, [
    h('legend', {}, [`Extra images${overlays.length ? ` (${overlays.length})` : ''}`]),
    h('p', { class: 'slipr-help' }, [
      'Images placed freely on the slide, in front of the layout. Move and resize them on the preview (Audience): drag, or a corner to resize; arrow keys move, Alt+arrows resize.',
    ]),
    overlays.length ? h('ol', { class: 'slipr-overlay-list' }, rows) : null,
    imageField({
      label: 'Add an extra image',
      image: undefined,
      resolveAsset,
      onFile: (file) => runImage(async () => {
        const index = await addOverlayImage(store, { slideId, file });
        if (store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.overlays?.[index]) {
          selectOverlay(slideId, index);
          toPreview();
        }
      }),
    }),
  ]);
}

/** Focus the selected box on the preview once it has re-rendered. */
function queueFocus() {
  setTimeout(() => {
    /** @type {HTMLElement | null} */ (document.querySelector('.slipr-overlay-box.is-selected'))?.focus({ preventScroll: false });
  }, 250);
}
