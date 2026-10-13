import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pictureStyle, pictureAttributes } from '../picture.js';

describe('picture style and opacity (D-014, I-084)', () => {
  test('a style id becomes the template class; opacity below 1 is kept', () => {
    const none = { viewBox: null, crop: null, morphId: null };
    assert.deepEqual(pictureStyle({ src: 'a.png', style: 'soft', opacity: 0.25 }), { className: 'slipr-picture-soft', opacity: '0.25', ...none });
    assert.deepEqual(pictureStyle({ src: 'a.png' }), { className: null, opacity: null, ...none });
    assert.deepEqual(pictureStyle({ src: 'a.png', opacity: 1 }), { className: null, opacity: null, ...none });
    assert.deepEqual(pictureStyle({ src: 'a.png', opacity: 0 }), { className: null, opacity: '0', ...none });
  });

  test('malformed values add nothing', () => {
    for (const style of ['Shadow', 'a b', '"x', '', 3]) assert.equal(pictureStyle({ style }).className, null, String(style));
    for (const opacity of ['0.5', NaN, null]) assert.equal(pictureStyle({ opacity }).opacity, null, String(opacity));
    assert.deepEqual(pictureStyle(undefined), { className: null, opacity: null, viewBox: null, crop: null, morphId: null });
  });

  test('a morph name (I-091) becomes data-morph-id; malformed ones are dropped', () => {
    assert.equal(pictureStyle({ morphId: 'robot-1' }).morphId, 'robot-1');
    for (const morphId of ['', 'two words', '"x', '-lead', 'x'.repeat(61), 3]) assert.equal(pictureStyle({ morphId }).morphId, null, String(morphId));
    assert.equal(pictureAttributes({ morphId: 'robot' }), ' data-morph-id="robot"');
  });

  test('as HTML attributes', () => {
    assert.equal(pictureAttributes({ style: 'rounded', opacity: 0.5 }), ' class="slipr-picture-rounded" style="opacity:0.5"');
    assert.equal(pictureAttributes({}), '');
  });
});
