// @ts-check
/**
 * Field editors for the quote, code and cards slot types (E-004, I-035).
 * Values are built by card-values.js, so they always have the shape the
 * format requires. Text, rich text, list and image fields stay in
 * slide-form.js; card fields reuse the same kinds of inputs.
 */
import { h } from '../dom.js';
import { addCard, cardsArray, cardsValue, codeValue, lengthHint, moveCard, quoteValue, removeCard, withCardField } from '../card-values.js';
import { imageValue, listValue, textareaText } from '../slot-values.js';
import { addImageToCard } from '../image-input.js';
import { imageField, runImage } from './image-field.js';

/**
 * @typedef {object} ValueAccess
 * @property {() => any} read            The slot's current value.
 * @property {(value: any) => void} write Store a new value (coalesced while typing).
 */

/**
 * A "12 / 18" counter that turns into a warning when the text is too long.
 * @param {string | undefined} text
 * @param {number | undefined} maxLength
 */
function counter(text, maxLength) {
  const hint = lengthHint(text, maxLength);
  if (!hint) return null;
  const el = h('span', { class: `slipr-counter ${hint.over ? 'is-over' : ''}`, 'aria-live': 'polite' }, [hint.text]);
  return el;
}

/**
 * Update a counter element while typing.
 * @param {HTMLElement | null} el @param {string} text @param {number | undefined} maxLength
 */
function updateCounter(el, text, maxLength) {
  const hint = lengthHint(text, maxLength);
  if (!el || !hint) return;
  el.textContent = hint.text;
  el.classList.toggle('is-over', hint.over);
}

/**
 * Quote: the quote text and its source.
 * @param {{ label: string } & ValueAccess} options
 * @returns {HTMLElement[]}
 */
export function quoteEditor({ label, read, write }) {
  const value = read();
  return [
    h('textarea', {
      class: 'slipr-textarea slipr-textarea-sm',
      placeholder: 'The quote',
      'aria-label': `${label}: quote`,
      oninput: (/** @type {Event} */ e) => write(quoteValue(read(), { text: /** @type {HTMLTextAreaElement} */ (e.target).value })),
    }, [typeof value?.text === 'string' ? value.text : '']),
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-alt',
      placeholder: 'Source (who said it; optional)',
      'aria-label': `${label}: source`,
      value: value?.source ?? '',
      oninput: (/** @type {Event} */ e) => write(quoteValue(read(), { source: /** @type {HTMLInputElement} */ (e.target).value })),
    }),
  ];
}

/**
 * Code: language and the code itself (monospace, Tab inserts spaces).
 * @param {{ label: string } & ValueAccess} options
 * @returns {HTMLElement[]}
 */
export function codeEditor({ label, read, write }) {
  const value = read();
  const area = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'slipr-textarea slipr-code-input',
    spellcheck: 'false',
    placeholder: 'Code',
    'aria-label': `${label}: code`,
    oninput: () => write(codeValue(read(), { code: area.value })),
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      // Tab indents (2 spaces); Esc then Tab leaves the field.
      if (e.key !== 'Tab' || e.shiftKey || area.dataset.tabOut === 'true') return;
      e.preventDefault();
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      write(codeValue(read(), { code: area.value }));
    },
  }, [typeof value?.code === 'string' ? value.code : '']));
  area.addEventListener('keyup', (e) => {
    area.dataset.tabOut = e.key === 'Escape' ? 'true' : 'false';
  });
  return [
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm',
      placeholder: 'Language (e.g. js, python, json)',
      'aria-label': `${label}: language`,
      value: value?.language ?? '',
      oninput: (/** @type {Event} */ e) => write(codeValue(read(), { language: /** @type {HTMLInputElement} */ (e.target).value })),
    }),
    area,
    h('span', { class: 'slipr-help' }, ['Tab indents. Press Esc, then Tab, to leave the field.']),
  ];
}

/**
 * Cards: one group of fields per card (from the slot's `fields`), with move,
 * remove and "+ Add card" (up to `maxItems`).
 * @param {{ store: import('../store.js').EditorStore, slideId: string, slotName: string, slotDef: any, label: string }} options
 * @returns {HTMLElement[]}
 */
