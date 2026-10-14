// @ts-check
/**
 * The graph editor (E-020), shared by the `graph` slot editor (Slide tab) and
 * the Graph block editor (Reader tab): a live mini graph (+ Node, 🔗 Connect:
 * click two nodes to link them, click a node to open its row, Fit, 📷
 * Snapshot as fallback), then the data file (pick one into data/, its nodes
 * listed read-only, "Move into the slide" to edit them), rows for nodes and
 * links, the layout, audience steps (slots), a caption and the fallback image.
 *
 * Values are built by ../graph-values.js (DOM-free, tested). The mini graph is
 * kept per slot or block across re-renders of the form and follows the value.
 */
import { h } from '../dom.js';
import {
  addEdge, addGraphStep, addNode, graphSnapshotAlt, moveDataInline, moveGraphStep, moveNode, nodeIds, removeEdge,
  removeGraphStep, removeNode, reverseEdge, setGraphLayout, updateEdge, updateGraphStep, updateNode,
} from '../graph-values.js';
import { runImage } from './image-field.js';
import { fallbackImageField } from './web-fields.js';
import { getCytoscape, graphElements, graphStyle, GRAPH_LAYOUTS, highlight, mergeGraphs, readableOn, runLayout, tagColors, TEXT_SIZE, themeOf } from '../../../shared/embeds/graph.js';
import { slideTitle } from '../../../shared/render.js';

/**
 * @typedef {object} GraphFieldsOptions
 * @property {string} key  Unique per slot or block (keeps its mini graph).
 * @property {string} label  Accessible name prefix, e.g. "Graph".
 * @property {'slot' | 'block'} kind  Slots have audience steps.
 * @property {() => any} read  The current value (from the store, at the moment of the edit).
 * @property {(value: any, typing?: boolean) => void} write  Store a new value; `typing` coalesces into one undo step.
 * @property {(path: string) => Promise<Blob | null>} readFile  Read a show file (the data file).
 * @property {(file: File, write: (path: string, title: string) => void) => Promise<void>} addDataFile
 * @property {(file: File, alt?: string) => Promise<void>} addFallback
 * @property {(src: string) => string} [resolveAsset]
 * @property {any[]} slides  The show's slides (for "linked slide").
 * @property {string} [currentSlideId]
 */

/**
 * @typedef {object} MiniGraph
 * @property {HTMLElement} wrapper
 * @property {GraphFieldsOptions} options
 * @property {any} [cy]
 * @property {string} drawnKey
 * @property {boolean} connecting  🔗 Connect mode.
 * @property {string | null} from  The first node of a link being made.
 * @property {Set<string>} open  Node ids whose rows are expanded.
 * @property {HTMLElement} status
 * @property {{ path: string, graph: any, error?: string } | null} file  The data file, once read.
 */

/** @type {Map<string, MiniGraph>} */
const miniGraphs = new Map();

/**
 * @param {GraphFieldsOptions} options
 * @returns {HTMLElement[]}
 */
export function graphFields(options) {
  const { label, kind, read, write } = options;
  const value = read() ?? {};
  const mini = miniGraph(options);
  /** @param {(v: any) => any} fn @param {boolean} [typing] */
  const change = (fn, typing = false) => write(fn(read() ?? {}), typing);
  const fileGraph = mini.file?.path === value.data ? mini.file?.graph : null;
  const ids = nodeIds(value, fileGraph);

  return [
    mini.wrapper,
    dataSection(options, value, mini, change),
    nodesSection(options, value, mini, change, ids),
    edgesSection(options, value, change, ids, fileGraph),
    h('label', { class: 'slipr-label' }, ['Layout', h('select', {
      class: 'slipr-select slipr-select-sm', 'aria-label': `${label}: layout`,
      onchange: (/** @type {Event} */ e) => change((v) => setGraphLayout(v, /** @type {HTMLSelectElement} */ (e.target).value)),
    }, GRAPH_LAYOUTS.map((l) => h('option', { value: l, selected: (value.layout ?? 'cose') === l ? true : undefined }, [LAYOUT_NAMES[l] ?? l])))]),
    kind === 'slot' ? stepsSection(options, value, change, ids, fileGraph) : null,
    h('label', { class: 'slipr-label' }, ['Caption',
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: value.caption ?? '', 'aria-label': `${label}: caption`,
        placeholder: 'Optional: a line below the graph',
        oninput: (/** @type {Event} */ e) => change((v) => withField(v, 'caption', /** @type {HTMLInputElement} */ (e.target).value || undefined), true),
      }),
    ]),
    fallbackImageField({
      label,
      read,
      write: (patch, field) => change((v) => withField(v, 'fallback', patch.fallback), field === 'fallback-alt'),
      addFallback: (file) => options.addFallback(file),
      resolveAsset: options.resolveAsset,
    }, 'Optional: a picture of the graph for print and slide thumbnails. 📷 Snapshot as fallback (under the mini graph) makes one.'),
  ].filter(/** @returns {x is HTMLElement} */ (x) => Boolean(x));
}

