import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterHtml,
  attributes,
  calculateTicks,
  chartModel,
  chartStepState,
  chartSvg,
  isChart,
  staticHtml,
} from '../embeds/chart.js';

const INLINE_CHART = {
  kind: 'bar',
  columns: [
    { key: 'category', label: 'Quarter' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'profit', label: 'Profit' },
  ],
  rows: [
    ['Q1', 120, 30],
    ['Q2', 150, 45],
    ['Q3', 90, 15],
    ['Q4', 210, 60],
  ],
  category: 'category',
  series: ['revenue', 'profit'],
  orientation: 'vertical',
  values: true,
  reference: 'average',
  highlight: 'Q2',
  steps: [
    { bars: 2 },
    { bars: 'all' },
    { highlight: 'Q4' },
    { highlight: null },
  ],
};

describe('chart model (I-109)', () => {
  it('isChart accepts valid chart objects and rejects non-charts', () => {
    assert.equal(isChart({ kind: 'bar' }), true);
    assert.equal(isChart({ type: 'chart' }), true);
    assert.equal(isChart({ category: 'c', series: ['s'], rows: [] }), true);
    assert.equal(isChart({ category: 'c', data: 'data/sales.csv' }), true);
    assert.equal(isChart(null), false);
    assert.equal(isChart(42), false);
    assert.equal(isChart('bar'), false);
    assert.equal(isChart({ columns: [{ key: 'a' }], rows: [] }), false);
  });

  it('calculateTicks generates round ticks covering [min, max]', () => {
    const ticks1 = calculateTicks(0, 100);
    assert.equal(ticks1.min <= 0, true);
    assert.equal(ticks1.max >= 100, true);
    assert.equal(ticks1.ticks.length >= 4 && ticks1.ticks.length <= 8, true);

    const ticks2 = calculateTicks(-20, 30);
    assert.equal(ticks2.min <= -20, true);
    assert.equal(ticks2.max >= 30, true);
    assert.ok(ticks2.ticks.includes(0));

    const ticksEqual = calculateTicks(0, 0);
    assert.equal(ticksEqual.min, 0);
    assert.equal(ticksEqual.max, 10);
  });

  it('builds category and series models from inline data', () => {
    const model = chartModel(INLINE_CHART);
    assert.equal(model.kind, 'bar');
    assert.equal(model.orientation, 'vertical');
    assert.equal(model.stacked, false);
    assert.equal(model.values, true);
    assert.equal(model.categories.length, 4);
    assert.deepEqual(model.categories.map((c) => c.key), ['Q1', 'Q2', 'Q3', 'Q4']);
    assert.equal(model.series.length, 2);
    assert.deepEqual(model.series.map((s) => s.key), ['revenue', 'profit']);
    assert.equal(model.highlight, 'Q2');
    assert.ok(model.reference);
    assert.equal(model.reference.label, 'Average');
    assert.ok(model.reference.value > 0);
  });

  it('supports horizontal orientation and stacked mode', () => {
    const model = chartModel({ ...INLINE_CHART, horizontal: true, stacked: true });
    assert.equal(model.orientation, 'horizontal');
    assert.equal(model.stacked, true);
  });

  it('supports sorting by value', () => {
    const desc = chartModel({ ...INLINE_CHART, sort: 'desc' });
    const valsDesc = desc.categories.map((c) => c.values[0]);
    assert.deepEqual(valsDesc, [210, 150, 120, 90]);

    const asc = chartModel({ ...INLINE_CHART, sort: 'asc' });
    const valsAsc = asc.categories.map((c) => c.values[0]);
    assert.deepEqual(valsAsc, [90, 120, 150, 210]);
  });

  it('supports numeric and object reference lines', () => {
    const numRef = chartModel({ ...INLINE_CHART, reference: 100 });
    assert.deepEqual(numRef.reference, { value: 100, label: 'Target' });

    const objRef = chartModel({ ...INLINE_CHART, reference: { value: 75, label: 'Budget' } });
    assert.deepEqual(objRef.reference, { value: 75, label: 'Budget' });
  });
});

