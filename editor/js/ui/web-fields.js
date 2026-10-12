// @ts-check
/**
 * Fields for an embedded web page (I-070, I-071), shared by the `web` slot
 * editor (Slide tab) and the Embedded Page block editor (Reader tab):
 * address and title, how it loads (live or screenshot while presenting;
 * click-to-load in reader mode), extra sandbox permissions, and the fallback
 * image. The caller says how to read and write the value; the value shapes
 * come from block-values.js.
 */
import { h } from '../dom.js';
import { embedUrlProblem, toggleAllow, WEB_ALLOW_OPTIONS } from '../block-values.js';
import { imageValue } from '../slot-values.js';
import { imageField, runImage } from './image-field.js';

/** Labels and help for the `allow` permissions. */
const ALLOW_TEXT = /** @type {Record<string, [string, string]>} */ ({
  'same-origin': ['Same origin', 'The page can use its own cookies, logins and storage. Only for pages on other sites; ignored for files in the show folder.'],
  fullscreen: ['Full screen', 'The page may go full screen (e.g. a video player).'],
  modals: ['Dialogs', 'The page may show alert and confirm dialogs.'],
  downloads: ['Downloads', 'The page may start downloads.'],
  presentation: ['Presentation', 'The page may start a presentation on another screen.'],
});

/**
 * @typedef {object} WebFieldsOptions
 * @property {string} label  Accessible name prefix, e.g. "Embedded page".
 * @property {'slot' | 'block'} kind
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(patch: Record<string, any>, field: string) => void} write  Patch the value; undefined removes a field.
 * @property {(file: File) => Promise<void>} addFallback  Copy an image into the show and make it the fallback.
 * @property {(src: string) => string} [resolveAsset]
 */

/**
 * Address and title inputs, with a hint when the address will not work.
 * @param {WebFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function webAddressFields({ label, read, write }) {
  const value = read() ?? {};
  const problem = embedUrlProblem(value.url ?? '');
  const hint = h('span', { class: `slipr-help ${problem ? `is-${problem.level}` : ''}`, 'aria-live': 'polite' }, [
    problem?.message ?? 'Many sites refuse to be shown inside another page; the frame then stays empty. Check it in the preview.',
  ]);
  return [
    h('input', {
      type: 'url',
      class: 'slipr-input slipr-input-sm',
      placeholder: 'https://… or a file in the show folder',
      'aria-label': `${label}: address`,
      value: value.url ?? '',
      oninput: (/** @type {Event} */ e) => {
        const url = /** @type {HTMLInputElement} */ (e.target).value;
        const p = embedUrlProblem(url);
        hint.textContent = p?.message ?? '';
        hint.className = `slipr-help ${p ? `is-${p.level}` : ''}`;
        write({ url }, 'url');
      },
    }),
    hint,
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Title (for screen readers and the frame)',
      'aria-label': `${label}: title`,
      value: value.title ?? '',
      oninput: (/** @type {Event} */ e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        const empty = input.value.trim() === '';
        input.setAttribute('aria-invalid', empty ? 'true' : 'false');
        if (!empty) write({ title: input.value }, 'title');
      },
    }),
  ];
}

/**
 * How the page loads, its permissions and its fallback image.
 * @param {WebFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function webOptionFields(options) {
  const { label, kind, read, write } = options;
  const value = read() ?? {};
  /** @type {HTMLElement[]} */
  const fields = [];

  if (kind === 'slot') {
    // Audience mode (I-071): live page or screenshot, the author's choice.
    fields.push(h('label', { class: 'slipr-embed-height' }, [
      'While presenting ',
      h('select', {
        class: 'slipr-select slipr-select-sm',
        'aria-label': `${label}: while presenting`,
        onchange: (/** @type {Event} */ e) => write({ present: /** @type {HTMLSelectElement} */ (e.target).value === 'static' ? 'static' : undefined }, 'present'),
      }, [
        h('option', { value: 'live', selected: value.present === 'static' ? undefined : true }, ['show the live page']),
        h('option', { value: 'static', selected: value.present === 'static' ? true : undefined }, ['show the fallback image']),
      ]),
    ]));
    if (value.present === 'static' && !value.fallback?.src) {
      fields.push(h('span', { class: 'slipr-help is-warning' }, ['Add a fallback image below; without one the slide shows a link card.']));
    }
  }

  // Click-to-load (I-070, D-011).
  fields.push(
    h('div', { class: 'slipr-form-checkbox' }, [
      h('label', {}, [
        h('input', {
          type: 'checkbox',
          checked: value.load === 'auto',
          onchange: (/** @type {Event} */ e) => write({ load: /** @type {HTMLInputElement} */ (e.target).checked ? 'auto' : undefined }, 'load'),
        }),
        kind === 'slot' ? ' In reader mode, load straight away without asking' : ' Load straight away, without asking the reader',
      ]),
    ]),
    h('span', { class: 'slipr-help' }, [
      'Off (the default): a page from another site shows a Load button, so nothing is sent to that site until the reader agrees. Files in the show folder always load directly.',
    ]),
  );

  // Extra sandbox permissions (I-071).
  fields.push(h('fieldset', { class: 'slipr-web-allow' }, [
    h('legend', {}, ['Allow the page to…']),
    ...WEB_ALLOW_OPTIONS.map((option) => h('label', { title: ALLOW_TEXT[option][1] }, [
      h('input', {
        type: 'checkbox',
        checked: Array.isArray(value.allow) && value.allow.includes(option),
        onchange: (/** @type {Event} */ e) => write({ allow: toggleAllow(read()?.allow, option, /** @type {HTMLInputElement} */ (e.target).checked) }, 'allow'),
      }),
      ` ${ALLOW_TEXT[option][0]}`,
    ])),
    Array.isArray(value.allow) && value.allow.includes('same-origin')
      ? h('span', { class: 'slipr-help is-warning' }, [ALLOW_TEXT['same-origin'][1]])
      : null,
  ]));

  // Fallback image (I-070): print, thumbnails, offline presenting, failures.
  fields.push(fallbackImageField(options, 'Optional: a screenshot of the page, shown in print, in thumbnails, before it loads and (if you choose) while presenting.'));

  return fields;
}

/**
 * The fallback image of an embed (I-070): picture, alt text, Remove.
 * @param {Pick<WebFieldsOptions, 'label' | 'read' | 'write' | 'addFallback' | 'resolveAsset'>} options
 * @param {string} help  Shown while there is no fallback image.
 * @returns {HTMLElement}
 */
export function fallbackImageField({ label, read, write, addFallback, resolveAsset }, help) {
  const fallback = read()?.fallback;
  return h('div', { class: 'slipr-embed-fallback-editor' }, [
    imageField({
      label: `${label}: fallback image`,
      image: fallback,
      resolveAsset,
      onFile: (file) => runImage(() => addFallback(file)),
    }),
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Alt text: what the fallback image shows',
      'aria-label': `${label}: fallback image alt text`,
      value: fallback?.alt ?? '',
      disabled: fallback?.src ? undefined : true,
      oninput: (/** @type {Event} */ e) => {
        const current = read()?.fallback;
        if (current?.src) write({ fallback: imageValue(current, { alt: /** @type {HTMLInputElement} */ (e.target).value }) }, 'fallback-alt');
      },
    }),
    fallback?.src
      ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => write({ fallback: undefined }, 'fallback') }, ['Remove fallback image'])
      : h('span', { class: 'slipr-help' }, [help]),
  ]);
}
