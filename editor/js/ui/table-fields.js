// @ts-check
/**
 * The table editor (I-104), shared by the `table` slot (slide form) and the
 * Table reader block: the data (a grid of typed-in rows, pasted from a
 * spreadsheet, or a CSV file copied into data/), the columns (header, format,
 * alignment, hidden, total, colours), the options (sorting, filter, rows before
 * scrolling, pinned first column, locale, caption) and, for slots, the steps
 * while presenting. Every change writes the whole value through `write`, built
 * by the pure helpers in ../table-values.js; typing coalesces into one undo step.
 */
import { h } from '../dom.js';
import { detectDelimiter, parseCsv } from '../../../shared/csv.js';
import { TABLE_ALIGNS, TABLE_FORMATS, TABLE_TOTALS, TABLE_VISUALS } from '../../../shared/embeds/table.js';
import {
  addColumn, addRow, addStep, cellText, inlineFromFile, moveColumn, moveRow, moveStep, newTable,
  pasteIntoGrid, removeColumn, removeRow, removeStep, setCell, setColumn, setColumnLabel, setStep,
  tableFromPaste, tableValue, withFileColumns,
} from '../table-values.js';
import { runImage } from './image-field.js';

/**
 * @typedef {object} TableFieldsOptions
 * @property {string} key  Identifies this editor across re-renders (slot or block).
 * @property {string} label  Accessible name prefix.
 * @property {'slot' | 'block'} kind  Slots also get the steps while presenting.
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(value: any, typing?: boolean) => void} write  Store a new value; `typing` coalesces into one undo step.
 * @property {(path: string) => Promise<Blob | null>} readFile  Read a show file (the CSV file).
 * @property {(file: File, write: (path: string, title: string) => void) => Promise<void>} addDataFile
 */

/** A CSV file, once read: its rows (header first). @type {Map<string, { path: string, rows: string[][] | null, decimalComma: boolean, error?: string }>} */
const files = new Map();

const FORMAT_NAMES = /** @type {Record<string, string>} */ ({
  '': 'Automatic', text: 'Text', number: 'Number', integer: 'Whole number', percent: 'Percent (0.12 → 12 %)',
  currency: 'Currency', date: 'Date (2026-10-14)', markdown: 'Markdown (links, terms)',
});
const TOTAL_NAMES = /** @type {Record<string, string>} */ ({ '': 'No total', sum: 'Sum', avg: 'Average', min: 'Lowest', max: 'Highest', count: 'Count' });
const VISUAL_NAMES = /** @type {Record<string, string>} */ ({ '': 'No colours', scale: 'Colour scale', bar: 'Data bar', sign: 'Red / green (sign)' });
const ALIGN_NAMES = /** @type {Record<string, string>} */ ({ '': 'Align: automatic', start: 'Align: left', center: 'Align: center', end: 'Align: right' });

/**
 * @param {TableFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function tableFields(options) {
  const root = h('div', { class: 'slipr-table-editor' });
  render(root, options);
  return [root];
}

/** @param {HTMLElement} root @param {TableFieldsOptions} options */
function render(root, options) {
  const { read, write, kind } = options;
  const value = read() ?? {};
  /** @param {(v: any) => any} fn @param {boolean} [typing] */
  const change = (fn, typing = false) => write(fn(read() ?? {}), typing);
  const file = readDataFile(root, options, value);
  const header = file?.rows?.[0] ?? null;
  root.replaceChildren(...[
    dataSection(options, value, change, file),
    columnsSection(options, value, change, header),
    optionsSection(options, value, change, header),
    kind === 'slot' ? stepsSection(options, value, change, header) : null,
  ].filter(/** @returns {x is HTMLElement} */ (x) => Boolean(x)));
}

