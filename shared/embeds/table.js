// @ts-check
/**
 * Embed kind `table`: a data table from a CSV file or inline rows (I-104), as a
 * `table` slot and a `table` reader block. Follows the embed kind contract of
 * ./index.js, without a library: plain DOM.
 *
 * The static content is the table itself (for a CSV file: its header and a
 * note), so print, thumbnails, screen readers and failures show the data.
 * Hydration reads the CSV file and adds the controls: sorting (header buttons),
 * a filter box, and in reader mode a Columns menu, Copy and Download CSV.
 * Audience mode: `steps` (show the first n rows, highlight a row, a column or a
 * cell) follow hidden Reveal fragments after the slot, like graph steps.
 *
 * Colours come from the template (`--slipr-table-*`); the show holds none. The
 * model and markup functions are DOM-free (tested); markup is built with
 * escape() and the Markdown module only, so it is safe for innerHTML.
 */
import { escape, markdownInline } from '../markdown.js';
import { detectDelimiter, parseCsv, toCsv } from '../csv.js';

/** No library to load. */
export const library = null;
/** Editor thumbnails show the table (cheap: no canvas). */
export const thumbnail = true;
/** Label of the error box when rendering fails. */
export const errorLabel = 'Table could not be shown';

export const TABLE_FORMATS = ['text', 'number', 'integer', 'percent', 'currency', 'date', 'markdown'];
export const TABLE_TOTALS = ['sum', 'avg', 'min', 'max', 'count'];
export const TABLE_VISUALS = ['scale', 'bar', 'sign'];
export const TABLE_ALIGNS = ['start', 'center', 'end'];
const NUMERIC_FORMATS = new Set(['number', 'integer', 'percent', 'currency']);

/**
 * @typedef {string | number | null} Cell
 * @typedef {object} TableColumn
 * @property {string} key
 * @property {string} label
 * @property {string} format  One of TABLE_FORMATS; `auto` when detected (a number shown as written).
 * @property {boolean} numeric
 * @property {number} [decimals]
 * @property {string} [currency]
 * @property {'start' | 'center' | 'end'} align
 * @property {boolean} hidden
 * @property {string} [total]
 * @property {string} [visual]
 * @typedef {{ columns: TableColumn[], rows: Cell[][] }} TableModel
 * @typedef {{ row: number | null, column: string | null }} TableHighlight
 */

/**
 * Is this a table value (slot value or block)?
 * @param {any} value
 * @returns {boolean}
 */
export function isTable(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Array.isArray(value.rows) || Array.isArray(value.columns) || isCsvPath(value.data)));
}

/** A data file a table reads (CSV or TSV). @param {unknown} data */
export function isCsvPath(data) {
  return typeof data === 'string' && /\.(csv|tsv|txt)$/i.test(data.trim());
}

/**
 * A cell as a number, or null. Numbers stay numbers; text such as `-12.5`,
 * `1e3`, `12%` (→ 0.12) and, with `decimalComma`, `1234,5` is read.
 * @param {Cell | undefined} cell
 * @param {{ decimalComma?: boolean }} [options]
 * @returns {number | null}
 */
export function cellNumber(cell, options = {}) {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;
  let s = cell.trim();
  if (!s) return null;
  let factor = 1;
  if (s.endsWith('%')) {
    factor = 0.01;
    s = s.slice(0, -1).trim();
  }
  if (options.decimalComma && /^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s) * factor;
  return Number.isFinite(n) ? n : null;
}

/** @param {Cell | undefined} cell */
const isEmpty = (cell) => cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');

/**
 * The table's columns and rows, from inline `rows` or a CSV file's rows (the
 * first is the header). Column settings come from `columns` by key: listed
 * columns in their order, then a file's other columns in file order.
 * DOM-free (tested).
 * @param {any} value
 * @param {string[][] | null} [fileRows]
 * @param {{ decimalComma?: boolean }} [options]
 * @returns {TableModel}
 */
