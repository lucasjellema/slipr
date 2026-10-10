import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { personalize, normalisePrefs, prefsFromParams, nearestVisibleSlide, blockVisible, DEFAULT_PREFS } from '../reader/personalize.js';
import { readJson } from '../../shared/test/helpers.js';

const demo = readJson('shows/demo/show.json');
const ids = (model) => model.slides.map((s) => s.slide.id);
const blockIds = (model, slideId) => model.slides.find((s) => s.slide.id === slideId)?.blocks.map((b) => b.id);

describe('slides', () => {
  test('default: all slides except reader-hidden ones, in show order', () => {
    const model = personalize(demo);
    assert.ok(!ids(model).includes('s-data-1'), 'reader.hidden');
    assert.ok(!ids(model).includes('s-thanks'), 'reader.hidden');
    assert.ok(ids(model).includes('s-backup-format'), 'audience-hidden slides are readable');
    assert.equal(ids(model)[0], 's-title');
    assert.equal(model.slides.length, demo.slides.length - 2);
  });

  test('a path selects and orders slides', () => {
    const model = personalize(demo, { path: 'quick' });
    assert.deepEqual(ids(model), ['s-title', 's-problem', 's-two-modes', 's-architecture', 's-roadmap']);
    assert.equal(model.path.label, '5-minute overview');
  });

  test('path "*" means all slides', () => {
    assert.deepEqual(ids(personalize(demo, { path: 'full' })), ids(personalize(demo)));
  });

  test('slides are grouped into consecutive chapters', () => {
    const model = personalize(demo);
    assert.deepEqual(model.chapters.map((c) => c.chapter?.id), ['why', 'how', 'next']);
    assert.equal(model.chapters[0].slides[0].slide.id, 's-title');
  });

  test('a path that jumps between chapters creates a group per run', () => {
    const show = { ...demo, paths: [{ id: 'zig', label: 'Zig', slides: ['s-title', 's-how', 's-problem'] }] };
    assert.deepEqual(personalize(show, { path: 'zig' }).chapters.map((c) => c.chapter?.id), ['why', 'how', 'why']);
  });
});

describe('blocks', () => {
  test('default depth 2 hides deep-dive blocks', () => {
    assert.deepEqual(blockIds(personalize(demo), 's-data-2'), ['idea', 'mgr-why']);
  });

  test('depth 3 shows everything, depth 1 only essentials', () => {
    assert.deepEqual(blockIds(personalize(demo, { depth: 3 }), 's-data-2'), ['idea', 'mgr-why', 'dev-code']);
    assert.deepEqual(blockIds(personalize(demo, { depth: 1 }), 's-data-2'), ['idea']);
  });

  test('a profile hides blocks meant for other profiles', () => {
    assert.deepEqual(blockIds(personalize(demo, { profile: 'dev', depth: 3 }), 's-data-2'), ['idea', 'dev-code']);
    assert.deepEqual(blockIds(personalize(demo, { profile: 'mgr', depth: 3 }), 's-data-2'), ['idea', 'mgr-why']);
  });

  test('blockVisible', () => {
    assert.equal(blockVisible({ for: ['dev'] }, { profile: null, depth: 2, path: null }), true);
    assert.equal(blockVisible({ for: ['dev'] }, { profile: 'mgr', depth: 2, path: null }), false);
    assert.equal(blockVisible({ depth: 3 }, { profile: null, depth: 2, path: null }), false);
    assert.equal(blockVisible({}, { profile: null, depth: 2, path: null }), true);
  });
});

describe('prefs', () => {
  test('unknown ids and bad depths are normalised', () => {
    assert.deepEqual(normalisePrefs(demo, { profile: 'cfo', path: 'nope', depth: 9 }), DEFAULT_PREFS);
    assert.deepEqual(normalisePrefs(demo, { profile: 'dev', path: 'quick', depth: 1 }), { profile: 'dev', depth: 1, path: 'quick' });
  });

  test('prefsFromParams only includes given parameters', () => {
    assert.deepEqual(prefsFromParams(new URLSearchParams('profile=dev&depth=3')), { profile: 'dev', depth: 3 });
    assert.deepEqual(prefsFromParams(new URLSearchParams('')), {});
  });
});

describe('nearestVisibleSlide', () => {
  const model = personalize(demo);
  test('visible slide: itself', () => assert.equal(nearestVisibleSlide(demo, model, 's-how'), 's-how'));
  test('hidden slide: the previous visible one', () => assert.equal(nearestVisibleSlide(demo, model, 's-data-1'), 's-how'));
  test('hidden last-ish slide: previous visible', () => assert.equal(nearestVisibleSlide(demo, model, 's-thanks'), 's-ai'));
  test('unknown or missing id: first slide', () => {
    assert.equal(nearestVisibleSlide(demo, model, 'nope'), 's-title');
    assert.equal(nearestVisibleSlide(demo, model, null), 's-title');
  });
  test('slide not on the active path', () => {
    const quick = personalize(demo, { path: 'quick' });
    assert.equal(nearestVisibleSlide(demo, quick, 's-tailored'), 's-architecture');
  });
});
