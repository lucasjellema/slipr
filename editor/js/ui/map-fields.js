// @ts-check
/**
 * The map editor (E-021), shared by the `map` slot editor (Slide tab) and the
 * Map block editor (Reader tab): an interactive mini map (click to add places,
 * drag pins, "Use this view", "Fit to places", "Snapshot as fallback"), then
 * rows for places, audience steps (slots) and GeoJSON layers, the tiles, how
 * it presents and loads, a caption and the fallback image.
 *
 * Values are built by ../map-values.js (DOM-free, tested). The mini map is
 * kept per slot or block across re-renders of the form, so it keeps its view
 * while you work; it follows the value on every render.
 */
import { h } from '../dom.js';
import {
  addLayer, addPlace, addStep, fitView, movePlace, moveStep, removeLayer, removePlace, removeStep, setView,
  snapshotAlt, tilesChoice, tilesProblem, tilesValue, updateLayer, updatePlace, updateStep,
} from '../map-values.js';
import { runImage } from './image-field.js';
import { fallbackImageField } from './web-fields.js';
import { loadLeaflet, localTileLayer, OSM_ATTRIBUTION, OSM_TILES, pinSvg, STEP_ZOOM, themeOf } from '../../../shared/embeds/map.js';
import { escape } from '../../../shared/markdown.js';
import { slideTitle } from '../../../shared/render.js';

/**
 * @typedef {object} MapFieldsOptions
 * @property {string} key  Unique per slot or block (keeps its mini map).
 * @property {string} label  Accessible name prefix, e.g. "Map".
 * @property {'slot' | 'block'} kind  Slots have audience steps and "present".
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(value: any, typing?: boolean) => void} write  Store a new value; `typing` coalesces into one undo step.
 * @property {(path: string) => Promise<Blob | null>} readFile  Read a show file (layers, local tiles).
 * @property {(file: File, write: (path: string, title: string) => void) => Promise<void>} addLayerFile
 * @property {(file: File, alt?: string) => Promise<void>} addFallback
 * @property {(src: string) => string} [resolveAsset]
 * @property {any[]} slides  The show's slides (for "linked slide").
 * @property {string} [currentSlideId]
 */

/**
 * @typedef {object} MiniMap
 * @property {HTMLElement} wrapper
 * @property {MapFieldsOptions} options  The latest (read/write change per render).
 * @property {any} [L]
 * @property {any} [map]
 * @property {any} [tiles]  The tile layer.
 * @property {string} tilesKey
 * @property {any} [layerGroup]
 * @property {string} layersKey
 * @property {any} [pinGroup]
 * @property {string} pinsKey
 * @property {boolean} adding  "Click to add" mode.
 * @property {Set<number>} open  Place rows that are expanded.
 * @property {HTMLElement} status
 */

/** @type {Map<string, MiniMap>} */
const miniMaps = new Map();

/**
 * @param {MapFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function mapFields(options) {
  const { label, kind, read, write } = options;
  const value = read() ?? {};
  const mini = miniMap(options);
  /** @param {(v: any) => any} fn @param {boolean} [typing] */
  const change = (fn, typing = false) => write(fn(read() ?? {}), typing);

  return [
    mini.wrapper,
    placesSection(options, value, mini, change),
    kind === 'slot' ? stepsSection(options, value, change) : null,
    layersSection(options, value, change),
    tilesSection(options, value, change),
    h('label', { class: 'slipr-label' }, ['Caption',
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: value.caption ?? '', 'aria-label': `${label}: caption`,
        placeholder: 'Optional: a line below the map',
        oninput: (/** @type {Event} */ e) => change((v) => withField(v, 'caption', /** @type {HTMLInputElement} */ (e.target).value || undefined), true),
      }),
    ]),
    fallbackImageField({
      label,
      read,
      write: (patch, field) => change((v) => withField(v, 'fallback', patch.fallback), field === 'fallback-alt'),
      addFallback: (file) => options.addFallback(file),
      resolveAsset: options.resolveAsset,
    }, 'Optional: a picture of the map for print, slide thumbnails and presenting without a connection. Snapshot as fallback (above the places) makes one from the mini map.'),
  ].filter(/** @returns {x is HTMLElement} */ (x) => Boolean(x));
}

