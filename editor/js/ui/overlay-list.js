// @ts-check
/**
 * The Slide tab's "Extra images and text" section: images (I-083) and text
 * elements (I-089) placed freely on the slide, in front of the layout. One row
 * per overlay (picture and alt text, or text and its look; appear one by one,
 * stacking order, remove), a drop zone to add an image and a button to add a
 * text. Placing and sizing happens on the audience preview
 * (ui/overlay-editor.js).
 *
 * Rows are collapsed by default to a one-line header (kind, number, a short
 * description, tools); the header's toggle expands the fields. Selecting an
 * overlay on the preview expands its row.
 */
import { h } from '../dom.js';
import { addImageToOverlay, addOverlayImage } from '../image-input.js';
import { imageField, runImage } from './image-field.js';
import {
  selectOverlay, selectedOverlay, showOverlaySelected, focusOverlayText, overlayRoot,
  isOverlayExpanded, setOverlayExpanded, remapOverlayExpanded, showOverlayRowExpanded,
} from './overlay-editor.js';
import { pictureStyleControls } from './picture-style.js';
import { textStyleControls } from './text-style-controls.js';
import { imageValue } from '../slot-values.js';
import { NEW_TEXT_BOX } from '../actions.js';

const EFFECTS = ['fade-in', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'fade-in-then-semi-out', 'semi-fade-out', 'grow', 'shrink'];

/**
 * @param {any} slide
 * @param {import('../store.js').EditorStore} store
 * @param {{ idPrefix?: string }} [options]  idPrefix: keeps element ids unique when the
 *   section is shown twice (the Slide tab and the enlarged preview, I-103).
 * @returns {HTMLElement}
 */
