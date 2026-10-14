import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestLayout, cleanTags, entryFromSlide, filterEntries, glossaryIdsIn, landing, libraryTags, parseManifest, pathWithHash,
  planImport, prepareInsert, renamePaths, reorderEntries, slideFiles, updatedEntry,
} from '../js/library/library-model.js';
import { insertSlides } from '../js/actions.js';
import { SlideLibrary, memoryLibraryAdapter, contentHash } from '../js/library/library-store.js';
import { copyToLibrary, insertFromLibrary } from '../js/library/library-io.js';
import { createStore } from '../js/store.js';
import { validateShow } from '../../shared/validate.js';
import { readJson, clone } from '../../shared/test/helpers.js';

const demo = readJson('shows/demo/show.json');
const defaultTemplate = readJson('templates/default/template.json');
const conclusionTemplate = readJson('templates/conclusion/template.json');
const conclusionDemo = readJson('shows/conclusion-demo/show.json');

let n = 0;
const ids = () => `s-new${++n}`;

/** A small show with links between its slides, a profile and a glossary term. */
function sampleShow() {
  return {
    slipr: '0.2', id: 'source', meta: { title: 'Source show' }, template: { ref: '../../templates/default', version: '^1.0' },
    chapters: [{ id: 'one', title: 'One' }],
    profiles: [{ id: 'dev', label: 'Developer' }, { id: 'ops', label: 'Operations' }],
    glossary: { layout: { term: 'Layout', definition: 'A slide design.' }, 'widget-term': { term: 'Widget', definition: 'A made-up term.' } },
    slides: [
      {
        id: 's-a', layout: 'bullets', chapter: 'one',
        content: { title: 'A [[layout]]', body: '- See [the next](#s-b)\n- And [[widget-term|widgets]]' },
        reader: { related: ['s-b', 's-x'], blocks: [
          { id: 'b1', type: 'text', md: 'For developers and ops', for: ['dev', 'ops'] },
          { id: 'b5', type: 'text', md: 'Only for ops', for: ['ops'] },
          { id: 'b2', type: 'slide-ref', slide: 's-b', label: 'Next' },
          { id: 'b3', type: 'slide-ref', slide: 's-x', label: 'Elsewhere' },
          { id: 'b4', type: 'slide-ref', slide: 's-y' },
        ] },
      },
      { id: 's-b', layout: 'image-full', chapter: 'one', content: { title: 'B', image: { src: 'images/b.png', alt: 'B' } } },
    ],
  };
}