/** @param {any} v @param {string} key @param {any} next */
function withField(v, key, next) {
  const out = { ...v, [key]: next };
  if (next === undefined) delete out[key];
  return out;
}

// ---------------------------------------------------------------------------
// The mini map

/**
 * The mini map of a slot or block, made once and re-synced on every render.
 * @param {MapFieldsOptions} options
 * @returns {MiniMap}
 */
function miniMap(options) {
  let mini = miniMaps.get(options.key);
  if (!mini) {
    const status = h('p', { class: 'slipr-help slipr-map-editor-status', 'aria-live': 'polite' });
    mini = {
      wrapper: h('div', { class: 'slipr-map-editor' }),
      options, tilesKey: '', layersKey: '', pinsKey: '', adding: false, open: new Set(), status,
    };
    miniMaps.set(options.key, mini);
    buildMiniMap(mini);
  }
  mini.options = options;
  renderToolbar(mini);
  sync(mini);
  return mini;
}

/** Create the Leaflet map (async: Leaflet loads on first use). @param {MiniMap} mini */
async function buildMiniMap(mini) {
  const canvas = h('div', { class: 'slipr-map-editor-canvas', role: 'application', 'aria-label': 'Map editor: drag to pan, + / − to zoom, drag a pin to move a place' });
  mini.wrapper.prepend(canvas);
  try {
    const L = await loadLeaflet(document);
    mini.L = L;
    const map = L.map(canvas, { scrollWheelZoom: 'center', zoomSnap: 0.5, doubleClickZoom: false, attributionControl: true });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    mini.map = map;
    /** @type {any} */ (canvas).sliprMap = map; // for browser checks
    const value = mini.options.read() ?? {};
    if (value.center) map.setView([value.center.lat, value.center.lng], Number.isFinite(value.zoom) ? value.zoom : STEP_ZOOM);
    else map.setView([20, 0], 2);
    map.on('click', (/** @type {any} */ e) => {
      if (!mini.adding) return;
      const { value: next, index } = addPlace(mini.options.read() ?? {}, { lat: e.latlng.lat, lng: e.latlng.lng });
      mini.open.add(index);
      mini.options.write(next);
      mini.status.textContent = `Place ${index + 1} added. Click again to add another, or turn “Click to add” off.`;
    });
    new ResizeObserver(() => map.invalidateSize()).observe(canvas);
    sync(mini, true);
    renderToolbar(mini); // its map buttons were drawn disabled while Leaflet loaded
  } catch (err) {
    canvas.replaceChildren(h('p', { class: 'slipr-help is-error' }, [`The map could not be loaded: ${err instanceof Error ? err.message : err}`]));
  }
}

/**
 * Bring tiles, layers and pins in line with the value.
 * @param {MiniMap} mini @param {boolean} [first]  Fit the view to the value (when the map is new).
 */
