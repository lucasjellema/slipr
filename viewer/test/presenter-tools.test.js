import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_KEYS, strokePath, toolAfterKey } from '../audience/presenter-tools.js';

describe('presenter tools (I-003)', () => {
  test('L, K and D pick the laser, the spotlight and the pen', () => {
    assert.deepEqual(TOOL_KEYS, { 76: 'laser', 75: 'spotlight', 68: 'pen' });
  });

  test('one tool at a time; its own key turns it off', () => {
    assert.equal(toolAfterKey(null, 'laser'), 'laser');
    assert.equal(toolAfterKey('laser', 'pen'), 'pen');
    assert.equal(toolAfterKey('pen', 'pen'), null);
  });

  test('strokes are fractions of the slide, drawn at any size', () => {
    assert.deepEqual(strokePath([{ x: 0.5, y: 0.25 }, { x: 1, y: 1 }], { width: 1920, height: 1080 }), [{ x: 960, y: 270 }, { x: 1920, y: 1080 }]);
  });
});
