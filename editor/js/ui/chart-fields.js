// @ts-check
/**
 * The chart editor (I-109), shared by the `chart` slot (slide form) and the
 * Chart reader block: the data (a grid of typed-in rows, pasted from a
 * spreadsheet, or a CSV file copied into data/), category and series column
 * pickers, chart options (direction, grouping, value labels, min/max, sort,
 * highlight, reference line, caption) and audience steps.
 */
import { h } from '../dom.js';
import { detectDelimiter, parseCsv } from '../../../shared/csv.js';
import {
  addColumn, addRow, cellFromText, cellText, inlineFromFile, newTable,
  pasteIntoGrid, removeColumn, removeRow, setCell, setColumnLabel, tableFromPaste,
} from '../table-values.js';
import {
  addChartStep, chartValue, moveChartStep, newChart, removeChartStep, setChartStep, tableFromChart,
} from '../chart-values.js';
import { runImage } from './image-field.js';

/**
 * @typedef {object} ChartFieldsOptions
 * @property {string} key  Identifies this editor across re-renders (slot or block).
 * @property {string} label  Accessible name prefix.
 * @property {'slot' | 'block'} kind  Slots also get the steps while presenting.
 * @property {() => any} read  The current value.
 * @property {(value: any, typing?: boolean) => void} write  Store a new value.
 * @property {(path: string) => Promise<Blob | null>} readFile  Read a show file.
 * @property {(file: File, write: (path: string, title: string) => void) => Promise<void>} addDataFile
 */

/** A CSV file, once read: its rows (header first). @type {Map<string, { path: string, rows: string[][] | null, decimalComma: boolean, error?: string }>} */
const files = new Map();

/**
 * @param {ChartFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function chartFields(options) {
  const root = h('div', { class: 'slipr-table-editor slipr-chart-editor' });
  render(root, options);
  return [root];
}

/** @param {HTMLElement} root @param {ChartFieldsOptions} options */
function render(root, options) {
  const { read, write, kind } = options;
  const value = read() ?? {};
  /** @param {(v: any) => any} fn @param {boolean} [typing] */
  const change = (fn, typing = false) => write(fn(read() ?? {}), typing);
  const file = readDataFile(root, options, value);
  const header = file?.rows?.[0] ?? null;

  root.replaceChildren(...[
    dataSection(options, value, change, file),
    columnsAndOptionsSection(options, value, change, header),
    kind === 'slot' ? stepsSection(options, value, change, header) : null,
  ].filter(/** @returns {x is HTMLElement} */ (x) => Boolean(x)));
}

/**
 * Read (and cache) the value's CSV file; re-render once it is read.
 * @param {HTMLElement} root @param {ChartFieldsOptions} options @param {any} value
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
// Data section (grid or CSV file)
// ---------------------------------------------------------------------------

/**
 * @param {ChartFieldsOptions} options @param {any} value
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
          return chartValue(rest, { data: path, sort: undefined, steps: undefined });
        })));
      }
    },
  }));
  const chooseButton = (/** @type {string} */ text) => h('button', {
    type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click(),
    title: 'Copy a CSV file into the show’s data/ folder. Comma, semicolon or tab separated.',
  }, [text]);

  if (typeof value.data === 'string') {
    const rows = file?.rows;
    const status = !rows ? (file?.error ? `The file could not be read (${file.error}).` : 'Reading the file…')
      : `${Math.max(0, rows.length - 1)} rows, ${rows[0]?.length ?? 0} columns${file?.decimalComma ? ' (semicolons, decimal commas)' : ''}.`;
    return h('fieldset', { class: 'slipr-fieldset slipr-table-editor-data' }, [
      h('legend', {}, ['Data source']),
      h('p', { class: 'slipr-help' }, [h('code', {}, [value.data]), ` ${status}`]),
      rows ? previewTable(rows) : null,
      h('div', { class: 'slipr-table-editor-actions' }, [
        chooseButton('Choose another CSV…'),
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: rows ? undefined : true,
          title: 'Copy the file’s rows into the slide, to edit them here.',
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
    h('legend', {}, ['Data source']),
    columns.length
      ? h('div', { class: 'slipr-table-editor-grid-wrap' }, [grid(options, columns, rows, change)])
      : h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => change((v) => chartValue(v, newChart())) }, ['Start a chart']),
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
          title: 'Replace the rows and columns with the pasted ones.',
          onclick: () => {
            if (!pasteArea.value.trim()) return;
            change((v) => tableFromPaste(v, pasteArea.value));
          },
        }, ['Replace data']),
      ]),
    ]),
  ]);
}

