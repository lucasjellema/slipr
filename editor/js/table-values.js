// @ts-check
/**
 * Value helpers for the table editor (I-104): pure functions that return a new
 * table value (slot value or block fields), never changing the old one, so
 * undo keeps working. DOM-free (tested in Node).
 *
 * A table holds either inline `rows` (arrays of cells in the order of
 * `columns`) or a CSV `data` file whose columns `columns` configures by key.
 * Column keys are what sort, steps and highlights refer to: renaming a key
 * renames it there too.
 */
import { slugify } from './io/new-show.js';
import { cellNumber } from '../../shared/embeds/table.js';

/** Block fields of a table (the slot value has these and `steps`). */
export const TABLE_FIELDS = ['data', 'columns', 'rows', 'sortable', 'sort', 'filter', 'maxRows', 'pinFirst', 'locale', 'caption', 'fallback'];

/** A new table: two columns, two empty rows. */
export function newTable() {
  return {
    columns: [{ key: 'column-1', label: 'Column 1' }, { key: 'column-2', label: 'Column 2' }],
    rows: [[null, null], [null, null]],
  };
}

/**
 * The value with `patch` applied; `undefined`, `false` (for flags), empty
 * strings and empty arrays remove a field.
 * @param {any} value @param {Record<string, any>} patch
 * @returns {any}
 */
export function tableValue(value, patch) {
  const next = { ...(value ?? {}), ...patch };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === '' || (v === false && ['sortable', 'filter', 'pinFirst'].includes(k))
      || (Array.isArray(v) && !v.length && k !== 'rows' && k !== 'columns')) delete next[k];
  }
  return next;
}

/**
 * A cell from typed text: empty → null, a plain number → a number, else the text.
 * @param {string} text
 * @returns {string | number | null}
 */
export function cellFromText(text) {
  const s = String(text ?? '');
  if (s.trim() === '') return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s.trim())) return Number(s.trim());
  return s;
}

/** A cell as text in an input. @param {unknown} cell */
export function cellText(cell) {
  return cell === null || cell === undefined ? '' : String(cell);
}

/** @param {any} value */
const columnsOf = (value) => (Array.isArray(value?.columns) ? value.columns : []);
/** @param {any} value */
const rowsOf = (value) => (Array.isArray(value?.rows) ? value.rows : []);

/**
 * A key that is not in use yet, from a label.
 * @param {string} label @param {string[]} taken
 */
export function uniqueKey(label, taken) {
  const base = slugify(label) || 'column';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}

/**
 * Rename a column key in sort and steps.
 * @param {any} value @param {string} from @param {string | null} to  null: the column is gone.
 */
function renameRefs(value, from, to) {
  let next = value;
  if (next.sort?.column === from) next = tableValue(next, { sort: to ? { ...next.sort, column: to } : undefined });
  if (Array.isArray(next.steps)) {
    const steps = next.steps.map((/** @type {any} */ s) => {
      if (s?.highlight?.column !== from) return s;
      if (to) return { ...s, highlight: { ...s.highlight, column: to } };
      const { column, ...rest } = s.highlight;
      return Object.keys(rest).length ? { ...s, highlight: rest } : { highlight: null };
    });
    next = tableValue(next, { steps });
  }
  return next;
}

/**
 * Change a column's header. For typed-in tables the key follows the label (and
 * sort and steps follow the key); a file's column keeps its key (the CSV header).
 * @param {any} value @param {number} index @param {string} label
 */
export function setColumnLabel(value, index, label) {
  const columns = columnsOf(value);
  const col = columns[index];
  if (!col) return value;
  if (typeof value?.data === 'string') return setColumn(value, index, { label: label || undefined });
  const taken = columns.filter((_, i) => i !== index).map((c) => c.key);
  const key = uniqueKey(label || `column-${index + 1}`, taken);
  const next = tableValue(value, { columns: columns.map((c, i) => (i === index ? { ...c, key, label: label || key } : c)) });
  return key === col.key ? next : renameRefs(next, col.key, key);
}

/**
 * Change a column's settings; `undefined` or `false` (hidden) removes one.
 * @param {any} value @param {number} index @param {Record<string, any>} patch
 */
