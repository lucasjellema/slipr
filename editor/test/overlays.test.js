import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addOverlay, updateOverlay, deleteOverlay, moveOverlay, duplicateSlide, setLayout,
  overlayBox, newOverlayBox, resizedOverlayBox, OVERLAY_MIN_SIZE,
} from '../js/actions.js';
import { validateShow } from '../../shared/validate.js';
import { svgAspect } from '../js/image-input.js';

describe('extra images: the aspect ratio of an SVG (I-083)', () => {
  test('from the viewBox, else width and height, else 1', () => {
    assert.equal(svgAspect('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" stroke-width="3">'), 2);
    assert.equal(svgAspect('<svg width="300" height="100"><rect stroke-width="9"/></svg>'), 3);
    assert.equal(svgAspect('<svg stroke-width="4" height="50" width="100">'), 2, 'not fooled by stroke-width');
    assert.equal(svgAspect('<svg xmlns="http://www.w3.org/2000/svg">'), 1);
    assert.equal(svgAspect('not an svg'), 1);
  });
});

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const demo = read('../../shows/demo/show.json');
const template = read('../../templates/default/template.json');

/** A 0.1 show without overlays, like the shows made before I-083. */
function oldShow() {
  const show = structuredClone(demo);
  show.slipr = '0.1';
  for (const s of show.slides) delete s.overlays;
  return show;
}
const image = { src: 'images/two-modes.svg', alt: 'Two modes' };
const slideOf = (show, id = 's-problem') => show.slides.find((s) => s.id === id);