export function buildOverlaySection(slide, store, { idPrefix = 'slipr-overlay' } = {}) {
  const overlays = Array.isArray(slide.overlays) ? slide.overlays : [];
  const slideId = slide.id;
  const resolveAsset = store.state.resolveAsset;
  const palette = store.state.template?.styleguide?.colors ?? {};
  const toPreview = () => {
    if (store.state.previewMode !== 'audience') store.setPreviewMode('audience');
  };

  /** The picture, alt text and picture style of an extra image. @param {any} o @param {number} i */
  const imageFields = (o, i) => [
    imageField({
      label: `Extra image ${i + 1}`,
      image: o.image,
      resolveAsset,
      onFile: (file) => runImage(() => addImageToOverlay(store, { slideId, index: i, file })),
    }),
    h('label', { class: 'slipr-label', for: `${idPrefix}-alt-${i}` }, ['Alt text']),
    h('input', {
      id: `${idPrefix}-alt-${i}`,
      type: 'text',
      class: 'slipr-input',
      value: o.image?.alt ?? '',
      placeholder: 'What the image shows',
      oninput: (/** @type {Event} */ e) => {
        const alt = /** @type {HTMLInputElement} */ (e.target).value;
        store.dispatch('updateOverlay', { slideId, index: i, patch: { image: { ...o.image, alt } } }, { coalesceKey: `overlay-alt-${slideId}-${i}` });
      },
    }),
    pictureStyleControls({
      label: `Extra image ${i + 1}`,
      image: o.image,
      styles: store.state.template?.pictureStyles ?? [],
      resolveAsset,
      onChange: (patch) => store.dispatch('updateOverlay', { slideId, index: i, patch: { image: imageValue(o.image, patch) } }),
    }),
  ];

  /** The text and the look of a text element (D-016). @param {any} o @param {number} i */
  const textFields = (o, i) => [
    h('label', { class: 'slipr-label', for: `${idPrefix}-text-${i}` }, ['Text']),
    h('textarea', {
      id: `${idPrefix}-text-${i}`,
      'data-overlay-text': String(i),
      class: 'slipr-textarea slipr-overlay-text-input',
      rows: '2',
      placeholder: 'The text; **bold**, *italic*, [[glossary-id]]; Enter starts a new line',
      oninput: (/** @type {Event} */ e) => {
        const text = /** @type {HTMLTextAreaElement} */ (e.target).value;
        store.dispatch('updateOverlay', { slideId, index: i, patch: { text } }, { coalesceKey: `overlay-text-${slideId}-${i}` });
      },
    }, [o.text]),
    textStyleControls({
      id: `${idPrefix}-style-${i}`,
      label: `Text ${i + 1}`,
      style: o.style,
      palette,
      onChange: (patch) => {
        // The latest style: several changes can come before the form re-renders.
        const live = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.overlays?.[i];
        store.dispatch('updateOverlay', { slideId, index: i, patch: { style: { ...(live?.style ?? {}), ...patch } } });
      },
    }),
  ];

  /**
   * Place and size as numbers (percentages of the slide), next to moving and
   * resizing on the preview. Stored on change; kept inside the slide.
   * @param {any} o @param {number} i
   */
  const positionFields = (o, i) => h('div', { class: 'slipr-overlay-position', role: 'group', 'aria-label': `Place and size of ${typeof o.text === 'string' ? 'text' : 'image'} ${i + 1}, in % of the slide` },
    /** @type {const} */ ([['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']]).map(([key, text]) => h('label', { class: 'slipr-text-style-field slipr-text-style-number' }, [
      h('span', { class: 'slipr-label' }, [`${text} %`]),
      h('input', {
        id: `${idPrefix}-${key}-${i}`,
        type: 'number', class: 'slipr-input', min: '0', max: '100', step: '0.5',
        value: String(Math.round(o[key] * 1000) / 10),
        onchange: (/** @type {Event} */ e) => {
          const v = Number(/** @type {HTMLInputElement} */ (e.target).value);
          if (Number.isFinite(v)) store.dispatch('updateOverlay', { slideId, index: i, patch: { [key]: v / 100 } });
        },
      }),
    ])));

  /** Move an overlay in the stacking order; its row stays expanded or collapsed. @param {number} i @param {number} j */
  const move = (i, j) => {
    remapOverlayExpanded(slideId, (k) => (k === i ? j : k === j ? i : k));
    store.dispatch('moveOverlay', { slideId, index: i, toIndex: j });
  };

  const rows = overlays.map((/** @type {any} */ o, /** @type {number} */ i) => {
    const fragment = o.fragment === true ? 'true' : typeof o.fragment === 'string' ? o.fragment : '';
    const isText = typeof o.text === 'string';
    const what = `${isText ? 'text' : 'image'} ${i + 1}`;
    const open = isOverlayExpanded(slideId, i);
    const bodyId = `${idPrefix}-body-${i}`;
    const summary = (isText ? o.text.replace(/\s+/g, ' ').trim() : o.image?.alt ?? '') || (isText ? '(no text)' : '(no alt text)');
    /** @type {HTMLElement} */
    const row = h('li', {
      class: `slipr-overlay-row ${isText ? 'is-text' : ''} ${selectedOverlay(slideId) === i ? 'is-selected' : ''} ${open ? 'is-expanded' : ''}`,
      'data-overlay-index': String(i),
    }, [
      h('div', { class: 'slipr-overlay-row-head' }, [
        h('button', {
          type: 'button',
          class: 'slipr-overlay-row-toggle',
          'aria-expanded': String(open),
          'aria-controls': bodyId,
          title: open ? 'Hide the settings' : 'Show the settings',
          onclick: () => showOverlayRowExpanded(row, slideId, i, !isOverlayExpanded(slideId, i)),
        }, [
          h('span', { class: 'slipr-overlay-row-chevron', 'aria-hidden': 'true' }, ['▸']),
          !isText && o.image?.src ? h('img', { class: 'slipr-overlay-row-thumb', src: resolveAsset?.(o.image.src) ?? o.image.src, alt: '' }) : null,
          h('span', { class: 'slipr-overlay-row-title' }, [`${isText ? 'Text' : 'Image'} ${i + 1}${i === overlays.length - 1 && overlays.length > 1 ? ' (in front)' : ''}`]),
          h('span', { class: 'slipr-overlay-row-summary' }, [summary]),
        ]),
        h('div', { class: 'slipr-overlay-row-tools' }, [
          h('button', {
            type: 'button', class: 'slipr-item-btn', title: 'Select it on the preview, to move and resize it',
            'aria-label': `Select ${what} on the preview`,
            onclick: () => { toPreview(); showOverlaySelected(slideId, i); queueFocus(); },
          }, ['⌖']),
          h('button', {
            type: 'button', class: 'slipr-item-btn', title: 'Bring forward', 'aria-label': `Bring ${what} forward`,
            disabled: i === overlays.length - 1 ? true : undefined,
            onclick: () => move(i, i + 1),
          }, ['▲']),
          h('button', {
            type: 'button', class: 'slipr-item-btn', title: 'Send backward', 'aria-label': `Send ${what} backward`,
            disabled: i === 0 ? true : undefined,
            onclick: () => move(i, i - 1),
          }, ['▼']),
          h('button', {
            type: 'button', class: 'slipr-item-btn slipr-item-btn-danger',
            title: isText ? 'Remove this text from the slide' : 'Remove this image from the slide (the file stays)',
            'aria-label': `Remove ${what}`,
            onclick: () => {
              selectOverlay(null);
              remapOverlayExpanded(slideId, (k) => (k === i ? -1 : k > i ? k - 1 : k));
              store.dispatch('deleteOverlay', { slideId, index: i });
            },
          }, ['🗑']),
        ]),
      ]),
      h('div', { id: bodyId, class: 'slipr-overlay-row-body', hidden: open ? undefined : true }, [
        positionFields(o, i),
        ...(isText ? textFields(o, i) : imageFields(o, i)),
        h('label', { class: 'slipr-label', for: `${idPrefix}-fragment-${i}` }, ['In audience mode']),
        h('select', {
          id: `${idPrefix}-fragment-${i}`,
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
      ]),
    ]);
    return row;
  });

  return h('fieldset', { class: 'slipr-fieldset slipr-overlays-form' }, [
    h('legend', {}, [`Extra images and text${overlays.length ? ` (${overlays.length})` : ''}`]),
    h('p', { class: 'slipr-help' }, [
      'Images and texts placed freely on the slide, in front of the layout. Move and resize them on the preview (Audience): drag, or a corner to resize; arrow keys move, Alt+arrows resize.',
    ]),
    overlays.length ? h('ol', { class: 'slipr-overlay-list' }, rows) : null,
    imageField({
      label: 'Add an extra image',
      image: undefined,
      resolveAsset,
      onFile: (file) => runImage(async () => {
        setOverlayExpanded(slideId, overlays.length, true); // the new image's row opens
        const index = await addOverlayImage(store, { slideId, file });
        if (store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.overlays?.[index]) {
          selectOverlay(slideId, index);
          toPreview();
        }
      }),
    }),
    h('button', {
      type: 'button',
      class: 'slipr-btn slipr-btn-sm slipr-overlay-add-text',
      title: 'Add a text element: a badge, a label or a callout, placed freely on the slide',
      onclick: () => {
        const index = overlays.length;
        selectOverlay(slideId, index);
        setOverlayExpanded(slideId, index, true);
        store.dispatch('addOverlay', { slideId, overlay: { text: 'Text', ...NEW_TEXT_BOX } });
        toPreview();
        focusOverlayText(index, { select: true });
      },
    }, ['+ Add text']),
  ]);
}

/** Focus the selected box on the preview once it has re-rendered. */
function queueFocus() {
  setTimeout(() => {
    /** @type {HTMLElement | null} */ (overlayRoot().querySelector('.slipr-overlay-box.is-selected'))?.focus({ preventScroll: false });
  }, 250);
}
