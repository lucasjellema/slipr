import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cropForAnimation, imagePairs } from '../audience/morph.js';
import { validateShow } from '../../shared/validate.js';
import { readJson, clone, codes } from '../../shared/test/helpers.js';

const pic = (/** @type {Partial<{ morphId: string | null, file: string, slot: string | null }>} */ k) => ({ morphId: null, file: '', slot: null, ...k });

describe('picture morph pairing (I-091)', () => {
  test('the same file pairs, in a slot or as an extra image', () => {
    assert.deepEqual(imagePairs([pic({ file: 'a.jpg', slot: 'slot-image' })], [pic({ file: 'a.jpg' })]), [[0, 0]]);
  });

  test('a morph name wins over the file, and pairs different files', () => {
    const from = [pic({ file: 'a.jpg' }), pic({ file: 'wide.jpg', morphId: 'robot' })];
    const to = [pic({ file: 'detail.jpg', morphId: 'robot' }), pic({ file: 'a.jpg' })];
    assert.deepEqual(imagePairs(from, to).sort(), [[0, 1], [1, 0]]);
  });

  test('a picture with a morph name pairs only by that name', () => {
    assert.deepEqual(imagePairs([pic({ file: 'a.jpg', morphId: 'x' })], [pic({ file: 'a.jpg' })]), []);
  });

  test('then by slot; each picture is used once', () => {
    assert.deepEqual(imagePairs([pic({ file: 'a.jpg', slot: 'slot-image' })], [pic({ file: 'b.jpg', slot: 'slot-image' })]), [[0, 0]]);
    assert.deepEqual(imagePairs([pic({ file: 'a.jpg' })], [pic({ file: 'a.jpg' }), pic({ file: 'a.jpg' })]), [[0, 0]]);
    assert.deepEqual(imagePairs([pic({ file: '' })], [pic({ file: '' })]), [], 'no file, no slot: no pair');
  });

  test('a crop animates from the whole picture when one side has none', () => {
    assert.equal(cropForAnimation('none'), 'inset(0% 0% 0% 0%)');
    assert.equal(cropForAnimation(''), 'inset(0% 0% 0% 0%)');
    assert.equal(cropForAnimation('inset(10% 0% 0% 5%)'), 'inset(10% 0% 0% 5%)');
  });
});

describe('morph names in the format (I-091)', () => {
  const demo = readJson('shows/demo/show.json');
  const template = readJson('templates/default/template.json');
  const run = (/** @type {(s: any) => void} */ mutate) => {
    const show = clone(demo);
    mutate(show);
    return validateShow(show, { template });
  };
  const slideImage = (/** @type {any} */ s) => s.slides.find((/** @type {any} */ x) => x.id === 's-architecture').content.image;

  test('valid in 0.2, an error in 0.1, a pattern', () => {
    assert.deepEqual(run((s) => { slideImage(s).morphId = 'arch'; }).warnings, []);
    assert.ok(codes(run((s) => { slideImage(s).morphId = 'arch'; s.slipr = '0.1'; }).errors).includes('format-version'));
    assert.equal(run((s) => { slideImage(s).morphId = 'two words'; }).ok, false);
  });

  test('the same name twice on one slide is a warning', () => {
    const result = run((s) => {
      const slide = s.slides.find((/** @type {any} */ x) => x.id === 's-architecture');
      slide.content.image.morphId = 'arch';
      slide.reader.blocks.find((/** @type {any} */ b) => b.type === 'image').image.morphId = 'arch';
    });
    assert.ok(codes(result.warnings).includes('duplicate-morph-id'));
  });
});
