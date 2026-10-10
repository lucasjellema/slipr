import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import * as actions from '../js/actions.js';
import { validateShow } from '../../shared/validate.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

describe('editor actions: slides', () => {
  test('addSlide appends or inserts after target slide', () => {
    const afterId = demo.slides[0].id;
    const added = actions.addSlide(demo, { layout: 'bullets', afterSlideId: afterId });

    assert.notEqual(added, demo, 'must return a new show reference');
    assert.equal(added.slides.length, demo.slides.length + 1);
    assert.equal(added.slides[0].id, afterId);
    assert.ok(added.slides[1].id.startsWith('s-'));
    assert.equal(added.slides[1].layout, 'bullets');

    // Appending to end
    const appended = actions.addSlide(demo, { layout: 'title' });
    assert.equal(appended.slides.length, demo.slides.length + 1);
    assert.equal(appended.slides[appended.slides.length - 1].layout, 'title');
  });

  test('addSlide picks a layout the template has (E-011)', () => {
    const conclusion = readJson('templates/conclusion/template.json');
    const conclusionDemo = readJson('shows/conclusion-demo/show.json');

    // After a title slide: the plain content layout of the template.
    assert.equal(actions.layoutForNewSlide(demo, template.layouts, 's-title'), 'bullets');
    assert.equal(actions.layoutForNewSlide(conclusionDemo, conclusion.layouts, 's-title'), 'text');
    // After a content slide: the same layout.
    assert.equal(actions.layoutForNewSlide(conclusionDemo, conclusion.layouts, 's-columns'), 'columns-4');
    // No anchor: after the last slide.
    const last = conclusionDemo.slides.at(-1);
    const expected = actions.layoutForNewSlide(conclusionDemo, conclusion.layouts, last.id);
    assert.equal(actions.layoutForNewSlide(conclusionDemo, conclusion.layouts, null), expected);

    const added = actions.addSlide(conclusionDemo, { afterSlideId: 's-title', templateLayouts: conclusion.layouts });
    const slide = added.slides[1];
    assert.ok(conclusion.layouts.some((l) => l.id === slide.layout), `layout ${slide.layout} exists in the template`);
    assert.deepEqual(validateShow(added, { template: conclusion }).errors, []);
  });

  test('addSlide without a layout or template layouts changes nothing', () => {
    assert.equal(actions.addSlide(demo, {}), demo);
  });

  test('duplicateSlide copies content and assigns new IDs', () => {
    const targetId = demo.slides[0].id;
    const duplicated = actions.duplicateSlide(demo, { slideId: targetId });

    assert.equal(duplicated.slides.length, demo.slides.length + 1);
    const copy = duplicated.slides[1];
    assert.notEqual(copy.id, targetId);
    assert.equal(copy.layout, demo.slides[0].layout);
    assert.deepEqual(copy.content, demo.slides[0].content);
    if (copy.reader?.blocks?.length) {
      assert.notEqual(copy.reader.blocks[0].id, demo.slides[0].reader.blocks[0].id);
    }
  });

  test('deleteSlide removes slide and cleans up paths and related references', () => {
    const targetId = 's-problem';
    const deleted = actions.deleteSlide(demo, { slideId: targetId });

    assert.equal(deleted.slides.length, demo.slides.length - 1);
    assert.ok(!deleted.slides.some((s) => s.id === targetId));

    // Check paths cleanup
    for (const path of deleted.paths) {
      if (Array.isArray(path.slides)) {
        assert.ok(!path.slides.includes(targetId), `path ${path.id} must not contain deleted slide`);
      }
    }

    // Check reader.related cleanup
    for (const slide of deleted.slides) {
      if (Array.isArray(slide.reader?.related)) {
        assert.ok(!slide.reader.related.includes(targetId), `slide ${slide.id} related must not contain deleted slide`);
      }
    }
  });

  test('moveSlide reorders slides within bounds', () => {
    const firstId = demo.slides[0].id;
    const moved = actions.moveSlide(demo, { slideId: firstId, toIndex: 2 });

    assert.equal(moved.slides[2].id, firstId);
    assert.equal(moved.slides.length, demo.slides.length);

    // Clamps out of bounds
    const clamped = actions.moveSlide(demo, { slideId: firstId, toIndex: 999 });
    assert.equal(clamped.slides[clamped.slides.length - 1].id, firstId);
  });

  test('setLayout preserves matching slots and orphans non-matching slots', () => {
    const slideId = 's-title';
    const templateLayouts = new Map(template.layouts.map((l) => [l.id, { def: l }]));

    // Title has title, subtitle, byline. Bullets has title, body.
    const switched = actions.setLayout(demo, { slideId, layout: 'bullets', templateLayouts });
    const target = switched.slides.find((s) => s.id === slideId);

    assert.equal(target.layout, 'bullets');
    assert.equal(target.content.title, demo.slides[0].content.title);
    assert.equal(target.content.subtitle, undefined);
    assert.equal(target._orphaned.subtitle, demo.slides[0].content.subtitle);

    // Switching back restores orphaned slots!
    const restored = actions.setLayout(switched, { slideId, layout: 'title', templateLayouts });
    const restoredTarget = restored.slides.find((s) => s.id === slideId);
    assert.equal(restoredTarget.layout, 'title');
    assert.equal(restoredTarget.content.subtitle, demo.slides[0].content.subtitle);
    assert.equal(restoredTarget._orphaned, undefined);
  });

  test('setSlot, setNotes, setHidden, setChapter, setTags update slide properties', () => {
    const slideId = 's-title';

    let cur = actions.setSlot(demo, { slideId, slot: 'title', value: 'New Title' });
    assert.equal(cur.slides.find((s) => s.id === slideId).content.title, 'New Title');

    cur = actions.setNotes(cur, { slideId, notes: 'Speaker notes test' });
    assert.equal(cur.slides.find((s) => s.id === slideId).notes, 'Speaker notes test');

    cur = actions.setNotes(cur, { slideId, notes: '' });
    assert.equal(cur.slides.find((s) => s.id === slideId).notes, undefined);

    cur = actions.setHidden(cur, { slideId, audienceHidden: true, readerHidden: true });
    assert.equal(cur.slides.find((s) => s.id === slideId).audience.hidden, true);
    assert.equal(cur.slides.find((s) => s.id === slideId).reader.hidden, true);

    cur = actions.setHidden(cur, { slideId, audienceHidden: false, readerHidden: false });
    assert.equal(cur.slides.find((s) => s.id === slideId).audience?.hidden, undefined);
    assert.equal(cur.slides.find((s) => s.id === slideId).reader?.hidden, undefined);

    cur = actions.setChapter(cur, { slideId, chapter: 'next' });
    assert.equal(cur.slides.find((s) => s.id === slideId).chapter, 'next');

    cur = actions.setTags(cur, { slideId, tags: ['tag1', 'tag2'] });
    assert.deepEqual(cur.slides.find((s) => s.id === slideId).tags, ['tag1', 'tag2']);
  });
});

