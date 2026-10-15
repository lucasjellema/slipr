// @ts-check
/**
 * Editor slide tab: dynamic form generated from layout slot definitions,
 * layout picker, speaker notes, chapter assignment and audience visibility.
 */

import { h, isTypingEcho, rerenderKeepingFocus } from '../dom.js';
import { GRAPH_HELP, MAP_HELP, TABLE_HELP, TAG_CLOUD_HELP } from '../help.js';
import { buildOverlaySection } from './overlay-list.js';
import { pictureStyleControls } from './picture-style.js';
import { describeValue, imageValue, listValue, slotEditorKind, textareaText, textValue } from '../slot-values.js';
import { addFallbackToSlot, addGraphDataFile, addImageToSlot, addLayerFile, addMediaFile, addPdf, addTableDataFile, imageFileFrom } from '../image-input.js';
import { pdfValue, webValue } from '../block-values.js';
import { webAddressFields, webOptionFields } from './web-fields.js';
import { pdfFields } from './pdf-fields.js';
import { TYPED_VIDEO_FIELDS, videoFields } from './video-fields.js';
import { videoValue } from '../video-values.js';
import { mapFields } from './map-fields.js';
import { graphFields } from './graph-fields.js';
import { tableFields } from './table-fields.js';
import { tagCloudFields } from './tag-cloud-fields.js';
import { readShowFile } from '../io/show-files.js';
import { imageField, runImage } from './image-field.js';
import { cardsEditor, codeEditor, quoteEditor } from './field-editors.js';
import { openLayoutPicker } from './layout-picker.js';
import { layoutName } from '../layout-choice.js';
import { parseTags } from '../show-entities.js';

/** Actions the slide form dispatches while the user types. */
const TYPING_ACTIONS = new Set(['setSlot', 'setNotes', 'setTags', 'updateOverlay']);
/** Web page fields that are typed (I-071); the others are choices. */
const TYPED_WEB_FIELDS = new Set(['url', 'pdf', 'title', 'fallback-alt']);