/**
 * Preview of a CSV file: the header and up to five rows.
 * @param {string[][]} rows
 */
function previewTable(rows) {
  const [header = [], ...body] = rows;
  const sample = body.slice(0, 5);
  return h('table', { class: 'slipr-table-editor-preview', 'aria-label': 'CSV file preview' }, [
    h('thead', {}, [h('tr', {}, header.map((hText) => h('th', {}, [hText])))]),
    h('tbody', {}, sample.map((r) => h('tr', {}, header.map((_, i) => h('td', {}, [r[i] ?? '']))))),
  ]);
}

/**
 * The typed-in grid of cells.
 * @param {ChartFieldsOptions} options @param {any[]} columns @param {any[][]} rows
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 */
function grid(options, columns, rows, change) {
  const { label } = options;
  const colKeys = columns.map((c) => c?.key);

  const headCells = columns.map((col, j) => {
    const input = h('input', {
      type: 'text', class: 'slipr-input slipr-input-sm', value: col?.label ?? col?.key ?? '',
      'aria-label': `Column ${j + 1} header`,
      oninput: (/** @type {any} */ e) => change((v) => setColumnLabel(v, j, e.target.value), true),
    });
    const removeBtn = columns.length > 1 ? h('button', {
      type: 'button', class: 'slipr-btn-icon', title: `Remove column "${col?.label ?? col?.key}"`,
      onclick: () => change((v) => removeColumn(v, j)),
    }, ['×']) : null;
    return h('th', {}, [input, removeBtn]);
  });

  const bodyRows = rows.map((row, i) => {
    const cells = columns.map((_, j) => {
      const val = row[j];
      const input = h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: cellText(val),
        'aria-label': `Row ${i + 1}, column ${j + 1}`,
        oninput: (/** @type {any} */ e) => change((v) => setCell(v, i, j, e.target.value), true),
        onpaste: (/** @type {ClipboardEvent} */ e) => {
          const text = e.clipboardData?.getData('text/plain');
          if (text && /[\t\n]/.test(text.trim())) {
            e.preventDefault();
            change((v) => pasteIntoGrid(v, i, j, text));
          }
        },
      });
      return h('td', {}, [input]);
    });
    const removeBtn = rows.length > 1 ? h('button', {
      type: 'button', class: 'slipr-btn-icon', title: `Remove row ${i + 1}`,
      onclick: () => change((v) => removeRow(v, i)),
    }, ['×']) : null;
    return h('tr', {}, [...cells, h('td', { class: 'slipr-table-editor-grid-row-btn' }, [removeBtn])]);
  });

  return h('table', { class: 'slipr-table-editor-grid', 'aria-label': `${label}: data grid` }, [
    h('thead', {}, [h('tr', {}, [...headCells, h('th', {})])]),
    h('tbody', {}, bodyRows),
  ]);
}

// ---------------------------------------------------------------------------
// Chart configuration & options section
// ---------------------------------------------------------------------------

/**
 * @param {ChartFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {string[] | null} header
 */
