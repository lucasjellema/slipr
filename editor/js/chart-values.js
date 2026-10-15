// @ts-check
/**
 * Value helpers for the chart editor (I-109): pure functions that return a new
 * chart value (slot value or block fields), never changing the old one, so
 * undo keeps working. DOM-free (tested in Node).
 *
 * A chart holds either inline `columns` and `rows` or a CSV `data` file.
 * `category` selects the category label column; `series` selects one or more
 * numeric columns.

/** Block fields of a chart (the slot value has these and `steps`). */
export const CHART_FIELDS = [
  'kind', 'data', 'columns', 'rows', 'category', 'series', 'orientation',
  'horizontal', 'stacked', 'values', 'min', 'max', 'sort', 'highlight',
  'reference', 'caption', 'fallback',
];

/** A new chart: 3 categories, 2 series. */
export function newChart() {
  return {
    kind: 'bar',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'series-1', label: 'Series 1' },
      { key: 'series-2', label: 'Series 2' },
    ],
    rows: [
      ['Alpha', 24, 18],
      ['Beta', 36, 29],
      ['Gamma', 15, 22],
    ],
    category: 'category',
    series: ['series-1', 'series-2'],
    orientation: 'vertical',
  };
}

/**
 * Apply a patch to a chart value; clean up undefined, empty strings and empty arrays.
 * @param {any} value
 * @param {Record<string, any>} patch
 * @returns {any}
 */
export function chartValue(value, patch) {
  const next = { kind: 'bar', ...(value ?? {}), ...patch };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === ''
      || (v === false && ['stacked', 'values', 'horizontal'].includes(k))
      || (Array.isArray(v) && !v.length && k !== 'rows' && k !== 'columns')) {
      delete next[k];
    }
  }
  return next;
}

/**
 * Convert an existing table value into a chart value (I-109).
 * Preserves the data (inline rows or CSV file) and selects the best columns.
 * @param {any} tableVal
 * @returns {any}
 */
export function chartFromTable(tableVal) {
  const base = tableVal && typeof tableVal === 'object' && !Array.isArray(tableVal) ? tableVal : {};
  const columns = Array.isArray(base.columns) ? base.columns : [];

  let category = '';
  const firstNonNum = columns.find((c) => c && !c.numeric && c.format !== 'number' && c.format !== 'integer' && c.format !== 'currency' && c.format !== 'percent');
  if (firstNonNum && typeof firstNonNum.key === 'string') {
    category = firstNonNum.key;
  } else if (columns[0]?.key) {
    category = columns[0].key;
  }

  const series = columns
    .filter((c) => c && c.key !== category && (c.numeric || c.format === 'number' || c.format === 'integer' || c.format === 'currency' || c.format === 'percent'))
    .map((c) => c.key);

  const { type, sortable, sort, filter, maxRows, pinFirst, locale, ...rest } = base;

  return chartValue(rest, {
    kind: 'bar',
    category: category || undefined,
    series: series.length ? series : undefined,
    orientation: 'vertical',
  });
}

/**
 * Convert an existing chart value into a table value (I-109).
 * @param {any} chartVal
 * @returns {any}
 */
export function tableFromChart(chartVal) {
  const base = chartVal && typeof chartVal === 'object' && !Array.isArray(chartVal) ? chartVal : {};
  const {
    type, kind, category, series, orientation, horizontal, stacked, values,
    min, max, highlight, reference, ...rest
  } = base;
  return { ...rest, sortable: true };
}

/**
 * One line summary for a chart value.
 * @param {any} value
 * @returns {string}
 */
export function chartSummary(value) {
  const kind = value?.kind || 'bar';
  if (typeof value?.data === 'string') {
    return `${kind.toUpperCase()} chart from ${value.data}`;
  }
  const rows = Array.isArray(value?.rows) ? value.rows.length : 0;
  const cols = Array.isArray(value?.columns) ? value.columns.length : 0;
  return `${kind.toUpperCase()} chart: ${rows} categories, ${cols} columns`;
}

// ---------------------------------------------------------------------------
// Step helpers (audience mode)
// ---------------------------------------------------------------------------

/** @param {any} value @param {any} step */
export function addChartStep(value, step) {
  return chartValue(value, { steps: [...(Array.isArray(value?.steps) ? value.steps : []), step] });
}

/** @param {any} value @param {number} index @param {any} step */
export function setChartStep(value, index, step) {
  return chartValue(value, { steps: (value?.steps ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => (i === index ? step : s)) });
}

/** @param {any} value @param {number} index */
export function removeChartStep(value, index) {
  return chartValue(value, { steps: (value?.steps ?? []).filter((/** @type {any} */ _, /** @type {number} */ i) => i !== index) });
}

/** @param {any} value @param {number} from @param {number} to */
export function moveChartStep(value, from, to) {
  const steps = [...(value?.steps ?? [])];
  if (from === to || !steps[from] || to < 0 || to >= steps.length) return value;
  const [s] = steps.splice(from, 1);
  steps.splice(to, 0, s);
  return chartValue(value, { steps });
}
