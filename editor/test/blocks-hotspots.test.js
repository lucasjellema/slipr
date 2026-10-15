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
      if (type === 'image' || type === 'embed' || type === 'pdf' || type === 'video') {
        // A new image block has no image yet, a new embed no URL, a new PDF or video no file: the user fills those in.
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

test('embed load and fallback (I-070): a 0.1 show becomes 0.2, removal keeps it valid', () => {
  const slide = demo.slides.find((s) => s.reader?.blocks?.some((b) => b.type === 'embed'));
  const embed = slide.reader.blocks.find((b) => b.type === 'embed');
  const ids = { slideId: slide.id, blockId: embed.id };
  const old = { ...demo, slipr: '0.1' };
  let next = actions.updateBlock(old, { ...ids, patch: { load: 'auto' } });
  assert.equal(next.slipr, '0.2');
  assert.equal(actions.updateBlock(old, { ...ids, patch: { height: 300 } }).slipr, '0.1', 'other fields keep the version');
  next = actions.updateBlock(next, { ...ids, patch: { load: undefined } });
  assert.ok(!('load' in next.slides.find((s) => s.id === slide.id).reader.blocks.find((b) => b.id === embed.id)));
});

test('video blocks (I-110): a 0.1 show becomes 0.2; an Embedded Page with a YouTube address keeps it', () => {
  const slide = demo.slides.find((s) => s.reader?.blocks?.length);
  const block = slide.reader.blocks[0];
  const old = { ...demo, slipr: '0.1' };
  const next = actions.setBlockType(old, { slideId: slide.id, blockId: block.id, type: 'video' });
  assert.equal(next.slipr, '0.2');
  const video = next.slides.find((s) => s.id === slide.id).reader.blocks.find((b) => b.id === block.id);
  assert.deepEqual([video.type, video.video, video.title], ['video', '', 'Video']);
  const embed = { id: 'e', type: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ', title: 'Bunny', load: 'auto', depth: 2 };
  assert.deepEqual(actions.convertBlock(embed, 'video'), { id: 'e', type: 'video', depth: 2, video: 'https://youtu.be/aqz-KE-bpKQ', title: 'Bunny', load: 'auto' });
  assert.equal(actions.convertBlock({ ...embed, url: 'https://example.org' }, 'video').video, '');
  assert.equal(actions.convertBlock({ id: 'v', type: 'video', video: 'https://youtu.be/aqz-KE-bpKQ', title: 'B' }, 'embed').url, 'https://youtu.be/aqz-KE-bpKQ');
  assert.equal(actions.convertBlock({ id: 'v', type: 'video', video: 'media/a.mp4', title: 'B' }, 'embed').url, '');
  const back = actions.convertBlock({ ...video, video: 'media/a.mp4', chapters: [{ time: 0, title: 'A' }], transcript: 'T' }, 'video');
  assert.deepEqual([back.video, back.chapters, back.transcript], ['media/a.mp4', [{ time: 0, title: 'A' }], 'T']);
  const withSlot = actions.setSlot(old, { slideId: slide.id, slot: 'video', value: { video: 'media/a.mp4', title: 'A' } });
  assert.equal(withSlot.slipr, '0.2');
});

test('PDF blocks (I-072): conversion keeps fields, a 0.1 show becomes 0.2', () => {
  const slide = demo.slides.find((s) => s.reader?.blocks?.length);
  const block = slide.reader.blocks[0];
  const old = { ...demo, slipr: '0.1' };
  const next = actions.setBlockType(old, { slideId: slide.id, blockId: block.id, type: 'pdf' });
  assert.equal(next.slipr, '0.2');
  const pdf = next.slides.find((s) => s.id === slide.id).reader.blocks.find((b) => b.id === block.id);
  assert.equal(pdf.type, 'pdf');
  assert.equal(pdf.pdf, '');
  assert.ok(pdf.title);
  const back = actions.convertBlock({ ...pdf, pdf: 'docs/a.pdf', pages: [2, 3], load: 'auto' }, 'pdf');
  assert.deepEqual([back.pdf, back.pages, back.load], ['docs/a.pdf', [2, 3], 'auto']);
  const withSlot = actions.setSlot(old, { slideId: slide.id, slot: 'document', value: { pdf: 'docs/a.pdf', title: 'A' } });
  assert.equal(withSlot.slipr, '0.2');
});