export function tableModel(value, fileRows = null, options = {}) {
  const config = (Array.isArray(value?.columns) ? value.columns : [])
    .filter((/** @type {any} */ c) => c && typeof c.key === 'string' && c.key);
  /** @type {string[]} */
  let keys;
  /** @type {Cell[][]} */
  let raw;
  if (fileRows) {
    const header = (fileRows[0] ?? []).map((k) => String(k));
    const listed = config.map((/** @type {any} */ c) => c.key).filter((/** @type {string} */ k) => header.includes(k));
    keys = [...listed, ...header.filter((k) => !listed.includes(k))];
    const index = keys.map((k) => header.indexOf(k));
    raw = fileRows.slice(1).map((r) => index.map((i) => (i >= 0 ? r[i] ?? null : null)));
  } else {
    keys = config.map((/** @type {any} */ c) => c.key);
    raw = (Array.isArray(value?.rows) ? value.rows : [])
      .filter((/** @type {unknown} */ r) => Array.isArray(r))
      .map((/** @type {any[]} */ r) => keys.map((_, i) => normaliseCell(r[i])));
  }
  const byKey = new Map(config.map((/** @type {any} */ c) => [c.key, c]));
  const columns = keys.map((key, i) => {
    const c = byKey.get(key) ?? {};
    const filled = raw.map((r) => r[i]).filter((v) => !isEmpty(v));
    const allNumbers = filled.length > 0 && filled.every((v) => cellNumber(v, options) !== null);
    const format = TABLE_FORMATS.includes(c.format) ? c.format : allNumbers ? 'auto' : 'text';
    const numeric = format === 'auto' || (NUMERIC_FORMATS.has(format) && filled.some((v) => cellNumber(v, options) !== null));
    /** @type {TableColumn} */
    const col = {
      key,
      label: typeof c.label === 'string' && c.label ? c.label : key,
      format,
      numeric,
      align: TABLE_ALIGNS.includes(c.align) ? c.align : numeric ? 'end' : 'start',
      hidden: c.hidden === true,
    };
    if (Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 10) col.decimals = c.decimals;
    if (typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency)) col.currency = c.currency;
    if (TABLE_TOTALS.includes(c.total) && (numeric || c.total === 'count')) col.total = c.total;
    if (TABLE_VISUALS.includes(c.visual) && numeric) col.visual = c.visual;
    return col;
  });
  return { columns, rows: raw };
}

/** @param {unknown} v @returns {Cell} */
function normaliseCell(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  return null;
}

/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();

/**
 * @param {string | undefined} locale @param {Intl.NumberFormatOptions} opts
 * @returns {Intl.NumberFormat}
 */
function numberFormat(locale, opts) {
  const key = `${locale ?? ''}|${JSON.stringify(opts)}`;
  let f = numberFormats.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale || undefined, opts);
    } catch {
      f = new Intl.NumberFormat(undefined, opts);
    }
    numberFormats.set(key, f);
  }
  return f;
}

/**
 * Format a number the way a column shows it.
 * @param {number} n @param {TableColumn} col @param {string} [locale]
 * @param {{ count?: boolean }} [options]  A count is always a whole number.
 */
export function formatNumber(n, col, locale, options = {}) {
  const d = col.decimals;
  if (options.count) return numberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  switch (col.format) {
    case 'integer':
      return numberFormat(locale, { maximumFractionDigits: 0 }).format(n);
    case 'percent':
      return numberFormat(locale, { style: 'percent', minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 0 }).format(n);
    case 'currency':
      return numberFormat(locale, { style: 'currency', currency: col.currency ?? 'EUR', ...(d !== undefined ? { minimumFractionDigits: d, maximumFractionDigits: d } : {}) }).format(n);
    case 'number':
      return numberFormat(locale, d !== undefined ? { minimumFractionDigits: d, maximumFractionDigits: d } : { maximumFractionDigits: 2 }).format(n);
    default:
      // A detected number column (format auto): no grouping, so years read as years.
      return numberFormat(locale, { useGrouping: false, maximumFractionDigits: d ?? 2 }).format(n);
  }
}

/**
 * A cell's text as shown (Markdown cells: their source).
 * @param {Cell} cell @param {TableColumn} col @param {string} [locale]
 * @param {{ decimalComma?: boolean }} [options]
 * @returns {string}
 */