describe('chartStepState (I-109)', () => {
  it('tracks revealed categories, series limit and highlights across steps', () => {
    const model = chartModel(INLINE_CHART);

    // Initial state (count = 0) with a category step starts with categoryLimit = 0
    const s0 = chartStepState(INLINE_CHART.steps, 0, model);
    assert.equal(s0.categoryLimit, 0);

    // Step 1: bars: 2
    const s1 = chartStepState(INLINE_CHART.steps, 1, model);
    assert.equal(s1.categoryLimit, 2);

    // Step 2: bars: "all"
    const s2 = chartStepState(INLINE_CHART.steps, 2, model);
    assert.equal(s2.categoryLimit, Infinity);

    // Step 3: highlight: "Q4"
    const s3 = chartStepState(INLINE_CHART.steps, 3, model);
    assert.equal(s3.highlight, 'Q4');

    // Step 4: highlight: null clears highlight
    const s4 = chartStepState(INLINE_CHART.steps, 4, model);
    assert.equal(s4.highlight, null);
  });
});

describe('chartSvg rendering (I-109)', () => {
  it('renders responsive SVG with accessibility, bars, ticks and legend', () => {
    const model = chartModel(INLINE_CHART);
    const svg = chartSvg(model);
    assert.match(svg, /^<svg viewBox="0 0 800 460" preserveAspectRatio="xMidYMid meet" class="slipr-chart-svg has-highlight"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /class="slipr-chart-bar"/);
    assert.match(svg, /class="slipr-chart-val-label"/);
    assert.match(svg, /class="slipr-chart-ref-line"/);
    assert.match(svg, /class="slipr-chart-legend"/);
  });

  it('renders horizontal bars and dimming for non-highlighted categories', () => {
    const model = chartModel({ ...INLINE_CHART, orientation: 'horizontal', highlight: 'Q1' });
    const svg = chartSvg(model, { highlight: 'Q1' });
    assert.match(svg, /class="slipr-chart-group is-highlight"/);
    assert.match(svg, /class="slipr-chart-group is-dimmed"/);
  });

  it('respects hiddenSeries from reader legend toggles', () => {
    const model = chartModel(INLINE_CHART);
    const hidden = new Set(['revenue']);
    const svg = chartSvg(model, { hiddenSeries: hidden });
    assert.doesNotMatch(svg, /data-series="Revenue"/);
    assert.match(svg, /data-series="Profit"/);
  });
});

describe('attributes, staticHtml and afterHtml (I-109)', () => {
  const ctx = {
    resolveAsset: (src) => `resolved/${src}`,
    template: {},
  };

  it('attributes produces data-chart and mode', () => {
    const attrs = attributes(INLINE_CHART, ctx, { mode: 'audience', slot: true });
    assert.equal(attrs.class, 'slipr-chart');
    assert.equal(attrs['data-chart-mode'], 'audience');
    assert.ok(attrs['data-chart'].includes('revenue'));
    assert.ok(attrs['data-chart'].includes('steps'));
    assert.equal('data-chart-slot' in attrs, true);
  });

  it('staticHtml renders inline SVG directly, or fallback card for CSV', () => {
    const inline = staticHtml(INLINE_CHART, ctx, { mode: 'reader' });
    assert.equal(inline.fallback, 'chart');
    assert.match(inline.html, /<div class="slipr-chart-frame"><svg/);

    const fromCsv = staticHtml({ kind: 'bar', data: 'data/sales.csv', caption: 'Sales' }, ctx);
    assert.match(fromCsv.html, /<div class="slipr-chart-card">/);
    assert.match(fromCsv.html, /data\/sales\.csv/);
  });

  it('afterHtml generates Reveal fragments for audience mode slots with steps', () => {
    const fragments = afterHtml(INLINE_CHART, { mode: 'audience', slot: true });
    assert.match(fragments, /<span class="fragment slipr-chart-step" data-chart-step="1"/);
    assert.match(fragments, /<span class="fragment slipr-chart-step" data-chart-step="4"/);

    // No fragments for reader mode or without steps
    assert.equal(afterHtml(INLINE_CHART, { mode: 'reader', slot: true }), '');
    assert.equal(afterHtml({ kind: 'bar', rows: [] }, { mode: 'audience', slot: true }), '');
  });
});
