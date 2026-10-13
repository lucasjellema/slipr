// @ts-check
/**
 * Embed kind `graph`: a network of nodes and edges drawn with the vendored
 * Cytoscape.js (I-074, D-011), as a `graph` slot and a `graph` reader block.
 * Follows the embed kind contract of ./index.js.
 *
 * The static content is an accessible list of the nodes and their links, so
 * print, thumbnails, screen readers and failures show the structure. Hydration
 * loads Cytoscape only when a graph is on the page.
 *
 * Reader mode: drag to pan, + / − / Fit to zoom (the wheel scrolls the page),
 * click / tap a node or pick it from the Node list to highlight it with its
 * neighbours and show its panel (Markdown, "Go to slide"); tag chips filter.
 * Audience mode: a fixed viewport; `steps` (show nodes / focus a node) follow
 * hidden Reveal fragments after the slot, like PDF pages.
 *
 * Colors come from the template (`--slipr-graph-1` … `6`, by a node's first
 * tag in order of first use); the show holds none.
 */
import { escape, markdown } from '../markdown.js';

/** Vendor folder (relative to the Slipr root); the export leaves it out of shows without graphs. */
export const library = 'vendor/cytoscape-3.34.3/';
/** Not drawn in editor thumbnails (a canvas per thumbnail is heavy); they show the list. */
export const thumbnail = false;
/** Label of the error box when rendering fails. */
export const errorLabel = 'Graph could not be drawn';

export const GRAPH_LAYOUTS = ['cose', 'breadthfirst', 'concentric', 'circle', 'grid'];
const PALETTE_SIZE = 6;
/** Node text size in graph units: the view's zoom scales it with the drawing. */
const TEXT_SIZE = 18;

/**
 * Is this a graph value (slot value or block)?
 * @param {any} value
 * @returns {boolean}
 */
export function isGraph(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Array.isArray(value.nodes) || typeof value.data === 'string'));
}

/**
 * The inline part of a graph, cleaned: nodes with an id, edges with both ends,
 * steps in their two shapes. DOM-free (tested).
 * @param {any} value
 * @returns {{ nodes: GraphNode[], edges: GraphEdge[] }}
 */
export function graphElements(value) {
  const nodes = (Array.isArray(value?.nodes) ? value.nodes : [])
    .filter((/** @type {any} */ n) => n && typeof n.id === 'string' && n.id)
    .map((/** @type {any} */ n) => ({
      id: n.id,
      label: typeof n.label === 'string' && n.label ? n.label : n.id,
      tags: Array.isArray(n.tags) ? n.tags.filter((/** @type {unknown} */ t) => typeof t === 'string' && t) : [],
      ...(typeof n.md === 'string' && n.md ? { md: n.md } : {}),
      ...(typeof n.slide === 'string' && n.slide ? { slide: n.slide } : {}),
    }));
  const edges = (Array.isArray(value?.edges) ? value.edges : [])
    .filter((/** @type {any} */ e) => e && typeof e.from === 'string' && typeof e.to === 'string')
    .map((/** @type {any} */ e) => ({ from: e.from, to: e.to, ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}) }));
  return { nodes, edges };
}

/**
 * @typedef {{ id: string, label: string, tags: string[], md?: string, slide?: string }} GraphNode
 * @typedef {{ from: string, to: string, label?: string }} GraphEdge
 * @typedef {{ show?: string[], focus?: string }} GraphStep
 */

/**
 * Merge a data file's graph with the inline one (the file's entries first).
 * @param {any} fileGraph @param {any} inline
 */
export function mergeGraphs(fileGraph, inline) {
  const a = graphElements(fileGraph);
  const b = graphElements(inline);
  return { nodes: [...a.nodes, ...b.nodes], edges: [...a.edges, ...b.edges] };
}

/**
 * The state after `count` steps: which nodes are visible, and which one is in
 * focus (a later show step ends a focus). DOM-free (tested).
 * @param {GraphNode[]} nodes @param {GraphStep[]} steps @param {number} count
 * @returns {{ visible: Set<string>, focus: string | null }}
 */
export function stepState(nodes, steps, count) {
  const later = new Set(steps.flatMap((s) => (Array.isArray(s?.show) ? s.show : [])));
  const visible = new Set(nodes.map((n) => n.id).filter((id) => !later.has(id)));
  /** @type {string | null} */
  let focus = null;
  for (const step of steps.slice(0, Math.max(0, count))) {
    if (Array.isArray(step?.show)) {
      for (const id of step.show) visible.add(id);
      focus = null;
    } else if (typeof step?.focus === 'string') {
      visible.add(step.focus);
      focus = step.focus;
    }
  }
  return { visible, focus };
}

