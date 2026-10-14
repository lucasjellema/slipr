import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseCsv, toCsv } from '../csv.js';
import {
  cellNumber, columnRanges, columnTotals, formatCell, isTable, resolveHighlight,
  staticHtml, tableHtml, tableModel, tableStepState, viewRows, afterHtml, attributes,
} from '../embeds/table.js';
import { isGraph } from '../embeds/graph.js';
import { usedEmbedKinds } from '../embeds/index.js';

const SALES = {
  columns: [
    { key: 'region', label: 'Region' },
    { key: 'revenue', label: 'Revenue', format: 'currency', currency: 'EUR', decimals: 0, total: 'sum', visual: 'bar' },
    { key: 'growth', format: 'percent', decimals: 1, visual: 'sign' },
    { key: 'note', format: 'markdown', hidden: true },
  ],
  rows: [
    ['North', 1200, 0.125, 'See [[template]]'],
    ['South', 800, -0.05, null],
    ['East', 1500, 0.2, '**best**'],
    ['West', null, 0, ''],
  ],
};

describe('CSV (I-104)', () => {
  it('detects comma, semicolon and tab', () => {
    assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
    assert.equal(detectDelimiter('a;b;c\n1,5;2;3'), ';');
    assert.equal(detectDelimiter('a\tb\n1\t2'), '\t');
    assert.equal(detectDelimiter('"x,y";z\n'), ';');
    assert.equal(detectDelimiter('single'), ',');
  });

  it('parses quotes, doubled quotes, line breaks in quotes, CRLF and a BOM; skips empty lines', () => {
    const rows = parseCsv('﻿name,note\r\n"Smith, J.","said ""hi""\nthen left"\r\n\r\nLee,  plain  \n');
    assert.deepEqual(rows, [['name', 'note'], ['Smith, J.', 'said "hi"\nthen left'], ['Lee', 'plain']]);
  });

  it('keeps empty fields and a last line without a line break', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,,3\n,,'), [['a', 'b', 'c'], ['1', '', '3'], ['', '', '']]);
  });

  it('writes CSV that reads back the same', () => {
    const rows = [['a', 'b, c'], ['x"y', 'line\nbreak'], [1, null]];
    assert.deepEqual(parseCsv(toCsv(rows)), [['a', 'b, c'], ['x"y', 'line\nbreak'], ['1', '']]);
    assert.equal(toCsv([['a', 'b']], { delimiter: '\t' }), 'a\tb');
  });
});

describe('table values (I-104)', () => {
  it('recognises tables, and graphs no longer take CSV data', () => {
    assert.ok(isTable({ rows: [] }));
    assert.ok(isTable({ data: 'data/x.csv' }));
    assert.ok(isTable({ columns: [{ key: 'a' }] }));
    assert.ok(!isTable({ data: 'data/x.json' }));
    assert.ok(!isTable('text'));
    assert.ok(!isGraph({ data: 'data/x.csv' }));
    assert.ok(isGraph({ data: 'data/x.json' }));
  });

  it('reads numbers: numbers, text, percent signs and (optionally) a decimal comma', () => {
    assert.equal(cellNumber(3), 3);
    assert.equal(cellNumber(' -12.5 '), -12.5);
    assert.equal(cellNumber('1e3'), 1000);
    assert.equal(cellNumber('12%'), 0.12);
    assert.equal(cellNumber('1234,5'), null);
    assert.equal(cellNumber('1234,5', { decimalComma: true }), 1234.5);
    assert.equal(cellNumber('abc'), null);
    assert.equal(cellNumber(''), null);
    assert.equal(cellNumber(null), null);
  });
});

