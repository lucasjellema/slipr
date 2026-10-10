import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, clone } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');
const hasHotspots = (b) => b.type === 'image' && b.hotspots?.length > 1;
const slideWithImageBlock = demo.slides.find((s) => s.reader?.blocks?.some(hasHotspots));
const imageBlock = slideWithImageBlock.reader.blocks.find(hasHotspots);

/** The demo with one text block added to its first slide. */
function withTextBlock(md = 'Some **reader** text') {
  const show = actions.addBlock(demo, { slideId: demo.slides[0].id, block: { type: 'text', md, depth: 3 } });
  const block = show.slides[0].reader.blocks.at(-1);
  return { show, slideId: show.slides[0].id, blockId: block.id };
}

describe('changing a block type keeps the show valid', () => {
  for (const type of actions.BLOCK_TYPES) {
    test(`text → ${type}`, () => {
      const { show, slideId, blockId } = withTextBlock();
      const next = actions.setBlockType(show, { slideId, blockId, type });
      const block = next.slides[0].reader.blocks.find((b) => b.id === blockId);
      assert.equal(block.type, type);
      assert.equal(block.depth, 3, 'depth survives');
      const errors = validateShow(next, { template }).errors;
      if (type === 'image' || type === 'embed') {
        // A new image block has no image yet, a new embed no URL: the user fills those in.
        assert.ok(errors.length > 0 && errors.every((e) => e.path.startsWith('slides[0].reader.blocks')), JSON.stringify(errors));
        assert.equal(block.md, undefined, 'no stray md on an image block');
      } else {
        assert.deepEqual(errors, []);
      }
    });
  }

  test('text survives a round trip through details and callout', () => {
    const { show, slideId, blockId } = withTextBlock('Keep me');
    let next = actions.setBlockType(show, { slideId, blockId, type: 'details' });
    next = actions.setBlockType(next, { slideId, blockId, type: 'callout' });
    next = actions.setBlockType(next, { slideId, blockId, type: 'text' });
    assert.equal(next.slides[0].reader.blocks.find((b) => b.id === blockId).md, 'Keep me');
  });

  test('a callout gets a valid variant', () => {
    const { show, slideId, blockId } = withTextBlock();
    const next = actions.setBlockType(show, { slideId, blockId, type: 'callout' });
    assert.equal(next.slides[0].reader.blocks.find((b) => b.id === blockId).variant, 'info');
  });

  test('the same type changes nothing', () => {
    const { show, slideId, blockId } = withTextBlock();
    assert.equal(actions.setBlockType(show, { slideId, blockId, type: 'text' }), show);
  });
});

describe('hotspots (E-006)', () => {
  const ids = { slideId: slideWithImageBlock.id, blockId: imageBlock.id };

  test('addHotspot appends a numbered hotspot with clamped, rounded coordinates', () => {
    const next = actions.addHotspot(demo, { ...ids, x: 0.123456, y: 1.7 });
    const spots = next.slides.find((s) => s.id === ids.slideId).reader.blocks.find((b) => b.id === ids.blockId).hotspots;
    const added = spots.at(-1);
    assert.equal(spots.length, imageBlock.hotspots.length + 1);
    assert.deepEqual(added, { x: 0.1235, y: 1, title: `Hotspot ${spots.length}`, md: '' });
    assert.deepEqual(validateShow(next, { template }).errors, []);
  });

  test('updateHotspot moves and renames; deleteHotspot removes', () => {
    let next = actions.updateHotspot(demo, { ...ids, index: 0, patch: { x: -0.2, y: 0.5, title: 'Renamed' } });
    let spot = next.slides.find((s) => s.id === ids.slideId).reader.blocks.find((b) => b.id === ids.blockId).hotspots[0];
    assert.deepEqual([spot.x, spot.y, spot.title, spot.md], [0, 0.5, 'Renamed', imageBlock.hotspots[0].md]);

    next = actions.deleteHotspot(next, { ...ids, index: 0 });
    const spots = next.slides.find((s) => s.id === ids.slideId).reader.blocks.find((b) => b.id === ids.blockId).hotspots;
    assert.equal(spots.length, imageBlock.hotspots.length - 1);
    assert.equal(spots[0].title, imageBlock.hotspots[1].title);
  });

  test('deleting the last hotspot removes the hotspots key', () => {
    let show = clone(demo);
    const block = show.slides.find((s) => s.id === ids.slideId).reader.blocks.find((b) => b.id === ids.blockId);
    block.hotspots = [block.hotspots[0]];
    show = actions.deleteHotspot(show, { ...ids, index: 0 });
    assert.ok(!('hotspots' in show.slides.find((s) => s.id === ids.slideId).reader.blocks.find((b) => b.id === ids.blockId)));
  });

  test('unknown index or non-image block: no change', () => {
    assert.equal(actions.updateHotspot(demo, { ...ids, index: 99, patch: { title: 'x' } }), demo);
    const { show, slideId, blockId } = withTextBlock();
    assert.equal(actions.addHotspot(show, { slideId, blockId, x: 0.5, y: 0.5 }), show);
  });
});

test('updateBlock removes fields patched to undefined', () => {
  const ids = { slideId: slideWithImageBlock.id, blockId: imageBlock.id };
  let next = actions.updateBlock(demo, { ...ids, patch: { caption: 'Hi' } });
  next = actions.updateBlock(next, { ...ids, patch: { caption: undefined } });
  const block = next.slides.find((s) => s.id === ids.slideId).reader.blocks.find((b) => b.id === ids.blockId);
  assert.ok(!('caption' in block));
  assert.deepEqual(validateShow(next, { template }).errors, []);
});