describe('library model (I-029)', () => {
  test('an entry keeps the slide, its layout, used glossary terms and the source; not its chapter', () => {
    const show = sampleShow();
    const e = entryFromSlide(show.slides[0], { show, template: defaultTemplate, tags: ['Intro', ' intro', 'Team'], now: 5 });
    assert.equal(e.title, 'A [[layout]]');
    assert.deepEqual(e.tags, ['intro', 'team']);
    assert.deepEqual(Object.keys(e.glossary).sort(), ['layout', 'widget-term']);
    assert.equal(e.layoutDef.id, 'bullets');
    assert.equal(e.slide.chapter, undefined);
    assert.equal(show.slides[0].chapter, 'one', 'the show is not changed');
    assert.deepEqual(e.source, { showId: 'source', showTitle: 'Source show', slideId: 's-a', template: { id: 'default', name: 'Slipr Default', version: defaultTemplate.version } });
    assert.deepEqual(glossaryIdsIn({ content: { a: '[[x]] and [[y|Y]]', b: ['[[x]]'] } }).sort(), ['x', 'y']);
  });

  test('files a slide uses: images, overlays, PDFs, data and layer files, backgrounds', () => {
    const files = slideFiles({
      content: { image: { src: 'images/a.png' }, doc: { pdf: 'docs/a.pdf', title: 'A' }, map: { markers: [], layers: [{ data: 'data/r.geojson' }] } },
      overlays: [{ image: { src: 'images/o.png' }, x: 0, y: 0, w: 0.1, h: 0.1 }],
      audience: { background: 'images/bg.jpg' },
    });
    assert.deepEqual(files.sort(), ['data/r.geojson', 'docs/a.pdf', 'images/a.png', 'images/bg.jpg', 'images/o.png']);
  });

  test('update keeps title, tags, note, collection and order', () => {
    const show = sampleShow();
    const old = { ...entryFromSlide(show.slides[0], { show, template: defaultTemplate, now: 1 }), title: 'Mine', tags: ['x'], note: 'n', collection: 'c', order: 7 };
    const fresh = entryFromSlide(show.slides[1], { show, template: defaultTemplate, now: 9 });
    const next = updatedEntry(old, fresh);
    assert.equal(next.id, old.id);
    assert.deepEqual([next.title, next.tags, next.note, next.collection, next.order, next.createdAt], ['Mine', ['x'], 'n', 'c', 7, 1]);
    assert.equal(next.slide.id, 's-b');
  });

  test('best layout: the same id, else the one whose slots take the content', () => {
    const conclusionSlide = conclusionDemo.slides.find((s) => s.layout === 'graph');
    const def = conclusionTemplate.layouts.find((l) => l.id === 'graph');
    assert.equal(bestLayout(conclusionSlide, def, defaultTemplate.layouts), 'graph', 'same id exists');
    const quote = { layout: 'big-quote', content: { quote: 'Q', title: 'T' } };
    const fit = bestLayout(quote, { slots: [{ name: 'quote', type: 'text' }, { name: 'title', type: 'text' }] }, [
      { id: 'title', slots: [{ name: 'title', type: 'text', required: true }, { name: 'subtitle', type: 'text' }] },
      { id: 'image-full', slots: [{ name: 'image', type: 'image', required: true }, { name: 'title', type: 'text' }] },
    ]);
    assert.equal(fit, 'title', 'image-full loses a point for its empty required image');
    assert.equal(bestLayout(quote, null, []), null);
  });

  test('prepareInsert: new ids, links remapped or cleaned, chapter of the slide before, profiles, glossary', () => {
    const source = sampleShow();
    const entries = source.slides.map((s, i) => entryFromSlide(s, { show: source, template: defaultTemplate, now: i }));
    const target = clone(demo);
    target.glossary = { ...target.glossary, layout: { term: 'Layout', definition: 'Something else.' } };
    const after = target.slides[2];
    const { slides, glossary, notices } = prepareInsert(entries, { show: target, template: defaultTemplate, afterSlideId: after.id, newId: ids });
    const [a, b] = slides;
    assert.notEqual(a.id, 's-a');
    assert.deepEqual(a.reader.related, [b.id], 's-b follows its new id, s-x is gone');
    assert.match(a.content.body, new RegExp(`\\(#${b.id}\\)`), 'Markdown link follows');
    assert.equal(a.chapter, after.chapter);
    const blocks = a.reader.blocks;
    assert.deepEqual(blocks[0].for, ['dev'], 'the demo has “dev”, not “ops”');
    assert.equal(blocks[1].for, undefined, 'no profile left: the block shows to everyone');
    assert.deepEqual(blocks[2], { id: 'b2', type: 'slide-ref', slide: b.id, label: 'Next' });
    assert.deepEqual(blocks[3], { id: 'b3', type: 'text', md: 'Elsewhere' }, 'a link to a missing slide becomes its label');
    assert.equal(blocks.length, 4, 'a link without a label is dropped');
    assert.deepEqual(Object.keys(glossary), ['widget-term'], 'the show keeps its own “layout”');
    assert.ok(notices.some((t) => t.includes('already defines “Layout”')));
    assert.ok(notices.some((t) => t.includes('links to slides')));
    assert.ok(notices.some((t) => t.includes('reader profile')));
  });

  test('prepareInsert: a slide from another template takes the best layout here, the rest goes to _orphaned', () => {
    const slide = conclusionDemo.slides.find((s) => s.layout === 'section-wave') ?? conclusionDemo.slides[1];
    const entry = entryFromSlide(slide, { show: conclusionDemo, template: conclusionTemplate, now: 1 });
    const { slides, notices } = prepareInsert([entry], { show: demo, template: defaultTemplate, newId: ids });
    assert.ok(defaultTemplate.layouts.some((l) => l.id === slides[0].layout));
    if (!defaultTemplate.layouts.some((l) => l.id === slide.layout)) assert.ok(notices[0].includes('is not in this template'));
  });

  test('landing: a two-column slide in the Conclusion template switches layout and sets columns aside', () => {
    const slide = demo.slides.find((s) => s.layout === 'two-column');
    const entry = entryFromSlide(slide, { show: demo, template: defaultTemplate, now: 1 });
    const here = landing(entry, defaultTemplate);
    assert.deepEqual(here, { layout: 'two-column', switched: false, aside: [] });
    const there = landing(entry, conclusionTemplate);
    if (!conclusionTemplate.layouts.some((l) => l.id === 'two-column')) {
      assert.equal(there.switched, true);
      const { slides, notices } = prepareInsert([entry], { show: conclusionDemo, template: conclusionTemplate, newId: ids });
      assert.equal(slides[0].layout, there.layout);
      for (const k of Object.keys(slides[0]._orphaned ?? {})) assert.ok(k in slide.content);
      if (there.aside.length) assert.ok(notices[0].includes('kept aside'));
    }
  });

  test('graph and map links to slides are remapped or dropped', () => {
    const show = { ...sampleShow(), slides: [
      { id: 's-g', layout: 'graph', content: { graph: { nodes: [{ id: 'a', slide: 's-m' }, { id: 'b', slide: 's-zz' }] } } },
      { id: 's-m', layout: 'map', content: { map: { markers: [{ lat: 1, lng: 2, slide: 's-g' }] } } },
    ] };
    const entries = show.slides.map((s, i) => entryFromSlide(s, { show, template: defaultTemplate, now: i }));
    const [g, m] = prepareInsert(entries, { show: demo, template: defaultTemplate, newId: ids }).slides;
    assert.equal(g.content.graph.nodes[0].slide, m.id);
    assert.equal(g.content.graph.nodes[1].slide, undefined);
    assert.equal(m.content.map.markers[0].slide, g.id);
  });

  test('renamed files and the insertSlides action', () => {
    assert.equal(pathWithHash('images/a.png', 'abcdef0123456789'), 'images/a-abcdef01.png');
    assert.equal(pathWithHash('data/file', 'abcdef0123456789'), 'data/file-abcdef01');
    assert.deepEqual(renamePaths({ a: 'images/a.png', b: ['images/a.png', 'other'] }, new Map([['images/a.png', 'images/a-1.png']])), { a: 'images/a-1.png', b: ['images/a-1.png', 'other'] });
    const show = { slides: [{ id: 'x', chapter: 'c1' }, { id: 'y', chapter: 'c2' }], chapters: [{ id: 'c1', title: '1' }, { id: 'c2', title: '2' }], glossary: { a: { term: 'A' } } };
    const next = insertSlides(show, { slides: [{ id: 'n', chapter: 'c1' }], afterSlideId: 'x', glossary: { a: { term: 'other' }, b: { term: 'B' } } });
    assert.deepEqual(next.slides.map((s) => s.id), ['x', 'n', 'y']);
    assert.deepEqual(next.glossary, { a: { term: 'A' }, b: { term: 'B' } });
    assert.deepEqual(insertSlides(show, { slides: [{ id: 'z' }] }).slides.map((s) => s.id), ['x', 'y', 'z'], 'no anchor: at the end');
    assert.equal(insertSlides(show, { slides: [] }), show);
  });

  test('filter, search, tags and sort', () => {
    const e = (id, title, tags, extra = {}) => ({ id, title, tags, note: '', collection: null, order: 0, createdAt: 0, updatedAt: 0, source: { showId: 's1', showTitle: 'Deck', template: { id: 'default' } }, slide: { content: { title } }, glossary: {}, files: [], ...extra });
    const list = [
      e('1', 'Pricing table', ['sales'], { order: 2, createdAt: 3 }),
      e('2', 'Team photo', ['team', 'intro'], { order: 1, createdAt: 1, collection: 'c' }),
      e('3', 'Agenda', ['intro'], { order: 3, createdAt: 2, source: { showId: 's2', showTitle: 'Other', template: { id: 'conclusion' } }, slide: { content: { title: 'Agenda', body: '- **Welcome** coffee' } } }),
    ];
    assert.deepEqual(filterEntries(list, { query: 'coffee' }).map((x) => x.id), ['3'], 'slide text, Markdown stripped');
    assert.deepEqual(filterEntries(list, { tags: ['intro'] }).map((x) => x.id), ['3', '2']);
    assert.deepEqual(filterEntries(list, { collection: '' }).map((x) => x.id), ['1', '3']);
    assert.deepEqual(filterEntries(list, { template: 'conclusion' }).map((x) => x.id), ['3']);
    assert.deepEqual(filterEntries(list, { showId: 's1', sort: 'title' }).map((x) => x.id), ['1', '2']);
    assert.deepEqual(filterEntries(list, { sort: 'newest' }).map((x) => x.id), ['1', '3', '2']);
    assert.deepEqual(filterEntries(list, {}, [{ id: 'c', name: 'C', order: 1 }]).map((x) => x.id), ['1', '3', '2'], 'manual: no collection first, then collections in order');
    assert.deepEqual(libraryTags(list), ['intro', 'sales', 'team']);
    assert.deepEqual(cleanTags('A, b ,,a'), ['a', 'b']);
  });

  test('reorder within a collection', () => {
    const list = ['a', 'b', 'c'].map((id, i) => ({ id, collection: null, order: i + 1, createdAt: 0 }));
    list.push({ id: 'z', collection: 'other', order: 1, createdAt: 0 });
    assert.deepEqual(reorderEntries(list, 'c', -1).sort((x, y) => x.id.localeCompare(y.id)), [{ id: 'b', order: 3 }, { id: 'c', order: 2 }]);
    assert.deepEqual(reorderEntries(list, 'a', 2, { absolute: true }).map((c) => c.id).sort(), ['a', 'b', 'c']);
    assert.deepEqual(reorderEntries(list, 'a', -1), [], 'already first');
    assert.deepEqual(reorderEntries(list, 'z', 1), [], 'alone in its collection');
  });

  test('import: manifest checks and plan', () => {
    assert.throws(() => parseManifest({ format: 'other' }), /not a Slipr slide library/);
    assert.throws(() => parseManifest({ format: 'slipr-library', version: 99 }), /newer/);
    const { entries } = parseManifest({ format: 'slipr-library', version: 1, entries: [
      { id: 'a', title: 'A', slide: { id: 's' }, files: [{ path: 'images/x.png', hash: '../../evil' }, { path: 'images/y.png', hash: 'ab'.repeat(16) }] },
      { id: 'bad' },
    ] });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].files.length, 1, 'a hash that is not hex is dropped');
    const plan = planImport([{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 1 }, { id: 'c', updatedAt: 1 }], [{ id: 'a', updatedAt: 3 }, { id: 'b', updatedAt: 2 }]);
    assert.deepEqual([plan.add, plan.replace, plan.skip].map((l) => l.map((e) => e.id)), [['c'], ['a'], ['b']]);
  });
});

