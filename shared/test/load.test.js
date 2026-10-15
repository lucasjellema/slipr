import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadShow, LoadError } from '../load.js';
import { repoRoot } from './helpers.js';

const base = pathToFileURL(`${repoRoot}/`);

/** A fetch that serves repository files from disk (file: URLs), with overrides. */
function fsFetch(overrides = {}) {
  return async (href, init = {}) => {
    if (href in overrides) {
      const o = overrides[href];
      if (o instanceof Error) throw o;
      return new Response(o.body ?? '', { status: o.status ?? 200, statusText: o.statusText ?? '' });
    }
    try {
      const body = await readFile(fileURLToPath(href));
      return new Response(init.method === 'HEAD' ? null : body, { status: 200 });
    } catch {
      return new Response('', { status: 404, statusText: 'Not Found' });
    }
  };
}

test('loads the demo show, its template and all layouts', async () => {
  const ctx = await loadShow('shows/demo/show.json', { baseUrl: base, fetch: fsFetch() });
  assert.equal(ctx.show.id, 'demo');
  assert.equal(ctx.template.id, 'default');
  assert.deepEqual([...ctx.layouts.keys()].sort(), ['bullets', 'diagram', 'graph', 'image-full', 'map', 'pdf', 'section', 'table', 'tag-cloud', 'title', 'two-column', 'video', 'web']);
  assert.match(ctx.layouts.get('bullets').html, /data-slot="body"/);
  assert.match(ctx.layouts.get('diagram').html, /data-slot="diagram"/);
  assert.ok(ctx.layouts.get('bullets').base.href.endsWith('/templates/default/layouts/bullets.html'));
  assert.deepEqual(ctx.validation.errors, []);
  assert.deepEqual(ctx.validation.warnings, []);
  assert.ok(ctx.resolveAsset('images/x.png').endsWith('/shows/demo/images/x.png'));
  assert.ok(ctx.resolveTemplateAsset('theme.css').endsWith('/templates/default/theme.css'));
});

test('reports missing images as warnings', async () => {
  const missing = new URL('shows/demo/images/two-modes.svg', base).href;
  const ctx = await loadShow('shows/demo/show.json', {
    baseUrl: base,
    fetch: fsFetch({ [missing]: { status: 404 } }),
  });
  assert.ok(ctx.validation.warnings.some((w) => w.code === 'missing-file'));
  assert.equal(ctx.validation.ok, true);
});

test('validation errors are returned, not thrown', async () => {
  const ctx = await loadShow('shows/fixtures/broken/show.json', { baseUrl: base, fetch: fsFetch() });
  assert.equal(ctx.validation.ok, false);
  assert.ok(ctx.validation.errors.length >= 4);
});

test('a missing show file throws a readable LoadError', async () => {
  await assert.rejects(loadShow('shows/nope/show.json', { baseUrl: base, fetch: fsFetch() }), (err) => {
    assert.ok(err instanceof LoadError);
    assert.equal(err.kind, 'fetch');
    assert.equal(err.status, 404);
    assert.match(err.message, /not found/);
    return true;
  });
});

test('invalid JSON throws a parse LoadError', async () => {
  const href = new URL('shows/bad/show.json', base).href;
  await assert.rejects(loadShow(href, { fetch: fsFetch({ [href]: { body: '{ "slipr": ' } }) }), (err) => {
    assert.equal(err.kind, 'parse');
    assert.match(err.message, /not valid JSON/);
    return true;
  });
});

test('a network failure explains the dev-server requirement', async () => {
  const href = new URL('shows/demo/show.json', base).href;
  await assert.rejects(loadShow(href, { fetch: fsFetch({ [href]: new TypeError('Failed to fetch') }) }), /npm run serve/);
});

test('a show without template.ref throws a template LoadError', async () => {
  const href = new URL('shows/x/show.json', base).href;
  await assert.rejects(loadShow(href, { fetch: fsFetch({ [href]: { body: '{"slipr":"0.1"}' } }) }), (err) => {
    assert.equal(err.kind, 'template');
    return true;
  });
});