describe('table model (I-104)', () => {
  it('builds inline columns with formats, alignment and numeric detection', () => {
    const m = tableModel(SALES);
    assert.deepEqual(m.columns.map((c) => [c.key, c.format, c.numeric, c.align]), [
      ['region', 'text', false, 'start'], ['revenue', 'currency', true, 'end'], ['growth', 'percent', true, 'end'], ['note', 'markdown', false, 'start'],
    ]);
    assert.equal(m.columns[0].label, 'Region');
    assert.equal(m.columns[2].label, 'growth');
    assert.equal(m.rows.length, 4);
  });

  it('orders a file’s columns: configured first, then the others in file order; detects numbers', () => {
    const m = tableModel({ columns: [{ key: 'b', label: 'Bee' }] }, [['a', 'b', 'c'], ['x', '1', '2'], ['y', '3', '4,5']], { decimalComma: true });
    assert.deepEqual(m.columns.map((c) => c.key), ['b', 'a', 'c']);
    assert.deepEqual(m.rows[1], ['3', 'y', '4,5']);
    assert.equal(m.columns[2].format, 'auto');
    assert.equal(m.columns[2].numeric, true);
    assert.equal(m.columns[1].numeric, false);
  });

  it('drops totals and visuals on columns without numbers (count is fine)', () => {
    const m = tableModel({ columns: [{ key: 'a', total: 'sum', visual: 'bar' }, { key: 'b', total: 'count' }], rows: [['x', 'y']] });
    assert.equal(m.columns[0].total, undefined);
    assert.equal(m.columns[0].visual, undefined);
    assert.equal(m.columns[1].total, 'count');
  });

  it('formats cells by column format and locale; detected numbers as written', () => {
    const m = tableModel(SALES);
    assert.equal(formatCell(1200, m.columns[1], 'en-US'), '€1,200');
    assert.equal(formatCell(0.125, m.columns[2], 'en-US'), '12.5%');
    assert.equal(formatCell(1200, m.columns[1], 'nl-NL').replace(/\s/g, ' '), '€ 1.200');
    const auto = tableModel({}, [['year'], ['2026']]).columns[0];
    assert.equal(formatCell('2026', auto, 'en-US'), '2026');
    assert.equal(formatCell('2026-10-14', { key: 'd', label: 'd', format: 'date', numeric: false, align: 'start', hidden: false }, 'en-US'), 'Oct 14, 2026');
    assert.equal(formatCell(null, m.columns[1], 'en-US'), '');
  });
});

describe('table view (I-104)', () => {
  const m = tableModel(SALES);

  it('sorts numbers and text (stable, empty cells last), both ways', () => {
    assert.deepEqual(viewRows(m, { sort: { column: 'revenue', order: 'asc' } }), [1, 0, 2, 3]);
    assert.deepEqual(viewRows(m, { sort: { column: 'revenue', order: 'desc' } }), [2, 0, 1, 3]);
    assert.deepEqual(viewRows(m, { sort: { column: 'region', order: 'asc' } }), [2, 0, 1, 3]);
    assert.deepEqual(viewRows(m, {}), [0, 1, 2, 3]);
  });

  it('filters on the shown columns, ignoring case, also on formatted text', () => {
    assert.deepEqual(viewRows(m, { filter: 'th' }), [0, 1]);
    assert.deepEqual(viewRows(m, { filter: 'BEST' }), []); // the note column is hidden
    assert.deepEqual(viewRows(m, { filter: 'best', hidden: new Set() }), [2]);
    assert.deepEqual(viewRows(m, { filter: '12.5%', locale: 'en-US' }), [0]);
  });

  it('limits to revealed rows (data order), then sorts', () => {
    assert.deepEqual(viewRows(m, { rowLimit: 2, sort: { column: 'revenue', order: 'desc' } }), [0, 1]);
  });

  it('totals over the rows on show', () => {
    assert.equal(columnTotals(m, [0, 1, 2, 3]).get('revenue'), 3500);
    assert.equal(columnTotals(m, [0, 1]).get('revenue'), 2000);
    const t = tableModel({ columns: [{ key: 'n', total: 'avg' }, { key: 'c', total: 'count' }, { key: 'lo', total: 'min' }, { key: 'hi', total: 'max' }], rows: [[2, 'a', 5, 5], [4, '', 1, 9], [null, 'b', 3, 1]] });
    const totals = columnTotals(t, [0, 1, 2]);
    assert.deepEqual([totals.get('n'), totals.get('c'), totals.get('lo'), totals.get('hi')], [3, 2, 1, 9]);
  });

  it('ranges for visuals over all rows', () => {
    assert.deepEqual(columnRanges(m).get('revenue'), { min: 800, max: 1500, maxAbs: 1500 });
    assert.deepEqual(columnRanges(m).get('growth'), { min: -0.05, max: 0.2, maxAbs: 0.2 });
  });
});