const LAYOUT_NAMES = /** @type {Record<string, string>} */ ({
  cose: 'Automatic (related nodes pull together)',
  breadthfirst: 'Tree (top down)',
  concentric: 'Rings',
  circle: 'Circle',
  grid: 'Grid',
});

/** @param {any} v @param {string} key @param {any} next */
function withField(v, key, next) {
  const out = { ...v, [key]: next };
  if (next === undefined) delete out[key];
  return out;
}

// ---------------------------------------------------------------------------
// The mini graph

/** @param {GraphFieldsOptions} options @returns {MiniGraph} */
function miniGraph(options) {
  let mini = miniGraphs.get(options.key);
  if (!mini) {
    mini = {
      wrapper: h('div', { class: 'slipr-graph-editor' }),
      options, drawnKey: '', connecting: false, from: null, open: new Set(),
      status: h('p', { class: 'slipr-help slipr-graph-editor-status', 'aria-live': 'polite' }),
      file: null,
    };
    miniGraphs.set(options.key, mini);
    buildMiniGraph(mini);
  }
  mini.options = options;
  readDataFile(mini);
  renderToolbar(mini);
  draw(mini);
  return mini;
}

/** Read (and cache) the value's data file. @param {MiniGraph} mini */
function readDataFile(mini) {
  const path = (mini.options.read() ?? {}).data;
  if (typeof path !== 'string' || !path) {
    mini.file = null;
    return;
  }
  if (mini.file?.path === path) return;
  mini.file = { path, graph: null };
  mini.options.readFile(path).then(async (blob) => {
    if (mini.file?.path !== path) return;
    if (!blob) throw new Error('not found');
    mini.file = { path, graph: JSON.parse(await blob.text()) };
  }).catch((err) => {
    if (mini.file?.path === path) mini.file = { path, graph: null, error: err instanceof Error ? err.message : String(err) };
  }).finally(() => {
    // Draw the file's nodes, and rebuild the fields after the mini graph (all of
    // them come from graphFields()): the node list, link pickers and steps now know the file's nodes.
    draw(mini);
    if (mini.wrapper.isConnected && mini.file?.path === path) {
      const fresh = graphFields(mini.options).filter((el) => el !== mini.wrapper);
      while (mini.wrapper.nextSibling) mini.wrapper.nextSibling.remove();
      mini.wrapper.after(...fresh);
    }
  });
}