function sync(mini, first = false) {
  const { L, map } = mini;
  if (!L || !map) return;
  const value = mini.options.read() ?? {};
  const palette = themeOf(mini.wrapper).palette;
  const tagColors = new Map();
  for (const tag of [...(value.markers ?? []).map((/** @type {any} */ m) => m.tags?.[0]), ...(value.layers ?? []).map((/** @type {any} */ l) => l.tag)]) {
    if (tag && !tagColors.has(tag)) tagColors.set(tag, palette[tagColors.size % palette.length]);
  }
  const colorOf = (/** @type {string | undefined} */ tag) => (tag ? tagColors.get(tag) : null) ?? palette[0];

  // Tiles
  const choice = tilesChoice(value);
  const tilesKey = JSON.stringify(choice);
  if (tilesKey !== mini.tilesKey) {
    mini.tilesKey = tilesKey;
    mini.tiles?.remove();
    mini.tiles = null;
    const maxZoom = choice.maxZoom ?? 19;
    // crossOrigin: tiles drawn into a snapshot must not taint the canvas.
    if (choice.mode === 'osm') mini.tiles = L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, crossOrigin: 'anonymous' });
    else if (choice.mode === 'server' && !tilesProblem({ ...choice, attribution: 'x' })) mini.tiles = L.tileLayer(choice.url, { maxZoom, attribution: escape(choice.attribution), crossOrigin: 'anonymous' });
    else if (choice.mode === 'folder' && !tilesProblem(choice)) mini.tiles = new (localTileLayer(L, mini.options.readFile))(choice.url, { maxZoom, attribution: escape(choice.attribution) });
    mini.tiles?.addTo(map);
  }

  // GeoJSON layers
  const layersKey = JSON.stringify(value.layers ?? []);
  if (layersKey !== mini.layersKey) {
    mini.layersKey = layersKey;
    mini.layerGroup?.remove();
    const group = L.layerGroup().addTo(map);
    mini.layerGroup = group;
    for (const layer of value.layers ?? []) {
      mini.options.readFile(layer.data).then(async (blob) => {
        if (!blob || mini.layerGroup !== group) return;
        const color = layer.tag ? colorOf(layer.tag) : '#5B6573';
        const style = layer.tag ? { color, weight: 3, fillColor: color, fillOpacity: 0.18 } : { color, weight: 1.2, fillColor: '#FFFFFF', fillOpacity: 1 };
        L.geoJSON(JSON.parse(await blob.text()), { style: () => style, interactive: false }).addTo(group);
        group.eachLayer((/** @type {any} */ l) => { if (!layer.tag) l.bringToBack?.(); });
      }).catch(() => { mini.status.textContent = `Layer ${layer.data} could not be read.`; });
    }
  }

  // Pins (draggable)
  const pinsKey = JSON.stringify([(value.markers ?? []).map((/** @type {any} */ m) => [m.lat, m.lng, m.title, m.tags?.[0]]), [...tagColors]]);
  if (pinsKey !== mini.pinsKey) {
    mini.pinsKey = pinsKey;
    mini.pinGroup?.remove();
    mini.pinGroup = L.layerGroup().addTo(map);
    (value.markers ?? []).forEach((/** @type {any} */ m, /** @type {number} */ i) => {
      const icon = L.divIcon({ className: 'slipr-map-pin', html: pinSvg(colorOf(m.tags?.[0])), iconSize: [24, 32], iconAnchor: [12, 31], tooltipAnchor: [0, -28] });
      const pin = L.marker([m.lat, m.lng], { icon, draggable: true, title: m.title ?? `Place ${i + 1}`, keyboard: true });
      pin.bindTooltip(escape(m.title ?? `Place ${i + 1}`), { direction: 'top' });
      pin.on('dragend', () => {
        const at = pin.getLatLng();
        mini.open.add(i);
        mini.options.write(updatePlace(mini.options.read() ?? {}, i, { lat: at.lat, lng: at.lng }));
      });
      pin.on('click', () => {
        mini.open.add(i);
        const row = /** @type {HTMLDetailsElement | null | undefined} */ (mini.wrapper.parentElement?.querySelector(`[data-place-index="${i}"]`));
        if (row) {
          row.open = true;
          row.scrollIntoView({ block: 'nearest' });
          row.querySelector('input')?.focus({ preventScroll: true });
        }
      });
      pin.addTo(mini.pinGroup);
    });
  }

  if (first) homeView(mini, value);
}

