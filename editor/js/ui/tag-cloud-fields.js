// @ts-check
/**
 * The tag cloud editor (I-105), shared by the `tag-cloud` slot (slide form) and
 * the Tag cloud reader block: the terms (typed in, pasted as a list, or a CSV
 * file copied into data/), the options (order, how many terms, what a weight
 * counts, caption) and, for slots, the steps while presenting. Every change
 * writes the whole value through `write`, built by the pure helpers in
 * ../tag-cloud-values.js; typing coalesces into one undo step. Laid out with
 * the table editor's classes (I-104).
 */
import { h } from '../dom.js';
import { detectDelimiter, parseCsv } from '../../../shared/csv.js';
import { TAG_CLOUD_ORDERS, tagCloudModel, tagKey } from '../../../shared/embeds/tag-cloud.js';
import { glossaryPhrases } from '../../../shared/glossary.js';
import {
  addStep, addTerm, highlightFromText, highlightText, inlineFromFile, moveStep, moveTerm, newTagCloud,
  removeStep, removeTerm, setStep, setTerm, tagCloudFromPaste, tagCloudValue, useDataFile, weightFromText,
} from '../tag-cloud-values.js';
import { runImage } from './image-field.js';

/**
 * @typedef {object} TagCloudFieldsOptions
 * @property {string} key  Identifies this editor across re-renders (slot or block).
 * @property {string} label  Accessible name prefix.
 * @property {'slot' | 'block'} kind  Slots also get the steps while presenting.
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(value: any, typing?: boolean) => void} write  Store a new value; `typing` coalesces into one undo step.
 * @property {(path: string) => Promise<Blob | null>} readFile  Read a show file (the CSV file).
 * @property {(file: File, write: (path: string, title: string) => void) => Promise<void>} addDataFile
 * @property {Record<string, any>} [glossary]  The show's glossary (term links).
 */

/** A CSV file, once read: its rows (header first). @type {Map<string, { path: string, rows: string[][] | null, decimalComma: boolean, error?: string }>} */
const files = new Map();

const ORDER_NAMES = /** @type {Record<string, string>} */ ({
  cloud: 'Heaviest in the middle', weight: 'Heaviest first', alphabetical: 'Alphabetical', none: 'As written',
});

/**
 * @param {TagCloudFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function tagCloudFields(options) {
  const root = h('div', { class: 'slipr-table-editor slipr-tag-cloud-editor' });
  render(root, options);
  return [root];
}

/** @param {HTMLElement} root @param {TagCloudFieldsOptions} options */
function render(root, options) {
  const { read, write, kind } = options;
  const value = read() ?? {};
  /** @param {(v: any) => any} fn @param {boolean} [typing] */
  const change = (fn, typing = false) => write(fn(read() ?? {}), typing);
  const file = readDataFile(root, options, value);
  root.replaceChildren(...[
    dataSection(options, value, change, file),
    optionsSection(options, value, change),
    kind === 'slot' ? stepsSection(options, value, change, file) : null,
  ].filter(/** @returns {x is HTMLElement} */ (x) => Boolean(x)));
}

/**
 * Read (and cache) the value's CSV file; re-render once it is read.
 * @param {HTMLElement} root @param {TagCloudFieldsOptions} options @param {any} value
 */
function readDataFile(root, options, value) {
  const path = typeof value.data === 'string' ? value.data : null;
  if (!path) {
    files.delete(options.key);
    return null;
  }
  const known = files.get(options.key);
  if (known?.path === path) return known;
  const entry = { path, rows: /** @type {string[][] | null} */ (null), decimalComma: false, error: /** @type {string | undefined} */ (undefined) };
  files.set(options.key, entry);
  options.readFile(path).then(async (blob) => {
    if (!blob) throw new Error('not found');
    const text = await blob.text();
    entry.rows = parseCsv(text);
    entry.decimalComma = detectDelimiter(text) === ';';
  }).catch((err) => {
    entry.error = err instanceof Error ? err.message : String(err);
  }).finally(() => {
    if (root.isConnected && files.get(options.key) === entry) render(root, options);
  });
  return entry;
}

