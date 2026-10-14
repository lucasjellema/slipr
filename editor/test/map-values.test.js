import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLayer, addPlace, addStep, cleanLatLng, ensurePlaceId, fitView, mapValue, movePlace, moveStep, removeLayer, removePlace,
  removeStep, setView, snapshotAlt, tilesChoice, tilesProblem, tilesValue, updateLayer, updatePlace, updateStep, WORLD_VIEW,
} from '../js/map-values.js';
import { convertBlock, setBlockType, setSlot, BLOCK_TYPES } from '../js/actions.js';
import { slotEditorKind } from '../js/slot-values.js';
import { validateShow } from '../../shared/validate.js';
import { readJson, clone } from '../../shared/test/helpers.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

describe('map values (E-021)', () => {
  test('a value keeps a center, places or layers; empty lists and undefined fields go', () => {
    assert.deepEqual(mapValue(undefined, {}), { center: { ...WORLD_VIEW.center }, zoom: 2 });
    assert.deepEqual(mapValue({ markers: [{ lat: 1, lng: 2 }], steps: [], caption: 'x' }, { caption: undefined }), { markers: [{ lat: 1, lng: 2 }] });
    assert.deepEqual(mapValue({ markers: [{ lat: 1, lng: 2 }] }, { markers: [] }), { center: { lat: 20, lng: 0 }, zoom: 2 }, 'the last place gone: the world view');
    assert.deepEqual(cleanLatLng(95, 190), { lat: 90, lng: -170 });
    assert.deepEqual(cleanLatLng(1.1234567, -180), { lat: 1.12346, lng: -180 });
  });

  test('places: add with an id from the title, update, move, remove', () => {
    let { value, index } = addPlace(undefined, { lat: 52.37, lng: 4.89, title: 'Amsterdam' });
    assert.equal(index, 0);
    ({ value } = addPlace(value, { lat: 51.9, lng: 4.5 }));
    assert.deepEqual(value.markers.map((m) => [m.id, m.title]), [['amsterdam', 'Amsterdam'], ['place-2', 'Place 2']]);
    value = updatePlace(value, 1, { title: 'Rotterdam', tags: 'port, city', md: '', slide: '' });
    assert.deepEqual(value.markers[1].tags, ['port', 'city']);
    assert.equal('md' in value.markers[1], false);
    value = updatePlace(value, 1, { lat: '51.92251234', lng: 4.47 });
    assert.equal(value.markers[1].lat, 51.92251);
    value = movePlace(value, 1, -1);
    assert.equal(value.markers[0].title, 'Rotterdam');
    assert.deepEqual(movePlace(value, 0, -1).markers.map((m) => m.title), ['Rotterdam', 'Amsterdam'], 'no move past the start');
    value = removePlace(value, 0);
    assert.deepEqual(value.markers.map((m) => m.id), ['amsterdam']);
  });

  test('steps follow renamed places and go with removed ones', () => {
    let { value } = addPlace(undefined, { lat: 1, lng: 1, title: 'A' });
    ({ value } = addPlace(value, { lat: 2, lng: 2, title: 'B' }));
    value = addStep(value);
    value = addStep(value);
    value = addStep(value);
    assert.deepEqual(value.steps.map((s) => s.marker), ['a', 'b', 'a'], 'unvisited places first, then the first again');
    value = updatePlace(value, 0, { id: 'start' });
    assert.deepEqual(value.steps.map((s) => s.marker), ['start', 'b', 'start']);
    value = updatePlace(value, 1, { id: 'start' });
    assert.equal(value.markers[1].id, 'start-2', 'ids stay unique');
    value = updateStep(value, 1, { zoom: '9.25' });
    assert.equal(value.steps[1].zoom, 9.3);
    value = updateStep(value, 1, { zoom: '' });
    assert.equal('zoom' in value.steps[1], false);
    value = updateStep(value, 0, { place: 1 });
    assert.equal(value.steps[0].marker, 'start-2');
    value = moveStep(value, 0, 1);
    assert.deepEqual(value.steps.map((s) => s.marker), ['start-2', 'start-2', 'start']);
    value = removePlace(value, 1);
    assert.deepEqual(value.steps.map((s) => s.marker), ['start'], 'steps to a removed place go');
    value = removeStep(value, 0);
    assert.equal(value.steps, undefined);
  });

  test('a place without an id gets one when a step needs it', () => {
    const value = { markers: [{ lat: 1, lng: 1, title: 'Old place' }] };
    const { value: next, id } = ensurePlaceId(value, 0);
    assert.equal(id, 'old-place');
    assert.equal(next.markers[0].id, 'old-place');
    assert.equal(addStep(value).steps[0].marker, 'old-place');
    assert.equal(addStep({ center: { lat: 0, lng: 0 } }).steps, undefined, 'no places: no step');
  });

  test('layers', () => {
    let value = addLayer(undefined, 'data/a.geojson', 'Route');
    value = updateLayer(value, 0, { tag: 'route', title: '' });
    assert.deepEqual(value.layers, [{ data: 'data/a.geojson', tag: 'route' }]);
    value = removeLayer(value, 0);
    assert.equal(value.layers, undefined);
  });

  test('view: fixed, or fit to places', () => {
    let value = setView({ markers: [{ lat: 1, lng: 1 }] }, { lat: 52.123456789, lng: 4.5 }, 7.333);
    assert.deepEqual([value.center, value.zoom], [{ lat: 52.12346, lng: 4.5 }, 7.33]);
    value = fitView(value);
    assert.equal(value.center, undefined);
    assert.equal(value.zoom, undefined);
    const empty = { center: { lat: 1, lng: 1 }, zoom: 3 };
    assert.equal(fitView(empty), empty, 'nothing to fit');
  });

  test('tiles: choice and value round trip, problems', () => {
    assert.deepEqual(tilesChoice({}).mode, 'osm');
    assert.equal(tilesValue({ mode: 'osm', url: 'x', attribution: '', maxZoom: null }), undefined);
    assert.equal(tilesValue({ mode: 'none', url: '', attribution: '', maxZoom: null }), 'none');
    assert.equal(tilesValue({ mode: 'folder', url: '', attribution: '', maxZoom: null }), 'tiles/{z}/{x}/{y}.png');
    const server = { url: 'https://t.example.org/{z}/{x}/{y}.png', attribution: '© T', maxZoom: 17 };
    assert.deepEqual(tilesValue({ mode: 'server', ...server }), server);
    assert.deepEqual(tilesChoice({ tiles: server }), { mode: 'server', ...server });
    assert.equal(tilesChoice({ tiles: 'tiles/{z}/{x}/{y}.png' }).mode, 'folder');
    assert.match(tilesProblem({ mode: 'server', url: 'http://x/{z}/{x}/{y}', attribution: 'a', maxZoom: null }), /https/);
    assert.match(tilesProblem({ mode: 'server', url: 'https://x/{z}', attribution: 'a', maxZoom: null }), /\{y\}/);
    assert.match(tilesProblem({ mode: 'server', url: 'https://x/{z}/{x}/{y}', attribution: ' ', maxZoom: null }), /attribution/);
    assert.match(tilesProblem({ mode: 'folder', url: '/abs/{z}', attribution: '', maxZoom: null }), /relative/);
    assert.equal(tilesProblem({ mode: 'folder', url: 'tiles/{z}/{x}/{y}.png', attribution: '', maxZoom: null }), null);
  });

  test('snapshot alt text names what is on the map', () => {
    assert.equal(snapshotAlt({}), 'Map');
    assert.equal(snapshotAlt({ markers: [{ title: 'A' }] }), 'Map with A');
    assert.equal(snapshotAlt({ markers: [{ title: 'A' }, { id: 'b' }], layers: [{ title: 'Route' }] }), 'Map with A, b and Route');
  });

  test('every value the editor makes is valid in a show', () => {
    let { value } = addPlace(undefined, { lat: 52.37, lng: 4.89, title: 'Amsterdam' });
    value = addStep(setView(value, { lat: 52, lng: 5 }, 8));
    value = { ...value, tiles: tilesValue({ mode: 'server', url: 'https://t.example.org/{z}/{x}/{y}.png', attribution: '© T', maxZoom: 15 }), present: 'static' };
    const show = clone(demo);
    show.slides.find((s) => s.id === 's-map').content.map = value;
    const r = validateShow(show, { template });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings.filter((w) => w.path.includes('s-map') || w.path.includes('.map')), []);
  });
});

