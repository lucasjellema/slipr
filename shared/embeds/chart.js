// @ts-check
/**
 * Embed kind `chart`: an embedded bar chart from inline data or a CSV file
 * (I-109), as a `chart` slot and a `chart` reader block. Follows the embed
 * kind contract of ./index.js, without a charting library: plain SVG.
 *
 * Data model is built on I-104 table data (`columns` and `rows`, or a CSV
 * file in `data/` read with `shared/csv.js`).
 * Visuals: SVG drawn with template tokens (`--slipr-chart-*`, falling back to
 * the palette); accessible tooltips, legend toggle, and "Show as table" in
 * reader mode; growing bars and reveal/highlight steps in audience mode.
 */
import { escape } from '../markdown.js';
import { detectDelimiter, parseCsv, toCsv } from '../csv.js';
import { cellNumber, formatNumber, isCsvPath, tableHtml, tableModel } from './table.js';

/** No library to load. */
export const library = null;
/** Editor thumbnails show the chart (pure SVG). */
export const thumbnail = true;
/** Label of the error box when rendering fails. */
export const errorLabel = 'Chart could not be shown';

export const CHART_KINDS = ['bar'];
export const CHART_ORIENTATIONS = ['vertical', 'horizontal'];
export const CHART_SORTS = ['none', 'desc', 'asc'];

/**
 * @typedef {object} ChartSeries
 * @property {string} key
 * @property {string} label
 * @property {import('./table.js').TableColumn} column
 * @property {number} index
 *
 * @typedef {object} ChartCategory
 * @property {string} key
 * @property {string} label
 * @property {number} index
 * @property {number[]} values  One number per series (0 for empty/non-numeric).
 * @property {number} totalPositive
 * @property {number} totalNegative
 * @property {number} sum
 *
 * @typedef {object} ChartReference
 * @property {number} value
 * @property {string} label
 *
 * @typedef {object} ChartModel
 * @property {'bar'} kind
 * @property {'vertical' | 'horizontal'} orientation
 * @property {boolean} stacked
 * @property {boolean} values
 * @property {ChartCategory[]} categories
 * @property {ChartSeries[]} series
 * @property {number} valMin
 * @property {number} valMax
 * @property {number[]} ticks
 * @property {ChartReference | null} reference
 * @property {string | null} highlight
 * @property {import('./table.js').TableModel} tableModel
 *
 * @typedef {object} ChartViewState
 * @property {number} [categoryLimit]
 * @property {number} [seriesLimit]
 * @property {Set<string>} [hiddenSeries]
 * @property {string | null} [highlight]
 * @property {'chart' | 'table'} [view]
 * @property {string} [locale]
 */

/**
 * Is this a chart value (slot value or block)?
 * @param {any} value
 * @returns {boolean}
 */
export function isChart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.kind === 'bar') return true;
  if (value.type === 'chart') return true;
  return Boolean(
    (value.category || (Array.isArray(value.series) && value.series.length > 0))
    && (Array.isArray(value.rows) || Array.isArray(value.columns) || isCsvPath(value.data))
  );
}

/**
 * Generate 4 to 6 nice round ticks covering [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {{ min: number, max: number, ticks: number[] }}
 */
export function calculateTicks(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] };
  }
  if (min === max) {
    if (min === 0) max = 10;
    else if (min > 0) min = 0;
    else max = 0;
  }
  const span = max - min;
  const roughStep = span / 5;
  const mag = 10 ** Math.floor(Math.log10(roughStep));
  const norm = roughStep / mag;
  let niceFactor = 1;
  if (norm > 7.5) niceFactor = 10;
  else if (norm > 3.5) niceFactor = 5;
  else if (norm > 1.75) niceFactor = 2;

  const step = niceFactor * mag;
  const tickMin = Math.floor(min / step) * step;
  const tickMax = Math.ceil(max / step) * step;
  const ticks = [];
  const count = Math.round((tickMax - tickMin) / step);
  for (let i = 0; i <= count; i++) {
    const val = Number((tickMin + i * step).toFixed(10));
    ticks.push(val);
  }
  return { min: tickMin, max: tickMax, ticks };
}

