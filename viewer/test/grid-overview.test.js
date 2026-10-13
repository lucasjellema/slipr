import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chunkRows, gridColumns, moveInGrid } from '../audience/grid-overview.js';

describe('grid overview (I-098)', () => {
  test('columns follow the width, 2 to 8', () => {
    assert.equal(gridColumns(1200), 4);
    assert.equal(gridColumns(1920), 6);
    assert.equal(gridColumns(375), 2);
    assert.equal(gridColumns(5000), 8);
  });

  test('items wrap into rows', () => {
    assert.deepEqual(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkRows([], 3), []);
  });

  test('arrow keys move through rows of different lengths', () => {
    const rows = [4, 2, 4];
    assert.deepEqual(moveInGrid(rows, 0, 3, 'ArrowDown'), { row: 1, col: 1 }, 'a shorter row: its last slide');
    assert.deepEqual(moveInGrid(rows, 1, 1, 'ArrowRight'), { row: 2, col: 0 }, 'wraps to the next row');
    assert.deepEqual(moveInGrid(rows, 2, 0, 'ArrowLeft'), { row: 1, col: 1 });
    assert.deepEqual(moveInGrid(rows, 0, 0, 'ArrowUp'), { row: 0, col: 0 }, 'stays at the edge');
    assert.deepEqual(moveInGrid(rows, 2, 3, 'ArrowRight'), { row: 2, col: 3 });
    assert.deepEqual(moveInGrid(rows, 1, 0, 'End'), { row: 2, col: 3 });
    assert.deepEqual(moveInGrid(rows, 1, 0, 'Home'), { row: 0, col: 0 });
  });
});