export function formatCell(cell, col, locale, options = {}) {
  if (isEmpty(cell)) return '';
  if (col.format === 'auto') return String(cell).trim(); // as written
  if (NUMERIC_FORMATS.has(col.format)) {
    const n = cellNumber(cell, options);
    return n === null ? String(cell) : formatNumber(n, col, locale);
  }
  if (col.format === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(cell).trim());
    if (m) {
      try {
        return new Intl.DateTimeFormat(locale || undefined, { dateStyle: 'medium', timeZone: 'UTC' })
          .format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
      } catch {
        return String(cell);
      }
    }
  }
  return String(cell);
}

/**
 * @typedef {object} ViewState
 * @property {{ column: string, order: 'asc' | 'desc' } | null} [sort]
 * @property {string} [filter]
 * @property {number} [rowLimit]  Show only rows with a data index below this (row reveal steps).
 * @property {Set<string>} [hidden]  Hidden column keys (default: the columns' own `hidden`).
 * @property {string} [locale]
 * @property {boolean} [decimalComma]
 */

/** The columns on show. @param {TableModel} model @param {ViewState} [state] */
export function shownColumns(model, state = {}) {
  return model.columns.filter((c) => (state.hidden ? !state.hidden.has(c.key) : !c.hidden));
}

/**
 * The rows on show, as data indexes in display order: revealed, filtered
 * (text in any shown column, ignoring case) and sorted (stable; empty cells
 * last). DOM-free (tested).
 * @param {TableModel} model @param {ViewState} [state]
 * @returns {number[]}
 */
export function viewRows(model, state = {}) {
  const limit = state.rowLimit ?? Infinity;
  let indexes = model.rows.map((_, i) => i).filter((i) => i < limit);
  const shown = shownColumns(model, state);
  const needle = (state.filter ?? '').trim().toLowerCase();
  if (needle) {
    const at = shown.map((c) => model.columns.indexOf(c));
    indexes = indexes.filter((i) => at.some((j, k) => {
      const cell = model.rows[i][j];
      return String(cell ?? '').toLowerCase().includes(needle)
        || formatCell(cell, shown[k], state.locale, state).toLowerCase().includes(needle);
    }));
  }
  const sort = state.sort;
  const j = sort ? model.columns.findIndex((c) => c.key === sort.column) : -1;
  if (sort && j >= 0) {
    const col = model.columns[j];
    const dir = sort.order === 'desc' ? -1 : 1;
    const collator = new Intl.Collator(state.locale || undefined, { numeric: true, sensitivity: 'base' });
    /** @param {Cell} cell */
    const keyOf = (cell) => (col.numeric ? cellNumber(cell, state) : isEmpty(cell) ? null : String(cell));
    indexes = [...indexes].sort((a, b) => {
      const x = keyOf(model.rows[a][j]);
      const y = keyOf(model.rows[b][j]);
      if (x === null || y === null) return x === y ? a - b : x === null ? 1 : -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      return c === 0 ? a - b : c * dir;
    });
  }
  return indexes;
}

/**
 * Column totals over the given rows. DOM-free (tested).
 * @param {TableModel} model @param {number[]} rows @param {{ decimalComma?: boolean }} [options]
 * @returns {Map<string, number | null>}
 */
