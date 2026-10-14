import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { afterHtml, attributes, isMap, mapLayers, mapMarkers, mapTagColors, OSM_TILES, staticHtml, stepView, tileOrigin, tileSource, STEP_ZOOM } from '../embeds/map.js';
import { embedHtml, embedKindForBlock, embedKindForSlot, usedEmbedKinds } from '../embeds/index.js';
import { renderBlock } from '../blocks.js';
import { validateShow, collectImagePaths } from '../validate.js';
import { codes, readJson, clone } from './helpers.js';

const ctx = { resolveAsset: (/** @type {string} */ src) => `/shows/x/${src}` };
const markers = [
  { id: 'ams', lat: 52.37, lng: 4.89, title: 'Amsterdam', tags: ['city'] },
  { id: 'rtm', lat: 51.92, lng: 4.48, title: 'Rotterdam', tags: ['port'], md: 'A **port**', slide: 's-1' },
  { lat: 52.09, lng: 5.12 },
];

describe('map module (I-075)', () => {
  test('isMap: markers, a center or layers', () => {
    assert.equal(isMap({ markers: [] }), true);
    assert.equal(isMap({ center: { lat: 1, lng: 2 } }), true);
    assert.equal(isMap({ layers: [] }), true);
    assert.equal(isMap({ center: { lat: 'x', lng: 2 } }), false);
    assert.equal(isMap({ nodes: [] }), false);
    assert.equal(isMap(null), false);
  });

  test('markers and layers are cleaned', () => {
    const m = mapMarkers({ markers: [...markers, { lat: 'a', lng: 1 }, null] });
    assert.deepEqual(m.map((x) => x.title), ['Amsterdam', 'Rotterdam', '52.09, 5.12']);
    assert.equal(m[1].md, 'A **port**');
    assert.deepEqual(m[2].tags, []);
    const l = mapLayers({ layers: [{ data: 'data/a.geojson', tag: 'route' }, { data: 'https://x.org/a.json' }, { title: 'no data' }] });
    assert.deepEqual(l, [{ data: 'data/a.geojson', tag: 'route' }]);
  });

  test('tile sources: OpenStreetMap by default, servers, local files, none', () => {
    assert.deepEqual(tileSource({}), { kind: 'server', url: OSM_TILES, attribution: '', maxZoom: 19 });
    assert.equal(tileSource({ tiles: 'none' }).kind, 'none');
    assert.equal(tileSource({ tiles: 'tiles/{z}/{x}/{y}.png' }).kind, 'local');
    const custom = tileSource({ tiles: { url: 'https://{s}.tiles.example.org/{z}/{x}/{y}.png', attribution: '© Example', maxZoom: 30 } });
    assert.deepEqual(custom, { kind: 'server', url: 'https://{s}.tiles.example.org/{z}/{x}/{y}.png', attribution: '© Example', maxZoom: 22 });
    assert.equal(tileSource({ tiles: 'http://insecure.org/{z}/{x}/{y}.png' }).kind, 'none', 'only https servers');
    assert.equal(tileOrigin('https://{s}.tiles.example.org/{z}/{x}/{y}.png'), 'https://tiles.example.org');
  });

  test('stepView: the marker of the latest step, or the map’s own view', () => {
    const m = mapMarkers({ markers });
    const steps = [{ marker: 'ams', zoom: 10 }, { marker: 'rtm' }, { marker: 'nope' }];
    assert.equal(stepView(m, steps, 0), null);
    assert.deepEqual(stepView(m, steps, 1), { marker: m[0], zoom: 10 });
    assert.deepEqual(stepView(m, steps, 2), { marker: m[1], zoom: STEP_ZOOM });
    assert.equal(stepView(m, steps, 3), null, 'an unknown marker shows the whole map');
  });

  test('tag colors: markers first, then layers, cycling through six', () => {
    const colors = mapTagColors(mapMarkers({ markers }), [{ data: 'a.json', tag: 'route' }, { data: 'b.json', tag: 'city' }]);
    assert.deepEqual([...colors], [['city', 0], ['port', 1], ['route', 2]]);
  });

  test('static list is escaped', () => {
    const { html, fallback } = staticHtml({ markers: [{ lat: 1, lng: 2, title: '<b>X</b>', md: 'Big **news** & [[term|more]]' }], layers: [{ data: 'a.json', title: 'Route' }] });
    assert.equal(fallback, 'list');
    assert.match(html, /<strong>&lt;b&gt;X&lt;\/b&gt;<\/strong> Big news &amp; more/);
    assert.match(html, /slipr-map-list-layer">Route/);
    assert.doesNotMatch(html, /<b>/);
  });

  test('attributes: tiles from a server ask first in reader mode only; local tiles and none never ask', () => {
    const reader = attributes({ markers }, ctx);
    assert.equal(reader['data-embed-origin'], 'https://tile.openstreetmap.org');
    assert.equal(reader['data-map-tiles'], OSM_TILES);
    assert.equal(reader['data-map-mode'], 'reader');
    assert.equal(attributes({ markers, load: 'auto' }, ctx)['data-embed-origin'], undefined);
    const audience = attributes({ markers }, ctx, { mode: 'audience', slot: true });
    assert.equal(audience['data-embed-origin'], undefined, 'audience mode presents live');
    assert.equal(audience['data-embed-static'], undefined);
    assert.equal(attributes({ markers, present: 'static' }, ctx, { mode: 'audience', slot: true })['data-embed-static'], '');
    const local = attributes({ markers, tiles: 'tiles/{z}/{x}/{y}.png' }, ctx);
    assert.equal(local['data-map-tiles'], '/shows/x/tiles/{z}/{x}/{y}.png', 'placeholders kept');
    assert.equal(local['data-embed-origin'], undefined);
    const none = attributes({ markers, tiles: 'none' }, ctx);
    assert.equal(none['data-map-tiles'], undefined);
    assert.equal(none['data-embed-origin'], undefined);
    const data = JSON.parse(attributes({ markers, layers: [{ data: 'data/r.geojson' }], center: { lat: 1, lng: 2, x: 3 }, zoom: 7 }, ctx)['data-map']);
    assert.equal(data.layers[0].src, '/shows/x/data/r.geojson');
    assert.deepEqual(data.center, { lat: 1, lng: 2 });
    assert.equal(data.zoom, 7);
  });

  test('steps are hidden fragments in audience slots only', () => {
    const steps = [{ marker: 'ams' }, { marker: 'rtm' }];
    assert.equal((afterHtml({ steps }, { mode: 'audience', slot: true }).match(/fragment slipr-map-step/g) ?? []).length, 2);
    assert.equal(afterHtml({ steps }, { mode: 'reader', slot: true }), '');
    assert.equal(afterHtml({ steps }, { mode: 'audience' }), '');
  });

  test('registry: slot and block kind, used kinds, block markup', () => {
    assert.equal(embedKindForSlot('map'), 'map');
    assert.equal(embedKindForBlock('map'), 'map');
    assert.ok(usedEmbedKinds({ slides: [{ id: 's', content: { m: { markers } } }] }).has('map'));
    assert.ok(usedEmbedKinds({ slides: [{ id: 's', content: {}, reader: { blocks: [{ id: 'b', type: 'map', center: { lat: 0, lng: 0 } }] } }] }).has('map'));
    assert.match(embedHtml('map', { markers }, ctx), /data-embed="map"/);
    const html = renderBlock({ id: 'm', type: 'map', title: 'Places', markers, caption: 'Cap' }, 's-1', { show: { slides: [] }, resolveAsset: ctx.resolveAsset });
    assert.match(html, /slipr-block-title">Places</);
    assert.match(html, /slipr-figure--map/);
    assert.match(html, /aria-label="Places"/);
    assert.match(html, /<figcaption class="slipr-caption">Cap<\/figcaption>/);
  });
});

describe('map validation (I-075)', () => {
  const demo = readJson('shows/demo/show.json');
  const template = readJson('templates/default/template.json');
  const withMap = (/** @type {any} */ map, version = '0.2') => {
    const show = clone(demo);
    show.slipr = version;
    show.slides.find((/** @type {any} */ s) => s.id === 's-map').content.map = map;
    return validateShow(show, { template });
  };
  const withBlock = (/** @type {any} */ block) => {
    const show = clone(demo);
    show.slides[0].reader = { blocks: [{ id: 'mb', type: 'map', ...block }] };
    return validateShow(show, { template });
  };

  test('the demo has a map slide and an offline map block with a GeoJSON layer, valid', () => {
    const s = demo.slides.find((/** @type {any} */ x) => x.id === 's-map');
    assert.equal(s.layout, 'map');
    assert.equal(s.content.map.steps.length, 3);
    assert.ok(s.reader.blocks.some((/** @type {any} */ b) => b.type === 'map' && b.tiles === 'none'));
    assert.ok(collectImagePaths(demo).includes('data/route.geojson'), 'layer files are show files');
    const r = withMap(s.content.map);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(codes(r.warnings).filter((c) => c.includes('marker') || c === 'tile-attribution'), []);
  });

  test('schema: positions, zoom, tiles, layers, steps', () => {
    assert.equal(withMap({ markers }).ok, true);
    assert.equal(withMap({ center: { lat: 0, lng: 0 }, zoom: 3 }).ok, true);
    assert.equal(withMap({ layers: [{ data: 'data/a.geojson' }] }).ok, true);
    assert.equal(withMap({ zoom: 3 }).ok, false, 'needs a center, markers or layers');
    assert.equal(withMap({ markers: [{ lat: 91, lng: 0 }] }).ok, false);
    assert.equal(withMap({ markers: [{ lat: 0 }] }).ok, false);
    assert.equal(withMap({ markers, zoom: 30 }).ok, false);
    for (const good of ['none', 'tiles/{z}/{x}/{y}.png', 'https://t.example.org/{z}/{x}/{y}.png', { url: 'https://t.example.org/{z}/{x}/{y}.png', attribution: '© T', maxZoom: 17 }]) {
      assert.equal(withMap({ markers, tiles: good }).ok, true, JSON.stringify(good));
    }
    for (const bad of ['http://t.example.org/{z}/{x}/{y}.png', '/tiles/{z}/{x}/{y}.png', 'javascript:{z}', 'tiles/x.png', { attribution: 'x' }]) {
      assert.equal(withMap({ markers, tiles: bad }).ok, false, JSON.stringify(bad));
    }
    for (const bad of ['https://x.org/a.geojson', '/abs/a.geojson', 'data/a.txt']) {
      assert.equal(withMap({ layers: [{ data: bad }] }).ok, false, bad);
    }
    assert.equal(withMap({ markers, steps: [{ zoom: 3 }] }).ok, false);
    assert.equal(withMap({ markers, present: 'later' }).ok, false);
    assert.equal(withBlock({ markers, steps: [{ marker: 'ams' }] }).ok, false, 'no steps on a block');
    assert.equal(withBlock({ markers, present: 'static' }).ok, false, 'no present on a block');
    assert.equal(withBlock({ markers, title: 'T', depth: 2, tiles: 'none' }).ok, true);
  });

  test('a map in a 0.1 show is an error', () => {
    assert.ok(codes(withMap({ markers }, '0.1').errors).includes('format-version'));
  });

  test('warnings: duplicate marker, unknown marker in a step, unknown slide, missing layer file, attribution, glossary', () => {
    const w = (/** @type {any} */ r) => codes(r.warnings);
    assert.ok(w(withMap({ markers: [...markers, { id: 'ams', lat: 0, lng: 0 }] })).includes('duplicate-marker'));
    assert.ok(w(withMap({ markers, steps: [{ marker: 'zz' }] })).includes('unknown-marker'));
    assert.ok(w(withMap({ markers: [{ lat: 0, lng: 0, slide: 's-nope' }] })).includes('unknown-slide'));
    assert.ok(w(withMap({ markers: [{ lat: 0, lng: 0, md: 'See [[nope]]' }] })).includes('unknown-glossary'));
    assert.ok(w(withMap({ markers, tiles: 'https://t.example.org/{z}/{x}/{y}.png' })).includes('tile-attribution'));
    assert.ok(!w(withMap({ markers })).includes('tile-attribution'), 'OpenStreetMap needs none from the author');
    const { warnings } = validateShow(clone(demo), { template, imageExists: (src) => src !== 'data/route.geojson' });
    assert.ok(warnings.some((x) => x.code === 'missing-file' && x.path.endsWith('.layers[1].data')));
  });
});
