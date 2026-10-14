import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { menuTargetIndex, menuTypeAheadIndex } from '../js/menu-nav.js';

describe('menu keyboard movement (I-102)', () => {
  it('arrow keys move and wrap', () => {
    assert.equal(menuTargetIndex('ArrowDown', 0, 3), 1);
    assert.equal(menuTargetIndex('ArrowDown', 2, 3), 0);
    assert.equal(menuTargetIndex('ArrowUp', 0, 3), 2);
    assert.equal(menuTargetIndex('ArrowUp', 2, 3), 1);
  });

  it('starts at the first or last item when none has focus', () => {
    assert.equal(menuTargetIndex('ArrowDown', -1, 3), 0);
    assert.equal(menuTargetIndex('ArrowUp', -1, 3), 2);
  });

  it('Home and End go to the ends', () => {
    assert.equal(menuTargetIndex('Home', 1, 4), 0);
    assert.equal(menuTargetIndex('End', 1, 4), 3);
  });

  it('other keys and empty menus do not move', () => {
    assert.equal(menuTargetIndex('Enter', 1, 3), null);
    assert.equal(menuTargetIndex('ArrowDown', -1, 0), null);
  });

  it('type-ahead finds the next label with that letter, past leading symbols', () => {
    const labels = ['◐ System', '☀ Light', '☾ Dark', 'Help', 'Keyboard shortcuts'];
    assert.equal(menuTypeAheadIndex('l', 0, labels), 1);
    assert.equal(menuTypeAheadIndex('D', 0, labels), 2);
    assert.equal(menuTypeAheadIndex('s', 0, labels), 0); // wraps around to itself
    assert.equal(menuTypeAheadIndex('x', 0, labels), null);
    assert.equal(menuTypeAheadIndex(' ', 0, labels), null);
  });
});