// ---------------------------------------------------------------------------
// Terms: typed in, or the CSV file

/**
 * @param {TagCloudFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {{ path: string, rows: string[][] | null, decimalComma: boolean, error?: string } | null} file
 */
function dataSection(options, value, change, file) {
  const { label } = options;
  const fileInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'file', accept: '.csv,.tsv,.txt,text/csv', hidden: true,
    onchange: () => {
      const picked = fileInput.files?.[0];
      fileInput.value = '';
      if (picked) runImage(() => options.addDataFile(picked, (path) => change((v) => useDataFile(v, path))));
    },
  }));
  const chooseButton = (/** @type {string} */ text) => h('button', {
    type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click(),
    title: 'Copy a CSV file into the show’s data/ folder: a column of terms and, optionally, a column of weights. Without weights each row counts 1, so repeated answers add up.',
  }, [text]);

  if (typeof value.data === 'string') {
    const rows = file?.rows;
    const header = rows?.[0] ?? [];
    const status = !rows ? (file?.error ? `The file could not be read (${file.error}).` : 'Reading the file…')
      : `${Math.max(0, rows.length - 1)} rows, ${header.length} column${header.length === 1 ? '' : 's'}${file?.decimalComma ? ' (semicolons, decimal commas)' : ''}.`;
    const columnSelect = (/** @type {string} */ name, /** @type {'termColumn' | 'weightColumn'} */ field, /** @type {string} */ automatic) => h('label', { class: 'slipr-label' }, [name,
      h('select', {
        class: 'slipr-select slipr-select-sm', 'aria-label': `${label}: ${name.toLowerCase()}`,
        onchange: (/** @type {Event} */ e) => change((v) => tagCloudValue(v, { [field]: /** @type {HTMLSelectElement} */ (e.target).value || undefined })),
      }, [h('option', { value: '' }, [automatic]), ...header.map((c) => h('option', { value: c, selected: value[field] === c ? true : undefined }, [c]))]),
    ]);
    return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-data' }, [
      h('legend', {}, ['Terms']),
      h('p', { class: 'slipr-help' }, [h('code', {}, [value.data]), ` ${status}`]),
      rows ? h('div', { class: 'slipr-table-editor-row' }, [
        columnSelect('Term column', 'termColumn', 'The first column'),
        columnSelect('Weight column', 'weightColumn', 'Automatic (numbers in the 2nd column, else count rows)'),
      ]) : null,
      rows ? filePreview(value, rows, file?.decimalComma ?? false, options.glossary) : null,
      h('div', { class: 'slipr-table-editor-actions' }, [
        chooseButton('Choose another CSV…'),
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: rows ? undefined : true,
          title: 'Copy the file’s terms and weights into the slide, to edit them here (the file stays in data/).',
          onclick: () => rows && change((v) => inlineFromFile(v, rows, { decimalComma: file?.decimalComma })),
        }, ['Move into the slide']),
        fileInput,
      ]),
    ]);
  }

  const terms = Array.isArray(value.terms) ? value.terms : [];
  const pasteArea = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'slipr-textarea slipr-table-editor-paste', rows: '5',
    'aria-label': `${label}: terms to paste`,
    placeholder: 'One term per line, optionally with a weight:\nOnboarding, 12\nTraining⇥8\nConference talks',
  }));
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-data' }, [
    h('legend', {}, [`Terms${terms.length ? ` (${terms.length})` : ''}`]),
    terms.length
      ? h('div', { class: 'slipr-table-editor-grid-wrap' }, [termGrid(options, terms, change)])
      : h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => tagCloudValue(v, newTagCloud())) }, ['Start a tag cloud']),
    h('div', { class: 'slipr-table-editor-actions' }, [
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => addTerm(v)) }, ['+ Term']),
      chooseButton('Use a CSV file…'),
      fileInput,
    ]),
    h('details', { class: 'slipr-table-editor-paste-box' }, [
      h('summary', {}, ['Paste a list']),
      pasteArea,
      h('div', { class: 'slipr-table-editor-actions' }, [
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Replace the terms with the pasted ones',
          onclick: () => {
            if (!pasteArea.value.trim()) return;
            change((v) => tagCloudFromPaste(v, pasteArea.value));
          },
        }, ['Replace the terms']),
      ]),
      h('p', { class: 'slipr-help' }, ['Tip: a column copied from a spreadsheet works too; repeated terms add up.']),
    ]),
  ]);
}