/** @param {MiniGraph} mini */
async function buildMiniGraph(mini) {
  const canvas = h('div', { class: 'slipr-graph-editor-canvas', role: 'application', 'aria-label': 'Graph editor: click a node to edit it; drag to pan; wheel to zoom' });
  mini.wrapper.prepend(canvas);
  try {
    const cytoscape = await getCytoscape();
    const theme = themeOf(mini.wrapper);
    const cy = cytoscape({
      container: canvas,
      style: [
        ...graphStyle(theme, TEXT_SIZE),
        { selector: '.from-file', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': theme.muted, opacity: 0.75 } },
        { selector: '.link-from', style: { 'border-width': 5, 'border-color': theme.accent } },
      ],
      layout: { name: 'preset' },
      boxSelectionEnabled: false,
      autounselectify: true,
      autoungrabify: true,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });
    mini.cy = cy;
    /** @type {any} */ (canvas).sliprGraph = cy; // for browser checks
    cy.on('tap', 'node', (/** @type {any} */ e) => tapNode(mini, e.target.id()));
    cy.on('tap', (/** @type {any} */ e) => {
      if (e.target === cy && mini.from) {
        mini.from = null;
        cy.nodes().removeClass('link-from');
        mini.status.textContent = '🔗 Connect: click the node the link starts at.';
      }
    });
    new ResizeObserver(() => { cy.resize(); fitAll(cy); }).observe(canvas);
    draw(mini, true);
    renderToolbar(mini);
  } catch (err) {
    canvas.replaceChildren(h('p', { class: 'slipr-help is-error' }, [`The graph could not be drawn: ${err instanceof Error ? err.message : err}`]));
  }
}

/**
 * A click on a node: in Connect mode the start or the end of a new link, otherwise its row.
 * @param {MiniGraph} mini @param {string} id
 */
function tapNode(mini, id) {
  const { options, cy } = mini;
  const value = options.read() ?? {};
  if (mini.connecting) {
    if (!mini.from) {
      mini.from = id;
      cy.getElementById(id).addClass('link-from');
      mini.status.textContent = `🔗 From “${labelOf(cy, id)}”: click the node the link goes to.`;
      return;
    }
    const from = mini.from;
    mini.from = null;
    cy.nodes().removeClass('link-from');
    if (from === id) {
      mini.status.textContent = '🔗 Connect: a link needs two different nodes. Click the node the link starts at.';
      return;
    }
    const next = addEdge(value, from, id);
    if (next === value) {
      mini.status.textContent = `There is already a link from “${labelOf(cy, from)}” to “${labelOf(cy, id)}”.`;
      return;
    }
    options.write(next);
    mini.status.textContent = `Linked “${labelOf(cy, from)}” → “${labelOf(cy, id)}”. Click the next node a link starts at, or turn Connect off.`;
    return;
  }
  const inline = (value.nodes ?? []).some((/** @type {any} */ n) => n.id === id);
  if (!inline) {
    mini.status.textContent = `“${labelOf(cy, id)}” is in the data file: use “Move into the slide” to edit it here.`;
    return;
  }
  mini.open.add(id);
  const row = /** @type {HTMLDetailsElement | null | undefined} */ (mini.wrapper.parentElement?.querySelector(`[data-node-id="${CSS.escape(id)}"]`));
  if (row) {
    row.open = true;
    row.scrollIntoView({ block: 'nearest' });
    row.querySelector('input')?.focus({ preventScroll: true });
  }
  highlight(cy, id);
}

/** Fit the whole graph, without blowing up a graph of one or two nodes. @param {any} cy */
function fitAll(cy) {
  cy.fit(undefined, 20);
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2);
    cy.center();
  }
}

/** @param {any} cy @param {string} id */
const labelOf = (cy, id) => cy.getElementById(id).data('label') ?? id;

/**
 * Bring the drawing in line with the value (and the data file).
 * @param {MiniGraph} mini @param {boolean} [force]
 */
function draw(mini, force = false) {
  const { cy } = mini;
  if (!cy) return;
  const value = mini.options.read() ?? {};
  const fileGraph = mini.file?.path === value.data ? mini.file?.graph : null;
  const fileIds = new Set(graphElements(fileGraph).nodes.map((n) => n.id));
  const graph = mergeGraphs(fileGraph, value);
  const seen = new Set();
  const nodes = graph.nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const key = JSON.stringify([nodes.map((n) => [n.id, n.label, n.tags[0]]), edges, value.layout ?? 'cose', [...fileIds]]);
  if (!force && key === mini.drawnKey) return;
  mini.drawnKey = key;
  const theme = themeOf(mini.wrapper);
  const colors = tagColors(nodes);
  cy.batch(() => {
    cy.elements().remove();
    cy.add([
      ...nodes.map((n) => {
        const color = theme.palette[n.tags[0] ? colors.get(n.tags[0]) ?? 0 : 0];
        return { group: 'nodes', data: { id: n.id, label: n.label, color, textColor: readableOn(color, theme.text) }, classes: fileIds.has(n.id) && !(value.nodes ?? []).some((/** @type {any} */ x) => x.id === n.id) ? 'from-file' : '' };
      }),
      ...edges.map((e, i) => ({ group: 'edges', data: { id: `e${i}`, source: e.from, target: e.to, label: e.label ?? '' } })),
    ]);
  });
  if (nodes.length) {
    runLayout(cy, value.layout);
    fitAll(cy);
  }
  if (mini.from && cy.getElementById(mini.from).nonempty()) cy.getElementById(mini.from).addClass('link-from');
}

