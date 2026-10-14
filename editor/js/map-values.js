// @ts-check
/**
 * Map values for the map editor (E-021): the `map` slot and the map reader
 * block (I-075). DOM-free, so it can be tested with node --test.
 *
 * Every helper takes the current value and returns a new one (never mutated),
 * keeping the shape docs/show-format.md describes: places (`markers`), the
 * first view (`center`, `zoom`), audience `steps`, GeoJSON `layers`, `tiles`,
 * `present`, `load`, `caption`, `fallback`.
 */
import { uniqueId } from './show-entities.js';

/** The fields of a map value (a block also has id, type, for, depth, title). */
export const MAP_FIELDS = ['center', 'zoom', 'markers', 'layers', 'tiles', 'steps', 'present', 'load', 'caption', 'fallback'];

/** Where a new map starts: the whole world. */
export const WORLD_VIEW = Object.freeze({ center: Object.freeze({ lat: 20, lng: 0 }), zoom: 2 });

/** @param {number} n @param {number} [digits] */
export function round(n, digits = 5) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** A latitude in [-90, 90] and a longitude wrapped into [-180, 180], rounded. @param {number} lat @param {number} lng */
export function cleanLatLng(lat, lng) {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat: round(Math.max(-90, Math.min(90, lat))), lng: round(wrapped === -180 && lng > 0 ? 180 : wrapped) };
}

/**
 * The value with a patch applied: fields patched to undefined are removed,
 * empty lists are dropped, and a map always keeps a center, places or layers.
 * @param {any} previous
 * @param {Record<string, any>} patch
 * @returns {any}
 */
export function mapValue(previous, patch) {
  const next = { ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), ...patch };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || (Array.isArray(value) && !value.length && ['markers', 'layers', 'steps'].includes(key))) delete next[key];
  }
  if (!next.center && !next.markers && !next.layers) {
    next.center = { ...WORLD_VIEW.center };
    if (next.zoom === undefined) next.zoom = WORLD_VIEW.zoom;
  }
  return next;
}

/** @param {any} value @returns {any[]} */
const placesOf = (value) => (Array.isArray(value?.markers) ? value.markers : []);
/** @param {any} value @returns {any[]} */
const stepsOf = (value) => (Array.isArray(value?.steps) ? value.steps : []);
/** @param {any} value @returns {any[]} */
const layersOf = (value) => (Array.isArray(value?.layers) ? value.layers : []);

