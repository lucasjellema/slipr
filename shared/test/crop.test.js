import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cropInset, isShown, normalCrop, toPicture, toShown } from '../crop.js';
import { pictureAttributes, pictureStyle } from '../picture.js';
import { renderBlock } from '../blocks.js';
import { validateShow } from '../validate.js';
import { codes, readJson, clone } from './helpers.js';

describe('image cropping (I-090)', () => {
  test('normalCrop clamps, rounds and drops full or invalid crops', () => {
    assert.deepEqual(normalCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
    assert.deepEqual(normalCrop({ x: 0.8, y: 0, w: 0.5, h: 1 }), { x: 0.8, y: 0, w: 0.2, h: 1 }, 'kept inside the picture');
    assert.equal(normalCrop({ x: 0, y: 0, w: 1, h: 1 }), null, 'the whole picture is no crop');
    assert.equal(normalCrop({ x: 0, y: 0, w: 0, h: 1 }), null);
    assert.equal(normalCrop({ x: '0', y: 0, w: 1, h: 1 }), null);
    assert.equal(normalCrop(undefined), null);
    assert.deepEqual(normalCrop({ x: 0.123456, y: 0, w: 0.5, h: 0.5 }), { x: 0.1235, y: 0, w: 0.5, h: 0.5 });
  });

  test('cropInset gives object-view-box insets (top right bottom left)', () => {
    assert.equal(cropInset({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }), 'inset(20% 40% 40% 10%)');
  });

  test('points map between the picture and the shown part', () => {
    const crop = { x: 0.2, y: 0.5, w: 0.5, h: 0.5 };
    assert.deepEqual(toShown({ x: 0.45, y: 0.75 }, crop), { x: 0.5, y: 0.5 });
    assert.deepEqual(toPicture({ x: 0.5, y: 0.5 }, crop), { x: 0.45, y: 0.75 });
    assert.equal(isShown(toShown({ x: 0.1, y: 0.75 }, crop)), false);
    assert.deepEqual(toShown({ x: 0.3, y: 0.4 }, undefined), { x: 0.3, y: 0.4 }, 'no crop: unchanged');
  });

  test('picture attributes carry the crop for CSS and the fallback', () => {
    const image = { src: 'a.png', opacity: 0.5, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } };
    assert.equal(pictureStyle(image).crop, '0.1 0.2 0.5 0.4');
    assert.equal(pictureAttributes(image), ' style="opacity:0.5;object-view-box:inset(20% 40% 40% 10%)" data-crop="0.1 0.2 0.5 0.4"');
    assert.equal(pictureAttributes({ src: 'a.png', crop: { x: 0, y: 0, w: 1, h: 1 } }), '');
  });

  test('hotspots are drawn relative to the crop; outside ones are left out', () => {
    const ctx = { show: { slides: [] }, resolveAsset: (/** @type {string} */ s) => s };
    const html = renderBlock({
      id: 'i', type: 'image', image: { src: 'a.png', alt: 'A', crop: { x: 0.5, y: 0, w: 0.5, h: 1 } },
      hotspots: [{ x: 0.75, y: 0.5, title: 'In', md: 'x' }, { x: 0.25, y: 0.5, title: 'Out', md: 'x' }],
    }, 's', ctx);
    assert.match(html, /left:50%;top:50%" data-hotspot="0"/);
    assert.doesNotMatch(html, /aria-label="Out"/);
  });

  test('validation: 0.2 only, inside the picture, hotspots inside the crop', () => {
    const demo = readJson('shows/demo/show.json');
    const template = readJson('templates/default/template.json');
    const run = (/** @type {any} */ crop, version = '0.2') => {
      const show = clone(demo);
      show.slipr = version;
      show.slides.find((/** @type {any} */ s) => s.id === 's-architecture').content.image.crop = crop;
      return validateShow(show, { template });
    };
    assert.deepEqual(run({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }).warnings, []);
    assert.ok(codes(run({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, '0.1').errors).includes('format-version'));
    assert.equal(run({ x: 0.1, y: 0.1, w: 0.5 }).ok, false, 'all four numbers');
    assert.equal(run({ x: 1.2, y: 0, w: 0.5, h: 0.5 }).ok, false);
    assert.ok(codes(run({ x: 0.8, y: 0, w: 0.5, h: 0.5 }).warnings).includes('crop-outside'));
    assert.ok(codes(run({ x: 0, y: 0, w: 0, h: 0.5 }).warnings).includes('empty-crop'));

    const show = clone(demo);
    const block = show.slides.find((/** @type {any} */ s) => s.id === 's-architecture').reader.blocks.find((/** @type {any} */ b) => b.type === 'image');
    block.image.crop = { x: 0.5, y: 0, w: 0.5, h: 1 };
    const { warnings } = validateShow(show, { template });
    assert.ok(warnings.some((w) => w.code === 'hotspot-outside-crop' && /Converter/.test(w.message)));
  });
});
