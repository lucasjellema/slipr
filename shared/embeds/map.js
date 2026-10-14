// @ts-check
/**
 * Embed kind `map`: an interactive map drawn with the vendored Leaflet (I-075,
 * D-011), as a `map` slot and a `map` reader block. Follows the embed kind
 * contract of ./index.js.
 *
 * The static content is an accessible list of the markers, so print,
 * thumbnails, screen readers and failures still name the places. Hydration
 * loads Leaflet only when a map is on the page.
 *
 * Tiles (the background map) come from `tiles`:
 * - absent: OpenStreetMap (https://tile.openstreetmap.org), with its attribution;
 * - an `https:` URL template: another tile server (the author names the attribution);
 * - a relative template (`tiles/{z}/{x}/{y}.png`): tiles in the show folder,
 *   which load without asking and work offline;
 * - `"none"`: no background, only markers and GeoJSON layers.
 * Tiles from a server are click-to-load in reader mode (unless `load: "auto"`);
 * in audience mode they load live, or `present: "static"` keeps the fallback.
 *
 * Reader mode: drag to pan, + / − / Fit (the wheel scrolls the page), click /
 * tap a marker or pick it from the Place list to show its panel (Markdown,
 * "Go to slide"); tag chips filter. Audience mode: a fixed view; `steps` fly
 * from marker to marker on hidden Reveal fragments after the slot.
 *
 * Colors come from the template (`--slipr-graph-1` … `6`, by a marker's or
 * layer's tag in order of first use, as for graphs); the show holds none.
 */
import { escape, markdown } from '../markdown.js';
import { externalOrigin } from './consent.js';

/** Vendor folder (relative to the Slipr root); the export leaves it out of shows without maps. */
export const library = 'vendor/leaflet-1.9.4/';
/** Not drawn in editor thumbnails (tiles and a map per thumbnail are heavy); they show the list. */
export const thumbnail = false;
/** Label of the error box when rendering fails. */
export const errorLabel = 'Map could not be drawn';

/** The default tile source: OpenStreetMap's standard tiles (usage policy: https://operations.osmfoundation.org/policies/tiles/). */
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const PALETTE_SIZE = 6;
/** Zoom for a step without its own, and for a single marker without `zoom`. */
export const STEP_ZOOM = 12;

/**
 * @typedef {{ id?: string, lat: number, lng: number, title: string, md?: string, tags: string[], slide?: string }} MapMarker
 * @typedef {{ data: string, title?: string, tag?: string }} MapLayer
 * @typedef {{ marker: string, zoom?: number }} MapStep
 * @typedef {{ kind: 'server' | 'local' | 'none', url: string, attribution: string, maxZoom: number }} TileSource
 */

/**
 * Is this a map value (slot value or block)?
 * @param {any} value
 * @returns {boolean}
 */
export function isMap(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Array.isArray(value.markers) || isLatLng(value.center) || Array.isArray(value.layers)));
}

/** @param {any} v */
function isLatLng(v) {
  return Boolean(v && typeof v === 'object' && Number.isFinite(v.lat) && Number.isFinite(v.lng));
}

/** A relative address in the show folder (no scheme, not root-relative). @param {string} src */
const isLocalPath = (src) => !/^[a-z][a-z0-9+.-]*:|^\/|^\\/i.test(src);

/**
 * The markers of a map, cleaned: a finite position, a title (default: the id). DOM-free (tested).
 * @param {any} value
 * @returns {MapMarker[]}
 */
export function mapMarkers(value) {
  return (Array.isArray(value?.markers) ? value.markers : [])
    .filter((/** @type {any} */ m) => isLatLng(m))
    .map((/** @type {any} */ m) => ({
      ...(typeof m.id === 'string' && m.id ? { id: m.id } : {}),
      lat: m.lat,
      lng: m.lng,
      title: typeof m.title === 'string' && m.title ? m.title : (typeof m.id === 'string' && m.id ? m.id : `${m.lat}, ${m.lng}`),
      tags: Array.isArray(m.tags) ? m.tags.filter((/** @type {unknown} */ t) => typeof t === 'string' && t) : [],
      ...(typeof m.md === 'string' && m.md ? { md: m.md } : {}),
      ...(typeof m.slide === 'string' && m.slide ? { slide: m.slide } : {}),
    }));
}

