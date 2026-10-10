import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readJson, clone, exists, repoRoot } from '../../shared/test/helpers.js';
import { validateShow } from '../../shared/validate.js';
import * as actions from '../js/actions.js';
import { canonicalShow, serializeShow } from '../js/io/serialize.js';
import { buildNewShow, caretRange, slugify } from '../js/io/new-show.js';

const demo = readJson('shows/demo/show.json');
const conclusionDemo = readJson('shows/conclusion-demo/show.json');

/** Objects whose key order is data (maps), not schema: it is kept as is. */
const MAPS = new Set(['content', '_orphaned', 'glossary']);

/**
 * Same data, the keys of every schema-shaped object reversed. Maps and card
 * objects (items of an array inside a map) keep their order.
 */
function reverseKeys(value, keep = false) {
  if (Array.isArray(value)) return value.map((item) => reverseKeys(item, keep));
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value);
  if (!keep) entries.reverse();
  return Object.fromEntries(entries.map(([k, v]) => {
    if (MAPS.has(k)) return [k, Object.fromEntries(Object.entries(v).map(([n, x]) => [n, reverseKeys(x, Array.isArray(x))]))];
    return [k, reverseKeys(v)];
  }));
}

describe('serializeShow (E-002)', () => {
  test('keeps the data, uses 2-space indentation and ends with a newline', () => {
    for (const show of [demo, conclusionDemo]) {
      const text = serializeShow(show);
      assert.deepEqual(JSON.parse(text), show);
      assert.ok(text.endsWith('}\n'));
      assert.match(text, /^\{\n {2}"/);
    }
  });

  test('key order is canonical, whatever order the store has', () => {
    for (const show of [demo, conclusionDemo]) {
      assert.equal(serializeShow(reverseKeys(show)), serializeShow(show));
    }
  });

  test('known keys follow the schema; slot names keep the show order', () => {
    const show = clone(demo);
    show.slides[0] = { content: { b: 'x', a: 'y' }, layout: 'title', id: 'zz', notes: 'n' };
    const out = canonicalShow(show);
    assert.deepEqual(Object.keys(out).slice(0, 4), ['$schema', 'slipr', 'id', 'meta']);
    assert.deepEqual(Object.keys(out.slides[0]), ['id', 'layout', 'content', 'notes']);
    assert.deepEqual(Object.keys(out.slides[0].content), ['b', 'a']);
  });

  test('image objects, cards and reader blocks are ordered too', () => {
    const show = clone(conclusionDemo);
    const s = show.slides.find((x) => x.content?.image);
    s.content.image = { alt: 'A', src: 'images/a.png' };
    const out = canonicalShow(show).slides.find((x) => x.id === s.id);
    assert.deepEqual(Object.keys(out.content.image), ['src', 'alt']);

    const withBlock = clone(demo);
    const slide = withBlock.slides.find((x) => x.reader?.blocks?.length);
    slide.reader.blocks[0] = reverseKeys(slide.reader.blocks[0]);
    const block = canonicalShow(withBlock).slides.find((x) => x.id === slide.id).reader.blocks[0];
    assert.deepEqual(Object.keys(block).slice(0, 2), ['id', 'type']);
  });

  test('a slide added by the editor serializes with id first', () => {
    const next = actions.addSlide(demo, { layout: 'bullets' });
    const added = JSON.parse(serializeShow(next)).slides.at(-1);
    assert.equal(Object.keys(added)[0], 'id');
  });
});

describe('new show from a template (E-002)', () => {
  test('slugify and caretRange', () => {
    assert.equal(slugify('Café   Ideas: 2027!'), 'cafe-ideas-2027');
    assert.equal(slugify('***'), '');
    assert.equal(caretRange('1.0.0'), '^1.0');
    assert.equal(caretRange('0.1.0'), '^0.1');
    assert.equal(caretRange(undefined), undefined);
  });

  for (const templateId of ['default', 'conclusion']) {
    test(`a new ${templateId} show is valid without warnings`, () => {
      const template = readJson(`templates/${templateId}/template.json`);
      const show = buildNewShow({ templateId, template, title: 'My Talk', date: '2026-10-10' });
      assert.equal(show.id, 'my-talk');
      assert.equal(show.template.ref, `/templates/${templateId}`, 'root-relative ref (D-012)');
      assert.equal(show.slides[0].layout, template.layouts[0].id);
      assert.equal(show.slides[0].content.title, 'My Talk');
      const result = validateShow(show, { template });
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.warnings, []);
    });
  }

  test('templates/index.json lists exactly the template folders', () => {
    const listed = readJson('templates/index.json').templates;
    const folders = readdirSync(resolve(repoRoot, 'templates'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && exists(`templates/${d.name}/template.json`))
      .map((d) => d.name);
    assert.deepEqual([...listed].sort(), folders.sort());
  });
});

describe('viewer URLs for Present / Read (E-007)', async () => {
  const { viewerUrl } = await import('../js/files.js');

  test('a folder show opens by key, a URL show by path', () => {
    assert.equal(viewerUrl({ folderKey: 'ab12cd34', mode: 'audience', slideId: 's-1' }), '../viewer/?folder=ab12cd34#/s-1');
    assert.equal(viewerUrl({ showUrl: '../shows/demo/show.json', mode: 'reader', slideId: 's-1' }), '../viewer/?show=..%2Fshows%2Fdemo%2Fshow.json&mode=reader#s-1');
  });

  test('the folder wins over the URL it was first opened with', () => {
    assert.equal(viewerUrl({ folderKey: 'k', showUrl: 'x/show.json', mode: 'audience', slideId: null }), '../viewer/?folder=k');
  });

  test('without a slide there is no hash; without a location there is no URL', () => {
    assert.equal(viewerUrl({ folderKey: 'k', mode: 'reader' }), '../viewer/?folder=k&mode=reader');
    assert.equal(viewerUrl({ mode: 'audience', slideId: 's-1' }), null);
  });
});