export function columnTotals(model, rows, options = {}) {
  /** @type {Map<string, number | null>} */
  const totals = new Map();
  model.columns.forEach((col, j) => {
    if (!col.total) return;
    const cells = rows.map((i) => model.rows[i][j]);
    if (col.total === 'count') {
      totals.set(col.key, cells.filter((c) => !isEmpty(c)).length);
      return;
    }
    const nums = /** @type {number[]} */ (cells.map((c) => cellNumber(c, options)).filter((n) => n !== null));
    if (!nums.length) {
      totals.set(col.key, null);
      return;
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    totals.set(col.key, col.total === 'sum' ? sum : col.total === 'avg' ? sum / nums.length
      : col.total === 'min' ? Math.min(...nums) : Math.max(...nums));
  });
  return totals;
}

/**
 * Per visual column: the range over all rows, so colours stay put while sorting
 * and filtering.
 * @param {TableModel} model @param {{ decimalComma?: boolean }} [options]
 * @returns {Map<string, { min: number, max: number, maxAbs: number }>}
 */
export function columnRanges(model, options = {}) {
  /** @type {Map<string, { min: number, max: number, maxAbs: number }>} */
  const ranges = new Map();
  model.columns.forEach((col, j) => {
    if (!col.visual) return;
    const nums = /** @type {number[]} */ (model.rows.map((r) => cellNumber(r[j], options)).filter((n) => n !== null));
    if (nums.length) ranges.set(col.key, { min: Math.min(...nums), max: Math.max(...nums), maxAbs: Math.max(...nums.map(Math.abs)) });
  });
  return ranges;
}

/**
 * The state after `count` audience steps: how many rows are revealed and
 * what is highlighted. A `rows` step ends a highlight. DOM-free (tested).
 * @param {any[]} steps @param {number} count @param {TableModel} model
 * @returns {{ rowLimit: number, highlight: TableHighlight | null }}
 */
export function tableStepState(steps, count, model) {
  const list = Array.isArray(steps) ? steps : [];
  let rowLimit = list.some((s) => s && s.rows !== undefined) ? 0 : Infinity;
  /** @type {TableHighlight | null} */
  let highlight = null;
  for (const step of list.slice(0, Math.max(0, count))) {
    if (!step || typeof step !== 'object') continue;
    if (step.rows !== undefined) {
      rowLimit = step.rows === 'all' ? Infinity : Number.isFinite(Number(step.rows)) ? Math.max(0, Number(step.rows)) : rowLimit;
      highlight = null;
    } else if ('highlight' in step) {
      highlight = step.highlight ? resolveHighlight(step.highlight, model) : null;
    }
  }
  return { rowLimit, highlight };
}

/**
 * A highlight's row as a data index (by number, 1-based, or by the first
 * column's text) and its column key, if they exist.
 * @param {any} h @param {TableModel} model
 * @returns {TableHighlight | null}
 */
export function resolveHighlight(h, model) {
  if (!h || typeof h !== 'object') return null;
  /** @type {number | null} */
  let row = null;
  if (typeof h.row === 'number' && Number.isInteger(h.row) && h.row >= 1 && h.row <= model.rows.length) row = h.row - 1;
  else if (typeof h.row === 'string' && h.row.trim()) {
    const want = h.row.trim().toLowerCase();
    const found = model.rows.findIndex((r) => String(r[0] ?? '').trim().toLowerCase() === want);
    row = found >= 0 ? found : null;
  }
  const column = typeof h.column === 'string' && model.columns.some((c) => c.key === h.column) ? h.column : null;
  return row === null && column === null ? null : { row, column };
}

/**
 * @typedef {object} TableHtmlOptions
 * @property {'audience' | 'reader'} [mode]
 * @property {boolean} [sortable]
 * @property {TableHighlight | null} [highlight]
 * @property {boolean} [pinFirst]
 * @property {string} [empty]  Text of an empty body (e.g. no filter matches).
 * @property {Record<string, { term: string }>} [glossary]  Names of the glossary terms in Markdown cells.
 */

/**
 * The `<table>` for a model and view state. DOM-free (tested).
 * @param {TableModel} model @param {ViewState} [state] @param {TableHtmlOptions} [options]
 * @returns {string}
 */
export function tableHtml(model, state = {}, options = {}) {
  const cols = shownColumns(model, state);
  const at = cols.map((c) => model.columns.indexOf(c));
  const rows = viewRows(model, state);
  const ranges = columnRanges(model, state);
  const hl = options.highlight ?? null;
  const md = { mode: options.mode ?? 'reader', glossary: options.glossary };
  const pin = options.pinFirst && cols.length > 1;
  /** @param {TableColumn} c @param {number} k */
  const cellClass = (c, k, extra = '') => {
    const cls = [`is-${c.align}`];
    if (c.numeric) cls.push('is-num');
    if (pin && k === 0) cls.push('is-pinned');
    if (hl && hl.column === c.key && hl.row === null) cls.push('is-highlight');
    if (extra) cls.push(extra);
    return cls.join(' ');
  };
  const head = cols.map((c, k) => {
    const sorted = state.sort?.column === c.key ? state.sort.order : null;
    const aria = options.sortable ? ` aria-sort="${sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}"` : '';
    const label = escape(c.label);
    const inner = options.sortable
      ? `<button type="button" class="slipr-table-sort" data-sort="${escape(c.key)}" title="Sort by ${label}">${label}<span class="slipr-table-sort-icon" aria-hidden="true">${sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}</span></button>`
      : label;
    return `<th scope="col" class="${cellClass(c, k)}"${aria}>${inner}</th>`;
  }).join('');
  const body = rows.map((i) => {
    const rowHl = hl && hl.row === i && hl.column === null;
    const cells = cols.map((c, k) => {
      const cell = model.rows[i][at[k]];
      let extra = '';
      let style = '';
      const range = ranges.get(c.key);
      const n = c.visual ? cellNumber(cell, state) : null;
      if (c.visual && n !== null && range) {
        if (c.visual === 'scale') {
          const level = range.max === range.min ? 0.5 : (n - range.min) / (range.max - range.min);
          extra = 'is-scale';
          style = ` style="--slipr-table-level:${level.toFixed(3)}"`;
        } else if (c.visual === 'bar') {
          const level = range.maxAbs ? Math.abs(n) / range.maxAbs : 0;
          extra = `is-bar${n < 0 ? ' is-negative' : ''}`;
          style = ` style="--slipr-table-level:${level.toFixed(3)}"`;
        } else if (c.visual === 'sign') {
          extra = n < 0 ? 'is-negative' : n > 0 ? 'is-positive' : '';
        }
      }
      if (hl && hl.row === i && hl.column === c.key) extra = `${extra} is-highlight`.trim();
      const text = c.format === 'markdown' && typeof cell === 'string' ? markdownInline(cell, md) : escape(formatCell(cell, c, state.locale, state));
      const content = c.visual === 'bar' && extra.includes('is-bar') ? `<span class="slipr-table-bar-value">${text}</span>` : text;
      return k === 0 && !c.numeric
        ? `<th scope="row" class="${cellClass(c, k, extra)}"${style}>${content}</th>`
        : `<td class="${cellClass(c, k, extra)}"${style}>${content}</td>`;
    }).join('');
    return `<tr data-row="${i}"${rowHl ? ' class="is-highlight"' : ''}>${cells}</tr>`;
  }).join('');
  const emptyRow = !rows.length && options.empty
    ? `<tr class="slipr-table-empty"><td colspan="${Math.max(1, cols.length)}">${escape(options.empty)}</td></tr>`
    : '';
  const totals = columnTotals(model, rows, state);
  const foot = cols.some((c) => c.total)
    ? `<tfoot><tr>${cols.map((c, k) => {
      if (c.total) {
        const v = totals.get(c.key);
        const text = v === null || v === undefined ? '' : formatNumber(v, c, state.locale, { count: c.total === 'count' });
        return `<td class="${cellClass(c, k)}" title="${escape(totalLabel(c.total))}">${escape(text)}</td>`;
      }
      return k === 0 ? `<th scope="row" class="${cellClass(c, k)}">Total</th>` : `<td class="${cellClass(c, k)}"></td>`;
    }).join('')}</tr></tfoot>`
    : '';
  const cls = ['slipr-table-grid'];
  if (hl) cls.push('has-highlight');
  return `<table class="${cls.join(' ')}"><thead><tr>${head}</tr></thead><tbody>${body}${emptyRow}</tbody>${foot}</table>`;
}

/** @param {string} total */
function totalLabel(total) {
  return { sum: 'Sum', avg: 'Average', min: 'Lowest', max: 'Highest', count: 'Count' }[total] ?? total;
}

/**
 * The glossary terms that Markdown cells refer to, by id, with their names, so
 * a cell shows "Reader layer" for [[reader-layer]] (I-086 aliases need no names).
 * @param {any} value @param {any} [ctx]
 * @returns {Record<string, { term: string }> | undefined}
 */
function usedGlossary(value, ctx) {
  const glossary = ctx?.show?.glossary;
  if (!glossary || typeof glossary !== 'object' || !Array.isArray(value?.rows)) return undefined;
  /** @type {Record<string, { term: string }>} */
  const found = {};
  for (const row of value.rows) {
    for (const cell of Array.isArray(row) ? row : []) {
      if (typeof cell !== 'string') continue;
      for (const m of cell.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
        const term = glossary[m[1]]?.term;
        if (typeof term === 'string') found[m[1]] = { term };
      }
    }
  }
  return Object.keys(found).length ? found : undefined;
}

/** The value as stored on the element: without the fallback (not needed live). @param {any} value */
function liveValue(value) {
  const { fallback, ...rest } = value ?? {};
  return rest;
}

/** @param {any} value @param {any} [ctx] */
function localeOf(value, ctx) {
  if (typeof value?.locale === 'string' && value.locale) return value.locale;
  const lang = ctx?.show?.meta?.language;
  return typeof lang === 'string' && lang ? lang : undefined;
}

/**
 * The initial view: the author's sort, and (with `stepped`, an audience slot in
 * a running presentation) the rows before the first click. Elsewhere (print,
 * thumbnails, the editor's preview) the table shows all its rows.
 * @param {any} value @param {TableModel} model @param {string | undefined} locale
 * @param {boolean} [stepped]
 */
function initialState(value, model, locale, stepped = false) {
  const sort = value?.sort && typeof value.sort.column === 'string' && model.columns.some((c) => c.key === value.sort.column)
    ? { column: value.sort.column, order: /** @type {'asc' | 'desc'} */ (value.sort.order === 'desc' ? 'desc' : 'asc') }
    : null;
  const at = stepped ? tableStepState(value?.steps, 0, model) : { rowLimit: Infinity, highlight: null };
  return { state: { sort, locale, rowLimit: at.rowLimit }, highlight: at.highlight };
}

/**
 * Attributes of the embed element: the value (without its fallback), the data
 * file's address, the mode and whether it is a slot.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  /** @type {Record<string, string>} */
  const attrs = {
    class: 'slipr-table',
    'data-table': JSON.stringify(liveValue(value)),
    'data-table-mode': options.mode === 'audience' ? 'audience' : 'reader',
  };
  const locale = localeOf(value, ctx);
  if (locale) attrs['data-table-locale'] = locale;
  if (options.slot) attrs['data-table-slot'] = '';
  if (isCsvPath(value?.data) && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value.data)) {
    attrs['data-table-src'] = ctx.resolveAsset(value.data);
  }
  const glossary = usedGlossary(value, ctx);
  if (glossary) attrs['data-table-glossary'] = JSON.stringify(glossary);
  if (Number.isInteger(value?.maxRows) && value.maxRows > 0) attrs.style = `--slipr-table-max-rows:${value.maxRows}`;
  attrs['aria-label'] = typeof value?.title === 'string' && value.title ? value.title
    : typeof value?.caption === 'string' && value.caption ? value.caption : 'Table';
  attrs.role = 'group';
  return attrs;
}