export function cardsEditor({ store, slideId, slotName, slotDef, label }) {
  const fields = Array.isArray(slotDef.fields) ? slotDef.fields : [];
  const maxItems = slotDef.maxItems;
  const read = () => cardsArray(store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slotName]);
  /** @param {any[]} cards @param {string} [coalesceKey] */
  const write = (cards, coalesceKey) =>
    store.dispatch('setSlot', { slideId, slot: slotName, value: cardsValue(cards) }, coalesceKey ? { coalesceKey } : undefined);

  const cards = read();
  const cardEls = cards.map((card, index) => {
    const legend = h('legend', { class: 'slipr-card-legend' }, [`Card ${index + 1}`]);
    const tools = h('div', { class: 'slipr-card-tools' }, [
      h('button', {
        type: 'button', class: 'slipr-item-btn', title: 'Move card up', 'aria-label': `Move card ${index + 1} up`,
        disabled: index === 0, onclick: () => write(moveCard(read(), index, index - 1)),
      }, ['▲']),
      h('button', {
        type: 'button', class: 'slipr-item-btn', title: 'Move card down', 'aria-label': `Move card ${index + 1} down`,
        disabled: index === cards.length - 1, onclick: () => write(moveCard(read(), index, index + 1)),
      }, ['▼']),
      h('button', {
        type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove card', 'aria-label': `Remove card ${index + 1}`,
        onclick: () => {
          const empty = Object.keys(card).length === 0;
          if (empty || confirm(`Remove card ${index + 1}?`)) write(removeCard(read(), index));
        },
      }, ['🗑']),
    ]);

    const fieldEls = fields.map((/** @type {any} */ field) => {
      const id = `card-${slideId}-${slotName}-${index}-${field.name}`;
      const fieldLabel = `${field.label ?? field.name}`;
      const value = card[field.name];
      const coalesceKey = `slot-${slideId}-${slotName}-${index}-${field.name}`;
      const setField = (/** @type {any} */ next) => write(withCardField(read(), index, field.name, next), coalesceKey);
      const labelEl = h('label', { class: 'slipr-label', for: id }, [
        fieldLabel,
        field.required ? h('span', { class: 'slipr-required' }, [' *']) : null,
      ]);

      if (field.type === 'image') {
        const image = imageValue(value, {});
        return h('div', { class: 'slipr-form-group slipr-card-field' }, [
          h('span', { class: 'slipr-label' }, [fieldLabel, field.required ? h('span', { class: 'slipr-required' }, [' *']) : null]),
          imageField({
            label: `Card ${index + 1}: ${fieldLabel}`,
            image,
            resolveAsset: store.state.resolveAsset,
            onFile: (file) => runImage(() => addImageToCard(store, { slideId, slot: slotName, index, field: field.name, file })),
          }),
          h('input', {
            type: 'text',
            class: 'slipr-input slipr-input-sm slipr-input-alt',
            placeholder: 'Alt text: what the image shows',
            'aria-label': `Card ${index + 1}: ${fieldLabel}: alt text`,
            value: image?.alt ?? '',
            disabled: image?.src ? undefined : true,
            oninput: (/** @type {Event} */ e) => {
              const currentImage = read()[index]?.[field.name];
              if (!currentImage?.src) return;
              setField(imageValue(currentImage, { alt: /** @type {HTMLInputElement} */ (e.target).value }));
            },
          }),
          field.help ? h('span', { class: 'slipr-help' }, [field.help]) : null,
        ]);
      }

      const multiline = field.type === 'richtext' || field.type === 'list';
      const text = multiline ? textareaText(value) : typeof value === 'string' ? value : '';
      const count = counter(text, field.maxLength);
      const onInput = (/** @type {Event} */ e) => {
        const typed = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.target).value;
        updateCounter(count, typed, field.maxLength);
        setField(field.type === 'list' ? listValue(read()[index]?.[field.name], typed) : typed);
      };
      const input = multiline
        ? h('textarea', { class: 'slipr-textarea slipr-textarea-sm', id, oninput: onInput }, [text])
        : h('input', { type: 'text', class: 'slipr-input slipr-input-sm', id, value: text, oninput: onInput });
      return h('div', { class: 'slipr-form-group slipr-card-field' }, [
        h('div', { class: 'slipr-card-field-head' }, [labelEl, count]),
        input,
        field.help ? h('span', { class: 'slipr-help' }, [field.help]) : null,
      ]);
    });

    return h('fieldset', { class: 'slipr-card-editor' }, [
      h('div', { class: 'slipr-card-head' }, [legend, tools]),
      ...fieldEls,
    ]);
  });

  const full = Boolean(maxItems && cards.length >= maxItems);
  return [
    ...cardEls,
    h('div', { class: 'slipr-cards-footer' }, [
      h('button', {
        type: 'button',
        class: 'slipr-btn slipr-btn-sm',
        disabled: full ? true : undefined,
        onclick: () => {
          write(addCard(read(), maxItems));
          // Focus the first field of the new card.
          queueMicrotask(() => {
            const el = document.getElementById(`card-${slideId}-${slotName}-${cards.length}-${fields.find((/** @type {any} */ f) => f.type !== 'image')?.name}`);
            el?.focus();
          });
        },
      }, ['+ Add card']),
      h('span', { class: 'slipr-help' }, [
        maxItems ? `${cards.length} of ${maxItems} ${label.toLowerCase()}${full ? ': the layout has no room for more' : ''}` : `${cards.length} cards`,
      ]),
    ]),
  ];
}
