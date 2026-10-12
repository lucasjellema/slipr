// @ts-check
/**
 * Fields for a PDF document (I-072), shared by the `pdf` slot editor (Slide
 * tab) and the PDF block editor (Reader tab): the file (choose one to copy it
 * into the show's docs/ folder, or type a path or https address), the title,
 * which pages, click-to-load for a PDF on another server, and the fallback
 * image. Value shapes come from block-values.js.
 */
import { h } from '../dom.js';
import { embedUrlProblem, pdfPagesPatch } from '../block-values.js';
import { runImage } from './image-field.js';
import { fallbackImageField } from './web-fields.js';

/**
 * @typedef {object} PdfFieldsOptions
 * @property {string} label  Accessible name prefix, e.g. "PDF document".
 * @property {'slot' | 'block'} kind
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(patch: Record<string, any>, field: string) => void} write  Patch the value; undefined removes a field.
 * @property {(file: File) => Promise<void>} addPdf  Copy a PDF into the show and make it the value's file.
 * @property {(file: File) => Promise<void>} addFallback  Copy an image into the show and make it the fallback.
 * @property {(src: string) => string} [resolveAsset]
 */

/**
 * @param {PdfFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function pdfFields(options) {
  const { label, kind, read, write } = options;
  const value = read() ?? {};
  const remote = /^\s*https?:/i.test(String(value.pdf ?? ''));

  const fileInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'file',
    accept: 'application/pdf,.pdf',
    hidden: true,
    onchange: () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) runImage(() => options.addPdf(file));
    },
  }));
  const problem = value.pdf ? embedUrlProblem(value.pdf) : null;
  const hint = h('span', { class: `slipr-help ${problem ? `is-${problem.level}` : ''}`, 'aria-live': 'polite' }, [
    problem?.message ?? (remote
      ? 'A PDF on another site works only if that site allows it (CORS). Files in the show folder always work, also offline.'
      : 'Choose a PDF to copy it into the show folder (docs/), or type its path.'),
  ]);

  /** @param {string} which @param {any} current */
  const pageInput = (which, current) => h('input', {
    type: 'number',
    min: '1',
    class: 'slipr-input slipr-input-sm',
    placeholder: which === 'first' ? '1' : 'end',
    value: current ?? '',
    'aria-label': `${label}: ${which} page`,
    onchange: () => write(pdfPagesPatch(firstEl.value, lastEl.value), 'pages'),
  });
  const [first, last] = Array.isArray(value.pages) ? value.pages : [value.page, value.page];
  const firstEl = /** @type {HTMLInputElement} */ (pageInput('first', first));
  const lastEl = /** @type {HTMLInputElement} */ (pageInput('last', Array.isArray(value.pages) ? last : undefined));

  /** @type {HTMLElement[]} */
  const fields = [
    h('div', { class: 'slipr-pdf-file' }, [
      h('input', {
        type: 'text',
        class: 'slipr-input slipr-input-sm',
        placeholder: 'docs/report.pdf or https://…',
        'aria-label': `${label}: file`,
        value: value.pdf ?? '',
        oninput: (/** @type {Event} */ e) => write({ pdf: /** @type {HTMLInputElement} */ (e.target).value }, 'pdf'),
      }),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click() }, ['Choose PDF…']),
      fileInput,
    ]),
    hint,
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Title (for screen readers and the card)',
      'aria-label': `${label}: title`,
      value: value.title ?? '',
      oninput: (/** @type {Event} */ e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        input.setAttribute('aria-invalid', input.value.trim() === '' ? 'true' : 'false');
        if (input.value.trim()) write({ title: input.value }, 'title');
      },
    }),
    h('div', { class: 'slipr-embed-height' }, [
      h('label', {}, ['Pages ', firstEl]),
      h('label', {}, [' to ', lastEl]),
    ]),
    h('span', { class: 'slipr-help' }, [
      kind === 'slot'
        ? 'Empty: page 1. One page: that page. A range: while presenting, each click shows the next page; readers can page through the range.'
        : 'Empty: the whole document. One page, or a range: readers can page through just those pages.',
    ]),
  ];

  if (remote) {
    fields.push(h('div', { class: 'slipr-form-checkbox' }, [
      h('label', {}, [
        h('input', {
          type: 'checkbox',
          checked: value.load === 'auto',
          onchange: (/** @type {Event} */ e) => write({ load: /** @type {HTMLInputElement} */ (e.target).checked ? 'auto' : undefined }, 'load'),
        }),
        ' In reader mode, load straight away without asking',
      ]),
    ]));
  }

  fields.push(fallbackImageField(options, 'Optional: a picture of the page, shown in print, in thumbnails and when the PDF cannot be shown.'));
  return fields;
}