/** The first view of the value: center + zoom, or everything on it. @param {MiniMap} mini @param {any} value */
function homeView(mini, value) {
  const { L, map } = mini;
  if (value.center) {
    map.setView([value.center.lat, value.center.lng], Number.isFinite(value.zoom) ? value.zoom : STEP_ZOOM);
    return;
  }
  const points = (value.markers ?? []).map((/** @type {any} */ m) => [m.lat, m.lng]);
  if (points.length === 1) map.setView(points[0], Number.isFinite(value.zoom) ? value.zoom : STEP_ZOOM);
  else if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], ...(Number.isFinite(value.zoom) ? { maxZoom: value.zoom } : {}) });
}

/** The buttons under the mini map. @param {MiniMap} mini */
function renderToolbar(mini) {
  const { options } = mini;
  const value = options.read() ?? {};
  const canFit = Boolean(value.markers?.length || value.layers?.length);
  const view = value.center
    ? `First view: fixed at ${value.center.lat.toFixed(3)}, ${value.center.lng.toFixed(3)}, zoom ${value.zoom ?? STEP_ZOOM}.`
    : 'First view: fits all places and layers.';
  const toolbar = h('div', { class: 'slipr-map-editor-tools', role: 'toolbar', 'aria-label': `${options.label}: map tools` }, [
    h('button', {
      type: 'button', class: `slipr-btn slipr-btn-sm ${mini.adding ? 'is-active' : ''}`, 'aria-pressed': String(mini.adding),
      title: 'When on, each click on the map adds a place there',
      onclick: () => {
        mini.adding = !mini.adding;
        mini.wrapper.classList.toggle('is-adding', mini.adding);
        mini.status.textContent = mini.adding ? 'Click the map to add a place.' : '';
        renderToolbar(mini);
      },
    }, ['📍 Click to add']),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Add a place in the middle of the mini map (then drag it, or type its position)',
      onclick: () => {
        const at = mini.map?.getCenter() ?? { lat: 20, lng: 0 };
        const { value: next, index } = addPlace(options.read() ?? {}, { lat: at.lat, lng: at.lng });
        mini.open.add(index);
        options.write(next);
      },
    }, ['+ Place at center']),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !mini.map, title: 'Use what the mini map shows now as the first view (center and zoom)',
      onclick: () => {
        if (!mini.map) return;
        options.write(setView(options.read() ?? {}, mini.map.getCenter(), mini.map.getZoom()));
        mini.status.textContent = 'The first view is now what the mini map shows.';
      },
    }, ['Use this view']),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !canFit || !value.center,
      title: canFit ? 'No fixed view: the map shows all its places and layers' : 'Add a place or a layer first',
      onclick: () => {
        const next = fitView(options.read() ?? {});
        options.write(next);
        homeView(mini, next);
      },
    }, ['Fit to places']),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !mini.map, title: 'Save a picture of the mini map as the fallback image (print, thumbnails, presenting offline)',
      onclick: () => snapshotToFallback(mini),
    }, ['📷 Snapshot as fallback']),
  ]);
  const old = mini.wrapper.querySelector(':scope > .slipr-map-editor-tools');
  if (old) old.replaceWith(toolbar);
  else mini.wrapper.append(toolbar);
  let info = /** @type {HTMLElement | null} */ (mini.wrapper.querySelector(':scope > .slipr-map-editor-view'));
  if (!info) {
    info = h('p', { class: 'slipr-help slipr-map-editor-view' });
    mini.wrapper.append(info, mini.status);
  }
  info.textContent = view;
}

/**
 * Draw the mini map (tiles, layers, pins, attribution) into a PNG and make it the fallback image.
 * @param {MiniMap} mini
 */
