import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import { insertGlossaryRef, insertPopup, insertSlideLink } from '../js/markdown-insert.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

describe('Markdown toolbar insertions (E-008)', () => {
  test('glossary reference: plain, or keeping the selected words', () => {
    assert.deepEqual(insertGlossaryRef('Uses  daily', 5, 5, 'reveal-js'), { text: 'Uses [[reveal-js]] daily', start: 18, end: 18 });
    const text = 'Built on the framework today';
    const start = text.indexOf('the framework');
    const r = insertGlossaryRef(text, start, start + 'the framework'.length, 'reveal-js');
    assert.equal(r.text, 'Built on [[reveal-js|the framework]] today');
    assert.equal(r.start, r.end);
  });

  test('popup: wraps the selection, or puts the cursor inside an empty one', () => {
    assert.deepEqual(insertPopup('A note', 2, 6), { text: 'A ^[note]', start: 9, end: 9 });
    assert.deepEqual(insertPopup('End.', 4, 4), { text: 'End.^[]', start: 6, end: 6 });
  });

  test('slide link: selected text or the slide title, never stray brackets', () => {
    assert.equal(insertSlideLink('See this', 4, 8, 's-05', 'Demo').text, 'See [this](#s-05)');
    assert.equal(insertSlideLink('See ', 4, 4, 's-05', 'The [beta] demo').text, 'See [The beta demo](#s-05)');
  });

  test('inserted syntax validates: known glossary term and slide id give no warnings', () => {
    const slide = demo.slides[0];
    const block = { type: 'text', md: insertSlideLink(insertGlossaryRef('x ', 2, 2, 'reveal-js').text, 0, 0, demo.slides[1].id, 'Next').text };
    const next = actions.addBlock(demo, { slideId: slide.id, block });
    assert.deepEqual(validateShow(next, { template }).warnings, []);
  });
});

describe('reader options (E-008)', () => {
  test('setShowSlide stores only false, and cleans up', () => {
    const id = demo.slides[0].id;
    const off = actions.setShowSlide(demo, { slideId: id, showSlide: false });
    assert.equal(off.slides[0].reader.showSlide, false);
    const on = actions.setShowSlide(off, { slideId: id, showSlide: true });
    assert.ok(!('showSlide' in (on.slides[0].reader ?? {})));
    assert.deepEqual(validateShow(off, { template }).errors, []);
  });

  test('setBlockAudience: profiles and depth; empty profiles means everyone', () => {
    const slide = demo.slides.find((s) => s.reader?.blocks?.length);
    const blockId = slide.reader.blocks[0].id;
    let next = actions.setBlockAudience(demo, { slideId: slide.id, blockId, forProfiles: ['dev'] });
    assert.deepEqual(next.slides.find((s) => s.id === slide.id).reader.blocks[0].for, ['dev']);
    next = actions.setBlockAudience(next, { slideId: slide.id, blockId, forProfiles: [] });
    assert.ok(!('for' in next.slides.find((s) => s.id === slide.id).reader.blocks[0]));
  });

  test('setRelated: add and clear related slides', () => {
    const [a, b, c] = demo.slides;
    let next = actions.setRelated(demo, { slideId: a.id, related: [b.id, c.id] });
    assert.deepEqual(next.slides[0].reader.related, [b.id, c.id]);
    assert.deepEqual(validateShow(next, { template }).warnings, []);
    next = actions.setRelated(next, { slideId: a.id, related: [] });
    assert.ok(!('related' in next.slides[0].reader));
  });
});
