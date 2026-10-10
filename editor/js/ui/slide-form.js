// @ts-check
/**
 * Editor slide tab: dynamic form generated from layout slot definitions,
 * layout picker, speaker notes, chapter assignment and audience visibility.
 */

import { h } from '../dom.js';

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
        slotsContainer.append(buildSlotField(key, { name: key, type: 'text' }, val, slide.id, store));
      }
    } else {
      for (const slotDef of slots) {
        const val = slide.content?.[slotDef.name] ?? '';
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

  store.subscribe(({ changedKeys }) => {
    if (
      changedKeys.includes('show') ||
      changedKeys.includes('selectedSlideId') ||
      changedKeys.includes('template')
    ) {
      // Don't reconstruct form if user is currently typing in an input inside this form
      if (document.activeElement && root.contains(document.activeElement)) {
        return;
      }
      render();
    }
  });

  render();
}

/**
 * Build a field input for a layout slot.
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

  const labelEl = h('label', { class: 'slipr-label' }, [
    labelText,
    isRequired ? h('span', { class: 'slipr-required' }, [' *']) : null,
  ]);

  let inputEl;

  if (slotDef.type === 'richtext' || slotDef.type === 'list') {
    const textVal = Array.isArray(value) ? value.join('\n') : String(value ?? '');
    inputEl = h(
      'textarea',
      {
        class: 'slipr-textarea',
        placeholder: slotDef.type === 'list' ? '- Bullet item\n- Another item' : '',
        oninput: (e) => {
          let val = /** @type {HTMLTextAreaElement} */ (e.target).value;
          store.dispatch('setSlot', { slideId, slot: slotName, value: val }, {
            coalesceKey: `slot-${slideId}-${slotName}`,
          });
        },
      },
      [textVal]
    );
  } else if (slotDef.type === 'image') {
    const srcVal = typeof value === 'string' ? value : value?.src ?? '';
    inputEl = h('input', {
      type: 'text',
      class: 'slipr-input',
      placeholder: 'images/example.png',
      value: srcVal,
      oninput: (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value;
        store.dispatch('setSlot', { slideId, slot: slotName, value: val }, {
          coalesceKey: `slot-${slideId}-${slotName}`,
        });
      },
    });
  } else {
    inputEl = h('input', {
      type: 'text',
      class: 'slipr-input',
      value: String(value ?? ''),
      oninput: (e) => {
        const val = /** @type {HTMLInputElement} */ (e.target).value;
        store.dispatch('setSlot', { slideId, slot: slotName, value: val }, {
          coalesceKey: `slot-${slideId}-${slotName}`,
        });
      },
    });
  }

  const group = h('div', { class: 'slipr-form-group' }, [
    labelEl,
    inputEl,
    helpText ? h('span', { class: 'slipr-help' }, [helpText]) : null,
  ]);

  return group;
}