/**
 * Read (and cache) the value's CSV file; re-render once it is read.
 * @param {HTMLElement} root @param {TableFieldsOptions} options @param {any} value
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
// Data: the grid, or the CSV file

/**
 * @param {TableFieldsOptions} options @param {any} value
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
      if (picked) {
        runImage(() => options.addDataFile(picked, (path) => change((v) => {
          const { rows, ...rest } = v;
          return tableValue(rest, { data: path, sort: undefined, steps: undefined });
        })));
      }
    },
  }));
  const chooseButton = (/** @type {string} */ text) => h('button', {
    type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click(),
    title: 'Copy a CSV file into the show’s data/ folder and show its rows. Comma, semicolon or tab separated; the first line holds the headers.',
  }, [text]);

  if (typeof value.data === 'string') {
    const rows = file?.rows;
    const status = !rows ? (file?.error ? `The file could not be read (${file.error}).` : 'Reading the file…')
      : `${Math.max(0, rows.length - 1)} rows, ${rows[0]?.length ?? 0} columns${file?.decimalComma ? ' (semicolons, decimal commas)' : ''}.`;
    return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-data' }, [
      h('legend', {}, ['Data']),
      h('p', { class: 'slipr-help' }, [h('code', {}, [value.data]), ` ${status}`]),
      rows ? previewTable(rows) : null,
      h('div', { class: 'slipr-table-editor-actions' }, [
        chooseButton('Choose another CSV…'),
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: rows ? undefined : true,
          title: 'Copy the file’s rows into the slide, to edit them here (the file stays in data/).',
          onclick: () => rows && change((v) => inlineFromFile(v, rows, { decimalComma: file?.decimalComma })),
        }, ['Move into the slide']),
        fileInput,
      ]),
    ]);
  }

  const columns = Array.isArray(value.columns) ? value.columns : [];
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const pasteArea = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'slipr-textarea slipr-table-editor-paste', rows: '4',
    'aria-label': `${label}: rows to paste`,
    placeholder: 'Copy cells in Excel or Google Sheets (headers in the first row) and paste them here.',
  }));
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-data' }, [
    h('legend', {}, ['Data']),
    columns.length
      ? h('div', { class: 'slipr-table-editor-grid-wrap' }, [grid(options, columns, rows, change)])
      : h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => tableValue(v, newTable())) }, ['Start a table (2 × 2)']),
    h('div', { class: 'slipr-table-editor-actions' }, [
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => addRow(v)) }, ['+ Row']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => addColumn(v)) }, ['+ Column']),
      chooseButton('Use a CSV file…'),
      fileInput,
    ]),
    h('details', { class: 'slipr-table-editor-paste-box' }, [
      h('summary', {}, ['Paste from a spreadsheet']),
      pasteArea,
      h('div', { class: 'slipr-table-editor-actions' }, [
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm',
          title: 'Replace the rows and columns with the pasted ones (columns with the same header keep their settings).',
          onclick: () => {
            if (!pasteArea.value.trim()) return;
            change((v) => tableFromPaste(v, pasteArea.value));
          },
        }, ['Replace the table']),
      ]),
      h('p', { class: 'slipr-help' }, ['Tip: pasting several cells into a cell of the grid fills them from there, as in a spreadsheet.']),
    ]),
  ]);
}

