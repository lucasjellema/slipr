// Map tiles in the show folder for every kind of show (I-099): folder and zip
// sources read them through readAsset, the single-file export packs them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attributes, localTileTemplates, tileFolder, tilePattern } from '../embeds/map.js';
import { packShow } from '../export/single-file.js';
import { createFolderSource } from '../folder-source.js';
import { loadShowFromFolder, loadShowFromZip } from '../load.js';
import { createZipSource } from '../zip.js';
import { validateShow } from '../validate.js';
import { fakeDirectory, readJson, repoRoot } from './helpers.js';

const FIXTURE = 'shows/fixtures/local-tiles';
const appBase = pathToFileURL(`${repoRoot}/`);
const fsFetch = async (/** @type {string} */ href) => {
  try {
    return new Response(await readFile(fileURLToPath(href)), { status: 200 });
  } catch {
    return new Response('', { status: 404 });
  }
};
const createObjectURL = () => 'blob:test';
const readRepo = async (/** @type {string} */ path) => {
  try {
    return new Uint8Array(await readFile(resolve(repoRoot, path)));
  } catch {
    return null;
  }
};
const listRepo = async (/** @type {string} */ dir) => {
  try {
    const base = resolve(repoRoot, dir);
    const entries = await readdir(base, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => relative(base, resolve(e.parentPath ?? e.path, e.name)).split(sep).join('/'));
  } catch {
    return null;
  }
};

describe('local map tiles (I-099)', () => {
  test('tile templates, folders and patterns', () => {
    assert.equal(tileFolder('tiles/{z}/{x}/{y}.png'), 'tiles');
    assert.equal(tileFolder('./maps/nl/{z}/{x}/{y}{r}.png'), 'maps/nl');
    assert.equal(tileFolder('{z}/{x}/{y}.png'), '');
    const p = tilePattern('tiles/{z}/{x}/{y}{r}.png');
    assert.ok(p.test('tiles/2/3/1.png'));
    assert.ok(p.test('tiles/2/3/1@2x.png'));
    assert.ok(!p.test('tiles/2/3/1.jpg'));
    assert.ok(!p.test('tiles/a/3/1.png'));
    assert.ok(!p.test('tiles/2/3/1xpng'), 'the dot is literal');
    assert.ok(tilePattern('t/{s}/{z}/{x}/{y}.png').test('t/a/1/0/0.png'));
    const show = readJson(`${FIXTURE}/show.json`);
    assert.deepEqual(localTileTemplates(show), ['tiles/{z}/{x}/{y}.png']);
    assert.deepEqual(localTileTemplates(readJson('shows/demo/show.json')), [], 'OpenStreetMap and "none" are not local');
  });

  test('the embed element names the template as written, and resolved for shows by URL', () => {
    const attrs = attributes({ markers: [], tiles: 'tiles/{z}/{x}/{y}.png' }, { resolveAsset: (s) => `/shows/x/${s}` });
    assert.equal(attrs['data-map-tiles-local'], 'tiles/{z}/{x}/{y}.png');
    assert.equal(attrs['data-map-tiles'], '/shows/x/tiles/{z}/{x}/{y}.png');
    assert.equal(attributes({ markers: [] }, { resolveAsset: (s) => s })['data-map-tiles-local'], undefined);
  });

  test('the fixture is a valid show without warnings', () => {
    const r = validateShow(readJson(`${FIXTURE}/show.json`), { template: readJson('templates/default/template.json') });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  test('a show from a folder reads tiles through readAsset', async () => {
    const source = createFolderSource(fakeDirectory(resolve(repoRoot, FIXTURE)));
    const ctx = await loadShowFromFolder(source, { appBase, fetch: fsFetch, createObjectURL });
    const tile = await ctx.readAsset?.('tiles/1/0/1.png');
    assert.ok(tile, 'the tile is read from the folder');
    assert.equal((await tile.arrayBuffer()).byteLength, (await readFile(resolve(repoRoot, FIXTURE, 'tiles/1/0/1.png'))).byteLength);
    assert.equal(await ctx.readAsset?.('tiles/9/0/0.png'), null, 'a missing tile is null');
  });

  test('a show from a zip reads tiles through readAsset', async () => {
    /** @type {Map<string, Uint8Array>} */
    const entries = new Map();
    for (const name of /** @type {string[]} */ (await listRepo(FIXTURE))) entries.set(`wrapper/${name}`, /** @type {Uint8Array} */ (await readRepo(`${FIXTURE}/${name}`)));
    const ctx = await loadShowFromZip(createZipSource(entries, { name: 'fixture.zip' }), { appBase, fetch: fsFetch, createObjectURL });
    assert.ok(await ctx.readAsset?.('tiles/2/3/3.png'));
    assert.equal(await ctx.readAsset?.('tiles/3/0/0.png'), null);
  });

  test('the single-file export packs the tiles the template names, and only with a lister', async () => {
    const packed = await packShow({ readFile: readRepo, listFiles: listRepo, showDir: FIXTURE });
    const tiles = packed.files.filter((f) => f.startsWith('show/tiles/'));
    assert.equal(tiles.length, 1 + 4 + 16);
    assert.ok(tiles.includes('show/tiles/2/3/1.png'));
    assert.deepEqual(packed.warnings, []);
    const without = await packShow({ readFile: readRepo, showDir: FIXTURE });
    assert.equal(without.files.filter((f) => f.startsWith('show/tiles/')).length, 0);
    assert.ok(without.warnings.some((w) => w.includes('could not be listed')));
  });
});