/**
 * Mount the slide form into a container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountSlideForm(container, store) {
  const root = h('div', { class: 'slipr-slide-form' });
  container.append(root);

  function render() {
    root.innerHTML = '';
    const state = store.state;
    const slide = state.show?.slides?.find((s) => s.id === state.selectedSlideId);

    if (!slide) {
      root.append(h('div', { class: 'slipr-empty-state' }, ['Select a slide to edit']));
      return;
    }

    // 1. Layout: a button that opens the layout picker with previews (E-004)
    const templateLayouts = state.template?.layouts ?? [];
    const currentDef = templateLayouts.find((l) => l.id === slide.layout);
    const layoutRow = h('div', { class: 'slipr-form-group' }, [
      h('span', { class: 'slipr-label', id: 'slipr-layout-label' }, ['Layout']),
      h(
        'button',
        {
          type: 'button',
          class: 'slipr-layout-button',
          'aria-describedby': 'slipr-layout-label',
          title: 'Choose another layout',
          onclick: () => openLayoutPicker({ store, mode: 'change', slideId: slide.id }),
        },
        [
          h('span', { class: 'slipr-layout-button-name' }, [currentDef ? layoutName(currentDef) : `${slide.layout} (not in this template)`]),
          h('span', { class: 'slipr-layout-button-action' }, ['Change…']),
        ]
      ),
      currentDef?.description ? h('span', { class: 'slipr-help' }, [currentDef.description]) : null,
    ]);

    // 2. Slots Form
    const currentLayoutDef =
      templateLayouts.find((l) => l.id === slide.layout) ??
      state.layouts?.get?.(slide.layout)?.def;

    const slotsContainer = h('div', { class: 'slipr-slots-form' });
    const slots = currentLayoutDef?.slots ?? [];

    if (slots.length === 0) {
      // Fallback for custom layouts without slot definitions: render current keys in content
      for (const [key, val] of Object.entries(slide.content ?? {})) {
        slotsContainer.append(buildSlotField(key, { name: key }, val, slide.id, store));
      }
    } else {
      for (const slotDef of slots) {
        const val = slide.content?.[slotDef.name];
        slotsContainer.append(buildSlotField(slotDef.name, slotDef, val, slide.id, store));
      }
    }

    // 3. Speaker Notes
    const notesRow = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Speaker Notes']),
      h(
        'textarea',
        {
          class: 'slipr-textarea slipr-textarea-sm',
          placeholder: 'Private presenter notes for audience mode…',
          oninput: (e) => {
            const notes = /** @type {HTMLTextAreaElement} */ (e.target).value;
            store.dispatch('setNotes', { slideId: slide.id, notes }, {
              coalesceKey: `notes-${slide.id}`,
            });
          },
        },
        [slide.notes ?? '']
      ),
    ]);

    // 4. Meta & Visibility
    const chapters = state.show?.chapters ?? [];
    const chapterOptions = [
      h('option', { value: '' }, ['(None)']),
      ...chapters.map((c) =>
        h('option', { value: c.id, selected: c.id === slide.chapter ? true : undefined }, [c.title ?? c.id])
      ),
    ];

    const chapterRow = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Chapter']),
      h(
        'select',
        {
          class: 'slipr-select',
          onchange: (e) => {
            const chap = /** @type {HTMLSelectElement} */ (e.target).value;
            store.dispatch('setChapter', { slideId: slide.id, chapter: chap || null });
          },
        },
        chapterOptions
      ),
    ]);

    const hiddenCheckbox = h('input', {
      type: 'checkbox',
      checked: Boolean(slide.audience?.hidden),
      onchange: (e) => {
        const checked = /** @type {HTMLInputElement} */ (e.target).checked;
        store.dispatch('setHidden', { slideId: slide.id, audienceHidden: checked });
      },
    });

    const visibilityRow = h('div', { class: 'slipr-form-checkbox' }, [
      h('label', {}, [hiddenCheckbox, ' Hide from audience mode']),
    ]);

    // 5. Tags and audience-mode options (E-015)
    const tagsRow = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label', for: 'slipr-slide-tags' }, ['Tags']),
      h('input', {
        type: 'text',
        id: 'slipr-slide-tags',
        class: 'slipr-input',
        placeholder: 'Comma-separated, e.g. architecture, format',
        value: (slide.tags ?? []).join(', '),
        oninput: (e) => {
          const tags = parseTags(/** @type {HTMLInputElement} */ (e.target).value);
          store.dispatch('setTags', { slideId: slide.id, tags }, { coalesceKey: `tags-${slide.id}` });
        },
      }),
      h('span', { class: 'slipr-help' }, ['Topics for reader search and "related" suggestions.']),
    ]);

    const audience = slide.audience ?? {};
    /** @param {Record<string, any>} patch */
    const setAudience = (patch) => store.dispatch('setSlideAudience', { slideId: slide.id, patch });
    const fragmentsValue = audience.fragments === true ? 'true' : typeof audience.fragments === 'string' ? audience.fragments : '';
    const audienceRow = h('fieldset', { class: 'slipr-fieldset slipr-audience-options' }, [
      h('legend', {}, ['Audience mode']),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label', for: 'slipr-fragments' }, ['Build step by step']),
        h('select', {
          id: 'slipr-fragments',
          class: 'slipr-select',
          onchange: (e) => {
            const v = /** @type {HTMLSelectElement} */ (e.target).value;
            setAudience({ fragments: v === '' ? undefined : v === 'true' ? true : v });
          },
        }, [
          h('option', { value: '', selected: fragmentsValue === '' ? true : undefined }, ['Off: everything at once']),
          h('option', { value: 'true', selected: fragmentsValue === 'true' ? true : undefined }, ['On: bullets and cards one by one']),
          ...['fade-in', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'fade-in-then-semi-out', 'semi-fade-out', 'grow', 'shrink'].map((style) => h('option', { value: style, selected: fragmentsValue === style ? true : undefined }, [`On, with effect: ${style}`])),
        ]),
      ]),
      h('div', { class: 'slipr-form-checkbox' }, [
        h('label', {}, [
          h('input', {
            type: 'checkbox',
            checked: Boolean(audience.autoAnimate),
            onchange: (e) => setAudience({ autoAnimate: /** @type {HTMLInputElement} */ (e.target).checked || undefined }),
          }),
          ' Auto-animate: morph matching fields from and to neighbouring auto-animate slides',
        ]),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label', for: 'slipr-slide-transition' }, ['Transition into this slide']),
        h('select', {
          id: 'slipr-slide-transition',
          class: 'slipr-select',
          onchange: (e) => setAudience({ transition: /** @type {HTMLSelectElement} */ (e.target).value || undefined }),
        }, [
          h('option', { value: '', selected: audience.transition ? undefined : true }, [`Show default (${state.show?.settings?.transition ?? 'Reveal default'})`]),
          ...['none', 'fade', 'slide', 'convex', 'concave', 'zoom'].map((t) => h('option', { value: t, selected: audience.transition === t ? true : undefined }, [t])),
        ]),
      ]),
      visibilityRow,
    ]);

    root.append(layoutRow, slotsContainer, buildOverlaySection(slide, store), notesRow, chapterRow, tagsRow, audienceRow);
  }

  store.subscribe((event) => {
    const { changedKeys } = event;
    if (
      changedKeys.includes('show') ||
      changedKeys.includes('selectedSlideId') ||
      changedKeys.includes('template')
    ) {
      // Leave the form alone while it echoes the user's own typing; re-render for anything else.
      if (isTypingEcho(root, event, TYPING_ACTIONS)) return;
      rerenderKeepingFocus(root, render);
    }
  });

  render();
}