/**
 * Palette index (0-based) per tag, in order of first use; untagged nodes use 0.
 * @param {GraphNode[]} nodes
 * @returns {Map<string, number>}
 */
export function tagColors(nodes) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const n of nodes) {
    const tag = n.tags[0];
    if (tag && !map.has(tag)) map.set(tag, map.size % PALETTE_SIZE);
  }
  return map;
}

/**
 * Attributes of the embed element: the graph itself (inline part), the data
 * file's address, the mode and whether it is a slot.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  const { nodes, edges } = graphElements(value);
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  /** @type {Record<string, string>} */
  const attrs = {
    class: 'slipr-graph',
    'data-graph': JSON.stringify({ nodes, edges, steps, layout: GRAPH_LAYOUTS.includes(value?.layout) ? value.layout : 'cose' }),
    'data-graph-mode': options.mode === 'audience' ? 'audience' : 'reader',
  };
  if (typeof value?.data === 'string' && value.data && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value.data)) {
    attrs['data-graph-src'] = ctx.resolveAsset(value.data);
  }
  if (typeof value?.title === 'string' && value.title) attrs['aria-label'] = value.title;
  return attrs;
}

/**
 * Static content without a fallback image: the nodes and their links as a list.
 * @param {any} value
 * @returns {{ html: string, fallback: 'list' }}
 */
export function staticHtml(value) {
  const { nodes, edges } = graphElements(value);
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const items = nodes.map((n) => {
    const links = edges.filter((e) => e.from === n.id)
      .map((e) => `→ ${escape(label.get(e.to) ?? e.to)}${e.label ? ` (${escape(e.label)})` : ''}`);
    return `<li><strong>${escape(n.label)}</strong>${links.length ? ` ${links.join(', ')}` : ''}</li>`;
  });
  const more = typeof value?.data === 'string' && value.data ? '<li class="slipr-graph-list-more">More nodes in the graph’s data file.</li>' : '';
  return { html: `<ul class="slipr-graph-list">${items.join('')}${more}</ul>`, fallback: 'list' };
}

/**
 * In an audience slot with steps: one hidden Reveal fragment per step, after the slot's own.
 * @param {any} value
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 */
export function afterHtml(value, options = {}) {
  if (!options.slot || (options.mode ?? 'reader') !== 'audience') return '';
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  return steps.map((_, i) => `<span class="fragment slipr-graph-step" data-graph-step="${i + 1}" aria-hidden="true"></span>`).join('');
}

// ---------------------------------------------------------------------------
// Drawing (browser only)

/** @type {Promise<any> | null} */
let cytoscapePromise = null;

/** Lazy-load the vendored Cytoscape.js once. */
async function getCytoscape() {
  if (!cytoscapePromise) {
    cytoscapePromise = import(new URL('../../vendor/cytoscape-3.34.3/dist/cytoscape.esm.min.mjs', import.meta.url).href)
      .then((mod) => mod.default ?? mod);
    cytoscapePromise.catch(() => { cytoscapePromise = null; });
  }
  return cytoscapePromise;
}

/**
 * Draw the graph into `live`. Throws when the data file cannot be read or the graph is empty.
 * @param {HTMLElement} el  The embed element.
 * @param {HTMLElement} live  Where the rendered content goes.
 */
