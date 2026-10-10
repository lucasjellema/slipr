// @ts-check
/**
 * Editor slide tab: dynamic form generated from layout slot definitions,
 * layout picker, speaker notes, chapter assignment and audience visibility.
 */

import { h, isTypingEcho, rerenderKeepingFocus } from '../dom.js';
import { describeValue, imageValue, listValue, slotEditorKind, textareaText, textValue } from '../slot-values.js';
import { addImageToSlot, imageFileFrom } from '../image-input.js';
import { imageField, runImage } from './image-field.js';
import { cardsEditor, codeEditor, quoteEditor } from './field-editors.js';

/** Actions the slide form dispatches while the user types. */
const TYPING_ACTIONS = new Set(['setSlot', 'setNotes']);

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

    // 1. Layout Picker
    const templateLayouts = state.template?.layouts ?? [];
    const layoutOptions = templateLayouts.map((l) =>
      h('option', { value: l.id, selected: l.id === slide.layout ? true : undefined }, [l.title ?? l.id])
    );

    const layoutRow = h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Layout']),
      h(
        'select',
        {
          class: 'slipr-select',
          onchange: (e) => {
            const nextLayout = /** @type {HTMLSelectElement} */ (e.target).value;
            store.dispatch('setLayout', {
              slideId: slide.id,
              layout: nextLayout,
              templateLayouts: state.layouts,
            });
          },
        },
        layoutOptions
      ),
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

    root.append(layoutRow, slotsContainer, notesRow, chapterRow, visibilityRow);
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
    ];
  } else if (kind === 'quote') {
    inputs = quoteEditor({ label: labelText, read: () => current, write });
  } else if (kind === 'code') {
    inputs = codeEditor({ label: labelText, read: () => current, write });
  } else if (kind === 'cards') {
    inputs = cardsEditor({ store, slideId, slotName, slotDef, label: labelText });
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

  const helpEl = help ? h('span', { class: 'slipr-help' }, [help]) : null;
  // A cards slot is a group of card editors: its help goes above them.
  if (kind === 'cards') {
    return h('section', { class: 'slipr-form-group slipr-cards-group' }, [labelEl, helpEl, ...inputs]);
  }
  return h('div', { class: 'slipr-form-group' }, [labelEl, ...inputs, helpEl]);
}