/**
 * Build a field for a layout slot. The value written always has the shape the
 * slot type requires (see slot-values.js); types without an editor are read-only.
 * @param {string} slotName
 * @param {any} slotDef
 * @param {any} value
 * @param {string} slideId
 * @param {import('../store.js').EditorStore} store
 */
function buildSlotField(slotName, slotDef, value, slideId, store) {
  const labelText = slotDef.label ?? slotName;
  const isRequired = Boolean(slotDef.required);
  const helpText = slotDef.help ?? '';
  const kind = slotEditorKind(slotDef.type, value);
  const coalesceKey = `slot-${slideId}-${slotName}`;

  // The latest value of this slot, so image and list edits build on it.
  let current = value;
  /** @param {any} next */
  const write = (next) => {
    current = next;
    store.dispatch('setSlot', { slideId, slot: slotName, value: next }, { coalesceKey });
  };

  const labelEl = h('label', { class: 'slipr-label' }, [
    labelText,
    isRequired ? h('span', { class: 'slipr-required' }, [' *']) : null,
  ]);

  /** @type {(HTMLElement | null)[]} */
  let inputs;

  if (kind === 'textarea') {
    inputs = [h(
      'textarea',
      {
        class: 'slipr-textarea',
        placeholder: slotDef.type === 'list' ? '- Bullet item\n- Another item' : '',
        oninput: (e) => {
          const text = /** @type {HTMLTextAreaElement} */ (e.target).value;
          write(slotDef.type === 'list' ? listValue(current, text) : textValue(text));
        },
      },
      [textareaText(value)]
    )];
  } else if (kind === 'image') {
    const image = imageValue(value, {});
    inputs = [
      imageField({
        label: labelText,
        image,
        resolveAsset: store.state.resolveAsset,
        onFile: (file) => runImage(() => addImageToSlot(store, { slideId, slot: slotName, file })),
      }),
      h('input', {
        type: 'text',
        class: 'slipr-input slipr-input-alt',
        placeholder: 'images/example.png',
        'aria-label': `${labelText}: image path`,
        value: image?.src ?? '',
        oninput: (e) => write(imageValue(current, { src: /** @type {HTMLInputElement} */ (e.target).value })),
        onpaste: (/** @type {ClipboardEvent} */ e) => {
          // An image on the clipboard goes into the slot; pasted text stays a path.
          const file = imageFileFrom(e.clipboardData);
          if (!file) return;
          e.preventDefault();
          runImage(() => addImageToSlot(store, { slideId, slot: slotName, file }));
        },
      }),
      h('input', {
        type: 'text',
        class: 'slipr-input slipr-input-alt',
        placeholder: 'Alt text: what the image shows',
        'aria-label': `${labelText}: alt text`,
        value: image?.alt ?? '',
        oninput: (e) => write(imageValue(current, { alt: /** @type {HTMLInputElement} */ (e.target).value })),
      }),
      // How the image fills its frame (E-015). Without a choice the layout decides.
      h('select', {
        class: 'slipr-select slipr-select-sm slipr-input-alt',
        'aria-label': `${labelText}: fit`,
        disabled: image?.src ? undefined : true,
        onchange: (e) => {
          const fit = /** @type {HTMLSelectElement} */ (e.target).value || undefined;
          const next = imageValue(current, { fit });
          current = next;
          store.dispatch('setSlot', { slideId, slot: slotName, value: next });
        },
      }, [
        h('option', { value: '', selected: image?.fit ? undefined : true }, ['Fit: as the layout decides']),
        h('option', { value: 'cover', selected: image?.fit === 'cover' ? true : undefined }, ['Fill the frame (may crop)']),
        h('option', { value: 'contain', selected: image?.fit === 'contain' ? true : undefined }, ['Show the whole image']),
      ]),
      // Picture style and opacity (D-014, I-084).
      pictureStyleControls({
        label: labelText,
        image,
        styles: store.state.template?.pictureStyles ?? [],
        resolveAsset: store.state.resolveAsset,
        store,
        onChange: (patch) => {
          const next = imageValue(current, patch);
          current = next;
          store.dispatch('setSlot', { slideId, slot: slotName, value: next });
        },
      }),
    ];
  } else if (kind === 'quote') {
    inputs = quoteEditor({ label: labelText, read: () => current, write });
  } else if (kind === 'code') {
    inputs = codeEditor({ label: labelText, read: () => current, write });
  } else if (kind === 'cards') {
    inputs = cardsEditor({ store, slideId, slotName, slotDef, label: labelText });
  } else if (kind === 'web') {
    // A web page (I-071): the same fields as the Embedded Page block, plus live / screenshot while presenting.
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    /** @type {import('./web-fields.js').WebFieldsOptions} */
    const options = {
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: (patch, field) => {
        current = webValue(readSlot(), patch);
        // Typing coalesces (one undo step, no re-render); choices re-render the form.
        store.dispatch('setSlot', { slideId, slot: slotName, value: current }, TYPED_WEB_FIELDS.has(field) ? { coalesceKey: `${coalesceKey}-${field}` } : {});
      },
      addFallback: (file) => addFallbackToSlot(store, { slideId, slot: slotName, file }),
      resolveAsset: store.state.resolveAsset,
    };
    inputs = [h('div', { class: 'slipr-embed-editor' }, [...webAddressFields(options), ...webOptionFields(options)])];
  } else if (kind === 'pdf') {
    // A PDF document (I-072): the same fields as the PDF block.
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    /** @param {Record<string, any>} patch @param {string} field */
    const writePdf = (patch, field) => {
      current = pdfValue(readSlot(), patch);
      store.dispatch('setSlot', { slideId, slot: slotName, value: current }, TYPED_WEB_FIELDS.has(field) ? { coalesceKey: `${coalesceKey}-${field}` } : {});
    };
    inputs = [h('div', { class: 'slipr-embed-editor' }, pdfFields({
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: writePdf,
      addPdf: (file) => addPdf(store, {
        file,
        fallbackName: slotName,
        write: (path) => writePdf({ pdf: path, ...(readSlot()?.title ? {} : { title: file.name.replace(/\.pdf$/i, '') }) }, 'file'),
      }),
      addFallback: (file) => addFallbackToSlot(store, { slideId, slot: slotName, file }),
      resolveAsset: store.state.resolveAsset,
    }))];
  } else if (kind === 'video') {
    // A video (I-110): the same fields as the Video block, plus what happens while presenting.
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    /** @param {Record<string, any>} patch @param {string} field */
    const writeVideo = (patch, field) => {
      current = videoValue(readSlot(), patch);
      store.dispatch('setSlot', { slideId, slot: slotName, value: current }, TYPED_VIDEO_FIELDS.has(field) ? { coalesceKey: `${coalesceKey}-${field}` } : {});
    };
    inputs = [h('div', { class: 'slipr-embed-editor' }, videoFields({
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: writeVideo,
      addVideo: (file) => addMediaFile(store, {
        file,
        kind: 'video',
        fallbackName: slotName,
        write: (path) => writeVideo({ video: path, ...(readSlot()?.title && readSlot()?.title !== 'Video' ? {} : { title: file.name.replace(/\.[a-z0-9]+$/i, '') }) }, 'file'),
      }),
      addCaptions: (file) => addMediaFile(store, {
        file,
        kind: 'captions',
        fallbackName: slotName,
        write: (path) => writeVideo({ captions: { ...(readSlot()?.captions ?? {}), src: path } }, 'captions'),
      }),
      addFallback: (file) => addFallbackToSlot(store, { slideId, slot: slotName, file }),
      resolveAsset: store.state.resolveAsset,
    }))];
  } else if (kind === 'map') {
    // A map (I-075, E-021): the same fields as the Map block, plus the tour and "while presenting".
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    inputs = [h('div', { class: 'slipr-embed-editor slipr-map-fields' }, mapFields({
      key: `slot:${slideId}:${slotName}`,
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: (next, typing) => {
        current = next;
        store.dispatch('setSlot', { slideId, slot: slotName, value: next }, typing ? { coalesceKey: `${coalesceKey}-map` } : {});
      },
      readFile: (path) => readShowFile(store.state, path),
      addLayerFile: (file, write) => addLayerFile(store, { file, write }),
      addFallback: (file, alt) => addFallbackToSlot(store, { slideId, slot: slotName, file, alt }),
      resolveAsset: store.state.resolveAsset,
      slides: store.state.show?.slides ?? [],
      currentSlideId: slideId,
    }))];
  } else if (kind === 'graph') {
    // A graph (I-074, E-020): the same fields as the Graph block, plus the build-up while presenting.
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    inputs = [h('div', { class: 'slipr-embed-editor slipr-map-fields' }, graphFields({
      key: `slot:${slideId}:${slotName}`,
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: (next, typing) => {
        current = next;
        store.dispatch('setSlot', { slideId, slot: slotName, value: next }, typing ? { coalesceKey: `${coalesceKey}-graph` } : {});
      },
      readFile: (path) => readShowFile(store.state, path),
      addDataFile: (file, write) => addGraphDataFile(store, { file, write }),
      addFallback: (file, alt) => addFallbackToSlot(store, { slideId, slot: slotName, file, alt }),
      resolveAsset: store.state.resolveAsset,
      slides: store.state.show?.slides ?? [],
      currentSlideId: slideId,
    }))];
  } else if (kind === 'table') {
    // A table (I-104): the same fields as the Table block, plus the steps while presenting.
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    inputs = [h('div', { class: 'slipr-embed-editor slipr-table-fields' }, tableFields({
      key: `slot:${slideId}:${slotName}`,
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: (next, typing) => {
        current = next;
        store.dispatch('setSlot', { slideId, slot: slotName, value: next }, typing ? { coalesceKey: `${coalesceKey}-table` } : {});
      },
      readFile: (path) => readShowFile(store.state, path),
      addDataFile: (file, write) => addTableDataFile(store, { file, write }),
    }))];
  } else if (kind === 'tag-cloud') {
    // A tag cloud (I-105): the same fields as the Tag cloud block, plus the steps while presenting.
    const readSlot = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName];
    inputs = [h('div', { class: 'slipr-embed-editor slipr-table-fields' }, tagCloudFields({
      key: `slot:${slideId}:${slotName}`,
      label: labelText,
      kind: 'slot',
      read: readSlot,
      write: (next, typing) => {
        current = next;
        store.dispatch('setSlot', { slideId, slot: slotName, value: next }, typing ? { coalesceKey: `${coalesceKey}-tag-cloud` } : {});
      },
      readFile: (path) => readShowFile(store.state, path),
      addDataFile: (file, write) => addTableDataFile(store, { file, write }),
      glossary: store.state.show?.glossary,
    }))];
  } else if (kind === 'readonly') {
    inputs = [
      h('div', { class: 'slipr-readonly', title: 'No editor for this slot type yet' }, [
        describeValue(slotDef.type, value),
      ]),
    ];
  } else {
    inputs = [h('input', {
      type: 'text',
      class: 'slipr-input',
      value: typeof value === 'string' ? value : '',
      oninput: (e) => write(textValue(/** @type {HTMLInputElement} */ (e.target).value)),
    })];
  }

  const help = kind === 'readonly'
    ? `This ${slotDef.type ?? ''} slot can't be edited here yet. Edit show.json directly.`.replace('  ', ' ')
    : helpText;

  const helpEl = kind === 'graph'
    ? h('span', { class: 'slipr-help' }, [h('a', { href: GRAPH_HELP, target: 'slipr-help', rel: 'noopener' }, ['How graphs work']), ': nodes, links, the build-up while presenting and data files.'])
    : kind === 'map'
      ? h('span', { class: 'slipr-help' }, [h('a', { href: MAP_HELP, target: 'slipr-help', rel: 'noopener' }, ['How maps work']), ': places, the tour while presenting, layers and offline maps.'])
    : kind === 'table'
      ? h('span', { class: 'slipr-help' }, [h('a', { href: TABLE_HELP, target: 'slipr-help', rel: 'noopener' }, ['How tables work']), ': typing or pasting rows, CSV files, column formats, totals and steps.'])
    : kind === 'tag-cloud'
      ? h('span', { class: 'slipr-help' }, [h('a', { href: TAG_CLOUD_HELP, target: 'slipr-help', rel: 'noopener' }, ['How tag clouds work']), ': terms and weights, CSV files, glossary links and steps.'])
    : help ? h('span', { class: 'slipr-help' }, [help]) : null;
  // A cards slot is a group of card editors: its help goes above them.
  if (kind === 'cards') {
    return h('section', { class: 'slipr-form-group slipr-cards-group' }, [labelEl, helpEl, ...inputs]);
  }
  return h('div', { class: 'slipr-form-group' }, [labelEl, ...inputs, helpEl]);
}