/** @param {MiniGraph} mini */
function renderToolbar(mini) {
  const { options } = mini;
  const toolbar = h('div', { class: 'slipr-graph-editor-tools', role: 'toolbar', 'aria-label': `${options.label}: graph tools` }, [
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Add a node (then name it below)',
      onclick: () => {
        const value = options.read() ?? {};
        const fileGraph = mini.file?.path === value.data ? mini.file?.graph : null;
        const { value: next, id } = addNode(value, {}, nodeIds({}, fileGraph));
        mini.open.add(id);
        options.write(next);
        const row = mini.wrapper.parentElement?.querySelector(`[data-node-id="${CSS.escape(id)}"] input`);
        /** @type {HTMLInputElement | null | undefined} */ (row)?.select();
      },
    }, ['+ Node']),
    h('button', {
      type: 'button', class: `slipr-btn slipr-btn-sm ${mini.connecting ? 'is-active' : ''}`, 'aria-pressed': String(mini.connecting),
      title: 'When on, click a node and then another to link them',
      onclick: () => {
        mini.connecting = !mini.connecting;
        mini.from = null;
        mini.cy?.nodes().removeClass('link-from');
        mini.wrapper.classList.toggle('is-connecting', mini.connecting);
        mini.status.textContent = mini.connecting ? '🔗 Connect: click the node the link starts at.' : '';
        renderToolbar(mini);
      },
    }, ['🔗 Connect']),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !mini.cy, title: 'Show the whole graph',
      onclick: () => { if (mini.cy) { fitAll(mini.cy); highlight(mini.cy, null); } },
    }, ['Fit']),
    h('button', {
      type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !mini.cy, title: 'Save a picture of the graph as the fallback image (print, thumbnails)',
      onclick: () => snapshotToFallback(mini),
    }, ['📷 Snapshot as fallback']),
  ]);
  const old = mini.wrapper.querySelector(':scope > .slipr-graph-editor-tools');
  if (old) old.replaceWith(toolbar);
  else mini.wrapper.append(toolbar, mini.status);
}

/** @param {MiniGraph} mini */
async function snapshotToFallback(mini) {
  const cy = mini.cy;
  if (!cy) return;
  mini.status.textContent = 'Making a snapshot…';
  try {
    highlight(cy, null);
    // The picture shows the graph as readers see it: without the editor's marks.
    const fromFile = cy.nodes('.from-file');
    fromFile.removeClass('from-file');
    cy.nodes().removeClass('link-from');
    mini.from = null;
    let blob;
    try {
      blob = await cy.png({ output: 'blob-promise', full: true, scale: 2, bg: '#FFFFFF' });
    } finally {
      fromFile.addClass('from-file');
    }
    const file = new File([blob], 'graph-snapshot.png', { type: 'image/png' });
    const value = mini.options.read() ?? {};
    const before = value.fallback?.src;
    await mini.options.addFallback(file, graphSnapshotAlt(value, mini.file?.path === value.data ? mini.file?.graph : null));
    const after = mini.options.read()?.fallback?.src;
    mini.status.textContent = after && after !== before
      ? 'Snapshot saved as the fallback image.'
      : 'No snapshot saved yet: the picture needs the show folder. Choose it, then press Snapshot again.';
  } catch (err) {
    mini.status.textContent = `No snapshot: ${err instanceof Error ? err.message : err}`;
  }
}

// ---------------------------------------------------------------------------
// Rows

/**
 * The data file: choose one into data/, see what it holds, move it inline.
 * @param {GraphFieldsOptions} options @param {any} value @param {MiniGraph} mini
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change
 */