/**
 * The typed-in rows as a grid of inputs: headers, then one row per data row
 * with ▲ ▼ 🗑. Typing coalesces; a paste of several cells fills from that cell.
 * @param {TableFieldsOptions} options @param {any[]} columns @param {any[][]} rows
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 */
function grid(options, columns, rows, change) {
  const { label } = options;
  /** @param {ClipboardEvent} e @param {number} r @param {number} c */
  const onPaste = (e, r, c) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // one value: an ordinary paste
    e.preventDefault();
    change((v) => pasteIntoGrid(v, r, c, text));
  };
  const head = h('tr', {}, [
    ...columns.map((col, c) => h('th', { scope: 'col' }, [h('input', {
      type: 'text', class: 'slipr-input slipr-input-sm slipr-table-editor-head', value: col.label ?? col.key,
      'aria-label': `${label}: header of column ${c + 1}`,
      oninput: (/** @type {Event} */ e) => change((v) => setColumnLabel(v, c, /** @type {HTMLInputElement} */ (e.target).value), true),
    })])),
    h('th', { class: 'slipr-table-editor-tools', 'aria-label': 'Row tools' }),
  ]);
  const body = rows.map((row, r) => h('tr', {}, [
    ...columns.map((_, c) => h('td', {}, [h('input', {
      type: 'text', class: 'slipr-input slipr-input-sm', value: cellText(row[c]),
      'aria-label': `${label}: row ${r + 1}, ${columns[c].label ?? columns[c].key}`,
      oninput: (/** @type {Event} */ e) => change((v) => setCell(v, r, c, /** @type {HTMLInputElement} */ (e.target).value), true),
      onpaste: (/** @type {ClipboardEvent} */ e) => onPaste(e, r, c),
    })])),
    h('td', { class: 'slipr-table-editor-tools' }, [
      h('button', { type: 'button', class: 'slipr-item-btn', title: 'Move up', 'aria-label': `Move row ${r + 1} up`, disabled: r === 0 ? true : undefined, onclick: () => change((v) => moveRow(v, r, r - 1)) }, ['▲']),
      h('button', { type: 'button', class: 'slipr-item-btn', title: 'Move down', 'aria-label': `Move row ${r + 1} down`, disabled: r === rows.length - 1 ? true : undefined, onclick: () => change((v) => moveRow(v, r, r + 1)) }, ['▼']),
      h('button', { type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove this row', 'aria-label': `Remove row ${r + 1}`, onclick: () => change((v) => removeRow(v, r)) }, ['🗑']),
    ]),
  ]));
  return h('table', { class: 'slipr-table-editor-grid' }, [h('thead', {}, [head]), h('tbody', {}, body)]);
}

/** The first rows of a CSV file, read-only. @param {string[][]} rows */
function previewTable(rows) {
  const [head = [], ...body] = rows;
  const shown = body.slice(0, 5);
  return h('div', { class: 'slipr-table-editor-grid-wrap' }, [
    h('table', { class: 'slipr-table-editor-grid is-preview' }, [
      h('thead', {}, [h('tr', {}, head.map((c) => h('th', { scope: 'col' }, [c])))]),
      h('tbody', {}, shown.map((r) => h('tr', {}, head.map((_, i) => h('td', {}, [r[i] ?? '']))))),
    ]),
    body.length > shown.length ? h('p', { class: 'slipr-help' }, [`… and ${body.length - shown.length} more rows.`]) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Columns

/**
 * @param {TableFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {string[] | null} header  A CSV file's header, once read.
 */
function columnsSection(options, value, change, header) {
  const fromFile = typeof value.data === 'string';
  // A file's columns: the configured ones and the file's others (configured on first change).
  const listed = fromFile && header ? withFileColumns(value, header).columns : (Array.isArray(value.columns) ? value.columns : []);
  /** Change a column, giving every file column an entry first. @param {(v: any) => any} fn @param {boolean} [typing] */
  const changeCol = (fn, typing = false) => change((v) => fn(fromFile && header ? withFileColumns(v, header) : v), typing);
  const rows = listed.map((/** @type {any} */ col, /** @type {number} */ i) => {
    const what = col.label ?? col.key;
    const format = col.format ?? '';
    const select = (/** @type {string} */ name, /** @type {Record<string, string>} */ names, /** @type {string[]} */ values, /** @type {string} */ current, /** @type {(v: string) => any} */ patch) => h('select', {
      class: 'slipr-select slipr-select-sm', 'aria-label': `${options.label}: ${what}: ${name}`,
      onchange: (/** @type {Event} */ e) => changeCol((v) => setColumn(v, i, patch(/** @type {HTMLSelectElement} */ (e.target).value || ''))),
    }, ['', ...values].map((x) => h('option', { value: x, selected: x === current ? true : undefined }, [names[x] ?? x])));
    return h('li', { class: 'slipr-table-editor-column' }, [
      h('div', { class: 'slipr-table-editor-column-head' }, [
        fromFile
          ? h('input', {
              type: 'text', class: 'slipr-input slipr-input-sm', value: col.label ?? '', placeholder: col.key,
              'aria-label': `${options.label}: header of ${col.key}`, title: `Header shown for the file's column “${col.key}”`,
              oninput: (/** @type {Event} */ e) => changeCol((v) => setColumnLabel(v, i, /** @type {HTMLInputElement} */ (e.target).value), true),
            })
          : h('strong', { class: 'slipr-table-editor-column-name' }, [what]),
        h('label', { class: 'slipr-checkbox-label' }, [
          h('input', {
            type: 'checkbox', checked: col.hidden ? true : undefined,
            onchange: (/** @type {Event} */ e) => changeCol((v) => setColumn(v, i, { hidden: /** @type {HTMLInputElement} */ (e.target).checked })),
          }), ' Hidden',
        ]),
        h('button', { type: 'button', class: 'slipr-item-btn', title: 'Move left', 'aria-label': `Move ${what} left`, disabled: i === 0 ? true : undefined, onclick: () => changeCol((v) => moveColumn(v, i, i - 1)) }, ['◀']),
        h('button', { type: 'button', class: 'slipr-item-btn', title: 'Move right', 'aria-label': `Move ${what} right`, disabled: i === listed.length - 1 ? true : undefined, onclick: () => changeCol((v) => moveColumn(v, i, i + 1)) }, ['▶']),
        fromFile ? null : h('button', {
          type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Remove this column and its cells', 'aria-label': `Remove ${what}`,
          onclick: () => change((v) => removeColumn(v, i)),
        }, ['🗑']),
      ]),
      h('div', { class: 'slipr-table-editor-column-settings' }, [
        select('format', FORMAT_NAMES, TABLE_FORMATS, format, (x) => ({ format: x || undefined })),
        ['number', 'percent', 'currency'].includes(format)
          ? h('input', {
              type: 'number', class: 'slipr-input slipr-input-sm slipr-table-editor-decimals', min: '0', max: '10', step: '1',
              value: col.decimals ?? '', placeholder: 'decimals', 'aria-label': `${options.label}: ${what}: decimals`, title: 'Digits after the decimal point',
              onchange: (/** @type {Event} */ e) => {
                const raw = /** @type {HTMLInputElement} */ (e.target).value;
                changeCol((v) => setColumn(v, i, { decimals: raw === '' ? undefined : Math.max(0, Math.min(10, Math.round(Number(raw)))) }));
              },
            })
          : null,
        format === 'currency'
          ? h('input', {
              type: 'text', class: 'slipr-input slipr-input-sm slipr-table-editor-currency', maxlength: '3', value: col.currency ?? '', placeholder: 'EUR',
              'aria-label': `${options.label}: ${what}: currency`, title: 'Currency code: EUR, USD, GBP, …',
              onchange: (/** @type {Event} */ e) => {
                const code = /** @type {HTMLInputElement} */ (e.target).value.trim().toUpperCase();
                changeCol((v) => setColumn(v, i, { currency: /^[A-Z]{3}$/.test(code) ? code : undefined }));
              },
            })
          : null,
        select('alignment', ALIGN_NAMES, TABLE_ALIGNS, col.align ?? '', (x) => ({ align: x || undefined })),
        select('total', TOTAL_NAMES, TABLE_TOTALS, col.total ?? '', (x) => ({ total: x || undefined })),
        select('colours', VISUAL_NAMES, TABLE_VISUALS, col.visual ?? '', (x) => ({ visual: x || undefined })),
      ]),
    ]);
  });
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-columns' }, [
    h('legend', {}, [`Columns${listed.length ? ` (${listed.length})` : ''}`]),
    fromFile && !header ? h('p', { class: 'slipr-help' }, ['The columns appear once the file is read.']) : null,
    h('p', { class: 'slipr-help' }, ['Automatic shows numbers as written. Totals and colours need numbers; hidden columns can be shown by readers.']),
    h('ol', { class: 'slipr-table-editor-column-list' }, rows),
  ]);
}

// ---------------------------------------------------------------------------
// Options

/**
 * @param {TableFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {string[] | null} header
 */
function optionsSection(options, value, change, header) {
  const { label } = options;
  const keys = columnKeys(value, header);
  /** @param {string} text @param {string} field @param {string} title */
  const check = (text, field, title) => h('label', { class: 'slipr-checkbox-label', title }, [
    h('input', {
      type: 'checkbox', checked: value[field] ? true : undefined,
      onchange: (/** @type {Event} */ e) => change((v) => tableValue(v, { [field]: /** @type {HTMLInputElement} */ (e.target).checked })),
    }), ` ${text}`,
  ]);
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-options' }, [
    h('legend', {}, ['Options']),
    h('div', { class: 'slipr-table-editor-checks' }, [
      check('Sortable', 'sortable', 'Click a header to sort: ascending, descending, original order (also while presenting)'),
      check('Filter box', 'filter', 'A search box that keeps the rows containing the text (also while presenting)'),
      check('Pin first column', 'pinFirst', 'The first column stays in place while the table scrolls sideways'),
    ]),
    h('div', { class: 'slipr-table-editor-row' }, [
      h('label', { class: 'slipr-label' }, ['Start sorted by',
        h('select', {
          class: 'slipr-select slipr-select-sm', 'aria-label': `${label}: start sorted by`,
          onchange: (/** @type {Event} */ e) => {
            const column = /** @type {HTMLSelectElement} */ (e.target).value;
            change((v) => tableValue(v, { sort: column ? { column, ...(v.sort?.order === 'desc' ? { order: 'desc' } : {}) } : undefined }));
          },
        }, [h('option', { value: '' }, ['Original order']), ...keys.map(([key, name]) => h('option', { value: key, selected: value.sort?.column === key ? true : undefined }, [name]))]),
      ]),
      value.sort ? h('label', { class: 'slipr-label' }, ['Order',
        h('select', {
          class: 'slipr-select slipr-select-sm', 'aria-label': `${label}: sort order`,
          onchange: (/** @type {Event} */ e) => change((v) => tableValue(v, { sort: { column: v.sort?.column, ...(/** @type {HTMLSelectElement} */ (e.target).value === 'desc' ? { order: 'desc' } : {}) } })),
        }, [h('option', { value: 'asc' }, ['Ascending']), h('option', { value: 'desc', selected: value.sort.order === 'desc' ? true : undefined }, ['Descending'])]),
      ]) : null,
      h('label', { class: 'slipr-label' }, ['Rows before scrolling',
        h('input', {
          type: 'number', class: 'slipr-input slipr-input-sm', min: '1', step: '1', value: value.maxRows ?? '', placeholder: 'all',
          'aria-label': `${label}: rows before scrolling`,
          onchange: (/** @type {Event} */ e) => {
            const n = Math.round(Number(/** @type {HTMLInputElement} */ (e.target).value));
            change((v) => tableValue(v, { maxRows: n >= 1 ? n : undefined }));
          },
        }),
      ]),
      h('label', { class: 'slipr-label' }, ['Number format',
        h('input', {
          type: 'text', class: 'slipr-input slipr-input-sm', value: value.locale ?? '', placeholder: 'the show’s language',
          'aria-label': `${label}: locale`, title: 'Language and region for numbers and dates, for example nl-NL or en-GB',
          onchange: (/** @type {Event} */ e) => {
            const locale = /** @type {HTMLInputElement} */ (e.target).value.trim();
            change((v) => tableValue(v, { locale: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : undefined }));
          },
        }),
      ]),
    ]),
    h('label', { class: 'slipr-label' }, ['Caption',
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: value.caption ?? '', 'aria-label': `${label}: caption`,
        placeholder: 'Optional: a line below the table',
        oninput: (/** @type {Event} */ e) => change((v) => tableValue(v, { caption: /** @type {HTMLInputElement} */ (e.target).value || undefined }), true),
      }),
    ]),
  ]);
}