/**
 * Build the chart model from slot/block value and optional CSV rows. DOM-free (tested).
 * @param {any} value
 * @param {string[][] | null} [fileRows]
 * @param {{ decimalComma?: boolean, locale?: string }} [options]
 * @returns {ChartModel}
 */
export function chartModel(value, fileRows = null, options = {}) {
  const tModel = tableModel(value, fileRows, options);
  const orientation = (value?.orientation === 'horizontal' || value?.horizontal === true) ? 'horizontal' : 'vertical';
  const stacked = Boolean(value?.stacked);
  const showValues = Boolean(value?.values);

  // 1. Identify category column
  let catCol = tModel.columns.find((c) => c.key === value?.category);
  if (!catCol) {
    catCol = tModel.columns.find((c) => !c.numeric) ?? tModel.columns[0];
  }
  const catIndex = catCol ? tModel.columns.indexOf(catCol) : 0;

  // 2. Identify series columns
  /** @type {import('./table.js').TableColumn[]} */
  let seriesCols = [];
  if (Array.isArray(value?.series) && value.series.length > 0) {
    seriesCols = tModel.columns.filter((c) => value.series.includes(c.key));
  }
  if (!seriesCols.length) {
    seriesCols = tModel.columns.filter((c) => c.numeric && c !== catCol);
  }
  if (!seriesCols.length) {
    seriesCols = tModel.columns.filter((c) => c !== catCol);
  }

  /** @type {ChartSeries[]} */
  const series = seriesCols.map((col, idx) => ({
    key: col.key,
    label: col.label || col.key,
    column: col,
    index: idx,
  }));

  // 3. Build categories
  const seriesIndices = seriesCols.map((c) => tModel.columns.indexOf(c));
  /** @type {ChartCategory[]} */
  let categories = tModel.rows.map((row, rIdx) => {
    const cellVal = catIndex >= 0 ? row[catIndex] : null;
    const catLabel = cellVal === null || cellVal === undefined ? `Category ${rIdx + 1}` : String(cellVal).trim();
    const vals = seriesIndices.map((sIdx) => {
      if (sIdx < 0) return 0;
      const n = cellNumber(row[sIdx], options);
      return n !== null ? n : 0;
    });
    let pos = 0;
    let neg = 0;
    let sum = 0;
    for (const v of vals) {
      if (v > 0) pos += v;
      else neg += v;
      sum += v;
    }
    return {
      key: catLabel,
      label: catLabel,
      index: rIdx,
      values: vals,
      totalPositive: pos,
      totalNegative: neg,
      sum,
    };
  });

  // 4. Sorting
  const sort = value?.sort;
  if (sort === 'asc' || sort === 'desc' || sort === true) {
    const dir = sort === 'asc' ? 1 : -1;
    categories = [...categories].sort((a, b) => (a.sum - b.sum) * dir);
  }

  // 5. Value ranges
  let rawMin = 0;
  let rawMax = 0;
  if (categories.length > 0) {
    if (stacked) {
      rawMin = Math.min(0, ...categories.map((c) => c.totalNegative));
      rawMax = Math.max(0, ...categories.map((c) => c.totalPositive));
    } else {
      const allVals = categories.flatMap((c) => c.values);
      rawMin = Math.min(0, ...allVals);
      rawMax = Math.max(0, ...allVals);
    }
  }

  if (typeof value?.min === 'number' && Number.isFinite(value.min)) {
    rawMin = value.min;
  }
  if (typeof value?.max === 'number' && Number.isFinite(value.max)) {
    rawMax = value.max;
  }

  const { min: valMin, max: valMax, ticks } = calculateTicks(rawMin, rawMax);

  // 6. Reference line
  /** @type {ChartReference | null} */
  let reference = null;
  if (value?.reference !== undefined && value?.reference !== null) {
    const ref = value.reference;
    let refVal = 0;
    let refLabel = 'Reference';
    const allVals = categories.flatMap((c) => c.values);
    const avg = allVals.length ? (allVals.reduce((a, b) => a + b, 0) / allVals.length) : 0;

    if (ref === 'average') {
      refVal = avg;
      refLabel = 'Average';
    } else if (typeof ref === 'number' && Number.isFinite(ref)) {
      refVal = ref;
      refLabel = 'Target';
    } else if (typeof ref === 'object') {
      if (ref.value === 'average') refVal = avg;
      else if (typeof ref.value === 'number') refVal = ref.value;
      refLabel = ref.label || (ref.value === 'average' ? 'Average' : 'Target');
    }
    reference = { value: refVal, label: refLabel };
  }

  return {
    kind: 'bar',
    orientation,
    stacked,
    values: showValues,
    categories,
    series,
    valMin,
    valMax,
    ticks,
    reference,
    highlight: typeof value?.highlight === 'string' ? value.highlight.trim() : null,
    tableModel: tModel,
  };
}