function dataSection(options, value, mini, change) {
  const fileInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'file', accept: '.json,application/json', hidden: true,
    onchange: () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) runImage(() => options.addDataFile(file, (path) => change((cur) => withField(cur, 'data', path))));
    },
  }));
  const summary = h('p', { class: 'slipr-help slipr-graph-data-summary' });
  const fill = () => {
    const file = mini.file;
    if (!value.data) {
      summary.replaceChildren('Optional: nodes and links from a JSON file ({ "nodes": [...], "edges": [...] }), for a large graph. Inline nodes come after the file\'s.');
      return;
    }
    if (!file?.graph) {
      summary.replaceChildren(file?.error ? `The file could not be read (${file.error}).` : 'Reading the file…');
      return;
    }
    const { nodes, edges } = graphElements(file.graph);
    summary.replaceChildren(
      `From the file: ${nodes.length} node${nodes.length === 1 ? '' : 's'}, ${edges.length} link${edges.length === 1 ? '' : 's'} (shown dashed in the mini graph; edit them in the file, or move them here). `,
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Copy the file\'s nodes and links into this graph and stop using the file (the file itself stays)',
        onclick: () => change((cur) => moveDataInline(cur, file.graph)),
      }, ['Move into the slide']),
    );
  };
  fill();
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, ['Data file']),
    h('div', { class: 'slipr-map-tiles' }, [
      h('input', {
        type: 'text', class: 'slipr-input slipr-input-sm', value: value.data ?? '', placeholder: 'data/graph.json', 'aria-label': `${options.label}: data file`,
        onchange: (/** @type {Event} */ e) => change((cur) => withField(cur, 'data', /** @type {HTMLInputElement} */ (e.target).value.trim() || undefined)),
      }),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', onclick: () => fileInput.click() }, ['Choose file…']),
      value.data ? h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': 'Stop using the data file', onclick: () => change((cur) => withField(cur, 'data', undefined)) }, ['🗑']) : null,
      fileInput,
    ]),
    summary,
  ]);
}

/**
 * @param {GraphFieldsOptions} options @param {any} value @param {MiniGraph} mini
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change @param {string[]} ids
 */
