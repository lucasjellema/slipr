import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  newTable, tableValue, cellFromText, setColumnLabel, setColumn, addColumn, removeColumn, moveColumn,
  withFileColumns, addRow, removeRow, moveRow, setCell, pastedRows, tableFromPaste, pasteIntoGrid,
  inlineFromFile, tableSummary, addStep, setStep, removeStep, moveStep,
} from '../js/table-values.js';
import { isTable } from '../../shared/embeds/table.js';

const T = {
  columns: [{ key: 'region', label: 'Region' }, { key: 'revenue', label: 'Revenue', format: 'currency', total: 'sum' }],
  rows: [['North', 10], ['South', 20]],
  sort: { column: 'revenue', order: 'desc' },
  steps: [{ highlight: { column: 'revenue' } }, { highlight: { row: 1, column: 'revenue' } }],
};

describe('table values (I-104)', () => {
  it('a new table is a valid table with two columns and two empty rows', () => {
    const t = newTable();
    assert.ok(isTable(t));
    assert.deepEqual(t.rows, [[null, null], [null, null]]);
  });

  it('patching removes empty fields and false flags, keeps empty rows', () => {
    assert.deepEqual(tableValue({ a: 1, sortable: true }, { sortable: false, caption: '', rows: [] }), { a: 1, rows: [] });
  });

  it('typed cells: empty → null, plain numbers → numbers, the rest stays text', () => {
    assert.equal(cellFromText(''), null);
    assert.equal(cellFromText(' 12.5 '), 12.5);
    assert.equal(cellFromText('-3'), -3);
    assert.equal(cellFromText('007'), '007');
    assert.equal(cellFromText('1,5'), '1,5');
    assert.equal(cellFromText('Q1'), 'Q1');
  });

  it('renaming a typed-in column changes its key, and sort and steps follow', () => {
    const t = setColumnLabel(T, 1, 'Sales (EUR)');
    assert.deepEqual(t.columns[1], { key: 'sales-eur', label: 'Sales (EUR)', format: 'currency', total: 'sum' });
    assert.equal(t.sort.column, 'sales-eur');
    assert.deepEqual(t.steps.map((s) => s.highlight.column), ['sales-eur', 'sales-eur']);
    assert.equal(setColumnLabel(T, 1, 'Region').columns[1].key, 'region-2');
  });

  it('a file column keeps its key when renamed', () => {
    const t = setColumnLabel({ data: 'data/x.csv', columns: [{ key: 'rev' }] }, 0, 'Revenue');
    assert.deepEqual(t.columns, [{ key: 'rev', label: 'Revenue' }]);
  });

  it('column settings drop what does not fit the format', () => {
    const t = setColumn(T, 1, { format: 'text', hidden: false });
    assert.deepEqual(t.columns[1], { key: 'revenue', label: 'Revenue', format: 'text', total: 'sum' });
    assert.deepEqual(setColumn(T, 1, { decimals: 2 }).columns[1].decimals, 2);
    assert.equal(setColumn(T, 0, { decimals: 2 }).columns[0].decimals, undefined);
  });

  it('adds, removes and moves columns with their cells; a removed column leaves sort and steps', () => {
    const added = addColumn(T, 'Note');
    assert.equal(added.columns[2].key, 'note');
    assert.deepEqual(added.rows[0], ['North', 10, null]);
    const removed = removeColumn(T, 1);
    assert.deepEqual(removed.rows, [['North'], ['South']]);
    assert.equal(removed.sort, undefined);
    assert.deepEqual(removed.steps, [{ highlight: null }, { highlight: { row: 1 } }]);
    const moved = moveColumn(T, 0, 1);
    assert.deepEqual(moved.columns.map((c) => c.key), ['revenue', 'region']);
    assert.deepEqual(moved.rows[0], [10, 'North']);
    assert.equal(moveColumn(T, 0, 5), T);
  });

  it('file columns: only settings change, and every header gets an entry', () => {
    const file = { data: 'data/x.csv', columns: [{ key: 'b' }] };
    assert.deepEqual(withFileColumns(file, ['a', 'b', 'c']).columns, [{ key: 'b' }, { key: 'a' }, { key: 'c' }]);
    assert.equal(withFileColumns(file, ['b']), file);
    assert.equal(addColumn(file).rows, undefined);
  });

  it('adds, removes and moves rows; sets cells', () => {
    assert.deepEqual(addRow(T).rows[2], [null, null]);
    assert.deepEqual(addRow(T, 0).rows[0], [null, null]);
    assert.deepEqual(removeRow(T, 0).rows, [['South', 20]]);
    assert.deepEqual(moveRow(T, 1, 0).rows, [['South', 20], ['North', 10]]);
    assert.deepEqual(setCell(T, 1, 1, '25').rows[1], ['South', 25]);
    assert.deepEqual(setCell(T, 0, 0, '').rows[0], [null, 10]);
  });

  it('reads pasted spreadsheet text (tabs) or CSV', () => {
    assert.deepEqual(pastedRows('a\tb\r\n1\t2\n'), [['a', 'b'], ['1', '2']]);
    assert.deepEqual(pastedRows('a;b\n1,5;2'), [['a', 'b'], ['1,5', '2']]);
    assert.deepEqual(pastedRows('"a",b\n1,2'), [['a', 'b'], ['1', '2']]);
  });

  it('a paste with headers replaces the table, keeping settings of columns with the same header', () => {
    const t = tableFromPaste(T, 'Region\tRevenue\tYear\nEast\t30\t2026\n\n');
    assert.deepEqual(t.columns, [{ key: 'region', label: 'Region' }, { key: 'revenue', label: 'Revenue', format: 'currency', total: 'sum' }, { key: 'year', label: 'Year' }]);
    assert.deepEqual(t.rows, [['East', 30, 2026]]);
    assert.equal(t.sort, undefined);
    assert.equal(t.steps, undefined);
  });

  it('a paste into a cell fills the block there, growing the table', () => {
    const t = pasteIntoGrid(T, 1, 1, '21\tx\n31\ty');
    assert.equal(t.columns.length, 3);
    assert.deepEqual(t.rows, [['North', 10, null], ['South', 21, 'x'], [null, 31, 'y']]);
  });

  it('moves a CSV file into the slide, with decimal commas read', () => {
    const t = inlineFromFile({ data: 'data/x.csv', columns: [{ key: 'v', label: 'Value', format: 'number' }], caption: 'c' }, [['name', 'v', 'p'], ['a', '1,5', '12,5%'], ['b', '', '-5%']], { decimalComma: true });
    assert.equal(t.data, undefined);
    assert.deepEqual(t.columns, [{ key: 'v', label: 'Value', format: 'number' }, { key: 'name' }, { key: 'p' }]);
    assert.deepEqual(t.rows, [[1.5, 'a', 0.125], [null, 'b', -0.05]]);
    assert.deepEqual(inlineFromFile({}, [['code'], ['007']]).rows, [['007']]);
    assert.equal(t.caption, 'c');
  });

  it('summaries', () => {
    assert.equal(tableSummary(T), 'Table: 2 rows × 2 columns');
    assert.equal(tableSummary({ data: 'data/x.csv' }), 'Table from data/x.csv');
  });

  it('steps: add, change, remove, move', () => {
    let t = addStep({}, { rows: 1 });
    t = addStep(t, { rows: 'all' });
    t = setStep(t, 0, { rows: 2 });
    assert.deepEqual(moveStep(t, 1, 0).steps, [{ rows: 'all' }, { rows: 2 }]);
    assert.equal(removeStep(removeStep(t, 0), 0).steps, undefined);
  });
});