async function snapshotToFallback(mini) {
  const map = mini.map;
  if (!map) return;
  mini.status.textContent = 'Making a snapshot…';
  try {
    const blob = await snapshot(map);
    const file = new File([blob], 'map-snapshot.png', { type: 'image/png' });
    const before = mini.options.read()?.fallback?.src;
    await mini.options.addFallback(file, snapshotAlt(mini.options.read() ?? {}));
    const after = mini.options.read()?.fallback?.src;
    // Adding a picture can stop to ask for the show folder first (shows opened by URL).
    mini.status.textContent = after && after !== before
      ? 'Snapshot saved as the fallback image.'
      : 'No snapshot saved yet: the picture needs the show folder. Choose it, then press Snapshot again.';
  } catch (err) {
    mini.status.textContent = err instanceof DOMException && err.name === 'SecurityError'
      ? 'The tile server does not allow copying its map pictures, so no snapshot can be made. Choose a picture as fallback instead.'
      : `No snapshot: ${err instanceof Error ? err.message : err}`;
  }
}

/**
 * A PNG of what a Leaflet map shows: loaded tiles, vector layers, pins and the attribution text.
 * @param {any} map
 * @returns {Promise<Blob>}
 */
export async function snapshot(map) {
  const container = /** @type {HTMLElement} */ (map.getContainer());
  const box = container.getBoundingClientRect();
  const scale = Math.min(2, window.devicePixelRatio || 1) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.scale(scale, scale);
  ctx.fillStyle = getComputedStyle(container).backgroundColor || '#dddddd';
  ctx.fillRect(0, 0, box.width, box.height);
  /** @param {Element} el @param {CanvasImageSource} img */
  const draw = (el, img) => {
    const r = el.getBoundingClientRect();
    ctx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height);
  };
  for (const tile of /** @type {NodeListOf<HTMLImageElement>} */ (container.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded'))) draw(tile, tile);
  const svgs = [...container.querySelectorAll('.leaflet-overlay-pane svg'), ...container.querySelectorAll('.leaflet-marker-pane .slipr-map-pin svg')];
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const copy = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
    copy.setAttribute('width', String(r.width));
    copy.setAttribute('height', String(r.height));
    copy.removeAttribute('style');
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    await img.decode().catch(() => new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }));
    draw(svg, img);
  }
  const credit = container.querySelector('.leaflet-control-attribution')?.textContent?.trim();
  if (credit) {
    ctx.font = '11px system-ui, sans-serif';
    const w = ctx.measureText(credit).width + 8;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(box.width - w, box.height - 16, w, 16);
    ctx.fillStyle = '#333333';
    ctx.fillText(credit, box.width - w + 4, box.height - 4);
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), 'image/png');
    } catch (err) {
      reject(err); // a tainted canvas: SecurityError
    }
  });
}

// ---------------------------------------------------------------------------
// Rows