describe('map slot and block in the editor (E-021)', () => {
  test('the map slot has an editor; Map is a block type', () => {
    assert.equal(slotEditorKind('map', undefined), 'map');
    assert.ok(BLOCK_TYPES.includes('map'));
  });

  test('converting a block to a map starts on the world view and keeps what fits', () => {
    const map = convertBlock({ id: 'b1', type: 'text', md: 'x', title: 'Places', for: ['dev'], depth: 2 }, 'map');
    assert.deepEqual(map, { id: 'b1', type: 'map', for: ['dev'], depth: 2, title: 'Places', center: { lat: 20, lng: 0 }, zoom: 2 });
  });

  test('a map block or slot makes a 0.1 show 0.2', () => {
    const show = { slipr: '0.1', slides: [{ id: 's', layout: 'map', content: {}, reader: { blocks: [{ id: 'b', type: 'text', md: '' }] } }] };
    assert.equal(setBlockType(show, { slideId: 's', blockId: 'b', type: 'map' }).slipr, '0.2');
    assert.equal(setSlot(show, { slideId: 's', slot: 'map', value: { center: { lat: 0, lng: 0 } } }).slipr, '0.2');
    assert.equal(setSlot(show, { slideId: 's', slot: 'title', value: 'T' }).slipr, '0.1');
  });
});
