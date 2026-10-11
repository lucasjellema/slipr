import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import { emptyChapters, gridMove, selectRange, slideRuns } from '../js/show-grid-model.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');
const ids = (show) => show.slides.map((s) => s.id);
const valid = (show) => assert.deepEqual(validateShow(show, { template }).errors, []);

/** A small show: slides a..f, chapters x (a,b), y (c,d), none (e), x again (f). */
const mini = {
  slipr: '0.1', id: 'mini', meta: { title: 'Mini' }, template: { ref: '/templates/default' },
  chapters: [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }, { id: 'z', title: 'Z' }],
  slides: [
    { id: 'a', layout: 'title', chapter: 'x', content: { title: 'A' } },
    { id: 'b', layout: 'title', chapter: 'x', content: { title: 'B' } },
    { id: 'c', layout: 'title', chapter: 'y', content: { title: 'C' } },
    { id: 'd', layout: 'title', chapter: 'y', content: { title: 'D' } },
    { id: 'e', layout: 'title', content: { title: 'E' } },
    { id: 'f', layout: 'title', chapter: 'x', content: { title: 'F' } },
  ],
};

describe('show grid model (I-081)', () => {
  test('runs follow slide order, like reader mode; a returning chapter is "continued"', () => {
    const runs = slideRuns(mini);
    assert.deepEqual(runs.map((r) => [r.chapterId, r.slides.map((s) => s.slide.id).join(''), r.continued]),
      [['x', 'ab', false], ['y', 'cd', false], [null, 'e', false], ['x', 'f', true]]);
    assert.equal(runs[0].chapter.title, 'X');
    assert.deepEqual(emptyChapters(mini).map((c) => c.id), ['z']);
  });

  test('range selection and grid movement', () => {
    assert.deepEqual(selectRange(ids(mini), 'b', 'd'), ['b', 'c', 'd']);
    assert.deepEqual(selectRange(ids(mini), 'e', 'c'), ['c', 'd', 'e']);
    assert.equal(gridMove('ArrowDown', 1, 6, 4), 5);
    assert.equal(gridMove('ArrowUp', 1, 6, 4), 0);
    assert.equal(gridMove('ArrowRight', 5, 6, 4), 5);
    assert.equal(gridMove('End', 0, 6, 4), 5);
    assert.equal(gridMove('x', 0, 6, 4), null);
  });
});

describe('show grid actions (I-081)', () => {
  test('moveSlides moves a selection as a block, keeping its order', () => {
    assert.deepEqual(ids(actions.moveSlides(mini, { slideIds: ['e', 'a'], beforeSlideId: 'c' })), ['b', 'a', 'e', 'c', 'd', 'f']);
    assert.deepEqual(ids(actions.moveSlides(mini, { slideIds: ['a', 'b'], beforeSlideId: null })), ['c', 'd', 'e', 'f', 'a', 'b']);
    assert.equal(actions.moveSlides(mini, { slideIds: ['c', 'd'], beforeSlideId: 'e' }), mini, 'no change, same object');
  });

  test('dropping a selection onto one of its own slides lands before the next slide that stays', () => {
    assert.deepEqual(ids(actions.moveSlides(mini, { slideIds: ['a', 'c'], beforeSlideId: 'c' })), ['b', 'a', 'c', 'd', 'e', 'f']);
  });

  test('moving into a chapter gives the slides that chapter; the chapter order follows the slides', () => {
    const next = actions.moveSlides(mini, { slideIds: ['c', 'd'], beforeSlideId: 'a', chapter: 'y' });
    assert.deepEqual(ids(next), ['c', 'd', 'a', 'b', 'e', 'f']);
    assert.deepEqual(next.chapters.map((c) => c.id), ['y', 'x', 'z'], 'agenda order follows; the empty chapter keeps its place');
    const unassigned = actions.moveSlides(mini, { slideIds: ['a'], beforeSlideId: 'e', chapter: null });
    assert.ok(!('chapter' in unassigned.slides.find((s) => s.id === 'a')));
  });

  test('moveChapter moves all slides of a chapter (also a split one) as a block', () => {
    const next = actions.moveChapter(mini, { chapterId: 'x', beforeSlideId: null });
    assert.deepEqual(ids(next), ['c', 'd', 'e', 'a', 'b', 'f']);
    assert.deepEqual(next.chapters.map((c) => c.id), ['y', 'x', 'z']);
  });

  test('createChapterFromSlides gathers the slides where the first one is', () => {
    const next = actions.createChapterFromSlides(mini, { chapterId: 'w', title: 'W', slideIds: ['b', 'e'] });
    assert.deepEqual(ids(next), ['a', 'b', 'e', 'c', 'd', 'f']);
    assert.ok(next.slides.filter((s) => s.chapter === 'w').map((s) => s.id).join() === 'b,e');
    assert.deepEqual(next.chapters.map((c) => c.id), ['x', 'w', 'y', 'z']);
  });

  test('duplicate, delete (never all), hide, assign chapter: each one action', () => {
    const dup = actions.duplicateSlides(mini, { slideIds: ['a', 'c'] });
    assert.equal(dup.slides.length, 8);
    assert.equal(dup.slides[1].content.title, 'A');
    assert.equal(dup.slides[4].content.title, 'C');
    assert.deepEqual(ids(actions.deleteSlides(mini, { slideIds: ['a', 'f'] })), ['b', 'c', 'd', 'e']);
    assert.equal(actions.deleteSlides(mini, { slideIds: ids(mini) }), mini, 'a show keeps at least one slide');
    const hidden = actions.setSlidesHidden(mini, { slideIds: ['b', 'c'], audienceHidden: true });
    assert.deepEqual(hidden.slides.filter((s) => s.audience?.hidden).map((s) => s.id), ['b', 'c']);
    const assigned = actions.setSlidesChapter(mini, { slideIds: ['e'], chapter: 'y' });
    assert.equal(assigned.slides.find((s) => s.id === 'e').chapter, 'y');
  });

  test('on the demo, a grid edit keeps the show valid and references clean', () => {
    let show = actions.moveChapter(demo, { chapterId: demo.chapters.at(-1).id, beforeSlideId: demo.slides[0].id });
    show = actions.createChapterFromSlides(show, { chapterId: 'extra', title: 'Extra', slideIds: [show.slides.at(-1).id] });
    valid(show);
    const removed = actions.deleteSlides(demo, { slideIds: ['s-problem'] });
    assert.ok(!JSON.stringify(removed.paths).includes('s-problem'));
  });
});