/**
 * @param {MapFieldsOptions} options @param {any} value @param {MiniMap} mini
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 */
function placesSection(options, value, mini, change) {
  const places = Array.isArray(value.markers) ? value.markers : [];
  const slides = options.slides ?? [];
  const rows = places.map((/** @type {any} */ m, /** @type {number} */ i) => {
    const name = m.title || m.id || `Place ${i + 1}`;
    /** @param {string} field @param {any} v @param {boolean} [typing] */
    const set = (field, v, typing = false) => change((cur) => updatePlace(cur, i, { [field]: v }), typing);
    const details = /** @type {HTMLDetailsElement} */ (h('details', { class: 'slipr-map-row', 'data-place-index': String(i), open: mini.open.has(i) ? true : undefined }, [
      h('summary', {}, [h('span', { class: 'slipr-map-row-title' }, [`📍 ${name}`]), h('span', { class: 'slipr-help' }, [` ${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}`])]),
      h('div', { class: 'slipr-map-row-body' }, [
        h('label', { class: 'slipr-label' }, ['Title', h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: m.title ?? '', oninput: (/** @type {Event} */ e) => set('title', /** @type {HTMLInputElement} */ (e.target).value, true) })]),
        h('div', { class: 'slipr-map-latlng' }, [
          h('label', { class: 'slipr-label' }, ['Latitude', h('input', { type: 'number', step: 'any', min: '-90', max: '90', class: 'slipr-input slipr-input-sm', value: String(m.lat), onchange: (/** @type {Event} */ e) => set('lat', Number(/** @type {HTMLInputElement} */ (e.target).value)) })]),
          h('label', { class: 'slipr-label' }, ['Longitude', h('input', { type: 'number', step: 'any', min: '-180', max: '180', class: 'slipr-input slipr-input-sm', value: String(m.lng), onchange: (/** @type {Event} */ e) => set('lng', Number(/** @type {HTMLInputElement} */ (e.target).value)) })]),
        ]),
        h('label', { class: 'slipr-label' }, ['Tags (the first picks the color)', h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: (m.tags ?? []).join(', '), placeholder: 'e.g. office, port', onchange: (/** @type {Event} */ e) => set('tags', /** @type {HTMLInputElement} */ (e.target).value) })]),
        h('label', { class: 'slipr-label' }, ['Text for readers (Markdown)', h('textarea', { class: 'slipr-textarea', rows: 2, oninput: (/** @type {Event} */ e) => set('md', /** @type {HTMLTextAreaElement} */ (e.target).value, true) }, [m.md ?? ''])]),
        h('label', { class: 'slipr-label' }, ['Linked slide', h('select', {
          class: 'slipr-select slipr-select-sm',
          onchange: (/** @type {Event} */ e) => set('slide', /** @type {HTMLSelectElement} */ (e.target).value),
        }, [
          h('option', { value: '' }, ['(none)']),
          ...slides.filter((/** @type {any} */ s) => s.id !== options.currentSlideId).map((/** @type {any} */ s) => h('option', { value: s.id, selected: s.id === m.slide ? true : undefined }, [`${slideTitle(s) || s.id}`])),
          m.slide && !slides.some((/** @type {any} */ s) => s.id === m.slide) ? h('option', { value: m.slide, selected: true }, [`${m.slide} (no such slide)`]) : null,
        ])]),
        h('label', { class: 'slipr-label' }, ['Id (for steps)', h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: m.id ?? '', onchange: (/** @type {Event} */ e) => set('id', /** @type {HTMLInputElement} */ (e.target).value.trim()) })]),
        h('div', { class: 'slipr-map-row-actions' }, [
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move ${name} up`, disabled: i === 0, onclick: () => change((cur) => movePlace(cur, i, -1)) }, ['▲']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move ${name} down`, disabled: i === places.length - 1, onclick: () => change((cur) => movePlace(cur, i, 1)) }, ['▼']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Show this place in the mini map', onclick: () => mini.map?.setView([m.lat, m.lng], Math.max(mini.map.getZoom(), 10)) }, ['Show on map']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': `Remove ${name}`, onclick: () => { mini.open.delete(i); change((cur) => removePlace(cur, i)); } }, ['🗑 Remove']),
        ]),
      ]),
    ]));
    details.addEventListener('toggle', () => {
      if (details.open) mini.open.add(i);
      else mini.open.delete(i);
    });
    return details;
  });
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, [`Places (${places.length})`]),
    places.length ? null : h('p', { class: 'slipr-help' }, ['No places yet: use 📍 Click to add, or + Place at center, on the mini map.']),
    ...rows,
  ]);
}