/**
 * State after audience steps: category reveal count, series limit, highlight.
 * DOM-free (tested).
 * @param {any[]} steps
 * @param {number} count
 * @param {ChartModel} model
 * @returns {{ categoryLimit: number, seriesLimit: number, highlight: string | null }}
 */
export function chartStepState(steps, count, model) {
  const list = Array.isArray(steps) ? steps : [];
  const hasCategoryStep = list.some((s) => s && (s.categories !== undefined || s.bars !== undefined));
  let categoryLimit = hasCategoryStep ? 0 : Infinity;
  let seriesLimit = Infinity;
  /** @type {string | null} */
  let highlight = model.highlight;

  for (const step of list.slice(0, Math.max(0, count))) {
    if (!step || typeof step !== 'object') continue;
    if (step.categories !== undefined || step.bars !== undefined) {
      const c = step.categories !== undefined ? step.categories : step.bars;
      categoryLimit = c === 'all' ? Infinity : Number.isFinite(Number(c)) ? Math.max(0, Number(c)) : categoryLimit;
    }
    if (step.series !== undefined) {
      if (step.series === 'all') {
        seriesLimit = Infinity;
      } else if (typeof step.series === 'number') {
        seriesLimit = Math.max(1, step.series);
      } else if (typeof step.series === 'string') {
        const idx = model.series.findIndex((s) => s.key === step.series);
        if (idx >= 0) seriesLimit = idx + 1;
      }
    }
    if ('highlight' in step) {
      highlight = typeof step.highlight === 'string' && step.highlight.trim() ? step.highlight.trim() : null;
    }
  }

  return { categoryLimit, seriesLimit, highlight };
}

/**
 * Render the chart SVG. DOM-free (tested).
 * @param {ChartModel} model
 * @param {ChartViewState} [state]
 * @param {{ mode?: 'audience' | 'reader', width?: number, height?: number }} [options]
 * @returns {string}
 */