function nodesSection(options, value, mini, change, ids) {
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const slides = options.slides ?? [];
  const fileIds = ids.filter((id) => !nodes.some((/** @type {any} */ n) => n.id === id));
  const rows = nodes.map((/** @type {any} */ n, /** @type {number} */ i) => {
    const name = n.label || n.id;
    /** @param {string} field @param {any} v @param {boolean} [typing] */
    const set = (field, v, typing = false) => change((cur) => updateNode(cur, i, { [field]: v }, fileIds), typing);
    const links = (value.edges ?? []).filter((/** @type {any} */ e) => e.from === n.id || e.to === n.id).length;
    const details = /** @type {HTMLDetailsElement} */ (h('details', { class: 'slipr-map-row', 'data-node-id': n.id, open: mini.open.has(n.id) ? true : undefined }, [
      h('summary', {}, [h('span', { class: 'slipr-map-row-title' }, [`● ${name}`]), h('span', { class: 'slipr-help' }, [` ${links} link${links === 1 ? '' : 's'}${n.tags?.length ? ` · ${n.tags.join(', ')}` : ''}`])]),
      h('div', { class: 'slipr-map-row-body' }, [
        h('label', { class: 'slipr-label' }, ['Label', h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: n.label ?? '', placeholder: n.id, oninput: (/** @type {Event} */ e) => set('label', /** @type {HTMLInputElement} */ (e.target).value, true) })]),
        h('label', { class: 'slipr-label' }, ['Tags (the first picks the color)', h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: (n.tags ?? []).join(', '), placeholder: 'e.g. format, viewer', onchange: (/** @type {Event} */ e) => set('tags', /** @type {HTMLInputElement} */ (e.target).value) })]),
        h('label', { class: 'slipr-label' }, ['Text for readers (Markdown)', h('textarea', { class: 'slipr-textarea', rows: 2, oninput: (/** @type {Event} */ e) => set('md', /** @type {HTMLTextAreaElement} */ (e.target).value, true) }, [n.md ?? ''])]),
        h('label', { class: 'slipr-label' }, ['Linked slide', h('select', {
          class: 'slipr-select slipr-select-sm',
          onchange: (/** @type {Event} */ e) => set('slide', /** @type {HTMLSelectElement} */ (e.target).value),
        }, [
          h('option', { value: '' }, ['(none)']),
          ...slides.filter((/** @type {any} */ s) => s.id !== options.currentSlideId).map((/** @type {any} */ s) => h('option', { value: s.id, selected: s.id === n.slide ? true : undefined }, [`${slideTitle(s) || s.id}`])),
          n.slide && !slides.some((/** @type {any} */ s) => s.id === n.slide) ? h('option', { value: n.slide, selected: true }, [`${n.slide} (no such slide)`]) : null,
        ])]),
        h('label', { class: 'slipr-label' }, ['Id (links and steps use it)', h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: n.id, onchange: (/** @type {Event} */ e) => {
          const id = /** @type {HTMLInputElement} */ (e.target).value.trim();
          mini.open.delete(n.id);
          change((cur) => {
            const next = updateNode(cur, i, { id }, fileIds);
            mini.open.add(next.nodes[i].id);
            return next;
          });
        } })]),
        h('div', { class: 'slipr-map-row-actions' }, [
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move ${name} up`, disabled: i === 0, onclick: () => change((cur) => moveNode(cur, i, -1)) }, ['▲']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move ${name} down`, disabled: i === nodes.length - 1, onclick: () => change((cur) => moveNode(cur, i, 1)) }, ['▼']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Show this node and its neighbours in the mini graph', onclick: () => { if (mini.cy) { highlight(mini.cy, n.id); mini.cy.animate({ fit: { eles: mini.cy.getElementById(n.id).closedNeighborhood(), padding: 30 } }, { duration: 250 }); } } }, ['Show in graph']),
          h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': `Remove ${name}`, onclick: () => { mini.open.delete(n.id); change((cur) => removeNode(cur, i)); } }, ['🗑 Remove']),
        ]),
      ]),
    ]));
    details.addEventListener('toggle', () => {
      if (details.open) mini.open.add(n.id);
      else mini.open.delete(n.id);
    });
    return details;
  });
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, [`Nodes (${nodes.length}${fileIds.length ? ` + ${fileIds.length} from the file` : ''})`]),
    nodes.length || fileIds.length ? null : h('p', { class: 'slipr-help' }, ['No nodes yet: + Node under the mini graph adds one.']),
    ...rows,
  ]);
}

/**
 * @param {GraphFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change @param {string[]} ids @param {any} fileGraph
 */
function edgesSection(options, value, change, ids, fileGraph) {
  const edges = Array.isArray(value.edges) ? value.edges : [];
  const labels = new Map(mergeGraphs(fileGraph, value).nodes.map((n) => [n.id, n.label]));
  /** @param {number} i @param {'from' | 'to'} end @param {string} current */
  const picker = (i, end, current) => h('select', {
    class: 'slipr-select slipr-select-sm', 'aria-label': `Link ${i + 1}: ${end}`,
    onchange: (/** @type {Event} */ e) => change((cur) => updateEdge(cur, i, { [end]: /** @type {HTMLSelectElement} */ (e.target).value })),
  }, [
    ids.includes(current) ? null : h('option', { value: current, selected: true }, [`${current} (no such node)`]),
    ...ids.map((id) => h('option', { value: id, selected: id === current ? true : undefined }, [labels.get(id) ?? id])),
  ]);
  const rows = edges.map((/** @type {any} */ e, /** @type {number} */ i) => h('div', { class: 'slipr-graph-edge-row' }, [
    picker(i, 'from', e.from),
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Reverse the link', 'aria-label': `Reverse link ${i + 1}`, onclick: () => change((cur) => reverseEdge(cur, i)) }, ['→']),
    picker(i, 'to', e.to),
    h('input', { type: 'text', class: 'slipr-input slipr-input-sm', value: e.label ?? '', placeholder: 'Label (optional)', 'aria-label': `Link ${i + 1}: label`, oninput: (/** @type {Event} */ ev) => change((cur) => updateEdge(cur, i, { label: /** @type {HTMLInputElement} */ (ev.target).value }), true) }),
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': `Remove link ${i + 1}`, onclick: () => change((cur) => removeEdge(cur, i)) }, ['🗑']),
  ]));
  /** A link between the first two nodes that are not linked yet. */
  const addAny = () => change((cur) => {
    for (const a of ids) for (const b of ids) {
      const next = addEdge(cur, a, b);
      if (next !== cur) return next;
    }
    return cur;
  });
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, [`Links (${edges.length})`]),
    h('p', { class: 'slipr-help' }, ['The arrow points from the first node to the second. 🔗 Connect in the mini graph makes links by clicking two nodes.']),
    ...rows,
    h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: ids.length < 2, onclick: addAny }, ['+ Add link']),
  ]);
}