/** @param {MapFieldsOptions} options @param {any} value @param {(fn: (v: any) => any, typing?: boolean) => void} change */
function stepsSection(options, value, change) {
  const places = Array.isArray(value.markers) ? value.markers : [];
  const steps = Array.isArray(value.steps) ? value.steps : [];
  const rows = steps.map((/** @type {any} */ s, /** @type {number} */ i) => {
    const at = places.findIndex((/** @type {any} */ p) => p.id === s.marker);
    return h('div', { class: 'slipr-map-step-row' }, [
      h('span', { class: 'slipr-map-step-number' }, [`${i + 1}.`]),
      h('select', {
        class: 'slipr-select slipr-select-sm', 'aria-label': `Step ${i + 1}: place`,
        onchange: (/** @type {Event} */ e) => change((cur) => updateStep(cur, i, { place: Number(/** @type {HTMLSelectElement} */ (e.target).value) })),
      }, [
        at < 0 ? h('option', { value: '', selected: true, disabled: true }, [`${s.marker} (no such place)`]) : null,
        ...places.map((/** @type {any} */ p, /** @type {number} */ j) => h('option', { value: String(j), selected: j === at ? true : undefined }, [p.title || p.id || `Place ${j + 1}`])),
      ]),
      h('label', { class: 'slipr-map-step-zoom' }, ['zoom ', h('input', {
        type: 'number', min: '0', max: '22', step: '0.5', class: 'slipr-input slipr-input-sm', value: s.zoom ?? '', placeholder: String(STEP_ZOOM),
        'aria-label': `Step ${i + 1}: zoom`,
        onchange: (/** @type {Event} */ e) => change((cur) => updateStep(cur, i, { zoom: /** @type {HTMLInputElement} */ (e.target).value })),
      })]),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move step ${i + 1} up`, disabled: i === 0, onclick: () => change((cur) => moveStep(cur, i, -1)) }, ['▲']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move step ${i + 1} down`, disabled: i === steps.length - 1, onclick: () => change((cur) => moveStep(cur, i, 1)) }, ['▼']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': `Remove step ${i + 1}`, onclick: () => change((cur) => removeStep(cur, i)) }, ['🗑']),
    ]);
  });
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, [`Tour while presenting (${steps.length} step${steps.length === 1 ? '' : 's'})`]),
    h('p', { class: 'slipr-help' }, ['Each click while presenting flies to the next place; before the first step the map shows its first view.']),
    ...rows,
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !places.length, title: places.length ? '' : 'Add a place first', onclick: () => change((cur) => addStep(cur)) }, ['+ Add step']),
  ]);
}

/** @param {MapFieldsOptions} options @param {any} value @param {(fn: (v: any) => any, typing?: boolean) => void} change */
function layersSection(options, value, change) {
  const layers = Array.isArray(value.layers) ? value.layers : [];
  const fileInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'file', accept: '.geojson,.json,application/geo+json,application/json', hidden: true,
    onchange: () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) runImage(() => options.addLayerFile(file, (path, title) => change((cur) => addLayer(cur, path, title))));
    },
  }));
  const rows = layers.map((/** @type {any} */ l, /** @type {number} */ i) => h('div', { class: 'slipr-map-layer-row' }, [
    h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: l.data, 'aria-label': `Layer ${i + 1}: file`, onchange: (/** @type {Event} */ e) => change((cur) => updateLayer(cur, i, { data: /** @type {HTMLInputElement} */ (e.target).value.trim() })) }),
    h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: l.title ?? '', placeholder: 'Title', 'aria-label': `Layer ${i + 1}: title`, oninput: (/** @type {Event} */ e) => change((cur) => updateLayer(cur, i, { title: /** @type {HTMLInputElement} */ (e.target).value }), true) }),
    h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: l.tag ?? '', placeholder: 'Tag (empty: background)', 'aria-label': `Layer ${i + 1}: tag`, onchange: (/** @type {Event} */ e) => change((cur) => updateLayer(cur, i, { tag: /** @type {HTMLInputElement} */ (e.target).value.trim() })) }),
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': `Remove layer ${i + 1}`, onclick: () => change((cur) => removeLayer(cur, i)) }, ['🗑']),
  ]));
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, [`Layers (${layers.length})`]),
    h('p', { class: 'slipr-help' }, ['Lines and areas from GeoJSON files. A tag gives a layer a color; a layer without a tag is background (land, borders).']),
    ...rows,
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click() }, ['+ Add layer from file…']),
    fileInput,
  ]);
}