/**
 * Static content without a fallback image: the table (inline rows), or for a
 * CSV file its header and a note.
 * @param {any} value
 * @param {any} ctx
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 * @returns {{ html: string, fallback: 'table' }}
 */
export function staticHtml(value, ctx, options = {}) {
  const fromFile = isCsvPath(value?.data);
  const model = tableModel(value, fromFile ? [((value?.columns ?? []).map((/** @type {any} */ c) => c?.key).filter(Boolean))] : null);
  const { state, highlight } = initialState(value, model, localeOf(value, ctx));
  const html = tableHtml(model, state, {
    mode: options.mode,
    glossary: usedGlossary(value, ctx),
    highlight,
    pinFirst: value?.pinFirst === true,
    empty: fromFile ? `The rows are in ${String(value.data).split('/').pop()}.` : '',
  });
  return { html: `<div class="slipr-table-scroll">${html}</div>`, fallback: 'table' };
}

/**
 * In an audience slot with steps: one hidden Reveal fragment per step, after the slot's own.
 * @param {any} value
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 */
export function afterHtml(value, options = {}) {
  if (!options.slot || (options.mode ?? 'reader') !== 'audience') return '';
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  return steps.map((_, i) => `<span class="fragment slipr-table-step" data-table-step="${i + 1}" aria-hidden="true"></span>`).join('');
}