describe('library store and round trips (I-029)', () => {
  const png = (seed) => new Blob([new Uint8Array([137, 80, 78, 71, seed])], { type: 'image/png' });

  /** An editor store on a show whose files live in memory. */
  function storeWith(show, files, template = defaultTemplate) {
    const store = createStore(show, { template });
    store.state.inMemoryAssets = new Map(files);
    store.state.resolveAsset = (src) => `memory:${src}`;
    return store;
  }

  test('copy slides with their files; files are stored once and removed with the last entry', async () => {
    const library = new SlideLibrary(memoryLibraryAdapter());
    const show = sampleShow();
    show.slides[0].content.image = { src: 'images/b.png', alt: 'same picture' };
    const store = storeWith(show, [['images/b.png', png(1)]]);
    const { count, missing } = await copyToLibrary(store, library, ['s-a', 's-b'], { tags: ['x'] });
    assert.equal(count, 2);
    assert.deepEqual(missing, []);
    const entries = await library.entries();
    assert.deepEqual(entries.map((e) => e.files.length), [1, 1]);
    assert.equal((await library.adapter.keys('files')).length, 1, 'one picture, stored once');
    assert.ok(await library.file(entries[0].files[0].hash));
    await library.remove([entries[0].id]);
    assert.equal((await library.adapter.keys('files')).length, 1, 'still used by the other entry');
    await library.remove([entries[1].id]);
    assert.equal((await library.adapter.keys('files')).length, 0);
  });

  test('a missing file is reported and left out', async () => {
    const library = new SlideLibrary(memoryLibraryAdapter());
    const store = storeWith(sampleShow(), []); // images/b.png is nowhere (memory: URLs cannot be fetched)
    const { count, missing } = await copyToLibrary(store, library, ['s-b']);
    assert.equal(count, 1);
    assert.deepEqual(missing, ['images/b.png']);
    assert.deepEqual((await library.entries())[0].files, []);
  });

  test('insert into another show: files written (renamed when the name is taken), slides valid, one undo step', async () => {
    const library = new SlideLibrary(memoryLibraryAdapter());
    const source = storeWith(sampleShow(), [['images/b.png', png(1)]]);
    await copyToLibrary(source, library, ['s-a', 's-b']);
    const entries = (await library.entries()).sort((a, b) => a.order - b.order);

    const targetShow = clone(demo);
    const target = storeWith(targetShow, [['images/b.png', png(2)]]); // a different picture with the same name
    const before = target.state.show.slides.length;
    const { slideIds, notices } = await insertFromLibrary(target, library, entries, targetShow.slides[0].id);
    const show = target.state.show;
    assert.equal(show.slides.length, before + 2);
    assert.deepEqual(show.slides.slice(1, 3).map((s) => s.id), slideIds);
    const image = show.slides[2].content.image.src;
    assert.match(image, /^images\/b-[0-9a-f]{8}\.png$/, 'renamed: the show has another b.png');
    assert.ok(target.state.inMemoryAssets.has(image));
    assert.equal(await contentHash(await target.state.inMemoryAssets.get(image).arrayBuffer()), entries[1].files[0].hash);
    assert.ok(notices.some((t) => t.includes('new name')));
    assert.equal(target.state.selectedSlideId, slideIds[0]);
    const result = validateShow(show, { template: defaultTemplate });
    assert.deepEqual(result.errors, []);
    target.undo();
    assert.equal(target.state.show.slides.length, before, 'one undo step');
  });

  test('insert the same file twice: written once, reused', async () => {
    const library = new SlideLibrary(memoryLibraryAdapter());
    const source = storeWith(sampleShow(), [['images/b.png', png(1)]]);
    await copyToLibrary(source, library, ['s-b']);
    const [entry] = await library.entries();
    const target = storeWith(clone(demo), []);
    await insertFromLibrary(target, library, [entry], null);
    await insertFromLibrary(target, library, [entry], null);
    const srcs = target.state.show.slides.slice(-2).map((s) => s.content.image.src);
    assert.deepEqual(srcs, ['images/b.png', 'images/b.png']);
    assert.equal(target.state.inMemoryAssets.size, 1);
  });

  test('export and import a library zip', async () => {
    const library = new SlideLibrary(memoryLibraryAdapter());
    await library.saveCollection({ id: 'col-1', name: 'Intro', order: 1 });
    const source = storeWith(sampleShow(), [['images/b.png', png(3)]]);
    await copyToLibrary(source, library, ['s-b'], { collection: 'col-1', tags: ['photo'] });
    const { bytes, count, missing } = await library.exportZip();
    assert.equal(count, 1);
    assert.equal(missing, 0);

    const other = new SlideLibrary(memoryLibraryAdapter());
    assert.deepEqual(await other.importZip(bytes), { added: 1, replaced: 0, skipped: 0 });
    const [entry] = await other.entries();
    assert.deepEqual(entry.tags, ['photo']);
    assert.deepEqual((await other.collections()).map((c) => c.name), ['Intro']);
    assert.ok(await other.file(entry.files[0].hash), 'the picture came along');
    assert.deepEqual(await other.importZip(bytes), { added: 0, replaced: 0, skipped: 1 }, 'importing again changes nothing');
  });

  test('removing a collection keeps its slides', async () => {
    const library = new SlideLibrary(memoryLibraryAdapter());
    await library.saveCollection({ id: 'c', name: 'C', order: 1 });
    await copyToLibrary(storeWith(sampleShow(), [['images/b.png', png(4)]]), library, ['s-b'], { collection: 'c' });
    await library.removeCollection('c');
    assert.deepEqual(await library.collections(), []);
    assert.equal((await library.entries())[0].collection, null);
  });
});
