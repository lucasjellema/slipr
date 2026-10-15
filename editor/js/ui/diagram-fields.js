// @ts-check
/**
 * Fields for a Mermaid diagram (I-073, E-019), shared by the `diagram` slot
 * editor (Slide tab) and the Diagram block editor (Reader tab): the Mermaid
 * source, the caption and the fallback image (I-070). The previews draw the
 * diagram (and show a syntax error); value shapes come from block-values.js.
 */
import { h } from '../dom.js';
import { DIAGRAM_HELP } from '../help.js';
import { fallbackImageField } from './web-fields.js';

/** Diagram fields that are typed: they coalesce into one undo step. */
export const TYPED_DIAGRAM_FIELDS = new Set(['mermaid', 'caption', 'fallback-alt']);

/**
 * @typedef {object} DiagramFieldsOptions
 * @property {string} label  Accessible name prefix, e.g. "Diagram".
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(patch: Record<string, any>, field: string) => void} write  Patch the value; undefined removes a field.
 * @property {(file: File) => Promise<void>} addFallback  Copy an image into the show and make it the fallback.
 * @property {(src: string) => string} [resolveAsset]
 */

/**
 * @param {DiagramFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function diagramFields(options) {
  const { label, read, write } = options;
  const value = read() ?? {};
  const emptyText = 'The diagram is empty. Type Mermaid source, for example: flowchart LR, then A --> B on the next line.';
  const hint = h('span', { class: `slipr-help ${value.mermaid?.trim() ? '' : 'is-error'}`, 'aria-live': 'polite' }, [
    value.mermaid?.trim() ? '' : emptyText,
  ]);
  /** @param {string} text */
  const writeMermaid = (text) => {
    const empty = !text.trim();
    hint.textContent = empty ? emptyText : '';
    hint.className = `slipr-help ${empty ? 'is-error' : ''}`;
    write({ mermaid: text }, 'mermaid');
  };
  const area = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'slipr-textarea slipr-code-input',
    spellcheck: 'false',
    placeholder: 'flowchart LR\n  A[Start] --> B[Finish]',
    'aria-label': `${label}: Mermaid source`,
    oninput: () => writeMermaid(area.value),
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      // Tab indents (2 spaces); Esc then Tab leaves the field.
      if (e.key !== 'Tab' || e.shiftKey || area.dataset.tabOut === 'true') return;
      e.preventDefault();
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      writeMermaid(area.value);
    },
  }, [typeof value.mermaid === 'string' ? value.mermaid : '']));
  area.addEventListener('keyup', (e) => {
    area.dataset.tabOut = e.key === 'Escape' ? 'true' : 'false';
  });

  return [
    area,
    hint,
    h('span', { class: 'slipr-help' }, [
      'Tab indents; Esc, then Tab, leaves the field. The preview draws the diagram, or shows what is wrong. ',
      h('a', { href: DIAGRAM_HELP, target: 'slipr-help', rel: 'noopener' }, ['How diagrams work']),
    ]),
    h('input', {
      type: 'text',
      class: 'slipr-input slipr-input-sm slipr-input-alt',
      placeholder: 'Caption (optional)',
      'aria-label': `${label}: caption`,
      value: value.caption ?? '',
      oninput: (/** @type {Event} */ e) => write({ caption: /** @type {HTMLInputElement} */ (e.target).value }, 'caption'),
    }),
    fallbackImageField(options, 'Optional: a picture of the diagram, shown in print, in thumbnails and if the diagram cannot be drawn.'),
  ];
}
