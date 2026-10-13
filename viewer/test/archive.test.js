import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { audienceUrl, readerUrl } from '../js/mode-switch.js';
import { readZip, createZipSource } from '../../shared/zip.js';
import { loadShowFromZip } from '../../shared/load.js';
import { rememberArchive, recallArchive } from '../../shared/archive-handles.js';

async function fsFetch(href) {
  try {
    return new Response(await readFile(fileURLToPath(href)), { status: 200 });
  } catch {
    return new Response('', { status: 404, statusText: 'Not Found' });
  }
}


describe('Viewer zip archive import & mode switching', () => {
  test('audienceUrl preserves ?archive=<key> and &path=<path> params', () => {
    const current = 'http://localhost:8080/viewer/?archive=8a9b1c2d&path=myshow&mode=reader#s-conclusion';
    const switched = audienceUrl('s-conclusion', current);
    const url = new URL(switched);
    assert.equal(url.searchParams.get('archive'), '8a9b1c2d');
    assert.equal(url.searchParams.get('path'), 'myshow');
    assert.equal(url.searchParams.get('mode'), null);
    assert.equal(url.hash, '#/s-conclusion');
  });

  test('readerUrl preserves ?archive=<key> and &path=<path> params', () => {
    const current = 'http://localhost:8080/viewer/?archive=8a9b1c2d&path=myshow#/s-conclusion';
    const switched = readerUrl('s-conclusion', current);
    const url = new URL(switched);
    assert.equal(url.searchParams.get('archive'), '8a9b1c2d');
    assert.equal(url.searchParams.get('path'), 'myshow');
    assert.equal(url.searchParams.get('mode'), 'reader');
    assert.equal(url.hash, '#s-conclusion');
  });

  test('round-trip archive persistence with recallArchive and readZip', async () => {
    const zipBytes = await readFile(new URL('../../quickstart-demo.zip', import.meta.url));
    const key = await rememberArchive(zipBytes, { name: 'quickstart-demo.zip', title: 'Quickstart Demo' });

    assert.ok(key);
    const record = await recallArchive(key);
    assert.ok(record);
    assert.equal(record.name, 'quickstart-demo.zip');
    assert.equal(record.title, 'Quickstart Demo');

    const entries = await readZip(record.data);
    assert.ok(entries.has('show.json'));

    const source = createZipSource(entries, { name: record.name });
    const fakeBase = new URL('../../', import.meta.url).href;
    const ctx = await loadShowFromZip(source, { appBase: fakeBase, fetch: fsFetch, createObjectURL: () => 'blob:mock-url' });

    assert.equal(ctx.show.meta.title, 'Slipr Quickstart Demo');

    assert.ok(ctx.show.slides.length >= 3);
    assert.ok(ctx.template);
  });

  test('candidate show detection lists multiple shows when present', async () => {
    const { writeZip } = await import('../../shared/zip.js');
    const zipData = await writeZip({
      'show-a/show.json': JSON.stringify({ slipr: '0.1', meta: { title: 'Show A' }, template: { ref: 'default' }, slides: [] }),
      'show-b/show.json': JSON.stringify({ slipr: '0.1', meta: { title: 'Show B' }, template: { ref: 'default' }, slides: [] }),
    });


    const entries = await readZip(zipData);
    const allShowFiles = Array.from(entries.keys()).filter((name) => name === 'show.json' || name.endsWith('/show.json'));
    const candidateShows = allShowFiles.map((f) => f === 'show.json' ? '' : f.slice(0, f.lastIndexOf('/') + 1));

    assert.deepEqual(candidateShows.sort(), ['show-a/', 'show-b/']);

    // Calling createZipSource with explicit path succeeds
    const sourceA = createZipSource(entries, { name: 'multi.zip', path: 'show-a' });
    assert.equal(sourceA.prefix, 'show-a/');
    const textA = await sourceA.readText('show.json');
    assert.ok(textA?.includes('Show A'));

    const sourceB = createZipSource(entries, { name: 'multi.zip', path: 'show-b' });
    assert.equal(sourceB.prefix, 'show-b/');
    const textB = await sourceB.readText('show.json');
    assert.ok(textB?.includes('Show B'));
  });
});