describe('table steps (I-104)', () => {
  const m = tableModel(SALES);
  const steps = [{ rows: 2 }, { highlight: { column: 'growth' } }, { highlight: { row: 'east' } }, { rows: 'all' }, { highlight: { row: 1, column: 'revenue' } }, { highlight: null }];

  it('starts with no rows once a rows step exists, and follows the steps', () => {
    assert.deepEqual(tableStepState(steps, 0, m), { rowLimit: 0, highlight: null });
    assert.deepEqual(tableStepState(steps, 1, m), { rowLimit: 2, highlight: null });
    assert.deepEqual(tableStepState(steps, 2, m), { rowLimit: 2, highlight: { row: null, column: 'growth' } });
    assert.deepEqual(tableStepState(steps, 3, m), { rowLimit: 2, highlight: { row: 2, column: null } });
    assert.deepEqual(tableStepState(steps, 4, m), { rowLimit: Infinity, highlight: null });
    assert.deepEqual(tableStepState(steps, 5, m), { rowLimit: Infinity, highlight: { row: 0, column: 'revenue' } });
    assert.deepEqual(tableStepState(steps, 6, m), { rowLimit: Infinity, highlight: null });
  });

  it('shows every row without rows steps', () => {
    assert.equal(tableStepState([{ highlight: { column: 'growth' } }], 0, m).rowLimit, Infinity);
  });

  it('ignores highlights of rows and columns that are not there', () => {
    assert.equal(resolveHighlight({ row: 9 }, m), null);
    assert.equal(resolveHighlight({ column: 'nope' }, m), null);
    assert.deepEqual(resolveHighlight({ row: 9, column: 'growth' }, m), { row: null, column: 'growth' });
  });
});

describe('table markup (I-104)', () => {
  const m = tableModel(SALES);

  it('writes an accessible table: header cells, row headers, sort buttons and aria-sort, totals in the footer', () => {
    const html = tableHtml(m, { locale: 'en-US', sort: { column: 'revenue', order: 'desc' } }, { sortable: true });
    assert.match(html, /<th scope="col" class="is-end is-num" aria-sort="descending"><button type="button" class="slipr-table-sort" data-sort="revenue"/);
    assert.match(html, /<th scope="row" class="is-start">East<\/th>/);
    assert.match(html, /<tfoot><tr><th scope="row" class="is-start">Total<\/th><td class="is-end is-num" title="Sum">€3,500<\/td>/);
    assert.doesNotMatch(html, /best/); // hidden column
  });

  it('marks visuals and highlights; escapes text; renders Markdown cells', () => {
    const html = tableHtml(m, { locale: 'en-US', hidden: new Set() }, { highlight: { row: null, column: 'growth' } });
    assert.match(html, /class="slipr-table-grid has-highlight"/);
    assert.match(html, /is-bar" style="--slipr-table-level:0\.800"/);
    assert.match(html, /is-highlight is-negative/);
    assert.match(html, /<strong>best<\/strong>/);
    const evil = tableHtml(tableModel({ columns: [{ key: 'a' }], rows: [['<img onerror=x>']] }));
    assert.doesNotMatch(evil, /<img/);
  });

  it('pins the first column and says when nothing matches', () => {
    const html = tableHtml(m, { filter: 'zzz' }, { pinFirst: true, empty: 'No rows' });
    assert.match(html, /is-pinned/);
    assert.match(html, /<tr class="slipr-table-empty"><td colspan="3">No rows<\/td><\/tr>/);
  });

  it('static content: the table, or for a CSV file its header and a note; step fragments in audience slots', () => {
    assert.match(staticHtml(SALES, {}).html, /North/);
    const file = staticHtml({ data: 'data/sales.csv', columns: [{ key: 'region' }] }, {});
    assert.match(file.html, /<th scope="col" class="is-start">region<\/th>/);
    assert.match(file.html, /The rows are in sales\.csv\./);
    // Print, thumbnails and the editor show every row; steps apply in a running presentation only.
    assert.equal(staticHtml({ ...SALES, steps: [{ rows: 1 }] }, {}, { mode: 'audience', slot: true }).html.includes('South'), true);
    assert.equal(afterHtml({ steps: [{ rows: 1 }, { rows: 2 }] }, { mode: 'audience', slot: true }).match(/class="fragment slipr-table-step"/g)?.length, 2);
    assert.equal(afterHtml({ steps: [{ rows: 1 }] }, { mode: 'reader', slot: true }), '');
  });

  it('attributes: the value without its fallback, the file address, the locale from the show', () => {
    const a = attributes({ ...SALES, data: 'data/s.csv', maxRows: 5, fallback: { src: 'x.png', alt: '' } }, { resolveAsset: (s) => `/show/${s}`, show: { meta: { language: 'nl' } } }, { mode: 'audience', slot: true });
    assert.equal(a['data-table-src'], '/show/data/s.csv');
    assert.equal(a['data-table-locale'], 'nl');
    assert.equal(a['data-table-mode'], 'audience');
    assert.equal(a.style, '--slipr-table-max-rows:5');
    assert.equal(JSON.parse(a['data-table']).fallback, undefined);
  });

  it('counts as a used embed kind (export, libraries)', () => {
    const kinds = usedEmbedKinds({ slides: [{ content: { t: SALES } }, { reader: { blocks: [{ id: 'b', type: 'table', rows: [] }] } }] });
    assert.ok(kinds.has('table'));
    assert.ok(!kinds.has('graph'));
  });
});
