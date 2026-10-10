import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../shared/test/helpers.js';
import { defaultState, migrate, createStore, memoryAdapter, openReaderState, isAnnotation } from '../reader/state.js';
import { describeQuote, locateQuote } from '../reader/quote.js';
import { buildSearchIndex, search, fold, tokens } from '../reader/search-index.js';
import { personalize } from '../reader/personalize.js';
import { annotationsToMarkdown, annotationsToJson, mergeImportedAnnotations } from '../reader/notes-export.js';

import { pinFromPoint, pinPosition, describeTarget, humanise } from '../reader/pin.js';

describe('slide notes and pins', () => {
  const pinAnn = { id: 'p1', kind: 'pin', slideId: 's-architecture', note: 'Look here', created: '2026-10-10T12:00:00Z',
    pin: { slot: 'image', item: null, x: 0.25, y: 0.5, cx: 0.3, cy: 0.6, label: 'Image' } };
  const slideAnn = { id: 'n1', kind: 'slide', slideId: 's-roadmap', note: 'Ask about dates', created: '2026-10-10T12:01:00Z' };

  test('isAnnotation accepts the three kinds and rejects broken pins', () => {
    assert.equal(isAnnotation(pinAnn), true);
    assert.equal(isAnnotation(slideAnn), true);
    assert.equal(isAnnotation({ ...pinAnn, pin: { ...pinAnn.pin, x: 1.5 } }), false);
    assert.equal(isAnnotation({ ...pinAnn, pin: undefined }), false);
    assert.equal(isAnnotation({ ...slideAnn, kind: 'doodle' }), false);
    assert.deepEqual(migrate({ annotations: [pinAnn, slideAnn, { id: 'x' }] }).annotations.map((a) => a.id), ['p1', 'n1']);
  });

  test('pinFromPoint: fractions within the object and the canvas', () => {
    const object = { left: 100, top: 50, width: 200, height: 100 };
    const canvas = { left: 0, top: 0, width: 1000, height: 500 };
    assert.deepEqual(pinFromPoint(object, canvas, 150, 75), { x: 0.25, y: 0.25, cx: 0.15, cy: 0.15 });
    assert.deepEqual(pinFromPoint(object, canvas, -20, 9999), { x: 0, y: 1, cx: 0, cy: 1 }, 'clamped');
  });

  test('pinPosition follows the object, or falls back to the canvas', () => {
    const pin = { x: 0.5, y: 0.5, cx: 0.1, cy: 0.2 };
    const frame = { left: 0, top: 0, width: 1000, height: 500 };
    const canvas = frame;
    assert.deepEqual(pinPosition(pin, { left: 200, top: 100, width: 100, height: 50 }, canvas, frame), { left: 25, top: 25, approximate: false });
    assert.deepEqual(pinPosition(pin, null, canvas, frame), { left: 10, top: 20, approximate: true });
  });

  test('describeTarget and humanise', () => {
    assert.equal(describeTarget({ slot: 'body', item: 1, text: 'Linked to a template', isImage: false }), 'Bullet 2: “Linked to a template”');
    assert.equal(describeTarget({ slot: 'image', item: null, text: '', isImage: true }), 'Image');
    assert.equal(describeTarget({ slot: 'title', item: null, text: 'Roadmap', isImage: false }), 'Title: “Roadmap”');
    assert.equal(describeTarget({ slot: null, item: null, text: '', isImage: false }), 'Slide');
    assert.equal(humanise('leftTitle'), 'Left title');
  });

  test('Markdown export describes slide notes and pins', () => {
    const md = annotationsToMarkdown(demo, [pinAnn, slideAnn]);
    assert.match(md, /## Three components, one shared core\n\n_📍 Pin on Image_\n\nLook here/);
    assert.match(md, /## Roadmap\n\n_Note on the slide_\n\nAsk about dates/);
  });
});

describe('notes export / import', () => {
  const a1 = { id: 'a1', slideId: 's-problem', blockId: 'story', quote: { exact: 'the speaker carries the story', prefix: '', suffix: '' }, note: 'Key point', created: '2026-10-10T10:00:00Z' };
  const a2 = { id: 'a2', slideId: 's-title', blockId: 'intro', quote: { exact: 'reader version', prefix: '', suffix: '' }, note: '', created: '2026-10-10T11:00:00Z' };

  test('Markdown groups by slide in show order, with bookmarks', () => {
    const md = annotationsToMarkdown(demo, [a1, a2], { bookmarks: ['s-ai'], date: '2026-10-10' });
    assert.match(md, /^# My notes: Introducing Slipr/);
    assert.match(md, /## Bookmarks\n\n- AI help, kept in its cage/);
    assert.ok(md.indexOf('## Introducing Slipr') < md.indexOf('## Why another presentation tool?'), 'show order');
    assert.match(md, /> the speaker carries the story\n\nKey point/);
  });

  test('empty export says so', () => {
    assert.match(annotationsToMarkdown(demo, []), /No highlights or notes yet/);
  });

  test('JSON round-trip merges by id; newer wins', () => {
    const json = annotationsToJson(demo, [a1, { ...a2, note: 'newer', updated: '2026-10-11T00:00:00Z' }]);
    const merged = mergeImportedAnnotations(json, demo, [a2]);
    assert.equal(merged.added, 1);
    assert.equal(merged.updated, 1);
    assert.equal(merged.annotations.find((a) => a.id === 'a2').note, 'newer');
  });

  test('rejects files for another show or of another kind', () => {
    assert.equal(mergeImportedAnnotations(annotationsToJson({ id: 'other' }, [a1]), demo, []), null);
    assert.equal(mergeImportedAnnotations('{"hello":1}', demo, []), null);
    assert.equal(mergeImportedAnnotations('not json', demo, []), null);
  });
});

const demo = readJson('shows/demo/show.json');

describe('reader state', () => {
  test('migrate() repairs anything', () => {
    assert.deepEqual(migrate(null), defaultState());
    assert.deepEqual(migrate('junk'), defaultState());
    const m = migrate({ prefs: { profile: 'dev', depth: 7 }, visited: ['a', 'a', 3, 'b'], welcomed: 'yes', annotations: [{ id: 'x' }] });
    assert.deepEqual(m.prefs, { profile: 'dev', depth: 2, path: null });
    assert.deepEqual(m.visited, ['a', 'b']);
    assert.equal(m.welcomed, false);
    assert.deepEqual(m.annotations, []);
  });

  test('isAnnotation', () => {
    const a = { id: '1', slideId: 's', blockId: 'b', quote: { exact: 'x', prefix: '', suffix: '' }, note: '', created: '2026-10-10T10:00:00Z' };
    assert.equal(isAnnotation(a), true);
    assert.equal(isAnnotation({ ...a, quote: { exact: '', prefix: '', suffix: '' } }), false);
  });

  test('store: update notifies and saves once (debounced)', async () => {
    const saved = [];
    const store = createStore(defaultState(), { save: (s) => { saved.push(s); }, delay: 10 });
    const seen = [];
    store.subscribe((s) => seen.push(s.bookmarks.length));
    store.update({ bookmarks: ['a'] });
    store.update((s) => ({ bookmarks: [...s.bookmarks, 'b'] }));
    assert.deepEqual(seen, [1, 2]);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].bookmarks, ['a', 'b']);
  });

  test('openReaderState round-trips through an adapter', async () => {
    const adapter = memoryAdapter();
    const first = await openReaderState('demo', { adapter });
    first.update({ visited: ['s-title'] });
    await first.flush();
    const second = await openReaderState('demo', { adapter });
    assert.deepEqual(second.get().visited, ['s-title']);
    assert.equal(second.adapter, 'memory');
  });
});

describe('text-quote anchoring', () => {
  const text = 'The cat sat. The cat ran. The dog sat.';

  test('describe and locate round-trip', () => {
    const start = text.indexOf('cat ran');
    const q = describeQuote(text, start, start + 7);
    assert.deepEqual(q, { exact: 'cat ran', prefix: 'The cat sat. The ', suffix: '. The dog sat.' });
    assert.deepEqual(locateQuote(text, q), { start, end: start + 7 });
  });

  test('picks the occurrence with the best context', () => {
    const second = text.indexOf('The cat', 5);
    const q = describeQuote(text, second, second + 7);
    assert.equal(locateQuote(text, q).start, second);
  });

  test('survives edits elsewhere in the text', () => {
    const q = describeQuote(text, 17, 24);
    const edited = 'Intro added. ' + text.replace('dog', 'bird');
    assert.equal(edited.slice(locateQuote(edited, q).start, locateQuote(edited, q).end), 'cat ran');
  });

  test('returns null when the text is gone', () => {
    assert.equal(locateQuote('nothing here', { exact: 'cat', prefix: '', suffix: '' }), null);
  });
});

describe('search', () => {
  const docs = buildSearchIndex(demo);

  test('fold() strips accents and keeps an index map', () => {
    const f = fold('Café É');
    assert.equal(f.text, 'cafe e');
    assert.equal(f.map[3], 3);
    assert.deepEqual(tokens('  Réader-layer! '), ['reader', 'layer']);
  });

  test('finds slides by title with the highest score', () => {
    const { results } = search(docs, 'architecture');
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.doc.slideId === 's-architecture'));
  });

  test('prefix matching and AND semantics', () => {
    assert.ok(search(docs, 'archit').results.some((r) => r.doc.slideId === 's-architecture'), 'word prefix');
    assert.equal(search(docs, 'rchitecture').results.length, 0, 'not in the middle of a word');
    const both = search(docs, 'temp swap').results;
    assert.ok(both.some((r) => r.doc.slideId === 's-data-2' && r.doc.blockId === 'idea'), 'callout "Swap the template…"');
    assert.equal(search(docs, 'template zzzz').results.length, 0);
  });

  test('finds text inside tabs, hotspots and glossary', () => {
    assert.ok(search(docs, 'python-pptx').results.some((r) => r.doc.blockId === 'diagram'));
    assert.ok(search(docs, 'open-source framework').results.some((r) => r.doc.kind === 'glossary'));
    assert.ok(search(docs, 'maxItems').results.some((r) => r.doc.blockId === 'dev-code'));
  });

  test('snippets are escaped and marked', () => {
    const r = search(docs, 'business case').results.find((x) => x.doc.blockId === 'mgr-value');
    assert.match(r.snippetHtml, /<mark>business<\/mark> <mark>case<\/mark>/);
    assert.doesNotMatch(search(docs, 'json').results.map((x) => x.snippetHtml).join(''), /<(?!\/?mark>)/);
  });

  test('finds text and image alt text inside cards', () => {
    const show = { id: 'c', meta: { title: 'C' }, slides: [{ id: 's-cards', layout: 'columns-4', content: {
      title: 'Our offices', cards: [{ title: 'Utrecht', text: 'Head *office*' }, { image: { src: 'x.png', alt: 'Harbour crane' } }],
    } }] };
    const cardDocs = buildSearchIndex(show);
    assert.ok(search(cardDocs, 'head office').results.some((r) => r.doc.slideId === 's-cards'));
    assert.ok(search(cardDocs, 'crane').results.some((r) => r.doc.slideId === 's-cards'));
  });

  test('notes are only searched when asked', () => {
    assert.equal(search(docs, 'Pause here').results.length, 0);
    assert.ok(search(docs, 'Pause here', { includeNotes: true }).results.some((r) => r.doc.kind === 'notes'));
  });

  test('matches hidden by tailoring are counted, not listed', () => {
    const model = personalize(demo, { profile: 'mgr' });
    const visibleBlocks = new Set(model.slides.flatMap((s) => s.blocks.map((b) => `${s.slide.id}/${b.id}`)));
    const visibleSlides = new Set(model.slides.map((s) => s.slide.id));
    const visible = (doc) => doc.kind === 'glossary' || (visibleSlides.has(doc.slideId) && (doc.kind !== 'block' || visibleBlocks.has(`${doc.slideId}/${doc.blockId}`)));
    const { results, hidden } = search(docs, 'maxItems', { visible });
    assert.equal(results.length, 0);
    assert.equal(hidden, 1);
  });
});