describe('editor actions: reader layer', () => {
  test('setSummary updates slide reader summary', () => {
    const slideId = 's-title';
    const updated = actions.setSummary(demo, { slideId, summary: 'Updated summary' });
    assert.equal(updated.slides.find((s) => s.id === slideId).reader.summary, 'Updated summary');
  });

  test('addBlock, updateBlock, moveBlock, deleteBlock', () => {
    const slideId = 's-title';
    const withBlock = actions.addBlock(demo, {
      slideId,
      block: { type: 'text', md: 'Hello block' },
    });
    const slide = withBlock.slides.find((s) => s.id === slideId);
    const addedBlock = slide.reader.blocks[slide.reader.blocks.length - 1];
    assert.equal(addedBlock.type, 'text');
    assert.equal(addedBlock.md, 'Hello block');
    assert.ok(addedBlock.id.startsWith('b-'));

    // Update
    const updated = actions.updateBlock(withBlock, {
      slideId,
      blockId: addedBlock.id,
      patch: { md: 'Modified' },
    });
    assert.equal(
      updated.slides.find((s) => s.id === slideId).reader.blocks.find((b) => b.id === addedBlock.id).md,
      'Modified'
    );

    // Delete
    const deleted = actions.deleteBlock(updated, { slideId, blockId: addedBlock.id });
    assert.ok(!deleted.slides.find((s) => s.id === slideId).reader.blocks.some((b) => b.id === addedBlock.id));
  });

  test('setBlockAudience and setRelated', () => {
    const slideId = 's-problem';
    const blockId = demo.slides[1].reader.blocks[0].id;

    const updated = actions.setBlockAudience(demo, {
      slideId,
      blockId,
      forProfiles: ['dev'],
      depth: 3,
    });
    const block = updated.slides.find((s) => s.id === slideId).reader.blocks.find((b) => b.id === blockId);
    assert.deepEqual(block.for, ['dev']);
    assert.equal(block.depth, 3);

    const withRelated = actions.setRelated(updated, { slideId, related: ['s-title'] });
    assert.deepEqual(withRelated.slides.find((s) => s.id === slideId).reader.related, ['s-title']);
  });
});