/**
 * @param {GraphFieldsOptions} options @param {any} value
 * @param {(fn: (v: any) => any, typing?: boolean) => void} change @param {string[]} ids @param {any} fileGraph
 */
function stepsSection(options, value, change, ids, fileGraph) {
  const steps = Array.isArray(value.steps) ? value.steps : [];
  const labels = new Map(mergeGraphs(fileGraph, value).nodes.map((n) => [n.id, n.label]));
  const rows = steps.map((/** @type {any} */ s, /** @type {number} */ i) => {
    const kind = Array.isArray(s.show) ? 'show' : 'focus';
    const body = kind === 'show'
      ? h('span', { class: 'slipr-graph-step-nodes', role: 'group', 'aria-label': `Step ${i + 1}: nodes to show` }, ids.map((id) => {
        const on = s.show.includes(id);
        return h('button', {
          type: 'button', class: 'slipr-library-tag', 'aria-pressed': String(on),
          onclick: () => change((cur) => updateGraphStep(cur, i, { show: on ? s.show.filter((/** @type {string} */ x) => x !== id) : [...s.show, id] })),
        }, [labels.get(id) ?? id]);
      }))
      : h('select', {
        class: 'slipr-select slipr-select-sm', 'aria-label': `Step ${i + 1}: node to focus`,
        onchange: (/** @type {Event} */ e) => change((cur) => updateGraphStep(cur, i, { focus: /** @type {HTMLSelectElement} */ (e.target).value })),
      }, [
        ids.includes(s.focus) ? null : h('option', { value: s.focus, selected: true }, [`${s.focus} (no such node)`]),
        ...ids.map((id) => h('option', { value: id, selected: id === s.focus ? true : undefined }, [labels.get(id) ?? id])),
      ]);
    return h('div', { class: 'slipr-graph-step-row' }, [
      h('span', { class: 'slipr-map-step-number' }, [`${i + 1}.`]),
      h('select', {
        class: 'slipr-select slipr-select-sm', 'aria-label': `Step ${i + 1}: kind`,
        onchange: (/** @type {Event} */ e) => change((cur) => updateGraphStep(cur, i, { kind: /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value) })),
      }, [
        h('option', { value: 'show', selected: kind === 'show' ? true : undefined }, ['Show']),
        h('option', { value: 'focus', selected: kind === 'focus' ? true : undefined }, ['Focus on']),
      ]),
      body,
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move step ${i + 1} up`, disabled: i === 0, onclick: () => change((cur) => moveGraphStep(cur, i, -1)) }, ['▲']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', 'aria-label': `Move step ${i + 1} down`, disabled: i === steps.length - 1, onclick: () => change((cur) => moveGraphStep(cur, i, 1)) }, ['▼']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', 'aria-label': `Remove step ${i + 1}`, onclick: () => change((cur) => removeGraphStep(cur, i)) }, ['🗑']),
    ]);
  });
  return h('section', { class: 'slipr-map-section' }, [
    h('h4', { class: 'slipr-map-section-title' }, [`Build-up while presenting (${steps.length} step${steps.length === 1 ? '' : 's'})`]),
    h('p', { class: 'slipr-help' }, ['One step per click. Show: those nodes appear (they are hidden until then). Focus on: zoom in on a node and its neighbours; the next Show zooms out again. Without steps the whole graph is there at once.']),
    ...rows,
    h('div', { class: 'slipr-map-row-actions' }, [
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !ids.length, onclick: () => change((cur) => addGraphStep(cur, 'show', ids)) }, ['+ Show step']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', disabled: !ids.length, onclick: () => change((cur) => addGraphStep(cur, 'focus', ids)) }, ['+ Focus step']),
    ]),
  ]);
}
