import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CROP_MIN, clampCrop, growCrop, moveCrop, resizeCrop, shapeCrop, shapeRatio } from '../js/crop-values.js';
import { imageValue } from '../js/slot-values.js';

const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 0.0002;
/** Ratios of 4-decimal values are a little less exact. */
const ratioNear = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 0.002;

describe('crop dialog geometry (I-090)', () => {
  test('clamp and move stay inside the picture', () => {
    assert.deepEqual(clampCrop({ x: -0.1, y: 0.9, w: 0.5, h: 0.5 }), { x: 0, y: 0.5, w: 0.5, h: 0.5 });
    assert.deepEqual(clampCrop({ x: 0, y: 0, w: 0, h: 2 }), { x: 0, y: 0, w: CROP_MIN, h: 1 });
    assert.deepEqual(moveCrop({ x: 0.4, y: 0.4, w: 0.5, h: 0.5 }, 0.3, -0.6), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  test('a shape ratio is in picture fractions', () => {
    assert.equal(shapeRatio('free', 1.5), null);
    assert.equal(shapeRatio('original', 1.5), 1);
    assert.equal(shapeRatio('1:1', 2), 0.5, 'a square on a 2:1 picture is half as wide as high, in fractions');
  });

  test('resizing from a corner keeps the opposite corner, and the shape when asked', () => {
    const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    assert.deepEqual(resizeCrop(start, 'se', 0.1, 0.2, null), { x: 0.2, y: 0.2, w: 0.5, h: 0.6 });
    const nw = resizeCrop(start, 'nw', -0.1, 0, null);
    assert.ok(near(nw.x, 0.1) && near(nw.x + nw.w, 0.6), 'right edge stays');
    const kept = resizeCrop(start, 'se', 0.2, 0, 1);
    assert.ok(ratioNear(kept.w, kept.h), 'ratio 1 kept');
    const capped = resizeCrop(start, 'se', 0.9, 0.9, 1);
    assert.ok(capped.x + capped.w <= 1 && capped.y + capped.h <= 1, 'never past the picture');
  });

  test('giving a shape keeps the centre and fits the picture', () => {
    const c = shapeCrop({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 2);
    assert.ok(ratioNear(c.w / c.h, 2));
    assert.ok(near(c.x + c.w / 2, 0.5) && near(c.y + c.h / 2, 0.5));
    const wide = shapeCrop({ x: 0, y: 0, w: 1, h: 1 }, 4);
    assert.ok(wide.w <= 1 && ratioNear(wide.w / wide.h, 4));
  });

  test('keyboard growth', () => {
    assert.deepEqual(growCrop({ x: 0, y: 0, w: 0.5, h: 0.5 }, 0.1, 0, null), { x: 0, y: 0, w: 0.6, h: 0.5 });
    const g = growCrop({ x: 0, y: 0, w: 0.5, h: 0.25 }, 0.1, 0, 2);
    assert.ok(ratioNear(g.w / g.h, 2));
  });

  test('a crop is stored on the image value, and removed for the whole picture', () => {
    const image = { src: 'a.png', alt: 'A' };
    assert.deepEqual(imageValue(image, { crop: { x: 0.1, y: 0, w: 0.5, h: 1 } }), { src: 'a.png', alt: 'A', crop: { x: 0.1, y: 0, w: 0.5, h: 1 } });
    assert.deepEqual(imageValue({ ...image, crop: { x: 0, y: 0, w: 0.5, h: 1 } }, { crop: undefined }), image);
  });
});