export function setColumn(value, index, patch) {
  const columns = columnsOf(value).map((c, i) => {
    if (i !== index) return c;
    const next = { ...c, ...patch };
    for (const [k, v] of Object.entries(next)) if (v === undefined || v === '' || (k === 'hidden' && v === false)) delete next[k];
    // Settings that only fit some formats.
    if (!['number', 'percent', 'currency'].includes(next.format)) delete next.decimals;
    if (next.format !== 'currency') delete next.currency;
    return next;
  });
  return tableValue(value, { columns });
}

/**
 * Add a column at the end (typed-in tables: every row gets an empty cell).
 * @param {any} value @param {string} [label]
 */
export function addColumn(value, label) {
  const columns = columnsOf(value);
  const text = label || `Column ${columns.length + 1}`;
  const key = uniqueKey(text, columns.map((c) => c.key));
  const next = tableValue(value, { columns: [...columns, { key, label: text }] });
  return typeof value?.data === 'string' ? next : tableValue(next, { rows: rowsOf(value).map((r) => [...r, null]) });
}

/**
 * Remove a column (and its cells, and sort / highlights on it).
 * @param {any} value @param {number} index
 */
export function removeColumn(value, index) {
  const col = columnsOf(value)[index];
  if (!col) return value;
  let next = tableValue(value, { columns: columnsOf(value).filter((_, i) => i !== index) });
  if (typeof value?.data !== 'string') next = tableValue(next, { rows: rowsOf(value).map((r) => r.filter((_, i) => i !== index)) });
  return renameRefs(next, col.key, null);
}

/**
 * Move a column (with its cells) from one place to another.
 * @param {any} value @param {number} from @param {number} to
 */
export function moveColumn(value, from, to) {
  const columns = columnsOf(value);
  if (from === to || !columns[from] || to < 0 || to >= columns.length) return value;
  /** @template T @param {T[]} list @returns {T[]} */
  const move = (list) => {
    const copy = [...list];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };
  const next = tableValue(value, { columns: move(columns) });
  return typeof value?.data === 'string' ? next : tableValue(next, { rows: rowsOf(value).map((r) => move(r)) });
}

/**
 * Make sure every column of a CSV file has a settings entry (in file order
 * after the configured ones), so it can be configured and reordered.
 * @param {any} value @param {string[]} header
 */
export function withFileColumns(value, header) {
  const columns = columnsOf(value);
  const known = columns.map((c) => c.key);
  const missing = header.filter((k) => k && !known.includes(k)).map((key) => ({ key }));
  return missing.length ? tableValue(value, { columns: [...columns, ...missing] }) : value;
}

/** @param {any} value @param {number} [at] Insert before this row (default: at the end). */
export function addRow(value, at) {
  const rows = rowsOf(value);
  const row = columnsOf(value).map(() => null);
  const i = at === undefined ? rows.length : Math.max(0, Math.min(rows.length, at));
  return tableValue(value, { rows: [...rows.slice(0, i), row, ...rows.slice(i)] });
}

/** @param {any} value @param {number} index */
export function removeRow(value, index) {
  return tableValue(value, { rows: rowsOf(value).filter((_, i) => i !== index) });
}

/** @param {any} value @param {number} from @param {number} to */
export function moveRow(value, from, to) {
  const rows = [...rowsOf(value)];
  if (from === to || !rows[from] || to < 0 || to >= rows.length) return value;
  const [row] = rows.splice(from, 1);
  rows.splice(to, 0, row);
  return tableValue(value, { rows });
}

/**
 * Set one cell from typed text.
 * @param {any} value @param {number} row @param {number} column @param {string} text
 */
export function setCell(value, row, column, text) {
  const width = columnsOf(value).length;
  const rows = rowsOf(value).map((r, i) => {
    if (i !== row) return r;
    const next = Array.from({ length: Math.max(width, r.length) }, (_, j) => r[j] ?? null);
    next[column] = cellFromText(text);
    return next;
  });
  return tableValue(value, { rows });
}

/**
 * Rows of text pasted from a spreadsheet (tab separated) or typed as CSV.
 * @param {string} text
 * @returns {string[][]}
 */
export function pastedRows(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const tabbed = lines.some((l) => l.includes('\t'));
  if (tabbed) return lines.map((l) => l.split('\t'));
  // Not from a spreadsheet: read it as CSV (comma or semicolon).
  const sep = (lines[0] ?? '').split(';').length > (lines[0] ?? '').split(',').length ? ';' : ',';
  return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
}