function columnsAndOptionsSection(options, value, change, header) {
  const allKeys = header ?? (Array.isArray(value.columns) ? value.columns.map((/** @type {any} */ c) => c.key) : []);
  const activeCategory = value.category || allKeys[0] || '';
  const activeSeries = new Set(Array.isArray(value.series) ? value.series : allKeys.filter((k) => k !== activeCategory));

  // Category picker
  const catSelect = h('select', {
    class: 'slipr-select',
    onchange: (/** @type {any} */ e) => change((v) => chartValue(v, { category: e.target.value })),
  }, allKeys.map((k) => h('option', { value: k, selected: k === activeCategory ? true : undefined }, [k])));

  // Series pickers
  const seriesCheckboxes = allKeys.map((k) => {
    const isChecked = activeSeries.has(k);
    const box = h('input', {
      type: 'checkbox',
      checked: isChecked,
      onchange: (/** @type {any} */ e) => {
        const next = new Set(activeSeries);
        if (e.target.checked) next.add(k);
        else next.delete(k);
        change((v) => chartValue(v, { series: [...next] }));
      },
    });
    return h('label', { class: 'slipr-checkbox-item' }, [box, ` ${k}`]);
  });

  // Chart options
  const orientationSelect = h('select', {
    class: 'slipr-select',
    onchange: (/** @type {any} */ e) => change((v) => chartValue(v, { orientation: e.target.value })),
  }, [
    h('option', { value: 'vertical', selected: value.orientation !== 'horizontal' ? true : undefined }, ['Vertical bars']),
    h('option', { value: 'horizontal', selected: value.orientation === 'horizontal' ? true : undefined }, ['Horizontal bars']),
  ]);

  const stackedCheckbox = h('input', {
    type: 'checkbox',
    checked: Boolean(value.stacked),
    onchange: (/** @type {any} */ e) => change((v) => chartValue(v, { stacked: e.target.checked })),
  });

  const valuesCheckbox = h('input', {
    type: 'checkbox',
    checked: Boolean(value.values),
    onchange: (/** @type {any} */ e) => change((v) => chartValue(v, { values: e.target.checked })),
  });

  const sortSelect = h('select', {
    class: 'slipr-select',
    onchange: (/** @type {any} */ e) => change((v) => chartValue(v, { sort: e.target.value === 'none' ? undefined : e.target.value })),
  }, [
    h('option', { value: 'none', selected: !value.sort || value.sort === 'none' ? true : undefined }, ['As written (data order)']),
    h('option', { value: 'desc', selected: value.sort === 'desc' || value.sort === true ? true : undefined }, ['Highest value first (descending)']),
    h('option', { value: 'asc', selected: value.sort === 'asc' ? true : undefined }, ['Lowest value first (ascending)']),
  ]);

  const highlightInput = h('input', {
    type: 'text', class: 'slipr-input', placeholder: 'Category name to highlight…',
    value: value.highlight ?? '',
    oninput: (/** @type {any} */ e) => change((v) => chartValue(v, { highlight: e.target.value || undefined }), true),
  });

  const minInput = h('input', {
    type: 'number', class: 'slipr-input slipr-input-sm', placeholder: 'Auto',
    value: value.min !== undefined ? String(value.min) : '',
    oninput: (/** @type {any} */ e) => {
      const n = e.target.value.trim() === '' ? undefined : Number(e.target.value);
      change((v) => chartValue(v, { min: n }), true);
    },
  });

  const maxInput = h('input', {
    type: 'number', class: 'slipr-input slipr-input-sm', placeholder: 'Auto',
    value: value.max !== undefined ? String(value.max) : '',
    oninput: (/** @type {any} */ e) => {
      const n = e.target.value.trim() === '' ? undefined : Number(e.target.value);
      change((v) => chartValue(v, { max: n }), true);
    },
  });

  const captionInput = h('input', {
    type: 'text', class: 'slipr-input', placeholder: 'Caption below the chart…',
    value: value.caption ?? '',
    oninput: (/** @type {any} */ e) => change((v) => chartValue(v, { caption: e.target.value || undefined }), true),
  });

  const toTableBtn = h('button', {
    type: 'button', class: 'slipr-btn slipr-btn-sm',
    title: 'Convert this chart into a data table.',
    onclick: () => change((v) => tableFromChart(v)),
  }, ['Show as table']);

  return h('fieldset', { class: 'slipr-fieldset' }, [
    h('legend', {}, ['Chart configuration']),
    h('div', { class: 'slipr-form-row' }, [
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-label' }, ['Category column']),
        catSelect,
      ]),
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-label' }, ['Orientation']),
        orientationSelect,
      ]),
    ]),
    h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Value series columns']),
      h('div', { class: 'slipr-checkbox-group' }, seriesCheckboxes),
    ]),
    h('div', { class: 'slipr-form-row' }, [
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-form-checkbox' }, [stackedCheckbox, ' Stacked bars']),
      ]),
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-form-checkbox' }, [valuesCheckbox, ' Show values on bars']),
      ]),
    ]),
    h('div', { class: 'slipr-form-row' }, [
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-label' }, ['Sort order']),
        sortSelect,
      ]),
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-label' }, ['Highlight category']),
        highlightInput,
      ]),
    ]),
    h('div', { class: 'slipr-form-row' }, [
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-label' }, ['Axis min']),
        minInput,
      ]),
      h('div', { class: 'slipr-form-col' }, [
        h('label', { class: 'slipr-label' }, ['Axis max']),
        maxInput,
      ]),
    ]),
    h('div', { class: 'slipr-form-group' }, [
      h('label', { class: 'slipr-label' }, ['Caption']),
      captionInput,
    ]),
    h('div', { class: 'slipr-form-group' }, [
      toTableBtn,
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Audience mode steps
// ---------------------------------------------------------------------------

/**
 * @param {ChartFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 * @param {string[] | null} header
 */
function stepsSection(options, value, change, header) {
  const steps = Array.isArray(value.steps) ? value.steps : [];

  const items = steps.map((step, idx) => {
    let summaryText = '';
    if (step.categories !== undefined || step.bars !== undefined) {
      summaryText = `Show first ${step.categories ?? step.bars} categories`;
    } else if (step.series !== undefined) {
      summaryText = `Show series ${step.series}`;
    } else if (step.highlight) {
      summaryText = `Highlight "${step.highlight}"`;
    } else if (step.highlight === null) {
      summaryText = 'Clear highlight';
    } else {
      summaryText = 'Step';
    }

    const removeBtn = h('button', {
      type: 'button', class: 'slipr-btn-icon', title: 'Remove step',
      onclick: () => change((v) => removeChartStep(v, idx)),
    }, ['🗑']);

    const upBtn = h('button', {
      type: 'button', class: 'slipr-btn-icon', disabled: idx === 0 ? true : undefined,
      onclick: () => change((v) => moveChartStep(v, idx, idx - 1)),
    }, ['▲']);

    const downBtn = h('button', {
      type: 'button', class: 'slipr-btn-icon', disabled: idx === steps.length - 1 ? true : undefined,
      onclick: () => change((v) => moveChartStep(v, idx, idx + 1)),
    }, ['▼']);

    return h('li', { class: 'slipr-step-item' }, [
      h('span', { class: 'slipr-step-summary' }, [summaryText]),
      h('div', { class: 'slipr-step-actions' }, [upBtn, downBtn, removeBtn]),
    ]);
  });

  return h('fieldset', { class: 'slipr-fieldset' }, [
    h('legend', {}, ['Audience presentation steps']),
    h('p', { class: 'slipr-help' }, ['Reveal categories or highlight items click by click.']),
    h('ul', { class: 'slipr-steps-list' }, items),
    h('div', { class: 'slipr-table-editor-actions' }, [
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm',
        onclick: () => change((v) => addChartStep(v, { categories: 2 })),
      }, ['+ Show categories']),
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm',
        onclick: () => change((v) => addChartStep(v, { highlight: 'Item' })),
      }, ['+ Highlight']),
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm',
        onclick: () => change((v) => addChartStep(v, { highlight: null })),
      }, ['+ Clear highlight']),
    ]),
  ]);
}