/** @param {any[]} list @param {number} from @param {number} delta */
function moved(list, from, delta) {
  const to = from + delta;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

// ---------------------------------------------------------------------------
// Places

/**
 * Add a place (it gets an id from its title, for steps).
 * @param {any} value
 * @param {{ lat: number, lng: number, title?: string }} place
 * @returns {{ value: any, index: number }}
 */
export function addPlace(value, { lat, lng, title }) {
  const places = placesOf(value);
  const name = title?.trim() || `Place ${places.length + 1}`;
  const id = uniqueId(name, places.map((p) => p.id).filter(Boolean), 'place');
  const place = { id, ...cleanLatLng(lat, lng), title: name };
  return { value: mapValue(value, { markers: [...places, place] }), index: places.length };
}

/**
 * Change a place. A new id is followed by the steps that name it; tags may be
 * given as text (comma-separated); empty optional fields are removed.
 * @param {any} value @param {number} index @param {Record<string, any>} patch
 * @returns {any}
 */
export function updatePlace(value, index, patch) {
  const places = placesOf(value);
  const old = places[index];
  if (!old) return value;
  const next = { ...old, ...patch };
  if (typeof patch.tags === 'string') next.tags = patch.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (patch.lat !== undefined || patch.lng !== undefined) Object.assign(next, cleanLatLng(Number(next.lat), Number(next.lng)));
  for (const key of ['title', 'md', 'slide', 'id']) if (next[key] === '' || next[key] === undefined) delete next[key];
  if (Array.isArray(next.tags) && !next.tags.length) delete next.tags;
  let steps = stepsOf(value);
  if (old.id && next.id !== old.id) {
    const taken = places.filter((_, i) => i !== index).map((p) => p.id).filter(Boolean);
    if (next.id) next.id = uniqueId(next.id, taken, 'place');
    steps = next.id
      ? steps.map((s) => (s.marker === old.id ? { ...s, marker: next.id } : s))
      : steps.filter((s) => s.marker !== old.id);
  }
  const markers = places.map((p, i) => (i === index ? next : p));
  return mapValue(value, { markers, steps });
}

/**
 * Remove a place, and the steps that fly to it.
 * @param {any} value @param {number} index
 * @returns {any}
 */
export function removePlace(value, index) {
  const places = placesOf(value);
  const gone = places[index];
  if (!gone) return value;
  return mapValue(value, {
    markers: places.filter((_, i) => i !== index),
    steps: gone.id ? stepsOf(value).filter((s) => s.marker !== gone.id) : stepsOf(value),
  });
}

/** @param {any} value @param {number} index @param {number} delta */
export function movePlace(value, index, delta) {
  return mapValue(value, { markers: moved(placesOf(value), index, delta) });
}

/**
 * The place's id, giving it one when it has none (steps need it).
 * @param {any} value @param {number} index
 * @returns {{ value: any, id: string | null }}
 */
export function ensurePlaceId(value, index) {
  const place = placesOf(value)[index];
  if (!place) return { value, id: null };
  if (place.id) return { value, id: place.id };
  const id = uniqueId(place.title ?? '', placesOf(value).map((p) => p.id).filter(Boolean), 'place');
  return { value: mapValue(value, { markers: placesOf(value).map((p, i) => (i === index ? { id, ...p } : p)) }), id };
}

// ---------------------------------------------------------------------------
// Steps (slots in audience mode: fly to a place)

/**
 * Add a step: to the first place no step visits yet (or the first place).
 * @param {any} value
 * @returns {any}
 */
export function addStep(value) {
  const places = placesOf(value);
  if (!places.length) return value;
  const visited = new Set(stepsOf(value).map((s) => s.marker));
  let index = places.findIndex((p) => !p.id || !visited.has(p.id));
  if (index < 0) index = 0;
  const { value: withId, id } = ensurePlaceId(value, index);
  return mapValue(withId, { steps: [...stepsOf(withId), { marker: /** @type {string} */ (id) }] });
}

/**
 * Change a step: `place` (an index into the places: gives that place an id if
 * needed) and / or `zoom` (empty removes it: the default zoom).
 * @param {any} value @param {number} index @param {{ place?: number, zoom?: number | string | null }} change
 * @returns {any}
 */
export function updateStep(value, index, change) {
  let current = value;
  const step = stepsOf(current)[index];
  if (!step) return value;
  const next = { ...step };
  if (change.place !== undefined) {
    const { value: withId, id } = ensurePlaceId(current, change.place);
    if (id) {
      current = withId;
      next.marker = id;
    }
  }
  if (change.zoom !== undefined) {
    const zoom = change.zoom === null || change.zoom === '' ? NaN : Number(change.zoom);
    if (Number.isFinite(zoom)) next.zoom = Math.max(0, Math.min(22, round(zoom, 1)));
    else delete next.zoom;
  }
  return mapValue(current, { steps: stepsOf(current).map((s, i) => (i === index ? next : s)) });
}

/** @param {any} value @param {number} index */
export function removeStep(value, index) {
  return mapValue(value, { steps: stepsOf(value).filter((_, i) => i !== index) });
}

/** @param {any} value @param {number} index @param {number} delta */
export function moveStep(value, index, delta) {
  return mapValue(value, { steps: moved(stepsOf(value), index, delta) });
}

// ---------------------------------------------------------------------------
// Layers

/** @param {any} value @param {string} data @param {string} [title] */
export function addLayer(value, data, title) {
  return mapValue(value, { layers: [...layersOf(value), { data, ...(title ? { title } : {}) }] });
}

/** @param {any} value @param {number} index @param {Record<string, string>} patch */
export function updateLayer(value, index, patch) {
  const layers = layersOf(value).map((l, i) => {
    if (i !== index) return l;
    const next = { ...l, ...patch };
    for (const key of ['title', 'tag']) if (!next[key]) delete next[key];
    return next;
  });
  return mapValue(value, { layers });
}

/** @param {any} value @param {number} index */
export function removeLayer(value, index) {
  return mapValue(value, { layers: layersOf(value).filter((_, i) => i !== index) });
}

// ---------------------------------------------------------------------------
// View and tiles

/**
 * Fix the first view to a center and zoom (from the editor's mini map).
 * @param {any} value @param {{ lat: number, lng: number }} center @param {number} zoom
 */
export function setView(value, center, zoom) {
  return mapValue(value, { center: cleanLatLng(center.lat, center.lng), zoom: Math.max(0, Math.min(22, round(zoom, 2))) });
}

/**
 * Let the first view fit the places and layers (no fixed center). Not
 * possible for a map without places or layers: it then stays as it is.
 * @param {any} value
 * @returns {any}
 */
export function fitView(value) {
  if (!placesOf(value).length && !layersOf(value).length) return value;
  const { center: _c, zoom: _z, ...rest } = value;
  return mapValue(rest, {});
}

/**
 * @typedef {object} TilesChoice
 * @property {'osm' | 'none' | 'folder' | 'server'} mode
 * @property {string} url  The template (folder or server).
 * @property {string} attribution
 * @property {number | null} maxZoom
 */

/**
 * The tiles of a value, as the editor's choice.
 * @param {any} value
 * @returns {TilesChoice}
 */
export function tilesChoice(value) {
  const raw = value?.tiles;
  if (raw === 'none') return { mode: 'none', url: '', attribution: '', maxZoom: null };
  const url = typeof raw === 'string' ? raw : typeof raw?.url === 'string' ? raw.url : '';
  const attribution = typeof raw?.attribution === 'string' ? raw.attribution : '';
  const maxZoom = Number.isInteger(raw?.maxZoom) ? raw.maxZoom : null;
  if (!url) return { mode: 'osm', url: '', attribution: '', maxZoom: null };
  return { mode: /^https?:/i.test(url) ? 'server' : 'folder', url, attribution, maxZoom };
}

/**
 * The `tiles` field for a choice (undefined: OpenStreetMap, the default).
 * @param {TilesChoice} choice
 * @returns {any}
 */
export function tilesValue(choice) {
  if (choice.mode === 'osm') return undefined;
  if (choice.mode === 'none') return 'none';
  const url = choice.url.trim() || (choice.mode === 'folder' ? 'tiles/{z}/{x}/{y}.png' : 'https://');
  const extra = {
    ...(choice.attribution.trim() ? { attribution: choice.attribution.trim() } : {}),
    ...(Number.isInteger(choice.maxZoom) ? { maxZoom: Math.max(0, Math.min(22, /** @type {number} */ (choice.maxZoom))) } : {}),
  };
  return Object.keys(extra).length ? { url, ...extra } : url;
}

/**
 * A problem with a tile address, for the field's hint, or null.
 * @param {TilesChoice} choice
 * @returns {string | null}
 */
export function tilesProblem(choice) {
  if (choice.mode === 'server') {
    if (!/^https:\/\//i.test(choice.url)) return 'A tile server address starts with https:// .';
    if (!/\{z\}/.test(choice.url) || !/\{x\}/.test(choice.url) || !/\{y\}/.test(choice.url)) return 'The address needs {z}, {x} and {y}, e.g. https://tiles.example.org/{z}/{x}/{y}.png';
    if (!choice.attribution.trim()) return 'Name the tile provider as it asks (attribution), e.g. © Example Maps.';
  }
  if (choice.mode === 'folder') {
    if (/^[a-z][a-z0-9+.-]*:|^\//i.test(choice.url)) return 'A folder in the show: a relative path such as tiles/{z}/{x}/{y}.png';
    if (!/\{z\}/.test(choice.url)) return 'The path needs {z}, {x} and {y}, e.g. tiles/{z}/{x}/{y}.png';
  }
  return null;
}

/**
 * Alt text for a snapshot of the map: what is on it.
 * @param {any} value
 * @returns {string}
 */
export function snapshotAlt(value) {
  const names = placesOf(value).map((p) => p.title || p.id).filter(Boolean);
  const layers = layersOf(value).map((l) => l.title).filter(Boolean);
  const all = [...names, ...layers];
  if (!all.length) return 'Map';
  const list = all.length === 1 ? all[0] : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
  return `Map with ${list}`;
}
