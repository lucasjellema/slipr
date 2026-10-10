// @ts-check
/**
 * A small toolbar above a Markdown field (E-008): insert a glossary
 * reference, a popup or a link to another slide at the cursor (or around the
 * selection). The insert goes through the field's own `input` event, so it is
 * saved and undone like typing.
 */
import { h } from '../dom.js';
import { slideTitle } from '../../../shared/render.js';
import { insertGlossaryRef, insertPopup, insertSlideLink } from '../markdown-insert.js';

/**
 * @param {HTMLTextAreaElement} field
 * @param {{ show: any, slideId: string }} context  The show (glossary, slides) and the current slide.
 * @returns {HTMLElement}
 */
export function markdownToolbar(field, { show, slideId }) {
  /** @param {import('../markdown-insert.js').Edit} edit */
  const apply = (edit) => {
    field.focus();
    field.value = edit.text;
    field.setSelectionRange(edit.start, edit.end);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const glossary = show?.glossary && typeof show.glossary === 'object' ? Object.entries(show.glossary) : [];
  const slides = (Array.isArray(show?.slides) ? show.slides : []).filter((/** @type {any} */ s) => s.id !== slideId);

  const glossarySelect = /** @type {HTMLSelectElement} */ (h('select', {
    class: 'slipr-select slipr-select-sm slipr-md-tool',
    'aria-label': 'Insert a glossary term',
    title: glossary.length ? 'Insert a glossary reference: [[term]]' : 'The glossary is empty (Show Settings)',
    disabled: glossary.length ? undefined : true,
    onchange: () => {
      const id = glossarySelect.value;
      glossarySelect.value = '';
      if (id) apply(insertGlossaryRef(field.value, field.selectionStart, field.selectionEnd, id));
    },
  }, [
    h('option', { value: '' }, ['[[ ]] Term…']),
    ...glossary.map(([id, term]) => h('option', { value: id }, [/** @type {any} */ (term)?.term ?? id])),
  ]));

  const slideSelect = /** @type {HTMLSelectElement} */ (h('select', {
    class: 'slipr-select slipr-select-sm slipr-md-tool',
    'aria-label': 'Insert a link to a slide',
    title: 'Insert a link to another slide',
    onchange: () => {
      const id = slideSelect.value;
      slideSelect.value = '';
      const target = slides.find((/** @type {any} */ s) => s.id === id);
      if (target) apply(insertSlideLink(field.value, field.selectionStart, field.selectionEnd, id, slideTitle(target) || id));
    },
  }, [
    h('option', { value: '' }, ['→ Slide…']),
    ...slides.map((/** @type {any} */ s) => {
      const number = show.slides.indexOf(s) + 1;
      return h('option', { value: s.id }, [`${number}. ${slideTitle(s) || s.id}`]);
    }),
  ]));

  const popupButton = h('button', {
    type: 'button',
    class: 'slipr-btn slipr-btn-sm slipr-md-tool',
    title: 'Popup (footnote): ^[text]. Wraps the selection, or inserts an empty one',
    'aria-label': 'Insert a popup',
    // Keep the field's selection: don't take focus on mouse down.
    onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
    onclick: () => apply(insertPopup(field.value, field.selectionStart, field.selectionEnd)),
  }, ['^[ ] Popup']);

  return h('div', { class: 'slipr-md-toolbar', role: 'toolbar', 'aria-label': 'Insert Markdown' }, [
    glossarySelect,
    popupButton,
    slideSelect,
  ]);
}
