import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addChartStep,
  chartFromTable,
  chartSummary,
  chartValue,
  moveChartStep,
  newChart,
  removeChartStep,
  setChartStep,
  tableFromChart,
} from '../js/chart-values.js';
import { isChart } from '../../shared/embeds/chart.js';
import { convertBlock, setBlockType, setSlot } from '../js/actions.js';
import { slotEditorKind } from '../js/slot-values.js';
import { withFallback } from '../js/block-values.js';

const SAMPLE_CHART = {
  kind: 'bar',
  columns: [
    { key: 'cat', label: 'Cat' },
    { key: 'val1', label: 'Val 1' },
    { key: 'val2', label: 'Val 2' },
  ],
  rows: [
    ['A', 10, 20],
    ['B', 30, 40],
  ],
  category: 'cat',
  series: ['val1', 'val2'],
  orientation: 'vertical',
  steps: [{ bars: 1 }],
};

describe('chart values (I-109)', () => {
  test('newChart produces a valid default chart shape', () => {
    const c = newChart();
    assert.equal(c.kind, 'bar');
    assert.equal(c.orientation, 'vertical');
    assert.equal(c.category, 'category');
    assert.deepEqual(c.series, ['series-1', 'series-2']);
    assert.equal(c.rows.length, 3);
    assert.equal(c.columns.length, 3);
    assert.ok(isChart(c));
  });

  test('chartValue applies patches immutably and drops empty fields', () => {
    const patched = chartValue(SAMPLE_CHART, {
      caption: '',
      stacked: false,
      orientation: 'horizontal',
      highlight: 'A',
    });
    assert.equal(patched.orientation, 'horizontal');
    assert.equal(patched.highlight, 'A');
    assert.equal('caption' in patched, false);
    assert.equal('stacked' in patched, false);
    assert.deepEqual(SAMPLE_CHART.orientation, 'vertical', 'SAMPLE_CHART is immutable');
  });

  test('chartFromTable converts a table into a chart', () => {
    const tableVal = {
      columns: [
        { key: 'dept', label: 'Department' },
        { key: 'staff', label: 'Staff count', numeric: true, format: 'integer' },
        { key: 'budget', label: 'Budget (k)', numeric: true, format: 'currency' },
      ],
      rows: [
        ['Engineering', 45, 600],
        ['Sales', 30, 450],
      ],
      sortable: true,
      pinFirst: true,
      caption: 'Overview',
    };

    const chartVal = chartFromTable(tableVal);
    assert.equal(chartVal.kind, 'bar');
    assert.equal(chartVal.category, 'dept');
    assert.deepEqual(chartVal.series, ['staff', 'budget']);
    assert.equal(chartVal.orientation, 'vertical');
    assert.equal(chartVal.caption, 'Overview');
    assert.equal('sortable' in chartVal, false);
    assert.equal('pinFirst' in chartVal, false);
    assert.ok(isChart(chartVal));
  });

  test('tableFromChart converts a chart into a table', () => {
    const t = tableFromChart(SAMPLE_CHART);
    assert.equal('kind' in t, false);
    assert.equal('category' in t, false);
    assert.equal('series' in t, false);
    assert.equal('orientation' in t, false);
    assert.equal(t.sortable, true);
    assert.deepEqual(t.columns, SAMPLE_CHART.columns);
    assert.deepEqual(t.rows, SAMPLE_CHART.rows);
  });

  test('chartSummary produces human readable descriptions', () => {
    assert.equal(chartSummary(SAMPLE_CHART), 'BAR chart: 2 categories, 3 columns');
    assert.equal(chartSummary({ kind: 'bar', data: 'data/sales.csv' }), 'BAR chart from data/sales.csv');
  });

  test('steps: add, set, remove, move', () => {
    let c = addChartStep(SAMPLE_CHART, { bars: 2 });
    assert.equal(c.steps.length, 2);
    assert.deepEqual(c.steps[1], { bars: 2 });

    c = setChartStep(c, 1, { highlight: 'B' });
    assert.deepEqual(c.steps[1], { highlight: 'B' });

    c = moveChartStep(c, 0, 1);
    assert.deepEqual(c.steps[0], { highlight: 'B' });
    assert.deepEqual(c.steps[1], { bars: 1 });

    c = removeChartStep(c, 0);
    assert.equal(c.steps.length, 1);
    assert.deepEqual(c.steps[0], { bars: 1 });
  });

  test('withFallback attaches fallback image to chart value', () => {
    const fallback = { src: 'images/chart-fallback.png', alt: 'Chart fallback' };
    const withFb = withFallback(SAMPLE_CHART, fallback);
    assert.equal(withFb.kind, 'bar');
    assert.deepEqual(withFb.fallback, fallback);
    assert.equal(withFb.category, 'cat');
  });

  test('slotEditorKind identifies chart slots as chart', () => {
    assert.equal(slotEditorKind('chart', {}), 'chart');
  });

  test('actions: setBlockType converts between chart and other block types', () => {
    const show = {
      slipr: '0.1',
      slides: [
        {
          id: 's-1',
          layout: 'bullets',
          reader: {
            blocks: [
              { id: 'b-1', type: 'text', md: 'Hello' },
            ],
          },
        },
      ],
    };

    const withChart = setBlockType(show, { slideId: 's-1', blockId: 'b-1', type: 'chart' });
    assert.equal(withChart.slipr, '0.2', 'chart block upgrades format to 0.2');
    const chartBlock = withChart.slides[0].reader.blocks[0];
    assert.equal(chartBlock.type, 'chart');
    assert.equal(chartBlock.kind, 'bar');
    assert.ok(Array.isArray(chartBlock.columns));

    const withTable = setBlockType(withChart, { slideId: 's-1', blockId: 'b-1', type: 'table' });
    const tableBlock = withTable.slides[0].reader.blocks[0];
    assert.equal(tableBlock.type, 'table');
    assert.ok(Array.isArray(tableBlock.columns));
  });

  test('actions: setSlot upgrades 0.1 show to 0.2 when setting chart slot', () => {
    const show = {
      slipr: '0.1',
      slides: [
        { id: 's-1', layout: 'chart', content: {} },
      ],
    };
    const next = setSlot(show, { slideId: 's-1', slot: 'chart', value: newChart() });
    assert.equal(next.slipr, '0.2');
    assert.ok(isChart(next.slides[0].content.chart));
  });
});