/**
 * The GeoJSON layers of a map: files in the show folder. DOM-free (tested).
 * @param {any} value
 * @returns {MapLayer[]}
 */
export function mapLayers(value) {
  return (Array.isArray(value?.layers) ? value.layers : [])
    .filter((/** @type {any} */ l) => l && typeof l.data === 'string' && l.data && isLocalPath(l.data))
    .map((/** @type {any} */ l) => ({
      data: l.data,
      ...(typeof l.title === 'string' && l.title ? { title: l.title } : {}),
      ...(typeof l.tag === 'string' && l.tag ? { tag: l.tag } : {}),
    }));
}

/**
 * Where the map's tiles come from. DOM-free (tested).
 * @param {any} value
 * @returns {TileSource}
 */
export function tileSource(value) {
  const raw = value?.tiles;
  if (raw === 'none') return { kind: 'none', url: '', attribution: '', maxZoom: 19 };
  const url = typeof raw === 'string' ? raw : typeof raw?.url === 'string' ? raw.url : '';
  const maxZoom = Number.isInteger(raw?.maxZoom) ? Math.max(0, Math.min(22, raw.maxZoom)) : 19;
  const attribution = typeof raw?.attribution === 'string' ? raw.attribution : '';
  if (!url) return { kind: 'server', url: OSM_TILES, attribution: '', maxZoom };
  if (/^https:\/\//i.test(url)) return { kind: 'server', url, attribution, maxZoom };
  if (isLocalPath(url)) return { kind: 'local', url, attribution, maxZoom };
  return { kind: 'none', url: '', attribution: '', maxZoom }; // not a usable address: draw without tiles
}

/**
 * The origin a tile server URL template contacts (`{s}.` subdomains left out), or null.
 * @param {string} template
 */
export function tileOrigin(template) {
  return externalOrigin(template.replace(/\{s\}\./, ''));
}

/**
 * Local tile templates (tiles in the show folder) the maps of a show use. DOM-free.
 * @param {any} show
 * @returns {string[]}
 */
export function localTileTemplates(show) {
  const found = new Set();
  for (const slide of Array.isArray(show?.slides) ? show.slides : []) {
    const values = [...Object.values(slide?.content && typeof slide.content === 'object' ? slide.content : {}),
      ...(Array.isArray(slide?.reader?.blocks) ? slide.reader.blocks.filter((/** @type {any} */ b) => b?.type === 'map') : [])];
    for (const value of values) {
      if (!isMap(value)) continue;
      const tiles = tileSource(value);
      if (tiles.kind === 'local') found.add(tiles.url);
    }
  }
  return [...found];
}

/**
 * The folder a local tile template's files live in (`tiles/{z}/{x}/{y}.png` →
 * `tiles`; `{z}/{x}/{y}.png` → ``), relative to show.json.
 * @param {string} template
 */
export function tileFolder(template) {
  const head = template.split('{')[0];
  const cut = head.lastIndexOf('/');
  return cut < 0 ? '' : head.slice(0, cut).replace(/^\.\//, '');
}

/**
 * A pattern for the paths (relative to show.json) a local tile template names:
 * `{z}`, `{x}`, `{y}` are numbers, `{s}` a letter, `{r}` empty or `@2x`.
 * @param {string} template
 * @returns {RegExp}
 */
export function tilePattern(template) {
  const parts = template.replace(/^\.\//, '').split(/(\{[a-z]+\})/);
  const body = parts.map((part) => {
    if (part === '{z}' || part === '{x}' || part === '{y}') return '-?\\d+';
    if (part === '{s}') return '[a-z0-9]';
    if (part === '{r}') return '(?:@2x)?';
    return part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`);
}

/**
 * Palette index (0-based) per tag, in order of first use (markers first, then layers).
 * @param {MapMarker[]} markers @param {MapLayer[]} layers
 * @returns {Map<string, number>}
 */
export function mapTagColors(markers, layers) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const tag of [...markers.map((m) => m.tags[0]), ...layers.map((l) => l.tag)]) {
    if (tag && !map.has(tag)) map.set(tag, map.size % PALETTE_SIZE);
  }
  return map;
}

/**
 * The view after `count` steps: the marker to fly to and its zoom, or null for
 * the map's own view. DOM-free (tested).
 * @param {MapMarker[]} markers @param {MapStep[]} steps @param {number} count
 * @returns {{ marker: MapMarker, zoom: number } | null}
 */
export function stepView(markers, steps, count) {
  const step = count > 0 ? steps[Math.min(count, steps.length) - 1] : null;
  const marker = step ? markers.find((m) => m.id === step.marker) : null;
  if (!step || !marker) return null;
  return { marker, zoom: Number.isFinite(step.zoom) ? /** @type {number} */ (step.zoom) : STEP_ZOOM };
}

/**
 * Attributes of the embed element: the map itself, the mode, its tiles and,
 * for tiles from a server, the origin that makes ./index.js ask first.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  const mode = options.mode === 'audience' ? 'audience' : 'reader';
  const tiles = tileSource(value);
  const layers = mapLayers(value).map((l) => ({ ...l, src: ctx.resolveAsset(l.data) }));
  const steps = (Array.isArray(value?.steps) ? value.steps : [])
    .filter((/** @type {any} */ s) => s && typeof s.marker === 'string');
  /** @type {Record<string, string>} */
  const attrs = {
    class: 'slipr-map',
    'data-map': JSON.stringify({
      markers: mapMarkers(value),
      layers,
      steps,
      ...(isLatLng(value?.center) ? { center: { lat: value.center.lat, lng: value.center.lng } } : {}),
      ...(Number.isFinite(value?.zoom) ? { zoom: value.zoom } : {}),
    }),
    'data-map-mode': mode,
    'data-embed-print': 'fallback',
  };
  if (tiles.kind === 'local') {
    // Resolve the folder part only: the {z}/{x}/{y} placeholders must stay as they are.
    const cut = tiles.url.indexOf('{');
    const head = cut < 0 ? tiles.url : tiles.url.slice(0, cut);
    attrs['data-map-tiles'] = (head ? ctx.resolveAsset(head) : ctx.resolveAsset('./')) + (cut < 0 ? '' : tiles.url.slice(cut));
    // As written: shows read from a folder or a zip read each tile through hydrateEmbeds' readAsset (I-099).
    attrs['data-map-tiles-local'] = tiles.url;
  } else if (tiles.kind === 'server') {
    attrs['data-map-tiles'] = tiles.url;
  }
  if (tiles.kind !== 'none') {
    attrs['data-map-attribution'] = tiles.attribution;
    attrs['data-map-max-zoom'] = String(tiles.maxZoom);
  }
  if (typeof value?.title === 'string' && value.title) attrs['aria-label'] = value.title;
  if (mode === 'audience') {
    if (value?.present === 'static') attrs['data-embed-static'] = '';
  } else if (tiles.kind === 'server' && value?.load !== 'auto') {
    const origin = tileOrigin(tiles.url);
    if (origin) attrs['data-embed-origin'] = origin;
  }
  return attrs;
}

/**
 * Static content without a fallback image: the markers as a list.
 * @param {any} value
 * @returns {{ html: string, fallback: 'list' }}
 */
export function staticHtml(value) {
  const items = mapMarkers(value).map((m) => {
    const text = m.md ? ` ${escape(plainText(m.md))}` : '';
    return `<li><strong>${escape(m.title)}</strong>${text}</li>`;
  });
  const layers = mapLayers(value).filter((l) => l.title).map((l) => `<li class="slipr-map-list-layer">${escape(/** @type {string} */ (l.title))}</li>`);
  if (!items.length && !layers.length) return { html: '<p class="slipr-map-list-empty">Map</p>', fallback: 'list' };
  return { html: `<ul class="slipr-map-list">${items.join('')}${layers.join('')}</ul>`, fallback: 'list' };
}

/** Markdown reduced to its words, for the static list. @param {string} md */
function plainText(md) {
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => label ?? id)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * In an audience slot with steps: one hidden Reveal fragment per step, after the slot's own.
 * @param {any} value
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 */
export function afterHtml(value, options = {}) {
  if (!options.slot || (options.mode ?? 'reader') !== 'audience') return '';
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  return steps.map((_, i) => `<span class="fragment slipr-map-step" data-map-step="${i + 1}" aria-hidden="true"></span>`).join('');
}

// ---------------------------------------------------------------------------
// Drawing (browser only)

/** @type {Promise<any> | null} */
let leafletPromise = null;

/** Lazy-load the vendored Leaflet once, with its stylesheet. */
async function getLeaflet() {
  if (!leafletPromise) {
    leafletPromise = import(new URL('../../vendor/leaflet-1.9.4/dist/leaflet-src.esm.js', import.meta.url).href);
    leafletPromise.catch(() => { leafletPromise = null; });
  }
  return leafletPromise;
}

/**
 * Add Leaflet's stylesheet to the document once; resolves when it has loaded
 * (Leaflet measures its panes, which the stylesheet positions).
 * @param {Document} doc
 * @returns {Promise<void>}
 */
function addLeafletStylesheet(doc) {
  const existing = /** @type {HTMLLinkElement | null} */ (doc.querySelector('link[data-slipr-leaflet]'));
  if (existing) return /** @type {any} */ (existing).sliprLoaded ?? Promise.resolve();
  const href = new URL('../../vendor/leaflet-1.9.4/dist/leaflet.css', import.meta.url).href;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.sliprLeaflet = '';
  // In a single-file export (I-054) stylesheets live in the file, not on a server.
  link.href = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(href) ?? href;
  // A stylesheet that fails still lets the map draw (less tidy); never wait forever.
  const loaded = new Promise((resolve) => {
    link.addEventListener('load', () => resolve(undefined), { once: true });
    link.addEventListener('error', () => resolve(undefined), { once: true });
    setTimeout(resolve, 3000);
  });
  /** @type {any} */ (link).sliprLoaded = loaded;
  doc.head.append(link);
  return loaded;
}

/**
 * Leaflet and its stylesheet, loaded once (also for the editor's map editor, E-021).
 * @param {Document} doc
 * @returns {Promise<any>}  The Leaflet module.
 */
export async function loadLeaflet(doc) {
  const [L] = await Promise.all([getLeaflet(), addLeafletStylesheet(doc)]);
  return L;
}

/**
 * A pin as SVG markup (fill escaped): Slipr's marker icon.
 * @param {string} color
 */
export function pinSvg(color) {
  return `<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true"><path d="M12 31c-1-3-10-12-10-19a10 10 0 0 1 20 0c0 7-9 16-10 19z" fill="${escape(color)}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>`;
}

/**
 * Draw the map into `live`. Throws when Leaflet cannot load or a layer file cannot be read.
 * @param {HTMLElement} el  The embed element.
 * @param {HTMLElement} live  Where the rendered content goes.
 * @param {{ readAsset?: (path: string) => Promise<Blob | null> }} [options]
 *   readAsset: read a file of the show (shows from a folder or a zip): local tiles are read through it.
 */
export async function hydrate(el, live, options = {}) {
  const own = JSON.parse(el.dataset.map ?? '{}');
  const markers = /** @type {MapMarker[]} */ (Array.isArray(own.markers) ? own.markers : []);
  const layerDefs = /** @type {(MapLayer & { src: string })[]} */ (Array.isArray(own.layers) ? own.layers : []);
  const steps = /** @type {MapStep[]} */ (Array.isArray(own.steps) ? own.steps : []);
  const audience = el.dataset.mapMode === 'audience';
  const doc = el.ownerDocument;

  const geojson = await Promise.all(layerDefs.map(async (l) => {
    const url = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(l.src) ?? l.src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The map layer "${l.title ?? l.data}" could not be read (${res.status}).`);
    return res.json();
  }));

  const [L] = await Promise.all([getLeaflet(), addLeafletStylesheet(doc)]);
  const theme = themeOf(el);
  const colors = mapTagColors(markers, layerDefs);
  const colorOf = (/** @type {string | undefined} */ tag) => theme.palette[tag ? colors.get(tag) ?? 0 : 0];

  const canvas = doc.createElement('div');
  canvas.className = 'slipr-map-canvas';
  canvas.setAttribute('aria-label', `${el.getAttribute('aria-label') || 'Map'}: ${markers.length} place${markers.length === 1 ? '' : 's'}. The list of places is below.`);
  live.append(canvas);
  // Leaflet measures its container: it must be in the page first.
  el.append(live);

  const map = L.map(canvas, {
    zoomControl: !audience,
    attributionControl: true,
    scrollWheelZoom: false,
    dragging: !audience,
    touchZoom: !audience,
    doubleClickZoom: !audience,
    boxZoom: !audience,
    keyboard: !audience,
    zoomSnap: audience ? 0 : 1,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
  /** @type {any} */ (el).sliprMap = map; // for debugging and browser checks

  const tiles = el.dataset.mapTiles;
  const localTiles = el.dataset.mapTilesLocal;
  if (tiles) {
    const maxZoom = Number(el.dataset.mapMaxZoom) || 19;
    // The author's attribution is text (show data is never HTML); OpenStreetMap's is a link.
    const attribution = tiles === OSM_TILES ? OSM_ATTRIBUTION : escape(el.dataset.mapAttribution ?? '');
    const read = options.readAsset;
    const layer = localTiles && read
      ? new (localTileLayer(L, read))(localTiles, { maxZoom, attribution })
      : L.tileLayer(tiles, { maxZoom, attribution, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!(localTiles && read) && /** @type {any} */ (globalThis).SLIPR_BUNDLE) {
      // Tiles in a single-file export: only those packed into the file exist.
      layer.getTileUrl = function getTileUrl(/** @type {any} */ coords) {
        return /** @type {any} */ (globalThis).SLIPR_BUNDLE.url(L.TileLayer.prototype.getTileUrl.call(this, coords));
      };
    }
    layer.addTo(map);
  }

  // GeoJSON layers: lines and areas in the layer's tag color; points as small circles.
  // A layer without a tag is background (land, borders): the template's page color, a muted outline.
  const overlays = layerDefs.map((def, i) => {
    const color = def.tag ? colorOf(def.tag) : theme.muted;
    const style = def.tag
      ? { color, weight: 3, opacity: 0.9, fillColor: color, fillOpacity: 0.18 }
      : { color, weight: 1.2, opacity: 0.8, fillColor: theme.bg, fillOpacity: 1 };
    return L.geoJSON(geojson[i], {
      style: () => style,
      pointToLayer: (/** @type {any} */ _f, /** @type {any} */ at) => L.circleMarker(at, { radius: 6, color, weight: 2, fillColor: color, fillOpacity: 0.7 }),
      onEachFeature: (/** @type {any} */ feature, /** @type {any} */ layer) => {
        const name = feature?.properties?.name ?? feature?.properties?.title ?? def.title;
        if (typeof name === 'string' && name) layer.bindTooltip(escape(name), { sticky: true });
      },
      interactive: !audience,
    }).addTo(map);
  });

  // Markers: a pin in the tag color, with the title as its tooltip and accessible name.
  const pins = markers.map((m) => {
    const color = colorOf(m.tags[0]);
    const icon = L.divIcon({
      className: 'slipr-map-pin',
      html: pinSvg(color),
      iconSize: [24, 32],
      iconAnchor: [12, 31],
      tooltipAnchor: [0, -28],
    });
    const pin = L.marker([m.lat, m.lng], { icon, title: m.title, alt: m.title, keyboard: !audience, interactive: !audience });
    pin.bindTooltip(escape(m.title), { direction: 'top', offset: [0, 0], permanent: false });
    if (!audience) {
      // A pin is a button with the place's name (Leaflet makes a new element each time it is added).
      pin.on('add', () => {
        const node = pin.getElement();
        node?.setAttribute('role', 'button');
        node?.setAttribute('aria-label', m.title);
      });
    }
    pin.addTo(map);
    return pin;
  });

  /** The map's own view: center and zoom, or everything on it. */
  // Until the reader moves the map, it keeps fitting its space (a reader column settles late).
  let fitting = false;
  let moved = false;
  map.on('dragstart', () => { moved = true; });
  map.on('zoomstart', () => { if (!fitting) moved = true; });
  const home = () => {
    moved = false;
    fitting = true;
    try {
      fitHome();
    } finally {
      fitting = false;
    }
  };
  const fitHome = () => {
    if (own.center) {
      map.setView([own.center.lat, own.center.lng], Number.isFinite(own.zoom) ? own.zoom : (markers.length ? STEP_ZOOM : 6), { animate: false });
      return;
    }
    const bounds = L.latLngBounds([]);
    for (const m of markers) bounds.extend([m.lat, m.lng]);
    // Background layers (no tag) are context: the view fits them only when nothing else is there.
    const focus = overlays.filter((_, i) => layerDefs[i].tag);
    for (const o of (markers.length || focus.length ? focus : overlays)) if (o.getBounds().isValid()) bounds.extend(o.getBounds());
    if (!bounds.isValid()) map.setView([0, 0], 1, { animate: false });
    else if (markers.length === 1 && !layerDefs.some((l) => l.tag)) map.setView(bounds.getCenter(), Number.isFinite(own.zoom) ? own.zoom : STEP_ZOOM, { animate: false });
    else {
      // A margin that scales with the map, and room above for the pins (32 px tall).
      const size = map.getSize();
      const pad = Math.round(Math.max(16, Math.min(size.x, size.y) * 0.08));
      map.fitBounds(bounds, {
        paddingTopLeft: [pad, pad + 32], paddingBottomRight: [pad, pad], animate: false,
        ...(Number.isFinite(own.zoom) ? { maxZoom: own.zoom } : {}),
      });
    }
  };

  /** @type {() => void} */
  let refit = home;
  if (audience) {
    const stepEls = /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-map-step')]);
    /** @type {any} */
    let shownTip = null;
    const apply = (/** @type {boolean} */ animate) => {
      const view = stepView(markers, steps, visibleSteps());
      shownTip?.closeTooltip();
      shownTip = null;
      map.stop();
      if (!view) {
        if (animate) {
          const before = { center: map.getCenter(), zoom: map.getZoom() };
          home();
          const target = { center: map.getCenter(), zoom: map.getZoom() };
          map.setView(before.center, before.zoom, { animate: false });
          map.flyTo(target.center, target.zoom, { duration: 1 });
        } else home();
        return;
      }
      const pin = pins[markers.indexOf(view.marker)];
      shownTip = pin;
      if (animate) map.flyTo([view.marker.lat, view.marker.lng], view.zoom, { duration: 1.2 });
      else map.setView([view.marker.lat, view.marker.lng], view.zoom, { animate: false });
      pin.openTooltip();
    };
    // Watch the step fragments only: Leaflet changes classes inside the map all the time.
    const visibleSteps = () => stepEls.filter((st) => st.classList.contains('visible')).length;
    let count = 0;
    refit = () => {
      count = visibleSteps();
      apply(false);
    };
    const changed = () => {
      const now = visibleSteps();
      if (now === count) return;
      count = now;
      apply(true);
    };
    const observer = new MutationObserver(changed);
    for (const st of stepEls) observer.observe(st, { attributes: true, attributeFilter: ['class'] });
  } else {
    live.append(readerControls(el, map, markers, pins, colors, theme, home));
  }
  refit();

  // Re-fit when the space changes (window, reader column, slide scaling): a
  // slide that is not shown yet measures 0 × 0, so the first real size gets a
  // fit; in reader mode later sizes too, until the reader has moved the map.
  /** @type {{ w: number, h: number }} */
  let size = { w: 0, h: 0 };
  const check = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (Math.abs(w - size.w) < 2 && Math.abs(h - size.h) < 2)) return;
    const first = !size.w;
    size = { w, h };
    map.invalidateSize({ animate: false });
    if (first || audience || !moved) refit();
  };
  new ResizeObserver(check).observe(canvas);
  // Also once the layout around it has settled (resize observers wait for a rendered frame).
  setTimeout(check, 250);
}

/**
 * A Leaflet tile layer whose tiles are files of the show, read through
 * `read` (a folder or zip source): each tile becomes an object URL, freed once drawn.
 * @param {any} L @param {(path: string) => Promise<Blob | null>} read
 */
export function localTileLayer(L, read) {
  return L.TileLayer.extend({
    createTile(/** @type {any} */ coords, /** @type {(err: any, tile: HTMLElement) => void} */ done) {
      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('role', 'presentation');
      const path = L.TileLayer.prototype.getTileUrl.call(this, coords);
      read(path).then((blob) => {
        if (!blob) {
          done(new Error(`Map tile ${path} is not in the show`), img);
          return;
        }
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          done(null, img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          done(new Error(`Map tile ${path} could not be drawn`), img);
        };
        img.src = url;
      }, (err) => done(err, img));
      return img;
    },
  });
}

/**
 * The reader's toolbar (Fit, place picker, tag filter) and the place panel.
 * @param {HTMLElement} el @param {any} map @param {MapMarker[]} markers @param {any[]} pins
 * @param {Map<string, number>} colors @param {Theme} theme @param {() => void} home
 * @returns {DocumentFragment}
 */
function readerControls(el, map, markers, pins, colors, theme, home) {
  const doc = el.ownerDocument;
  const frag = doc.createDocumentFragment();
  /** @param {string} tag @param {Record<string, string>} [attrs] @param {(string | Node)[]} [children] */
  const make = (tag, attrs = {}, children = []) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...children);
    return node;
  };

  const panel = make('div', { class: 'slipr-map-panel', 'aria-live': 'polite', hidden: '' });
  const order = markers.map((m, i) => ({ m, i })).sort((a, b) => a.m.title.localeCompare(b.m.title));
  const picker = /** @type {HTMLSelectElement} */ (make('select', { class: 'slipr-map-picker', 'aria-label': 'Select a place' }, [
    make('option', { value: '' }, ['Place…']),
    ...order.map(({ m, i }) => make('option', { value: String(i) }, [m.title])),
  ]));
  /** @param {number} index @returns {HTMLOptionElement | null} */
  const optionOf = (index) => picker.querySelector(`option[value="${index}"]`);

  /** @type {number | null} */
  let current = null;
  /** @param {number | null} index */
  const select = (index) => {
    if (current !== null) pins[current]?.getElement()?.classList.remove('slipr-map-pin--selected');
    current = index;
    picker.value = index === null ? '' : String(index);
    const m = index === null || !map.hasLayer(pins[index]) ? null : markers[index]; // a hidden place cannot be selected
    if (!m) {
      current = null;
      picker.value = '';
    }
    panel.replaceChildren();
    panel.hidden = !m;
    if (!m || index === null) return;
    pins[index].getElement()?.classList.add('slipr-map-pin--selected');
    if (!map.getBounds().pad(-0.1).contains([m.lat, m.lng])) map.panTo([m.lat, m.lng]);
    panel.append(make('p', { class: 'slipr-map-panel-title' }, [m.title]));
    if (m.md) {
      const body = make('div', { class: 'slipr-map-panel-body' });
      body.innerHTML = markdown(m.md, { mode: 'reader' }); // escaped by shared/markdown.js
      panel.append(body);
    }
    const actions = make('p', { class: 'slipr-map-panel-actions' });
    if (m.slide) actions.append(make('a', { href: `#${encodeURIComponent(m.slide)}`, class: 'slipr-map-panel-slide' }, ['Go to slide →']));
    const clear = make('button', { type: 'button', class: 'slipr-map-btn' }, ['Clear']);
    clear.addEventListener('click', () => select(null));
    actions.append(clear);
    panel.append(actions);
  };

  pins.forEach((pin, i) => pin.on('click', () => select(i)));
  map.on('click', () => select(null));
  picker.addEventListener('change', () => select(picker.value === '' ? null : Number(picker.value)));
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) select(null); });

  // Tag chips: legend and filter (a hidden tag hides its markers).
  const hiddenTags = new Set();
  const markerTags = [...new Set(markers.map((m) => m.tags[0]).filter(Boolean))];
  const chips = [...colors.keys()].filter((tag) => markerTags.includes(tag)).map((tag) => {
    const chip = make('button', { type: 'button', class: 'slipr-map-tag', 'aria-pressed': 'true', title: `Show or hide “${tag}”` }, [
      make('span', { class: 'slipr-map-swatch', style: `background:${theme.palette[colors.get(tag) ?? 0]}`, 'aria-hidden': 'true' }), tag,
    ]);
    chip.addEventListener('click', () => {
      if (hiddenTags.has(tag)) hiddenTags.delete(tag);
      else hiddenTags.add(tag);
      chip.setAttribute('aria-pressed', String(!hiddenTags.has(tag)));
      markers.forEach((m, i) => {
        const hide = m.tags.length > 0 && m.tags.every((t) => hiddenTags.has(t));
        if (hide && map.hasLayer(pins[i])) {
          if (current === i) select(null);
          pins[i].remove();
        } else if (!hide && !map.hasLayer(pins[i])) pins[i].addTo(map);
        // The Place… list offers only the places on show.
        const option = optionOf(i);
        if (option) {
          option.hidden = hide;
          option.disabled = hide;
        }
      });
    });
    return chip;
  });

  const fit = make('button', { type: 'button', class: 'slipr-map-btn', 'aria-label': 'Show the whole map', title: 'Show the whole map' }, ['Fit']);
  fit.addEventListener('click', () => home());
  frag.append(
    make('div', { class: 'slipr-map-toolbar', role: 'toolbar', 'aria-label': 'Map' }, [
      fit,
      ...(markers.length ? [picker] : []),
      ...(chips.length ? [make('span', { class: 'slipr-map-tags', role: 'group', 'aria-label': 'Filter by tag' }, chips)] : []),
    ]),
    panel,
  );
  return frag;
}

/**
 * @typedef {{ palette: string[], muted: string, bg: string }} Theme
 */

/**
 * The template's colors as computed on the embed element (the graph palette, I-074).
 * @param {HTMLElement} el
 * @returns {Theme}
 */
export function themeOf(el) {
  const style = getComputedStyle(el);
  const v = (/** @type {string} */ name, /** @type {string} */ fallback) => style.getPropertyValue(name).trim() || fallback;
  // Without the template's palette: its primary and accent, then four neutral colors.
  const defaults = [v('--slipr-color-primary', '#1F3A5F'), v('--slipr-color-accent', '#F2A900'), '#2A9D8F', '#7B5EA7', '#C8553D', '#5B6573'];
  return {
    palette: defaults.map((d, i) => v(`--slipr-graph-${i + 1}`, d)),
    muted: v('--slipr-color-muted', '#5B6573'),
    bg: v('--slipr-color-bg', '#FFFFFF'),
  };
}