// ---------------------------------------------------------------------------
// Live table (browser only)

/**
 * Read the data, then show the table with its controls. Throws when the CSV
 * file cannot be read.
 * @param {HTMLElement} el  The embed element.
 * @param {HTMLElement} live  Where the rendered content goes.
 */
export async function hydrate(el, live) {
  const value = JSON.parse(el.dataset.table ?? '{}');
  const audience = el.dataset.tableMode === 'audience';
  const slot = el.dataset.tableSlot !== undefined;
  const locale = el.dataset.tableLocale || undefined;
  const glossary = el.dataset.tableGlossary ? JSON.parse(el.dataset.tableGlossary) : undefined;
  let decimalComma = false;
  /** @type {string[][] | null} */
  let fileRows = null;
  if (el.dataset.tableSrc) {
    const src = el.dataset.tableSrc;
    const url = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The table's data file could not be read (${res.status}).`);
    const text = await res.text();
    decimalComma = detectDelimiter(text) === ';';
    fileRows = parseCsv(text);
    if (!fileRows.length) throw new Error('The table\'s data file is empty.');
  }
  const model = tableModel(value, fileRows, { decimalComma });
  const doc = el.ownerDocument;
  // Steps follow Reveal's fragments, so only in a running presentation.
  const presenting = audience && slot && Boolean(el.closest('.reveal'));
  const initial = initialState(value, model, locale, presenting);
  /** @type {ViewState} */
  let state = { ...initial.state, decimalComma, filter: '', hidden: new Set(model.columns.filter((c) => c.hidden).map((c) => c.key)) };
  /** @type {TableHighlight | null} */
  let highlight = initial.highlight;
  const sortable = value.sortable === true;

  /** @param {string} tag @param {Record<string, string>} [attrs] @param {(string | Node)[]} [children] */
  const make = (tag, attrs = {}, children = []) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...children);
    return node;
  };

  const scroll = make('div', { class: 'slipr-table-scroll', tabindex: '0', role: 'region', 'aria-label': `${el.getAttribute('aria-label') || 'Table'} (scrolls)` });
  const status = make('span', { class: 'slipr-table-status', 'aria-live': 'polite' });
  const toolbar = make('div', { class: 'slipr-table-toolbar' });

  function render() {
    const focusedSort = /** @type {HTMLElement | null} */ (doc.activeElement)?.dataset?.sort ?? null;
    scroll.innerHTML = tableHtml(model, state, {
      mode: audience ? 'audience' : 'reader',
      glossary,
      sortable,
      highlight,
      pinFirst: value.pinFirst === true,
      empty: state.filter ? `No rows contain “${state.filter}”.` : '',
    }); // built with escape() and the Markdown module only
    if (focusedSort) /** @type {HTMLElement | null} */ (scroll.querySelector(`[data-sort="${CSS.escape(focusedSort)}"]`))?.focus();
    const shown = viewRows(model, state).length;
    const total = Math.min(model.rows.length, state.rowLimit ?? Infinity);
    status.textContent = shown === total ? `${total} ${total === 1 ? 'row' : 'rows'}` : `${shown} of ${total} rows`;
  }

  scroll.addEventListener('click', (e) => {
    const button = /** @type {HTMLElement} */ (e.target).closest?.('[data-sort]');
    if (!(button instanceof HTMLElement) || !scroll.contains(button)) return;
    const key = button.dataset.sort ?? '';
    // Ascending, descending, then back to the author's order.
    const order = state.sort?.column !== key ? 'asc' : state.sort.order === 'asc' ? 'desc' : null;
    state = { ...state, sort: order ? { column: key, order } : null };
    render();
  });

  if (value.filter === true) {
    const input = /** @type {HTMLInputElement} */ (make('input', { type: 'search', class: 'slipr-table-filter', placeholder: 'Filter rows…', 'aria-label': 'Filter rows' }));
    input.addEventListener('input', () => {
      state = { ...state, filter: input.value };
      render();
    });
    toolbar.append(input);
  }
  if (!audience) {
    toolbar.append(columnsMenu(), button('Copy', 'Copy the rows on show (pastes into a spreadsheet)', copy), button('Download CSV', 'Download the rows on show as a CSV file', download));
  }
  toolbar.append(status);

  /** @param {string} text @param {string} title @param {() => void} fn */
  function button(text, title, fn) {
    const b = make('button', { type: 'button', class: 'slipr-table-btn', title }, [text]);
    b.addEventListener('click', fn);
    return b;
  }

  /** Readers show or hide columns (the author's hidden ones start hidden). */
  function columnsMenu() {
    const list = make('div', { class: 'slipr-table-columns-list', role: 'group', 'aria-label': 'Columns to show' });
    for (const col of model.columns) {
      const box = /** @type {HTMLInputElement} */ (make('input', { type: 'checkbox' }));
      box.checked = !state.hidden?.has(col.key);
      box.addEventListener('change', () => {
        const hidden = new Set(state.hidden);
        if (box.checked) hidden.delete(col.key);
        else hidden.add(col.key);
        state = { ...state, hidden };
        render();
      });
      list.append(make('label', { class: 'slipr-table-columns-item' }, [box, ` ${col.label}`]));
    }
    return make('details', { class: 'slipr-table-columns' }, [make('summary', { class: 'slipr-table-btn' }, ['Columns']), list]);
  }

  /** The rows on show, raw values, header first. */
  function exportRows() {
    const cols = shownColumns(model, state);
    const at = cols.map((c) => model.columns.indexOf(c));
    return [cols.map((c) => c.label), ...viewRows(model, state).map((i) => at.map((j) => model.rows[i][j]))];
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(toCsv(exportRows(), { delimiter: '\t' }));
      status.textContent = 'Copied: paste it into a spreadsheet.';
    } catch {
      status.textContent = 'Copying is not allowed here.';
    }
  }

  function download() {
    const blob = new Blob([`﻿${toCsv(exportRows())}`], { type: 'text/csv;charset=utf-8' });
    const a = /** @type {HTMLAnchorElement} */ (make('a', { href: URL.createObjectURL(blob), download: fileName() }));
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function fileName() {
    if (typeof value.data === 'string') return value.data.split('/').pop()?.replace(/\.(tsv|txt)$/i, '.csv') || 'table.csv';
    const base = String(value.title || value.caption || 'table').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${base || 'table'}.csv`;
  }

  if (toolbar.childElementCount > 1 || value.filter === true) live.append(toolbar);
  live.append(scroll);
  render();
  /** @type {any} */ (el).sliprTable = { model, get state() { return state; } }; // for debugging and browser checks

  if (presenting) {
    const stepEls = /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-table-step')]);
    const apply = () => {
      const s = tableStepState(value.steps, stepEls.filter((st) => st.classList.contains('visible')).length, model);
      state = { ...state, rowLimit: s.rowLimit };
      highlight = s.highlight;
      render();
    };
    if (stepEls.length) new MutationObserver(apply).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
    // Each time the slide is shown again, start from the author's sort and filter.
    const section = el.closest('section');
    if (section) {
      let present = section.classList.contains('present');
      new MutationObserver(() => {
        const now = section.classList.contains('present');
        if (now && !present) {
          state = { ...state, sort: initial.state.sort, filter: '' };
          const input = /** @type {HTMLInputElement | null} */ (toolbar.querySelector('.slipr-table-filter'));
          if (input) input.value = '';
          render();
        }
        present = now;
      }).observe(section, { attributes: true, attributeFilter: ['class'] });
    }
  }
}