/** [key, header] of every column. @param {any} value @param {string[] | null} header @returns {[string, string][]} */
function columnKeys(value, header) {
  const columns = typeof value.data === 'string' && header ? withFileColumns(value, header).columns : (value.columns ?? []);
  return columns.map((/** @type {any} */ c) => [c.key, c.label ?? c.key]);
}

// ---------------------------------------------------------------------------
// Steps while presenting (slots)

/**
 * @param {TableFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {string[] | null} header
 */
function stepsSection(options, value, change, header) {
  const steps = Array.isArray(value.steps) ? value.steps : [];
  const keys = columnKeys(value, header);
  const rows = steps.map((/** @type {any} */ step, /** @type {number} */ i) => {
    const isRows = step && step.rows !== undefined;
    const hl = step?.highlight ?? null;
    const body = isRows
      ? [
          h('span', {}, ['Show the first']),
          h('input', {
            type: 'number', class: 'slipr-input slipr-input-sm slipr-table-editor-decimals', min: '0', step: '1',
            value: step.rows === 'all' ? '' : String(step.rows), placeholder: 'all', 'aria-label': `Step ${i + 1}: number of rows`,
            onchange: (/** @type {Event} */ e) => {
              const raw = /** @type {HTMLInputElement} */ (e.target).value;
              change((v) => setStep(v, i, { rows: raw === '' ? 'all' : Math.max(0, Math.round(Number(raw))) }));
            },
          }),
          h('span', {}, ['rows (empty: all)']),
        ]
      : hl === null
        ? [h('span', {}, ['Clear the highlight'])]
        : [
            h('span', {}, ['Highlight row']),
            h('input', {
              type: 'text', class: 'slipr-input slipr-input-sm slipr-table-editor-hl-row', value: hl.row === undefined ? '' : String(hl.row),
              placeholder: 'any', 'aria-label': `Step ${i + 1}: row (number or first column text)`, title: 'A row number (1 is the first row of the data) or the text in its first column. Empty: a whole column.',
              onchange: (/** @type {Event} */ e) => {
                const raw = /** @type {HTMLInputElement} */ (e.target).value.trim();
                const row = raw === '' ? undefined : /^\d+$/.test(raw) ? Math.max(1, Number(raw)) : raw;
                change((v) => setStep(v, i, { highlight: highlightOf(row, hl.column) }));
              },
            }),
            h('span', {}, ['column']),
            h('select', {
              class: 'slipr-select slipr-select-sm', 'aria-label': `Step ${i + 1}: column`,
              onchange: (/** @type {Event} */ e) => {
                const column = /** @type {HTMLSelectElement} */ (e.target).value || undefined;
                change((v) => setStep(v, i, { highlight: highlightOf(hl.row, column) }));
              },
            }, [h('option', { value: '' }, ['any']), ...keys.map(([key, name]) => h('option', { value: key, selected: hl.column === key ? true : undefined }, [name]))]),
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
  const rowCount = Array.isArray(value.rows) ? value.rows.length : 0;
  return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-steps' }, [
    h('legend', {}, [`While presenting${steps.length ? ` (${steps.length} step${steps.length === 1 ? '' : 's'})` : ''}`]),
    h('p', { class: 'slipr-help' }, ['One step per click. With a “show rows” step the table starts empty; a highlight dims the rest until the next step.']),
    steps.length ? h('ol', { class: 'slipr-table-editor-step-list' }, rows) : null,
    h('div', { class: 'slipr-table-editor-actions' }, [
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm',
        onclick: () => change((v) => {
          const last = [...(v.steps ?? [])].reverse().find((/** @type {any} */ s) => typeof s?.rows === 'number');
          return addStep(v, { rows: last ? Math.min(last.rows + 1, rowCount || last.rows + 1) : 1 });
        }),
      }, ['+ Show rows']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => addStep(v, { highlight: { column: keys[1]?.[0] ?? keys[0]?.[0] } })) }, ['+ Highlight']),
      steps.some((/** @type {any} */ s) => s?.highlight) ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => addStep(v, { highlight: null })) }, ['+ Clear highlight']) : null,
    ]),
  ]);
}

/** A highlight from its parts (null when neither is set). @param {any} row @param {string | undefined} column */
function highlightOf(row, column) {
  if (row === undefined && !column) return null;
  return { ...(row !== undefined ? { row } : {}), ...(column ? { column } : {}) };
}