/**
 * The typed-in terms: text, weight, glossary term, ▲ ▼ 🗑. Typing coalesces.
 * @param {TagCloudFieldsOptions} options @param {any[]} terms
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 */
function termGrid(options, terms, change) {
  const { label } = options;
  const glossary = options.glossary ?? {};
  const ids = Object.keys(glossary);
  const byName = new Map(glossaryPhrases(glossary).map((p) => [p.phrase, p.id]));
  const head = h('tr', {}, [
    h('th', { scope: 'col' }, ['Term']),
    h('th', { scope: 'col', title: 'Size by weight or count; empty counts 1' }, ['Weight']),
    ids.length ? h('th', { scope: 'col', title: 'The glossary term this term opens in reader mode' }, ['Glossary']) : null,
    h('th', { class: 'slipr-table-editor-tools', 'aria-label': 'Term tools' }),
  ]);
  const body = terms.map((term, r) => {
    const name = term?.text || `term ${r + 1}`;
    const found = byName.get(tagKey(term?.text ?? ''));
    return h('tr', {}, [
      h('td', {}, [h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm slipr-tag-cloud-editor-term', value: term?.text ?? '',
        'aria-label': `${label}: term ${r + 1}`,
        oninput: (/** @type {Event} */ e) => change((v) => setTerm(v, r, { text: /** @type {HTMLInputElement} */ (e.target).value }), true),
      })]),
      h('td', {}, [h('input', {
        type: 'number', class: 'slipr-input slipr-input-sm slipr-tag-cloud-editor-weight', min: '0', step: 'any',
        value: typeof term?.weight === 'number' ? String(term.weight) : '', placeholder: '1',
        'aria-label': `${label}: weight of ${name}`,
        oninput: (/** @type {Event} */ e) => change((v) => setTerm(v, r, { weight: weightFromText(/** @type {HTMLInputElement} */ (e.target).value) }), true),
      })]),
      ids.length ? h('td', {}, [h('select', {
        class: 'slipr-select slipr-select-sm', 'aria-label': `${label}: glossary term of ${name}`,
        onchange: (/** @type {Event} */ e) => change((v) => setTerm(v, r, { glossary: /** @type {HTMLSelectElement} */ (e.target).value || undefined })),
      }, [
        h('option', { value: '' }, [found ? `Automatic: ${glossary[found]?.term ?? found}` : 'Automatic: none']),
        ...ids.map((id) => h('option', { value: id, selected: term?.glossary === id ? true : undefined }, [glossary[id]?.term ?? id])),
      ])]) : null,
      h('td', { class: 'slipr-table-editor-tools' }, [
        h('button', { type: 'button', class: 'slipr-item-btn', title: 'Move up', 'aria-label': `Move ${name} up`, disabled: r === 0 ? true : undefined, onclick: () => change((v) => moveTerm(v, r, r - 1)) }, ['▲']),
        h('button', { type: 'button', class: 'slipr-item-btn', title: 'Move down', 'aria-label': `Move ${name} down`, disabled: r === terms.length - 1 ? true : undefined, onclick: () => change((v) => moveTerm(v, r, r + 1)) }, ['▼']),
        h('button', { type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove this term', 'aria-label': `Remove ${name}`, onclick: () => change((v) => removeTerm(v, r)) }, ['🗑']),
      ]),
    ]);
  });
  return h('table', { class: 'slipr-table-editor-grid' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
}

/**
 * The heaviest terms in a CSV file, as the cloud reads them, read-only.
 * @param {any} value @param {string[][]} rows @param {boolean} decimalComma @param {Record<string, any> | undefined} glossary
 */
function filePreview(value, rows, decimalComma, glossary) {
  const { tags } = tagCloudModel({ ...value, order: 'weight' }, rows, { decimalComma, glossary });
  const shown = tags.slice(0, 8);
  return h('div', { class: 'slipr-table-editor-grid-wrap' }, [
    h('table', { class: 'slipr-table-editor-grid is-preview' }, [
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col' }, ['Term']), h('th', { scope: 'col' }, ['Weight']), h('th', { scope: 'col' }, ['Glossary'])])]),
      h('tbody', {}, shown.map((t) => h('tr', {}, [h('td', {}, [t.text]), h('td', {}, [String(t.weight)]), h('td', {}, [t.glossary ? glossary?.[t.glossary]?.term ?? t.glossary : ''])]))),
    ]),
    tags.length > shown.length ? h('p', { class: 'slipr-help' }, [`… and ${tags.length - shown.length} more terms.`]) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Options

/**
 * @param {TagCloudFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 */
function optionsSection(options, value, change) {
  const { label } = options;
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-options' }, [
    h('legend', {}, ['Options']),
    h('div', { class: 'slipr-table-editor-row' }, [
      h('label', { class: 'slipr-label' }, ['Order',
        h('select', {
          class: 'slipr-select slipr-select-sm', 'aria-label': `${label}: order`,
          onchange: (/** @type {Event} */ e) => {
            const order = /** @type {HTMLSelectElement} */ (e.target).value;
            change((v) => tagCloudValue(v, { order: order === 'cloud' ? undefined : order }));
          },
        }, TAG_CLOUD_ORDERS.map((o) => h('option', { value: o, selected: (value.order ?? 'cloud') === o ? true : undefined }, [ORDER_NAMES[o] ?? o]))),
      ]),
      h('label', { class: 'slipr-label' }, ['Show at most',
        h('input', {
          type: 'number', class: 'slipr-input slipr-input-sm', min: '1', step: '1', value: value.maxTerms ?? '', placeholder: 'all terms',
          'aria-label': `${label}: show at most this many terms`, title: 'Only the heaviest terms are shown',
          onchange: (/** @type {Event} */ e) => {
            const n = Math.round(Number(/** @type {HTMLInputElement} */ (e.target).value));
            change((v) => tagCloudValue(v, { maxTerms: n >= 1 ? n : undefined }));
          },
        }),
      ]),
      h('label', { class: 'slipr-label' }, ['A weight counts',
        h('input', {
          type: 'text', class: 'slipr-input slipr-input-sm', value: value.weightLabel ?? '', placeholder: 'e.g. mentions',
          'aria-label': `${label}: what a weight counts`, title: 'Readers see “12 mentions” when they click a term',
          oninput: (/** @type {Event} */ e) => change((v) => tagCloudValue(v, { weightLabel: /** @type {HTMLInputElement} */ (e.target).value.trim() || undefined }), true),
        }),
      ]),
    ]),
    h('label', { class: 'slipr-label' }, ['Caption',
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: value.caption ?? '', 'aria-label': `${label}: caption`,
        placeholder: 'Optional: a line below the cloud',
        oninput: (/** @type {Event} */ e) => change((v) => tagCloudValue(v, { caption: /** @type {HTMLInputElement} */ (e.target).value || undefined }), true),
      }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Steps while presenting (slots)

/**
 * @param {TagCloudFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {{ rows: string[][] | null, decimalComma: boolean } | null} file
 */
function stepsSection(options, value, change, file) {
  const steps = Array.isArray(value.steps) ? value.steps : [];
  const model = tagCloudModel({ ...value, order: 'weight' }, file?.rows ?? null, { decimalComma: file?.decimalComma });
  const count = model.tags.length;
  const rows = steps.map((/** @type {any} */ step, /** @type {number} */ i) => {
    const isTerms = step && step.terms !== undefined;
    const body = isTerms
      ? [
          h('span', {}, ['Show the heaviest']),
          h('input', {
            type: 'number', class: 'slipr-input slipr-input-sm slipr-table-editor-decimals', min: '0', step: '1',
            value: step.terms === 'all' ? '' : String(step.terms), placeholder: 'all', 'aria-label': `Step ${i + 1}: number of terms`,
            onchange: (/** @type {Event} */ e) => {
              const raw = /** @type {HTMLInputElement} */ (e.target).value;
              change((v) => setStep(v, i, { terms: raw === '' ? 'all' : Math.max(0, Math.round(Number(raw))) }));
            },
          }),
          h('span', {}, ['terms (empty: all)']),
        ]
      : step?.highlight === null || step?.highlight === undefined
        ? [h('span', {}, ['Clear the highlight'])]
        : [
            h('span', {}, ['Highlight']),
            h('input', {
              type: 'text', class: 'slipr-input slipr-input-sm slipr-tag-cloud-editor-highlight', value: highlightText(step.highlight),
              'aria-label': `Step ${i + 1}: terms to highlight`, title: 'One or more terms, separated by commas; the rest dims until the next step',
              onchange: (/** @type {Event} */ e) => change((v) => setStep(v, i, { highlight: highlightFromText(/** @type {HTMLInputElement} */ (e.target).value) })),
            }),
          ];
    return h('li', { class: 'slipr-table-editor-step' }, [
      h('span', { class: 'slipr-table-editor-step-number' }, [`${i + 1}.`]),
      ...body,
      h('span', { class: 'slipr-table-editor-step-tools' }, [
        h('button', { type: 'button', class: 'slipr-item-btn', title: 'Earlier', 'aria-label': `Move step ${i + 1} up`, disabled: i === 0 ? true : undefined, onclick: () => change((v) => moveStep(v, i, i - 1)) }, ['▲']),
        h('button', { type: 'button', class: 'slipr-item-btn', title: 'Later', 'aria-label': `Move step ${i + 1} down`, disabled: i === steps.length - 1 ? true : undefined, onclick: () => change((v) => moveStep(v, i, i + 1)) }, ['▼']),
        h('button', { type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove this step', 'aria-label': `Remove step ${i + 1}`, onclick: () => change((v) => removeStep(v, i)) }, ['🗑']),
      ]),
    ]);
  });
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-steps' }, [
    h('legend', {}, [`While presenting${steps.length ? ` (${steps.length} step${steps.length === 1 ? '' : 's'})` : ''}`]),
    h('p', { class: 'slipr-help' }, ['One step per click. With a “show terms” step the cloud starts empty and the heaviest terms appear first; a highlight dims the rest until the next step.']),
    steps.length ? h('ol', { class: 'slipr-table-editor-step-list' }, rows) : null,
    h('div', { class: 'slipr-table-editor-actions' }, [
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm',
        onclick: () => change((v) => {
          const last = [...(v.steps ?? [])].reverse().find((/** @type {any} */ s) => typeof s?.terms === 'number');
          return addStep(v, { terms: last ? Math.min(last.terms + 3, count || last.terms + 3) : Math.min(3, count || 3) });
        }),
      }, ['+ Show terms']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: count ? undefined : true, onclick: () => change((v) => addStep(v, { highlight: model.tags[0]?.text ?? null })) }, ['+ Highlight']),
      steps.some((/** @type {any} */ s) => typeof s?.highlight === 'string' || Array.isArray(s?.highlight))
        ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => addStep(v, { highlight: null })) }, ['+ Clear highlight'])
        : null,
    ]),
  ]);
}