export async function hydrate(el, live) {
  const own = JSON.parse(el.dataset.graph ?? '{}');
  let graph = graphElements(own);
  if (el.dataset.graphSrc) {
    const src = el.dataset.graphSrc;
    const url = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The graph's data file could not be read (${res.status}).`);
    graph = mergeGraphs(await res.json(), own);
  }
  if (!graph.nodes.length) throw new Error('The graph has no nodes.');
  const ids = new Set(graph.nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const steps = /** @type {GraphStep[]} */ (Array.isArray(own.steps) ? own.steps : []);
  const audience = el.dataset.graphMode === 'audience';
  const doc = el.ownerDocument;

  const cytoscape = await getCytoscape();
  const theme = themeOf(el);
  const colors = tagColors(graph.nodes);

  const canvas = doc.createElement('div');
  canvas.className = 'slipr-graph-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${el.getAttribute('aria-label') || 'Graph'}: ${graph.nodes.length} nodes, ${edges.length} links. The list of nodes and links is below.`);
  live.append(canvas);
  // Cytoscape measures its container: it must be in the page first.
  el.append(live);

  const cy = cytoscape({
    container: canvas,
    elements: [
      ...graph.nodes.map((n) => {
        const color = theme.palette[n.tags[0] ? colors.get(n.tags[0]) ?? 0 : 0];
        return { group: 'nodes', data: { id: n.id, label: n.label, color, textColor: readableOn(color, theme.text) } };
      }),
      ...edges.map((e, i) => ({ group: 'edges', data: { id: `e${i}`, source: e.from, target: e.to, label: e.label ?? '' } })),
    ],
    style: graphStyle(theme, TEXT_SIZE),
    layout: { name: 'preset' },
    userZoomingEnabled: false,
    userPanningEnabled: !audience,
    boxSelectionEnabled: false,
    autoungrabify: audience,
    autounselectify: true,
    minZoom: 0.2,
    maxZoom: 3,
  });
  runLayout(cy, own.layout);
  /** @type {any} */ (el).sliprGraph = cy; // for debugging and browser checks

  /** Fit the view to the space; in audience mode to the whole graph, so revealing never moves the camera. */
  // The force layout has no shape of its own: widen it to the drawing area (up to 1.8 ×).
  const placed = new Map(cy.nodes().map((/** @type {any} */ n) => [n.id(), { ...n.position() }]));
  const spread = () => {
    if (!GRAPH_LAYOUTS.includes(own.layout) || own.layout === 'cose') widen(cy, placed);
  };
  let refit = () => {
    spread();
    cy.fit(shown(cy), 24);
  };
  if (audience) {
    let home = { zoom: 1, pan: { x: 0, y: 0 } };
    const stepEls = /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-graph-step')]);
    const apply = () => {
      const { visible, focus } = stepState(graph.nodes, steps, stepEls.filter((st) => st.classList.contains('visible')).length);
      cy.batch(() => {
        cy.nodes().forEach((/** @type {any} */ n) => { n.style('display', visible.has(n.id()) ? 'element' : 'none'); });
      });
      highlight(cy, focus);
      cy.stop();
      if (focus) cy.animate({ fit: { eles: cy.getElementById(focus).closedNeighborhood(), padding: 40 } }, { duration: 400 });
      else cy.animate({ zoom: home.zoom, pan: home.pan }, { duration: 300 });
    };
    refit = () => {
      cy.stop();
      cy.nodes().style('display', 'element'); // measure with every node, then re-apply the steps
      spread();
      cy.fit(undefined, 24);
      home = { zoom: cy.zoom(), pan: { ...cy.pan() } };
      apply();
    };
    refit();
    if (stepEls.length) new MutationObserver(apply).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
  } else {
    live.append(readerControls(el, cy, graph.nodes, colors, theme));
    refit();
  }
  // Re-fit when the space changes (window, reader column, slide scaling).
  // Compared with the size Cytoscape knows, which it measured while the page may
  // still have been settling; the first real size always gets a fit.
  let fitted = false;
  const check = () => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    if (fitted && Math.abs(canvas.clientWidth - cy.width()) < 2 && Math.abs(canvas.clientHeight - cy.height()) < 2) return;
    fitted = true;
    cy.resize();
    refit();
  };
  new ResizeObserver(check).observe(canvas);
  // Also once the layout around it has settled (resize observers wait for a rendered frame).
  setTimeout(check, 250);
}

/**
 * The nodes on show: by the display flag Slipr sets (steps, tag filter), not by
 * Cytoscape's visibility, which lags behind a style change.
 * @param {any} cy
 */
function shown(cy) {
  return cy.nodes().filter((/** @type {any} */ n) => n.style('display') !== 'none');
}

/**
 * Stretch the layout horizontally towards the drawing area's proportions (at
 * most 1.8 ×), from the positions the layout gave, so it can run repeatedly.
 * @param {any} cy @param {Map<string, { x: number, y: number }>} placed
 */