describe('extra images: actions (I-083)', () => {
  test('the first extra image makes the show 0.2, and the result is valid', () => {
    const show = oldShow();
    const next = addOverlay(show, { slideId: 's-problem', overlay: { image, x: 0.6, y: 0.1, w: 0.3, h: 0.3 } });
    assert.equal(show.slipr, '0.1', 'the old show is not mutated');
    assert.equal(next.slipr, '0.2');
    assert.deepEqual(slideOf(next).overlays, [{ image, x: 0.6, y: 0.1, w: 0.3, h: 0.3 }]);
    assert.deepEqual(Object.keys(slideOf(next)).slice(0, Object.keys(slideOf(next)).indexOf('overlays') + 1).slice(-2), ['content', 'overlays']);
    const result = validateShow(next, { template });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  test('an image without src is not added', () => {
    const show = oldShow();
    assert.equal(addOverlay(show, { slideId: 's-problem', overlay: { image: { alt: 'x' } } }), show);
  });

  test('boxes stay inside the canvas, with a minimum size, rounded', () => {
    assert.deepEqual(overlayBox({ x: 0.9, y: -1, w: 0.3, h: 0.123456 }), { x: 0.7, y: 0, w: 0.3, h: 0.1235 });
    assert.deepEqual(overlayBox({ x: 0, y: 0, w: 5, h: 0 }), { x: 0, y: 0, w: 1, h: OVERLAY_MIN_SIZE });
    assert.deepEqual(overlayBox({}), { x: 0.35, y: 0.35, w: 0.3, h: 0.3 });
  });

  test('a new box keeps the image aspect ratio on the canvas, centred', () => {
    const box = newOverlayBox(2, 16 / 9);   // a 2:1 image on a 16:9 slide
    assert.equal(box.w, 0.3);
    assert.equal(box.h, 0.2667);            // 0.3 * (16/9) / 2
    assert.equal(box.x, 0.35);
    const tall = newOverlayBox(0.25, 16 / 9); // very tall: limited to 80 % height
    assert.equal(tall.h, 0.8);
    assert.ok(Math.abs(tall.w - (0.8 * 0.25) / (16 / 9)) < 0.0001);
  });

  test('update moves, resizes, changes image and fragment; nothing else changes', () => {
    let show = addOverlay(oldShow(), { slideId: 's-problem', overlay: { image, x: 0.1, y: 0.1, w: 0.2, h: 0.2 } });
    show = updateOverlay(show, { slideId: 's-problem', index: 0, patch: { x: 0.95, w: 0.25 } });
    assert.deepEqual(slideOf(show).overlays[0], { image, x: 0.75, y: 0.1, w: 0.25, h: 0.2 });
    show = updateOverlay(show, { slideId: 's-problem', index: 0, patch: { fragment: 'fade-up' } });
    assert.equal(slideOf(show).overlays[0].fragment, 'fade-up');
    show = updateOverlay(show, { slideId: 's-problem', index: 0, patch: { fragment: undefined } });
    assert.equal('fragment' in slideOf(show).overlays[0], false);
    assert.equal(updateOverlay(show, { slideId: 's-problem', index: 0, patch: { x: 0.75 } }), show, 'no-op returns the same show');
    assert.equal(updateOverlay(show, { slideId: 's-problem', index: 3, patch: { x: 0 } }), show, 'unknown index');
  });

  test('stacking order and delete; the last delete removes the field', () => {
    let show = oldShow();
    for (const src of ['a.png', 'b.png', 'c.png']) {
      show = addOverlay(show, { slideId: 's-problem', overlay: { image: { src: `images/${src}`, alt: src } } });
    }
    show = moveOverlay(show, { slideId: 's-problem', index: 0, toIndex: 2 });
    assert.deepEqual(slideOf(show).overlays.map((o) => o.image.alt), ['b.png', 'c.png', 'a.png']);
    assert.equal(moveOverlay(show, { slideId: 's-problem', index: 0, toIndex: 5 }), show);
    show = deleteOverlay(show, { slideId: 's-problem', index: 1 });
    assert.deepEqual(slideOf(show).overlays.map((o) => o.image.alt), ['b.png', 'a.png']);
    show = deleteOverlay(deleteOverlay(show, { slideId: 's-problem', index: 0 }), { slideId: 's-problem', index: 0 });
    assert.equal('overlays' in slideOf(show), false);
    assert.equal(show.slipr, '0.2', 'a show stays 0.2');
  });

  test('extra images survive duplicating a slide and switching its layout', () => {
    let show = addOverlay(oldShow(), { slideId: 's-problem', overlay: { image } });
    show = duplicateSlide(show, { slideId: 's-problem' });
    const copy = show.slides[show.slides.findIndex((s) => s.id === 's-problem') + 1];
    assert.deepEqual(copy.overlays, slideOf(show).overlays);
    show = setLayout(show, { slideId: 's-problem', layout: 'two-column', templateLayouts: template.layouts });
    assert.equal(slideOf(show).overlays.length, 1);
  });
});

describe('extra images: resizing by a corner (I-083)', () => {
  const start = { x: 0.2, y: 0.2, w: 0.2, h: 0.1 };

  test('dragging the bottom-right corner keeps the top-left corner and the ratio', () => {
    assert.deepEqual(resizedOverlayBox(start, 'se', 0.1, 0, true), { x: 0.2, y: 0.2, w: 0.3, h: 0.15 });
    assert.deepEqual(resizedOverlayBox(start, 'se', 0, 0.1, true), { x: 0.2, y: 0.2, w: 0.4, h: 0.2 }, 'follows the larger change');
  });

  test('dragging the top-left corner keeps the bottom-right corner', () => {
    assert.deepEqual(resizedOverlayBox(start, 'nw', -0.1, 0, true), { x: 0.1, y: 0.15, w: 0.3, h: 0.15 });
  });

  test('with Shift the ratio is free', () => {
    assert.deepEqual(resizedOverlayBox(start, 'ne', 0.1, -0.05, false), { x: 0.2, y: 0.15, w: 0.3, h: 0.15 });
  });

  test('growing past the canvas edge stops at the edge, keeping the ratio', () => {
    const r = resizedOverlayBox({ x: 0.7, y: 0.1, w: 0.2, h: 0.2 }, 'se', 0.5, 0, true);
    assert.deepEqual(r, { x: 0.7, y: 0.1, w: 0.3, h: 0.3 });
  });

  test('shrinking stops at the minimum size', () => {
    const r = resizedOverlayBox(start, 'se', -1, -1, false);
    assert.equal(r.w, OVERLAY_MIN_SIZE);
    assert.equal(r.h, OVERLAY_MIN_SIZE);
  });
});