describe('table blocks and slots in the editor (I-104)', async () => {
  const { convertBlock, setBlockType, setSlot, BLOCK_TYPES } = await import('../js/actions.js');
  const { slotEditorKind } = await import('../js/slot-values.js');
  const { serializeShow } = await import('../js/io/serialize.js');

  it('a block becomes a table with two columns and two rows, keeping its title', () => {
    assert.ok(BLOCK_TYPES.includes('table'));
    const b = convertBlock({ id: 'b1', type: 'details', title: 'Numbers', md: 'x', depth: 3 }, 'table');
    assert.deepEqual(b, { id: 'b1', type: 'table', depth: 3, title: 'Numbers', columns: [{ key: 'column-1', label: 'Column 1' }, { key: 'column-2', label: 'Column 2' }], rows: [[null, null], [null, null]] });
  });

  it('a table block or slot makes a 0.1 show 0.2', () => {
    const show = { slipr: '0.1', slides: [{ id: 's1', layout: 'table', content: {}, reader: { blocks: [{ id: 'b1', type: 'text', md: '' }] } }] };
    assert.equal(setBlockType(show, { slideId: 's1', blockId: 'b1', type: 'table' }).slipr, '0.2');
    assert.equal(setSlot(show, { slideId: 's1', slot: 'table', value: { columns: [{ key: 'a' }], rows: [] } }).slipr, '0.2');
  });

  it('table slots get the table editor', () => {
    assert.equal(slotEditorKind('table', undefined), 'table');
  });

  it('saves table keys in the spec order', () => {
    const show = { slipr: '0.2', slides: [{ id: 's1', content: { t: { steps: [{ highlight: { column: 'a', row: 1 } }], rows: [[1]], columns: [{ total: 'sum', key: 'a' }] } } }] };
    const text = serializeShow(show);
    assert.ok(text.indexOf('"columns"') < text.indexOf('"rows"') && text.indexOf('"rows"') < text.indexOf('"steps"'));
    assert.ok(text.indexOf('"key"') < text.indexOf('"total"'));
    assert.ok(text.indexOf('"row"') < text.indexOf('"column": "a"'));
  });
});