function widen(cy, placed) {
  const w = cy.width();
  const h = cy.height();
  const xs = [...placed.values()].map((p) => p.x);
  const ys = [...placed.values()].map((p) => p.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  if (!w || !h || !bw || !bh) return;
  const factor = Math.min(1.8, Math.max(1, (w / h) / (bw / bh)));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  cy.nodes().positions((/** @type {any} */ n) => {
    const at = placed.get(n.id()) ?? n.position();
    return { x: cx + (at.x - cx) * factor, y: at.y };
  });
}

/**
 * Place the nodes: deterministic (cose starts from a circle, not at random).
 * @param {any} cy @param {string} name
 */
function runLayout(cy, name) {
  const layout = GRAPH_LAYOUTS.includes(name) ? name : 'cose';
  // A fixed box, not the container's: a slide that is not shown yet measures 0 × 0.
  // Placement only (fit: false): the view is fitted afterwards.
  const boundingBox = { x1: 0, y1: 0, w: 800, h: 500 };
  cy.layout({ name: 'circle', animate: false, fit: false, boundingBox }).run();
  if (layout === 'circle') return;
  /** @type {Record<string, any>} */
  const options = { name: layout, animate: false, fit: false, padding: 24 };
  if (layout === 'cose') Object.assign(options, { randomize: false, nodeRepulsion: () => 1000000, idealEdgeLength: () => 110, nodeOverlap: 40, gravity: 0.2, numIter: 3000 });
  else options.boundingBox = boundingBox;
  if (layout === 'breadthfirst') Object.assign(options, { directed: true, spacingFactor: 1.1 });
  cy.layout(options).run();
}

/**
 * Highlight a node and its neighbours, fading the rest; null clears it.
 * @param {any} cy @param {string | null} id
 */
function highlight(cy, id) {
  cy.batch(() => {
    cy.elements().removeClass('faded focused');
    if (!id) return;
    const node = cy.getElementById(id);
    if (node.empty()) return;
    cy.elements().not(node.closedNeighborhood()).addClass('faded');
    node.addClass('focused');
  });
}

/**
 * The reader's toolbar (zoom, node picker, tag filter) and the node panel.
 * @param {HTMLElement} el @param {any} cy @param {GraphNode[]} nodes
 * @param {Map<string, number>} colors @param {Theme} theme
 * @returns {DocumentFragment}
 */
function readerControls(el, cy, nodes, colors, theme) {
  const doc = el.ownerDocument;
  const frag = doc.createDocumentFragment();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /** @param {string} tag @param {Record<string, string>} [attrs] @param {(string | Node)[]} [children] */
  const make = (tag, attrs = {}, children = []) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...children);
    return node;
  };

  const panel = make('div', { class: 'slipr-graph-panel', 'aria-live': 'polite', hidden: '' });
  const picker = /** @type {HTMLSelectElement} */ (make('select', { class: 'slipr-graph-picker', 'aria-label': 'Select a node' }, [
    make('option', { value: '' }, ['Node…']),
    ...[...nodes].sort((a, b) => a.label.localeCompare(b.label)).map((n) => make('option', { value: n.id }, [n.label])),
  ]));

  /** @param {string | null} id */
  const select = (id) => {
    highlight(cy, id);
    picker.value = id ?? '';
    const node = id ? byId.get(id) : null;
    panel.replaceChildren();
    panel.hidden = !node;
    if (!node) return;
    const neighbours = cy.getElementById(node.id).neighborhood('node').map((/** @type {any} */ n) => n.data('label'));
    panel.append(make('p', { class: 'slipr-graph-panel-title' }, [node.label]));
    if (node.md) {
      const body = make('div', { class: 'slipr-graph-panel-body' });
      body.innerHTML = markdown(node.md, { mode: 'reader' }); // escaped by shared/markdown.js
      panel.append(body);
    }
    if (neighbours.length) panel.append(make('p', { class: 'slipr-graph-panel-links' }, [`Linked to: ${neighbours.join(', ')}`]));
    const actions = make('p', { class: 'slipr-graph-panel-actions' });
    if (node.slide) actions.append(make('a', { href: `#${encodeURIComponent(node.slide)}`, class: 'slipr-graph-panel-slide' }, ['Go to slide →']));
    const clear = make('button', { type: 'button', class: 'slipr-graph-btn' }, ['Clear']);
    clear.addEventListener('click', () => select(null));
    actions.append(clear);
    panel.append(actions);
  };

  cy.on('tap', 'node', (/** @type {any} */ e) => select(e.target.id()));
  cy.on('tap', (/** @type {any} */ e) => { if (e.target === cy) select(null); });
  picker.addEventListener('change', () => select(picker.value || null));
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) select(null); });

  /** @param {string} text @param {string} label @param {() => void} fn */
  const button = (text, label, fn) => {
    const b = make('button', { type: 'button', class: 'slipr-graph-btn', 'aria-label': label, title: label }, [text]);
    b.addEventListener('click', fn);
    return b;
  };
  const zoomBy = (/** @type {number} */ f) => cy.zoom({ level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });

  // Tag chips: legend and filter (a hidden tag hides its nodes).
  const hiddenTags = new Set();
  const chips = [...colors.keys()].map((tag) => {
    const chip = make('button', { type: 'button', class: 'slipr-graph-tag', 'aria-pressed': 'true', title: `Show or hide “${tag}”` }, [
      make('span', { class: 'slipr-graph-swatch', style: `background:${theme.palette[colors.get(tag) ?? 0]}`, 'aria-hidden': 'true' }), tag,
    ]);
    chip.addEventListener('click', () => {
      if (hiddenTags.has(tag)) hiddenTags.delete(tag);
      else hiddenTags.add(tag);
      chip.setAttribute('aria-pressed', String(!hiddenTags.has(tag)));
      cy.batch(() => cy.nodes().forEach((/** @type {any} */ n) => {
        const tags = byId.get(n.id())?.tags ?? [];
        n.style('display', tags.length && tags.every((t) => hiddenTags.has(t)) ? 'none' : 'element');
      }));
    });
    return chip;
  });

  frag.append(
    make('div', { class: 'slipr-graph-toolbar', role: 'toolbar', 'aria-label': 'Graph' }, [
      button('−', 'Zoom out', () => zoomBy(1 / 1.25)),
      button('+', 'Zoom in', () => zoomBy(1.25)),
      button('Fit', 'Fit the graph', () => cy.fit(shown(cy), 24)),
      picker,
      ...(chips.length ? [make('span', { class: 'slipr-graph-tags', role: 'group', 'aria-label': 'Filter by tag' }, chips)] : []),
    ]),
    panel,
  );
  return frag;
}