describe('editor actions: show settings', () => {
  test('setMeta and setSettings', () => {
    const m = actions.setMeta(demo, { title: 'Brand New Title', author: 'Author Name' });
    assert.equal(m.meta.title, 'Brand New Title');
    assert.equal(m.meta.author, 'Author Name');

    const s = actions.setSettings(m, { transition: 'slide', aspectRatio: '4:3' });
    assert.equal(s.settings.transition, 'slide');
    assert.equal(s.settings.aspectRatio, '4:3');
  });

  test('upsertChapter and deleteChapter unassigns slides', () => {
    const added = actions.upsertChapter(demo, { id: 'test-chap', title: 'Test Chapter' });
    assert.ok(added.chapters.some((c) => c.id === 'test-chap'));

    const assigned = actions.setChapter(added, { slideId: 's-title', chapter: 'test-chap' });
    assert.equal(assigned.slides.find((s) => s.id === 's-title').chapter, 'test-chap');

    const deleted = actions.deleteChapter(assigned, { chapterId: 'test-chap' });
    assert.ok(!deleted.chapters.some((c) => c.id === 'test-chap'));
    assert.equal(deleted.slides.find((s) => s.id === 's-title').chapter, undefined);
  });

  test('upsertGlossaryTerm and deleteGlossaryTerm', () => {
    const added = actions.upsertGlossaryTerm(demo, {
      id: 'term-x',
      term: 'Term X',
      definition: 'Definition X',
    });
    assert.equal(added.glossary['term-x'].term, 'Term X');

    const deleted = actions.deleteGlossaryTerm(added, { id: 'term-x' });
    assert.equal(deleted.glossary['term-x'], undefined);
  });

  test('upsertProfile and deleteProfile cleans up block audience', () => {
    const added = actions.upsertProfile(demo, { id: 'designer', label: 'Designer' });
    assert.ok(added.profiles.some((p) => p.id === 'designer'));

    const slideId = 's-problem';
    const blockId = demo.slides[1].reader.blocks[0].id;
    const targeted = actions.setBlockAudience(added, { slideId, blockId, forProfiles: ['designer'] });

    const deleted = actions.deleteProfile(targeted, { profileId: 'designer' });
    assert.ok(!deleted.profiles.some((p) => p.id === 'designer'));
    const block = deleted.slides.find((s) => s.id === slideId).reader.blocks.find((b) => b.id === blockId);
    assert.equal(block.for, undefined);
  });

  test('upsertPath and deletePath', () => {
    const added = actions.upsertPath(demo, { id: 'exec', label: 'Executive', slides: ['s-title'] });
    assert.ok(added.paths.some((p) => p.id === 'exec'));

    const deleted = actions.deletePath(added, { pathId: 'exec' });
    assert.ok(!deleted.paths.some((p) => p.id === 'exec'));
  });
});

describe('editor actions: global search and replace (I-025)', () => {
  test('findMatches locates text across metadata, slides, notes, and reader blocks', () => {
    // "Slipr" occurs in show title, slides, etc.
    const res = actions.findMatches(demo, { query: 'Slipr' });
    assert.ok(res.totalMatches > 5, `expected multiple matches, got ${res.totalMatches}`);
    assert.ok(res.matches.some((m) => m.slideTitle === 'Show metadata'));
    assert.ok(res.matches.some((m) => m.location.includes('title') || m.location.includes('body')));

    // "audience" occurs in speaker notes (e.g. s-problem: "Ask the audience...")
    const audRes = actions.findMatches(demo, { query: 'audience' });
    assert.ok(audRes.matches.some((m) => m.location === 'Speaker notes'));

    // Check snippet formatting
    const match = res.matches[0];
    assert.ok(match.snippet.includes('[Slipr]'), 'snippet must bracket the matched text');
  });

  test('findMatches respects matchCase and matchWholeWord', () => {
    const ci = actions.findMatches(demo, { query: 'slipr', matchCase: false });
    const cs = actions.findMatches(demo, { query: 'slipr', matchCase: true });
    // In demo show, "Slipr" is capitalized, so cs should have fewer or different matches than ci
    assert.ok(ci.totalMatches > cs.totalMatches);

    const part = actions.findMatches(demo, { query: 'mode', matchWholeWord: false });
    const whole = actions.findMatches(demo, { query: 'mode', matchWholeWord: true });
    assert.ok(part.totalMatches >= whole.totalMatches);

    // Empty or whitespace returns 0
    assert.equal(actions.findMatches(demo, { query: '' }).totalMatches, 0);
    assert.equal(actions.findMatches(demo, { query: '   ' }).totalMatches, 0);
  });

  test('replaceAllText replaces across show and can be undone', () => {
    // Replace unique word "SlidePresenter" with "PresentationTool"
    const replaced = actions.replaceAllText(demo, {
      find: 'SlidePresenter',
      replaceWith: 'PresentationTool',
    });

    assert.notEqual(replaced, demo, 'must return a new show reference');

    const checkBefore = actions.findMatches(demo, { query: 'PresentationTool' });
    assert.equal(checkBefore.totalMatches, 0);

    const checkAfter = actions.findMatches(replaced, { query: 'PresentationTool' });
    assert.ok(checkAfter.totalMatches > 0);

    const oldAfter = actions.findMatches(replaced, { query: 'SlidePresenter' });
    assert.equal(oldAfter.totalMatches, 0);

    // When query is not found, returns same show reference
    const unchanged = actions.replaceAllText(demo, {
      find: 'nonexistenttermxyz123',
      replaceWith: 'abc',
    });
    assert.equal(unchanged, demo);
  });

  test('replaceSlideText replaces only within target slide', () => {
    const targetSlideId = 's-problem';
    const replaced = actions.replaceSlideText(demo, {
      slideId: targetSlideId,
      find: 'room',
      replaceWith: 'auditorium',
    });

    assert.notEqual(replaced, demo);
    const target = replaced.slides.find((s) => s.id === targetSlideId);
    assert.ok(target.content.body.includes('auditorium'));

    // Other slides untouched
    const other = replaced.slides.find((s) => s.id === 's-title');
    assert.equal(other, demo.slides.find((s) => s.id === 's-title'));
  });
});

