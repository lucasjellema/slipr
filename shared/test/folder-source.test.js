import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFolderSource, normalizePath } from '../folder-source.js';
import { loadShowFromFolder, resolveFolderTemplate, LoadError } from '../load.js';
import { fakeDirectory, repoRoot } from './helpers.js';

const appBase = pathToFileURL(`${repoRoot}/`);

/** Serves repository files from disk (file: URLs). */
async function fsFetch(href) {
  try {
    return new Response(await readFile(fileURLToPath(href)), { status: 200 });
  } catch {
    return new Response('', { status: 404, statusText: 'Not Found' });
  }
}

let blobCount = 0;
const createObjectURL = () => `blob:test/${++blobCount}`;

describe('folder source', () => {
  test('normalizePath keeps paths inside the folder', () => {
    assert.equal(normalizePath('images/a.png'), 'images/a.png');
    assert.equal(normalizePath('./images/../images/a.png'), 'images/a.png');
    assert.equal(normalizePath('images\\a.png'), 'images/a.png');
    assert.equal(normalizePath('images/my%20photo.png'), 'images/my photo.png');
    assert.equal(normalizePath('images/100%.png'), 'images/100%.png');
  });

  test('normalizePath rejects URLs, absolute paths and paths that leave the folder', () => {
    for (const p of ['../x.png', 'images/../../x.png', '/templates/default', 'https://example.com/a.png', 'data:image/png;base64,AA', '', '.']) {
      assert.equal(normalizePath(p), null, p);
    }
  });

  test('reads files in subfolders and returns null for missing files', async () => {
    const source = createFolderSource(fakeDirectory(resolve(repoRoot, 'shows/demo')));
    assert.equal(source.name, 'demo');
    const text = await source.readText('show.json');
    assert.equal(JSON.parse(text).id, 'demo');
    assert.ok(await source.readFile('images/architecture.svg'));
    assert.equal(await source.readFile('images/nope.png'), null);
    assert.equal(await source.readFile('nope/x.png'), null);
    assert.equal(await source.readFile('../conclusion-demo/show.json'), null, 'never reads outside the folder');
  });
});

describe('template refs for folder shows (D-012)', () => {
  const base = new URL('http://localhost:8080/');

  test('root-relative /templates/<id> resolves against Slipr, without a notice', () => {
    const r = resolveFolderTemplate('/templates/conclusion', base);
    assert.equal(r.href.href, 'http://localhost:8080/templates/conclusion/template.json');
    assert.equal(r.notice, null);
  });

  test('a relative ref that leaves the folder resolves by name, with a notice', () => {
    const r = resolveFolderTemplate('../../templates/default', base);
    assert.equal(r.href.href, 'http://localhost:8080/templates/default/template.json');
    assert.match(r.notice, /"default"/);
  });

  test('URLs are used as is', () => {
    const r = resolveFolderTemplate('https://example.com/t/brand', base);
    assert.equal(r.href.href, 'https://example.com/t/brand/template.json');
  });

  test('a template inside the show folder is refused with a clear message', () => {
    assert.throws(() => resolveFolderTemplate('./template', base), (err) => err instanceof LoadError && /inside the show folder/.test(err.message));
  });
});

describe('loadShowFromFolder', () => {
  test('loads the demo show by folder: template by name, images as blob URLs, no warnings', async () => {
    const source = createFolderSource(fakeDirectory(resolve(repoRoot, 'shows/demo')));
    const ctx = await loadShowFromFolder(source, { appBase, fetch: fsFetch, createObjectURL });
    assert.equal(ctx.show.id, 'demo');
    assert.equal(ctx.template.id, 'default');
    assert.ok(ctx.layouts.has('bullets'));
    assert.deepEqual(ctx.validation.errors, []);
    assert.deepEqual(ctx.validation.warnings, []);
    assert.match(ctx.resolveAsset('images/architecture.svg'), /^blob:test\//);
    assert.ok(ctx.resolveTemplateAsset('theme.css').endsWith('/templates/default/theme.css'));
    assert.equal(ctx.notices.length, 1, 'the demo uses a relative ref, so it gets a notice');
    // A file added later (E-006) becomes resolvable as a blob URL.
    assert.equal(ctx.resolveAsset('images/new.png'), 'images/new.png');
    ctx.registerAsset('images/new.png', new Blob(['x']));
    assert.match(ctx.resolveAsset('images/new.png'), /^blob:test\//);
    assert.equal(ctx.folder, source);
  });

  test('loads the conclusion demo too', async () => {
    const source = createFolderSource(fakeDirectory(resolve(repoRoot, 'shows/conclusion-demo')));
    const ctx = await loadShowFromFolder(source, { appBase, fetch: fsFetch, createObjectURL });
    assert.equal(ctx.template.id, 'conclusion');
    assert.deepEqual(ctx.validation.errors, []);
    assert.deepEqual(ctx.validation.warnings, []);
  });

  test('a missing image is a warning, a folder without show.json an error', async () => {
    const source = createFolderSource(fakeDirectory(resolve(repoRoot, 'shows/demo')));
    const realText = source.readText;
    const patched = {
      ...source,
      async readText(path) {
        const text = await realText(path);
        if (path !== 'show.json') return text;
        const show = JSON.parse(text);
        show.slides.find((s) => s.content?.image).content.image.src = 'images/missing.png';
        return JSON.stringify(show);
      },
    };
    const ctx = await loadShowFromFolder(patched, { appBase, fetch: fsFetch, createObjectURL });
    assert.ok(ctx.validation.warnings.some((w) => /missing\.png/.test(w.message)));

    const empty = createFolderSource(fakeDirectory(resolve(repoRoot, 'shows/demo/images')));
    await assert.rejects(loadShowFromFolder(empty, { appBase, fetch: fsFetch, createObjectURL }), (err) => err instanceof LoadError && /no show\.json/.test(err.message));
  });
});