/**
 * @typedef {{ palette: string[], text: string, muted: string, accent: string, bg: string, font: string }} Theme
 */

/**
 * The template's tokens as computed on the embed element.
 * @param {HTMLElement} el
 * @returns {Theme}
 */
function themeOf(el) {
  const style = getComputedStyle(el);
  const v = (/** @type {string} */ name, /** @type {string} */ fallback) => style.getPropertyValue(name).trim() || fallback;
  // Without the template's graph palette: its primary and accent, then four neutral colors.
  const defaults = [v('--slipr-color-primary', '#1F3A5F'), v('--slipr-color-accent', '#F2A900'), '#2A9D8F', '#7B5EA7', '#C8553D', '#5B6573'];
  const palette = defaults.map((d, i) => v(`--slipr-graph-${i + 1}`, d));
  return {
    palette,
    text: v('--slipr-color-text', '#1E2329'),
    muted: v('--slipr-color-muted', '#5B6573'),
    accent: v('--slipr-color-accent', '#F2A900'),
    bg: v('--slipr-color-bg', '#FFFFFF'),
    font: v('--slipr-font-body', 'system-ui, sans-serif'),
  };
}

/**
 * Cytoscape styles from the template tokens; `size` is the node text size in graph units.
 * @param {Theme} t @param {number} size
 */
function graphStyle(t, size) {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)', color: 'data(textColor)', label: 'data(label)',
        'font-family': t.font, 'font-size': size, 'text-valign': 'center', 'text-halign': 'center',
        'text-wrap': 'wrap', 'text-max-width': size * 9, shape: 'round-rectangle',
        width: 'label', height: 'label', padding: size * 0.75, 'border-width': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        width: Math.max(1.5, size / 9), 'line-color': t.muted, 'target-arrow-color': t.muted, 'target-arrow-shape': 'triangle',
        'arrow-scale': Math.max(1, size / 14), 'curve-style': 'bezier', label: 'data(label)', 'font-family': t.font, 'font-size': size * 0.8, color: t.muted,
        'text-background-color': t.bg, 'text-background-opacity': 0.85, 'text-background-padding': 2, 'text-rotation': 'autorotate',
      },
    },
    { selector: '.focused', style: { 'border-width': Math.max(3, size / 5), 'border-color': t.accent } },
    { selector: '.faded', style: { opacity: 0.18 } },
  ];
}

/**
 * White or the template's text color, whichever reads better on `color`.
 * @param {string} color @param {string} dark
 */
export function readableOn(color, dark) {
  const rgb = parseColor(color);
  if (!rgb) return dark;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? dark : '#FFFFFF';
}

/** #rgb, #rrggbb or rgb(a)() → [r, g, b], else null. @param {string} color */
function parseColor(color) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color.trim());
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