export function chartSvg(model, state = {}, options = {}) {
  const W = options.width ?? 800;
  const H = options.height ?? 460;
  const mode = options.mode ?? 'reader';

  const hiddenSeries = state.hiddenSeries ?? new Set();
  const activeSeries = model.series.filter((s) => !hiddenSeries.has(s.key));
  const categoryLimit = state.categoryLimit ?? Infinity;
  const activeCategories = model.categories.filter((_, idx) => idx < categoryLimit);

  const hasLegend = model.series.length > 1;
  const isHorizontal = model.orientation === 'horizontal';

  // Layout boundaries
  const marginTop = hasLegend ? 54 : 30;
  const marginBottom = isHorizontal ? 40 : 64;
  const marginLeft = isHorizontal ? 100 : 70;
  const marginRight = 30;

  const plotX = marginLeft;
  const plotY = marginTop;
  const plotW = Math.max(10, W - marginLeft - marginRight);
  const plotH = Math.max(10, H - marginTop - marginBottom);

  const valMin = model.valMin;
  const valMax = model.valMax;
  const valSpan = Math.max(0.0001, valMax - valMin);

  /** Convert a data value to coordinate along the value axis. */
  const valToCoord = (/** @type {number} */ v) => {
    const fraction = (v - valMin) / valSpan;
    if (isHorizontal) {
      return plotX + fraction * plotW;
    }
    return plotY + plotH - fraction * plotH;
  };

  const zeroCoord = valToCoord(0);

  /** @type {string[]} */
  const parts = [];

  // 1. Gridlines and value ticks
  for (const tick of model.ticks) {
    const coord = valToCoord(tick);
    const firstCol = activeSeries[0]?.column ?? model.tableModel.columns[0] ?? { format: 'auto' };
    const tickFormatted = formatNumber(tick, firstCol, state.locale);

    if (isHorizontal) {
      parts.push(
        `<line x1="${coord.toFixed(1)}" y1="${plotY}" x2="${coord.toFixed(1)}" y2="${plotY + plotH}" class="slipr-chart-grid" stroke="var(--slipr-chart-grid, rgba(0,0,0,0.12))" stroke-dasharray="3,3" />`
      );
      parts.push(
        `<text x="${coord.toFixed(1)}" y="${plotY + plotH + 20}" text-anchor="middle" class="slipr-chart-axis-label" fill="var(--slipr-chart-text, #5b6573)" font-size="12">${escape(tickFormatted)}</text>`
      );
    } else {
      parts.push(
        `<line x1="${plotX}" y1="${coord.toFixed(1)}" x2="${plotX + plotW}" y2="${coord.toFixed(1)}" class="slipr-chart-grid" stroke="var(--slipr-chart-grid, rgba(0,0,0,0.12))" stroke-dasharray="3,3" />`
      );
      parts.push(
        `<text x="${plotX - 10}" y="${(coord + 4).toFixed(1)}" text-anchor="end" class="slipr-chart-axis-label" fill="var(--slipr-chart-text, #5b6573)" font-size="12">${escape(tickFormatted)}</text>`
      );
    }
  }

  // 2. Base axis line
  if (isHorizontal) {
    parts.push(
      `<line x1="${zeroCoord.toFixed(1)}" y1="${plotY}" x2="${zeroCoord.toFixed(1)}" y2="${plotY + plotH}" class="slipr-chart-axis" stroke="var(--slipr-chart-text, #5b6573)" stroke-width="1.5" />`
    );
  } else {
    parts.push(
      `<line x1="${plotX}" y1="${zeroCoord.toFixed(1)}" x2="${plotX + plotW}" y2="${zeroCoord.toFixed(1)}" class="slipr-chart-axis" stroke="var(--slipr-chart-text, #5b6573)" stroke-width="1.5" />`
    );
  }

  // 3. Bars
  const numCats = model.categories.length;
  const catSlotSize = isHorizontal ? (plotH / Math.max(1, numCats)) : (plotW / Math.max(1, numCats));
  const catPadding = catSlotSize * 0.22;
  const catBand = Math.max(4, catSlotSize - catPadding);

  const numSeries = Math.max(1, activeSeries.length);
  const seriesBand = model.stacked ? catBand : (catBand / numSeries);

  const activeHighlight = state.highlight !== undefined ? state.highlight : model.highlight;

  model.categories.forEach((cat, catIdx) => {
    const isRevealed = catIdx < categoryLimit;
    const isHl = Boolean(activeHighlight && (cat.label.toLowerCase() === activeHighlight.toLowerCase() || cat.key.toLowerCase() === activeHighlight.toLowerCase()));
    const isDimmed = Boolean(activeHighlight && !isHl);

    const groupClasses = ['slipr-chart-group'];
    if (!isRevealed) groupClasses.push('is-hidden');
    if (isHl) groupClasses.push('is-highlight');
    if (isDimmed) groupClasses.push('is-dimmed');

    parts.push(`<g class="${groupClasses.join(' ')}" data-category-index="${catIdx}">`);

    // Category label
    if (isHorizontal) {
      const catY = plotY + catIdx * catSlotSize + catSlotSize / 2;
      parts.push(
        `<text x="${plotX - 12}" y="${(catY + 4).toFixed(1)}" text-anchor="end" class="slipr-chart-cat-label" fill="var(--slipr-chart-text, #1e2329)" font-size="13">${escape(cat.label)}</text>`
      );
    } else {
      const catX = plotX + catIdx * catSlotSize + catSlotSize / 2;
      parts.push(
        `<text x="${catX.toFixed(1)}" y="${plotY + plotH + 22}" text-anchor="middle" class="slipr-chart-cat-label" fill="var(--slipr-chart-text, #1e2329)" font-size="13">${escape(cat.label)}</text>`
      );
    }

    // Series bars
    let stackPosCoord = zeroCoord;
    let stackNegCoord = zeroCoord;

    activeSeries.forEach((ser, sIdx) => {
      const origSIdx = model.series.indexOf(ser);
      const val = cat.values[origSIdx] ?? 0;
      const colFormatted = formatNumber(val, ser.column, state.locale);
      const ariaLabel = `${cat.label}, ${ser.label}: ${colFormatted}`;
      const colorVar = `var(--slipr-chart-${ser.index + 1}, var(--slipr-chart-col-${(ser.index % 6) + 1}))`;

      let x = 0;
      let y = 0;
      let w = 0;
      let h = 0;

      if (isHorizontal) {
        const barSlotY = plotY + catIdx * catSlotSize + catPadding / 2 + (model.stacked ? 0 : sIdx * seriesBand);
        y = barSlotY;
        h = Math.max(1, seriesBand - (model.stacked ? 0 : 2));

        if (model.stacked) {
          const barLen = Math.abs(valToCoord(val) - zeroCoord);
          if (val >= 0) {
            x = stackPosCoord;
            w = barLen;
            stackPosCoord += barLen;
          } else {
            x = stackNegCoord - barLen;
            w = barLen;
            stackNegCoord -= barLen;
          }
        } else {
          const coord = valToCoord(val);
          if (val >= 0) {
            x = zeroCoord;
            w = Math.max(0, coord - zeroCoord);
          } else {
            x = coord;
            w = Math.max(0, zeroCoord - coord);
          }
        }
      } else {
        const barSlotX = plotX + catIdx * catSlotSize + catPadding / 2 + (model.stacked ? 0 : sIdx * seriesBand);
        x = barSlotX;
        w = Math.max(1, seriesBand - (model.stacked ? 0 : 2));

        if (model.stacked) {
          const barLen = Math.abs(valToCoord(val) - zeroCoord);
          if (val >= 0) {
            y = stackPosCoord - barLen;
            h = barLen;
            stackPosCoord -= barLen;
          } else {
            y = stackNegCoord;
            h = barLen;
            stackNegCoord += barLen;
          }
        } else {
          const coord = valToCoord(val);
          if (val >= 0) {
            y = coord;
            h = Math.max(0, zeroCoord - coord);
          } else {
            y = zeroCoord;
            h = Math.max(0, coord - zeroCoord);
          }
        }
      }

      // Bar element (interactive & accessible)
      parts.push(
        `<g class="slipr-chart-bar" tabindex="0" role="graphics-symbol" aria-label="${escape(ariaLabel)}" data-category="${escape(cat.label)}" data-series="${escape(ser.label)}" data-value="${escape(colFormatted)}">`
      );
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${colorVar}" class="slipr-chart-bar-rect" />`
      );

      // Value label
      if (model.values && isRevealed && w > 0 && h > 0) {
        let labelX = 0;
        let labelY = 0;
        let anchor = 'middle';
        if (isHorizontal) {
          labelX = val >= 0 ? (x + w + 5) : (x - 5);
          labelY = y + h / 2 + 4;
          anchor = val >= 0 ? 'start' : 'end';
        } else {
          labelX = x + w / 2;
          labelY = val >= 0 ? (y - 5) : (y + h + 13);
          anchor = 'middle';
        }
        parts.push(
          `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}" class="slipr-chart-val-label" fill="var(--slipr-color-text, #1e2329)" font-size="11" font-weight="600">${escape(colFormatted)}</text>`
        );
      }

      parts.push(`</g>`);
    });

    parts.push(`</g>`);
  });

  // 4. Reference line
  if (model.reference) {
    const refCoord = valToCoord(model.reference.value);
    const firstCol = activeSeries[0]?.column ?? model.tableModel.columns[0] ?? { format: 'auto' };
    const refFmt = formatNumber(model.reference.value, firstCol, state.locale);
    const refText = `${model.reference.label}: ${refFmt}`;

    if (isHorizontal) {
      if (refCoord >= plotX && refCoord <= plotX + plotW) {
        parts.push(
          `<line x1="${refCoord.toFixed(1)}" y1="${plotY}" x2="${refCoord.toFixed(1)}" y2="${plotY + plotH}" class="slipr-chart-ref-line" stroke="var(--slipr-chart-highlight, #f2a900)" stroke-width="2" stroke-dasharray="4,4" />`
        );
        parts.push(
          `<text x="${(refCoord + 4).toFixed(1)}" y="${plotY + 14}" class="slipr-chart-ref-label" fill="var(--slipr-chart-highlight, #f2a900)" font-size="11" font-weight="700">${escape(refText)}</text>`
        );
      }
    } else {
      if (refCoord >= plotY && refCoord <= plotY + plotH) {
        parts.push(
          `<line x1="${plotX}" y1="${refCoord.toFixed(1)}" x2="${plotX + plotW}" y2="${refCoord.toFixed(1)}" class="slipr-chart-ref-line" stroke="var(--slipr-chart-highlight, #f2a900)" stroke-width="2" stroke-dasharray="4,4" />`
        );
        parts.push(
          `<text x="${plotX + plotW - 4}" y="${(refCoord - 5).toFixed(1)}" text-anchor="end" class="slipr-chart-ref-label" fill="var(--slipr-chart-highlight, #f2a900)" font-size="11" font-weight="700">${escape(refText)}</text>`
        );
      }
    }
  }

  // 5. Legend (if more than one series)
  if (hasLegend) {
    parts.push(`<g class="slipr-chart-legend" transform="translate(${plotX}, 20)">`);
    let legendX = 0;
    model.series.forEach((ser) => {
      const isHidden = hiddenSeries.has(ser.key);
      const colorVar = `var(--slipr-chart-${ser.index + 1}, var(--slipr-chart-col-${(ser.index % 6) + 1}))`;
      const itemCls = isHidden ? 'slipr-chart-legend-item is-hidden' : 'slipr-chart-legend-item';

      parts.push(
        `<g class="${itemCls}" data-series-key="${escape(ser.key)}" transform="translate(${legendX}, 0)">`
      );
      parts.push(
        `<rect width="12" height="12" rx="3" fill="${colorVar}" />`
      );
      parts.push(
        `<text x="18" y="10" font-size="12" fill="var(--slipr-color-text, #1e2329)">${escape(ser.label)}</text>`
      );
      parts.push(`</g>`);
      legendX += (ser.label.length * 8 + 36);
    });
    parts.push(`</g>`);
  }

  const svgClasses = ['slipr-chart-svg'];
  if (activeHighlight) svgClasses.push('has-highlight');
  if (mode === 'audience') svgClasses.push('slipr-chart-audience');

  return (
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="${svgClasses.join(' ')}" role="img" aria-label="Bar chart">`
    + `<title>${escape(model.categories.map((c) => c.label).join(', '))}</title>`
    + parts.join('')
    + `</svg>`
  );
}

/**
 * Attributes for the embed element.
 * @param {any} value
 * @param {import('./index.js').EmbedContext} ctx
 * @param {import('./index.js').EmbedOptions} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  /** @type {Record<string, string>} */
  const attrs = {
    class: 'slipr-chart',
    'data-chart': JSON.stringify(liveValue(value)),
    'data-chart-mode': options.mode === 'audience' ? 'audience' : 'reader',
  };
  if (options.slot) attrs['data-chart-slot'] = '';
  if (isCsvPath(value?.data)) attrs['data-chart-src'] = ctx.resolveAsset(value.data);
  return attrs;
}

/** Strip steps and fallback image from data attribute payload. @param {any} v */
function liveValue(v) {
  if (!v || typeof v !== 'object') return {};
  const { fallback, ...rest } = v;
  return rest;
}

/**
 * Static fallback HTML when there is no fallback image: inline rows draw the
 * SVG right away; a CSV file gets a summary note.
 * @param {any} value
 * @param {import('./index.js').EmbedContext} ctx
 * @param {import('./index.js').EmbedOptions} [options]
 * @returns {{ html: string, fallback: 'chart' }}
 */
export function staticHtml(value, ctx, options = {}) {
  const fromFile = isCsvPath(value?.data);
  let html = '';
  if (!fromFile && (Array.isArray(value?.rows) || Array.isArray(value?.columns))) {
    const model = chartModel(value, null, { locale: 'en' });
    html = `<div class="slipr-chart-frame">${chartSvg(model, {}, { mode: options.mode ?? 'reader' })}</div>`;
  } else {
    const title = value?.caption || value?.title || 'Data chart';
    html = `<div class="slipr-chart-card"><strong class="slipr-chart-card-title">${escape(title)}</strong>`
      + `<span class="slipr-chart-card-note">${escape(fromFile ? value.data : 'Chart')}</span></div>`;
  }
  return { html, fallback: 'chart' };
}

/**
 * Hidden Reveal fragments for audience mode steps.
 * @param {any} value
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 */
export function afterHtml(value, options = {}) {
  if (!options.slot || (options.mode ?? 'reader') !== 'audience') return '';
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  return steps.map((_, i) => `<span class="fragment slipr-chart-step" data-chart-step="${i + 1}" aria-hidden="true"></span>`).join('');
}

// ---------------------------------------------------------------------------
// Client hydration (browser)
// ---------------------------------------------------------------------------

/**
 * Read the CSV data if needed, render SVG, wire up tooltips, audience steps,
 * legend toggle and "Show as table".
 * @param {HTMLElement} el
 * @param {HTMLElement} live
 * @param {{ readAsset?: (path: string) => Promise<Blob | null> }} [options]
 */
export async function hydrate(el, live, options = {}) {
  const doc = el.ownerDocument;
  const raw = el.dataset.chart ? JSON.parse(el.dataset.chart) : {};
  const audience = el.dataset.chartMode === 'audience';
  const presenting = audience && Boolean(el.closest('.reveal'));

  let fileRows = null;
  let decimalComma = false;
  if (isCsvPath(raw.data)) {
    const read = options?.readAsset;
    let text = '';
    if (read) {
      const blob = await read(raw.data);
      if (!blob) throw new Error(`Chart data file "${raw.data}" not found`);
      text = await blob.text();
    } else {
      const src = el.dataset.chartSrc || raw.data;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status} reading chart data file "${raw.data}"`);
      text = await res.text();
    }
    decimalComma = detectDelimiter(text) === ';';
    fileRows = parseCsv(text);
  }

  const model = chartModel(raw, fileRows, { decimalComma });
  /** @type {ChartViewState} */
  let state = {
    view: 'chart',
    hiddenSeries: new Set(),
    categoryLimit: Infinity,
    highlight: model.highlight,
  };

  const container = doc.createElement('div');
  container.className = 'slipr-chart-container';

  // Toolbar (in reader mode)
  const toolbar = doc.createElement('div');
  toolbar.className = 'slipr-chart-toolbar';

  const viewToggleBtn = doc.createElement('button');
  viewToggleBtn.type = 'button';
  viewToggleBtn.className = 'slipr-chart-btn slipr-chart-view-toggle';
  viewToggleBtn.textContent = 'Show as table';

  let tableContainer = /** @type {HTMLElement | null} */ (null);

  viewToggleBtn.addEventListener('click', () => {
    state.view = state.view === 'chart' ? 'table' : 'chart';
    render();
  });

  if (!audience) {
    toolbar.append(viewToggleBtn);
  }

  // Tooltip
  const tooltip = doc.createElement('div');
  tooltip.className = 'slipr-chart-tooltip';
  tooltip.hidden = true;
  doc.body.append(tooltip);

  const hideTooltip = () => { tooltip.hidden = true; };

  const showTooltip = (/** @type {HTMLElement} */ barEl) => {
    const cat = barEl.dataset.category || '';
    const ser = barEl.dataset.series || '';
    const val = barEl.dataset.value || '';
    tooltip.innerHTML = `<strong>${escape(cat)}</strong><span>${escape(ser)}: ${escape(val)}</span>`;
    tooltip.hidden = false;

    const rect = barEl.getBoundingClientRect();
    const ttRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - ttRect.width / 2;
    let top = rect.top - ttRect.height - 8;
    if (top < 10) top = rect.bottom + 8;
    if (left < 10) left = 10;
    if (left + ttRect.width > doc.documentElement.clientWidth - 10) {
      left = doc.documentElement.clientWidth - 10 - ttRect.width;
    }
    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.style.top = `${top + window.scrollY}px`;
  };

  function render() {
    container.replaceChildren();

    if (state.view === 'table') {
      viewToggleBtn.textContent = 'Show as chart';
      if (!tableContainer) {
        tableContainer = doc.createElement('div');
        tableContainer.className = 'slipr-chart-table-wrap';
        tableContainer.innerHTML = tableHtml(model.tableModel, {}, { mode: 'reader', sortable: true });
        // Add Copy / Download buttons to the table toolbar
        const tToolbar = doc.createElement('div');
        tToolbar.className = 'slipr-table-toolbar';
        const copyBtn = doc.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'slipr-table-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', async () => {
          const exportRows = [
            model.tableModel.columns.map((c) => c.label),
            ...model.tableModel.rows,
          ];
          try {
            await navigator.clipboard.writeText(toCsv(exportRows, { delimiter: '\t' }));
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
          } catch {
            copyBtn.textContent = 'Failed';
          }
        });
        const dlBtn = doc.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'slipr-table-btn';
        dlBtn.textContent = 'Download CSV';
        dlBtn.addEventListener('click', () => {
          const exportRows = [
            model.tableModel.columns.map((c) => c.label),
            ...model.tableModel.rows,
          ];
          const blob = new Blob([`\ufeff${toCsv(exportRows)}`], { type: 'text/csv;charset=utf-8' });
          const a = doc.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${(raw.caption || raw.title || 'chart-data').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
          doc.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        });
        tToolbar.append(copyBtn, dlBtn);
        tableContainer.prepend(tToolbar);
      }
      container.append(tableContainer);
      return;
    }

    viewToggleBtn.textContent = 'Show as table';
    const svgWrap = doc.createElement('div');
    svgWrap.className = 'slipr-chart-frame';
    svgWrap.innerHTML = chartSvg(model, state, { mode: audience ? 'audience' : 'reader' });

    // Interactive bars (tooltips & focus)
    if (!audience) {
      svgWrap.querySelectorAll('.slipr-chart-bar').forEach((bar) => {
        const elBar = /** @type {HTMLElement} */ (bar);
        elBar.addEventListener('mouseenter', () => showTooltip(elBar));
        elBar.addEventListener('mouseleave', hideTooltip);
        elBar.addEventListener('focus', () => showTooltip(elBar));
        elBar.addEventListener('blur', hideTooltip);
        elBar.addEventListener('click', () => showTooltip(elBar));
      });

      // Interactive legend items (toggle series)
      svgWrap.querySelectorAll('.slipr-chart-legend-item').forEach((item) => {
        const elItem = /** @type {HTMLElement} */ (item);
        const sKey = elItem.dataset.seriesKey;
        if (!sKey) return;
        elItem.style.cursor = 'pointer';
        elItem.addEventListener('click', () => {
          const next = new Set(state.hiddenSeries);
          if (next.has(sKey)) {
            next.delete(sKey);
          } else if (next.size < model.series.length - 1) {
            // keep at least one series visible
            next.add(sKey);
          }
          state = { ...state, hiddenSeries: next };
          hideTooltip();
          render();
        });
      });
    }

    container.append(svgWrap);
  }

  if (toolbar.childElementCount > 0) live.append(toolbar);
  live.append(container);
  render();

  // Audience steps
  if (presenting) {
    const stepEls = /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-chart-step')]);
    const applySteps = () => {
      const activeCount = stepEls.filter((st) => st.classList.contains('visible')).length;
      const s = chartStepState(raw.steps, activeCount, model);
      state = {
        ...state,
        categoryLimit: s.categoryLimit,
        highlight: s.highlight,
      };
      render();
    };

    if (stepEls.length) {
      new MutationObserver(applySteps).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    // Reset when slide is re-entered
    const section = el.closest('section');
    if (section) {
      let present = section.classList.contains('present');
      new MutationObserver(() => {
        const now = section.classList.contains('present');
        if (now && !present) {
          applySteps();
        }
        present = now;
      }).observe(section, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // Debugging & test handle
  /** @type {any} */ (el).sliprChart = { model, get state() { return state; } };
}