/**
 * Replace the table with pasted rows: the first line holds the headers.
 * Keeps the table's options; settings of columns with the same header stay.
 * @param {any} value @param {string} text
 */
export function tableFromPaste(value, text) {
  const [header = [], ...body] = pastedRows(text).filter((r) => r.some((c) => c.trim() !== ''));
  const old = new Map(columnsOf(value).map((c) => [c.label ?? c.key, c]));
  /** @type {string[]} */
  const keys = [];
  const columns = header.map((h, i) => {
    const label = h.trim() || `Column ${i + 1}`;
    const key = uniqueKey(label, keys);
    keys.push(key);
    const kept = old.get(label);
    return kept ? { ...kept, key, label } : { key, label };
  });
  const rows = body.map((r) => columns.map((_, j) => cellFromText(r[j] ?? '')));
  const { data, ...rest } = value ?? {};
  return tableValue(rest, { columns, rows, sort: undefined, steps: undefined });
}

/**
 * Paste a block of cells into the grid at a cell, as a spreadsheet does:
 * the table grows (rows and columns) where the block does not fit.
 * @param {any} value @param {number} row @param {number} column @param {string} text
 */
export function pasteIntoGrid(value, row, column, text) {
  const block = pastedRows(text);
  let next = value;
  const needCols = column + Math.max(...block.map((r) => r.length)) - columnsOf(next).length;
  for (let i = 0; i < needCols; i++) next = addColumn(next);
  while (rowsOf(next).length < row + block.length) next = addRow(next);
  const rows = rowsOf(next).map((r, i) => {
    const src = block[i - row];
    if (!src) return r;
    const copy = [...r];
    src.forEach((cell, j) => { copy[column + j] = cellFromText(cell); });
    return copy;
  });
  return tableValue(next, { rows });
}

/**
 * Turn a CSV file's rows into typed-in rows ("Move into the slide"): the
 * columns keep their settings, in the order the table shows them.
 * @param {any} value @param {string[][]} fileRows  Header first.
 * @param {{ decimalComma?: boolean }} [options]
 */
export function inlineFromFile(value, fileRows, options = {}) {
  const [header = [], ...body] = fileRows;
  const configured = columnsOf(value).filter((c) => header.includes(c.key));
  const keys = [...configured.map((c) => c.key), ...header.filter((k) => !configured.some((c) => c.key === k))];
  const byKey = new Map(columnsOf(value).map((c) => [c.key, c]));
  const columns = keys.map((key) => byKey.get(key) ?? { key });
  const at = keys.map((k) => header.indexOf(k));
  const rows = body.map((r) => at.map((i) => {
    const raw = r[i] ?? '';
    // Decimal commas and percent signs become numbers (12,5% → 0.125); other text as typed.
    const n = /[,%]/.test(raw) ? cellNumber(raw, options) : null;
    return n !== null ? n : cellFromText(raw);
  }));
  const { data, ...rest } = value ?? {};
  return tableValue(rest, { columns, rows });
}

/**
 * One line about a table, for summaries and the block list.
 * @param {any} value
 */
export function tableSummary(value) {
  const cols = columnsOf(value).length;
  if (typeof value?.data === 'string') return `Table from ${value.data}${cols ? `, ${cols} column${cols === 1 ? '' : 's'} set up` : ''}`;
  const rows = rowsOf(value).length;
  return `Table: ${rows} row${rows === 1 ? '' : 's'} × ${cols} column${cols === 1 ? '' : 's'}`;
}

// --------------------------------------------------------------- steps

/** @param {any} value @param {any} step */
export function addStep(value, step) {
  return tableValue(value, { steps: [...(Array.isArray(value?.steps) ? value.steps : []), step] });
}

/** @param {any} value @param {number} index @param {any} step */
export function setStep(value, index, step) {
  return tableValue(value, { steps: (value?.steps ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => (i === index ? step : s)) });
}

/** @param {any} value @param {number} index */
export function removeStep(value, index) {
  return tableValue(value, { steps: (value?.steps ?? []).filter((/** @type {any} */ _, /** @type {number} */ i) => i !== index) });
}

/** @param {any} value @param {number} from @param {number} to */
export function moveStep(value, from, to) {
  const steps = [...(value?.steps ?? [])];
  if (from === to || !steps[from] || to < 0 || to >= steps.length) return value;
  const [s] = steps.splice(from, 1);
  steps.splice(to, 0, s);
  return tableValue(value, { steps });
}