/** @param {MapFieldsOptions} options @param {any} value @param {(fn: (v: any) => any, typing?: boolean) => void} change */
function tilesSection(options, value, change) {
  const choice = tilesChoice(value);
  const problem = tilesProblem(choice);
  /** @param {Partial<import('../map-values.js').TilesChoice>} patch @param {boolean} [typing] */
  const setTiles = (patch, typing = false) => change((cur) => withField(cur, 'tiles', tilesValue({ ...tilesChoice(cur), ...patch })), typing);
  const fromServer = choice.mode === 'osm' || choice.mode === 'server';
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, ['Background map']),
    h('select', {
      class: 'slipr-select slipr-select-sm', 'aria-label': `${options.label}: background map`,
      onchange: (/** @type {Event} */ e) => {
        const mode = /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value);
        setTiles({ mode, ...(mode !== choice.mode ? { url: '', attribution: '', maxZoom: null } : {}) });
      },
    }, [
      h('option', { value: 'osm', selected: choice.mode === 'osm' ? true : undefined }, ['OpenStreetMap (from the internet)']),
      h('option', { value: 'none', selected: choice.mode === 'none' ? true : undefined }, ['None: only places and layers (offline)']),
      h('option', { value: 'folder', selected: choice.mode === 'folder' ? true : undefined }, ['Map pictures in the show folder (offline)']),
      h('option', { value: 'server', selected: choice.mode === 'server' ? true : undefined }, ['Another tile server']),
    ]),
    choice.mode === 'folder' || choice.mode === 'server' ? h('div', { class: 'slipr-map-tiles' }, [
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: choice.url, 'aria-label': 'Tile address',
        placeholder: choice.mode === 'folder' ? 'tiles/{z}/{x}/{y}.png' : 'https://tiles.example.org/{z}/{x}/{y}.png',
        onchange: (/** @type {Event} */ e) => setTiles({ url: /** @type {HTMLInputElement} */ (e.target).value.trim() }),
      }),
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: choice.attribution, 'aria-label': 'Attribution',
        placeholder: choice.mode === 'server' ? 'Attribution, e.g. © Example Maps' : 'Attribution (optional)',
        onchange: (/** @type {Event} */ e) => setTiles({ attribution: /** @type {HTMLInputElement} */ (e.target).value }),
      }),
      h('label', { class: 'slipr-map-step-zoom' }, ['Max zoom ', h('input', {
        type: 'number', min: '0', max: '22', class: 'slipr-input slipr-input-sm', value: choice.maxZoom ?? '', placeholder: '19',
        onchange: (/** @type {Event} */ e) => {
          const n = Number.parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
          setTiles({ maxZoom: Number.isInteger(n) ? n : null });
        },
      })]),
    ]) : null,
    problem ? h('span', { class: 'slipr-help is-warning', role: 'note' }, [problem]) : null,
    options.kind === 'slot' && fromServer ? h('label', { class: 'slipr-label' }, ['While presenting', h('select', {
      class: 'slipr-select slipr-select-sm',
      onchange: (/** @type {Event} */ e) => change((cur) => withField(cur, 'present', /** @type {HTMLSelectElement} */ (e.target).value === 'static' ? 'static' : undefined)),
    }, [
      h('option', { value: 'live', selected: value.present !== 'static' ? true : undefined }, ['Show the live map']),
      h('option', { value: 'static', selected: value.present === 'static' ? true : undefined }, ['Show the fallback picture (nothing is loaded)']),
    ])]) : null,
    fromServer ? h('div', { class: 'slipr-form-checkbox' }, [h('label', {}, [
      h('input', {
        type: 'checkbox', checked: value.load === 'auto',
        onchange: (/** @type {Event} */ e) => change((cur) => withField(cur, 'load', /** @type {HTMLInputElement} */ (e.target).checked ? 'auto' : undefined)),
      }),
      ' In reader mode, load the map straight away without asking',
    ])]) : null,
  ]);
}
