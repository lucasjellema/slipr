import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setSlot, updateBlock, usesPictureStyle } from '../js/actions.js';
import { imageValue } from '../js/slot-values.js';
import { canonicalShow } from '../js/io/serialize.js';
import { validateShow } from '../../shared/validate.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const demo = read('../../shows/demo/show.json');
const template = read('../../templates/default/template.json');

/** The demo as a 0.1 show (no extra images). */
function oldShow() {
  const show = structuredClone(demo);
  show.slipr = '0.1';
  for (const s of show.slides) delete s.overlays;
  return show;
}
const arch = (show) => show.slides.find((s) => s.id === 's-architecture');

describe('picture style and opacity in the editor (I-084)', () => {
  test('usesPictureStyle finds a style or opacity on a picture, also inside cards', () => {
    assert.equal(usesPictureStyle({ src: 'a.png', style: 'shadow' }), true);
    assert.equal(usesPictureStyle({ src: 'a.png', opacity: 0.5 }), true);
    assert.equal(usesPictureStyle({ src: 'a.png', alt: 'x' }), false);
    assert.equal(usesPictureStyle([{ title: 'Card', photo: { src: 'b.png', style: 'frame' } }]), true);
    assert.equal(usesPictureStyle('text'), false);
    assert.equal(usesPictureStyle({ style: 'not a picture' }), false);
  });

  test('a styled image slot makes a 0.1 show 0.2, and the show stays valid', () => {
    const show = oldShow();
    const image = imageValue(arch(show).content.image, { style: 'shadow', opacity: 0.7 });
    const next = setSlot(show, { slideId: 's-architecture', slot: 'image', value: image });
    assert.equal(next.slipr, '0.2');
    assert.equal(show.slipr, '0.1', 'not mutated');
    assert.deepEqual(validateShow(next, { template }).errors, []);
    // Removing them again keeps 0.2 (still valid) and drops the keys.
    const plain = setSlot(next, { slideId: 's-architecture', slot: 'image', value: imageValue(image, { style: undefined, opacity: undefined }) });
    assert.equal(plain.slipr, '0.2');
    assert.deepEqual(Object.keys(arch(plain).content.image).sort(), ['alt', 'fit', 'src']);
  });

  test('a styled reader image block does the same; plain text edits do not', () => {
    const show = oldShow();
    const block = arch(show).reader.blocks.find((b) => b.type === 'image');
    const next = updateBlock(show, { slideId: 's-architecture', blockId: block.id, patch: { image: { ...block.image, opacity: 0.5 } } });
    assert.equal(next.slipr, '0.2');
    assert.equal(updateBlock(show, { slideId: 's-architecture', blockId: block.id, patch: { caption: 'x' } }).slipr, '0.1');
    assert.equal(setSlot(show, { slideId: 's-problem', slot: 'title', value: 'New' }).slipr, '0.1');
  });

  test('saved key order: style and opacity after focus', () => {
    const show = setSlot(oldShow(), { slideId: 's-architecture', slot: 'image', value: { opacity: 0.5, style: 'soft', src: 'images/architecture.svg', alt: 'A' } });
    assert.deepEqual(Object.keys(arch(canonicalShow(show)).content.image), ['src', 'alt', 'style', 'opacity']);
  });
});
