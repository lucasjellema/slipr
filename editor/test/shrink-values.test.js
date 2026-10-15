import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canShrink, typeOfPath, shrinkSize, shouldOfferShrink, shrunkBaseName, formatBytes, savingText,
  parseFocus, focusValue, moveFocus, SHRINK_DEFAULTS, OFFER_BYTES,
} from '../js/shrink-values.js';

describe('shrinking pictures (I-026)', () => {
  test('raster pictures can be shrunk, SVG and GIF not', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/avif']) assert.ok(canShrink(type), type);
    for (const type of ['image/svg+xml', 'image/gif', '', null, undefined]) assert.equal(canShrink(type), false, String(type));
  });

  test('the type of a path comes from its extension', () => {
    assert.equal(typeOfPath('images/a-1a2b3c4d.JPG'), 'image/jpeg');
    assert.equal(typeOfPath('images/a.webp?v=2'), 'image/webp');
    assert.equal(typeOfPath('images/logo.svg'), 'image/svg+xml');
    assert.equal(typeOfPath('images/noext'), null);
  });

  test('the longest side is limited, proportions kept, never enlarged', () => {
    assert.deepEqual(shrinkSize(4800, 3200, 2400), { width: 2400, height: 1600 });
    assert.deepEqual(shrinkSize(3000, 6000, 2400), { width: 1200, height: 2400 });
    assert.deepEqual(shrinkSize(800, 600, 2400), { width: 800, height: 600 });
    assert.deepEqual(shrinkSize(2400, 10, 2400), { width: 2400, height: 10 });
    assert.deepEqual(shrinkSize(5000, 1, 100), { width: 100, height: 1 });
  });

  test('the defaults are Lucas\'s', () => {
    assert.deepEqual({ ...SHRINK_DEFAULTS }, { maxSide: 2400, quality: 0.85 });
  });

  test('adding a large raster picture offers to shrink it', () => {
    assert.ok(shouldOfferShrink({ type: 'image/jpeg', bytes: OFFER_BYTES + 1 }));
    assert.ok(shouldOfferShrink({ type: 'image/png', bytes: 1000, width: 4000, height: 3000 }));
    assert.equal(shouldOfferShrink({ type: 'image/png', bytes: 1000, width: 2400, height: 1600 }), false);
    assert.equal(shouldOfferShrink({ type: 'image/gif', bytes: OFFER_BYTES * 5, width: 5000, height: 5000 }), false);
    assert.equal(shouldOfferShrink({ type: 'image/svg+xml', bytes: OFFER_BYTES * 2 }), false);
  });

  test('a shrunk picture keeps the slug of the original', () => {
    assert.equal(shrunkBaseName('images/team-photo-1a2b3c4d.jpg'), 'team-photo');
    assert.equal(shrunkBaseName('images/holiday.png'), 'holiday');
    assert.equal(shrunkBaseName('images/1a2b3c4d.png'), '1a2b3c4d');
    assert.equal(shrunkBaseName(''), 'image');
  });

  test('sizes and savings read well', () => {
    assert.equal(formatBytes(840), '840 B');
    assert.equal(formatBytes(219136), '214 KB');
    assert.equal(formatBytes(3.4 * 1024 * 1024), '3.4 MB');
    assert.equal(savingText(1000, 90), '−91 %');
    assert.equal(savingText(1000, 1200), '+20 %');
    assert.equal(savingText(0, 10), '');
  });
});

describe('focal point (I-026)', () => {
  test('percentages and keywords are read as fractions', () => {
    assert.deepEqual(parseFocus('30% 40%'), { x: 0.3, y: 0.4 });
    assert.deepEqual(parseFocus('center'), { x: 0.5, y: 0.5 });
    assert.deepEqual(parseFocus('left top'), { x: 0, y: 0 });
    assert.deepEqual(parseFocus('top left'), { x: 0, y: 0 });
    assert.deepEqual(parseFocus('bottom'), { x: 0.5, y: 1 });
    assert.deepEqual(parseFocus('right'), { x: 1, y: 0.5 });
    assert.deepEqual(parseFocus('25%'), { x: 0.25, y: 0.5 });
    assert.deepEqual(parseFocus('right 20%'), { x: 1, y: 0.2 });
    assert.deepEqual(parseFocus('150% -5%'), { x: 1, y: 0 });
  });

  test('anything else is the middle', () => {
    for (const focus of [undefined, null, 3, '', '10px 20px', 'calc(50%) x']) assert.deepEqual(parseFocus(focus), { x: 0.5, y: 0.5 }, String(focus));
  });

  test('a point is stored as "x% y%" to 0.1 %', () => {
    assert.equal(focusValue({ x: 0.3, y: 0.4 }), '30% 40%');
    assert.equal(focusValue({ x: 0.12345, y: 1.2 }), '12.3% 100%');
    assert.deepEqual(parseFocus(focusValue({ x: 0.125, y: 0.875 })), { x: 0.125, y: 0.875 });
  });

  test('moving keeps the point on the picture', () => {
    assert.deepEqual(moveFocus({ x: 0.5, y: 0.5 }, 0.01, -0.05), { x: 0.51, y: 0.45 });
    assert.deepEqual(moveFocus({ x: 0.99, y: 0.02 }, 0.05, -0.05), { x: 1, y: 0 });
  });
});
