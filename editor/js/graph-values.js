// @ts-check
/**
 * Graph values for the graph editor (E-020): the `graph` slot and the graph
 * reader block (I-074). DOM-free, so it can be tested with node --test.
 *
 * Every helper takes the current value and returns a new one (never mutated),
 * keeping the shape docs/show-format.md describes: `nodes`, `edges`, `data`
 * (a JSON file in the show folder), `layout`, audience `steps` (show nodes,
 * or focus one), `caption`, `fallback`. Node ids are what edges and steps use:
 * renaming one renames it there, removing one removes it there.
 */
import { uniqueId } from './show-entities.js';
import { GRAPH_LAYOUTS, graphElements, mergeGraphs } from '../../shared/embeds/graph.js';

/** The fields of a graph value (a block also has id, type, for, depth, title). */
export const GRAPH_FIELDS = ['nodes', 'edges', 'data', 'layout', 'steps', 'caption', 'fallback'];

/**
 * The value with a patch applied: fields patched to undefined are removed,
 * empty edge and step lists are dropped, and a graph always keeps `nodes` or `data`.
 * @param {any} previous
 * @param {Record<string, any>} patch
 * @returns {any}
 */
export function graphValue(previous, patch) {
  const next = { ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), ...patch };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || (Array.isArray(value) && !value.length && (key === 'edges' || key === 'steps'))) delete next[key];
  }
  if (Array.isArray(next.nodes) && !next.nodes.length && typeof next.data === 'string') delete next.nodes;
  if (!Array.isArray(next.nodes) && typeof next.data !== 'string') next.nodes = [];
  return next;
}

/** @param {any} value @returns {any[]} */
const nodesOf = (value) => (Array.isArray(value?.nodes) ? value.nodes : []);
/** @param {any} value @returns {any[]} */
const edgesOf = (value) => (Array.isArray(value?.edges) ? value.edges : []);
/** @param {any} value @returns {any[]} */
const stepsOf = (value) => (Array.isArray(value?.steps) ? value.steps : []);

/** @param {any[]} list @param {number} from @param {number} delta */
function moved(list, from, delta) {
  const to = from + delta;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

/**
 * Every node id in use: inline nodes, plus those of a data file when known.
 * @param {any} value @param {any} [fileGraph]
 * @returns {string[]}
 */
export function nodeIds(value, fileGraph) {
  return [...graphElements(fileGraph).nodes, ...graphElements(value).nodes].map((n) => n.id);
}

// ---------------------------------------------------------------------------
// Nodes

/**
 * Add a node (its id comes from its label).
 * @param {any} value @param {{ label?: string, tags?: string[] }} [node] @param {string[]} [taken]  Ids also in use (a data file's).
 * @returns {{ value: any, index: number, id: string }}
 */
export function addNode(value, node = {}, taken = []) {
  const nodes = nodesOf(value);
  const label = node.label?.trim() || `Node ${nodes.length + 1}`;
  const id = uniqueId(label, [...taken, ...nodes.map((n) => n.id)], 'node');
  const fresh = { id, label, ...(node.tags?.length ? { tags: node.tags } : {}) };
  return { value: graphValue(value, { nodes: [...nodes, fresh] }), index: nodes.length, id };
}

/**
 * Change a node. A new id is followed by the edges and steps that name it;
 * tags may be text (comma-separated); empty optional fields are removed.
 * @param {any} value @param {number} index @param {Record<string, any>} patch @param {string[]} [taken]
 * @returns {any}
 */
export function updateNode(value, index, patch, taken = []) {
  const nodes = nodesOf(value);
  const old = nodes[index];
  if (!old) return value;
  const next = { ...old, ...patch };
  if (typeof patch.tags === 'string') next.tags = patch.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (Array.isArray(next.tags) && !next.tags.length) delete next.tags;
  for (const key of ['label', 'md', 'slide']) if (next[key] === '' || next[key] === undefined) delete next[key];
  let edges = edgesOf(value);
  let steps = stepsOf(value);
  if (patch.id !== undefined && patch.id !== old.id) {
    const others = [...taken, ...nodes.filter((_, i) => i !== index).map((n) => n.id)];
    next.id = uniqueId(String(patch.id).trim() || next.label || 'node', others, 'node');
    edges = edges.map((e) => ({ ...e, ...(e.from === old.id ? { from: next.id } : {}), ...(e.to === old.id ? { to: next.id } : {}) }));
    steps = steps.map((s) => (Array.isArray(s.show)
      ? { show: s.show.map((/** @type {string} */ id) => (id === old.id ? next.id : id)) }
      : s.focus === old.id ? { focus: next.id } : s));
  }
  return graphValue(value, { nodes: nodes.map((n, i) => (i === index ? next : n)), edges, steps });
}

/**
 * Remove a node, its links, and its place in the steps.
 * @param {any} value @param {number} index
 * @returns {any}
 */
export function removeNode(value, index) {
  const nodes = nodesOf(value);
  const gone = nodes[index];
  if (!gone) return value;
  const steps = stepsOf(value)
    .map((s) => (Array.isArray(s.show) ? { show: s.show.filter((/** @type {string} */ id) => id !== gone.id) } : s))
    .filter((s) => (Array.isArray(s.show) ? s.show.length > 0 : s.focus !== gone.id));
  return graphValue(value, {
    nodes: nodes.filter((_, i) => i !== index),
    edges: edgesOf(value).filter((e) => e.from !== gone.id && e.to !== gone.id),
    steps,
  });
}

/** @param {any} value @param {number} index @param {number} delta */
export function moveNode(value, index, delta) {
  return graphValue(value, { nodes: moved(nodesOf(value), index, delta) });
}

// ---------------------------------------------------------------------------
// Links

/**
 * Add a link (not from a node to itself, and not twice the same way).
 * @param {any} value @param {string} from @param {string} to @param {string} [label]
 * @returns {any}
 */
export function addEdge(value, from, to, label) {
  if (!from || !to || from === to) return value;
  if (edgesOf(value).some((e) => e.from === from && e.to === to)) return value;
  return graphValue(value, { edges: [...edgesOf(value), { from, to, ...(label ? { label } : {}) }] });
}

/** @param {any} value @param {number} index @param {Record<string, string>} patch */
export function updateEdge(value, index, patch) {
  const edges = edgesOf(value).map((e, i) => {
    if (i !== index) return e;
    const next = { ...e, ...patch };
    if (!next.label) delete next.label;
    return next;
  });
  return graphValue(value, { edges });
}

/** @param {any} value @param {number} index */
export function removeEdge(value, index) {
  return graphValue(value, { edges: edgesOf(value).filter((_, i) => i !== index) });
}

/** @param {any} value @param {number} index */
export function reverseEdge(value, index) {
  const edge = edgesOf(value)[index];
  return edge ? updateEdge(value, index, { from: edge.to, to: edge.from }) : value;
}

// ---------------------------------------------------------------------------
// Steps (slots in audience mode)

/**
 * Add a step: show the nodes no step shows yet (or the last node), or focus a node.
 * @param {any} value @param {'show' | 'focus'} kind @param {string[]} [ids]  All node ids (with a data file's).
 * @returns {any}
 */
export function addGraphStep(value, kind, ids = nodeIds(value)) {
  if (!ids.length) return value;
  if (kind === 'focus') return graphValue(value, { steps: [...stepsOf(value), { focus: ids[0] }] });
  const shown = new Set(stepsOf(value).flatMap((s) => (Array.isArray(s.show) ? s.show : [])));
  const fresh = ids.filter((id) => !shown.has(id));
  return graphValue(value, { steps: [...stepsOf(value), { show: [fresh.at(-1) ?? ids.at(-1)] }] });
}

/**
 * Change a step: its kind, the nodes it shows (a list), or the node it focuses.
 * @param {any} value @param {number} index @param {{ kind?: 'show' | 'focus', show?: string[], focus?: string }} change
 * @returns {any}
 */
export function updateGraphStep(value, index, change) {
  const step = stepsOf(value)[index];
  if (!step) return value;
  /** @type {any} */
  let next = step;
  const current = Array.isArray(step.show) ? 'show' : 'focus';
  if (change.kind && change.kind !== current) {
    next = change.kind === 'show' ? { show: [step.focus] } : { focus: step.show?.[0] };
  }
  if (change.show) next = change.show.length ? { show: change.show } : step;
  if (change.focus) next = { focus: change.focus };
  return graphValue(value, { steps: stepsOf(value).map((s, i) => (i === index ? next : s)) });
}

/** @param {any} value @param {number} index */
export function removeGraphStep(value, index) {
  return graphValue(value, { steps: stepsOf(value).filter((_, i) => i !== index) });
}

/** @param {any} value @param {number} index @param {number} delta */
export function moveGraphStep(value, index, delta) {
  return graphValue(value, { steps: moved(stepsOf(value), index, delta) });
}

// ---------------------------------------------------------------------------
// Layout, data file, alt text

/**
 * The layout (cose, the default, is stored as nothing).
 * @param {any} value @param {string} layout
 */
export function setGraphLayout(value, layout) {
  return graphValue(value, { layout: GRAPH_LAYOUTS.includes(layout) && layout !== 'cose' ? layout : undefined });
}

/**
 * Make a data file's nodes and links part of the value (they come first, as
 * when they are drawn), and drop the file reference: then they are editable.
 * Inline nodes with an id the file also has are dropped (the file's comes first).
 * @param {any} value @param {any} fileGraph  The parsed data file.
 * @returns {any}
 */
export function moveDataInline(value, fileGraph) {
  const merged = mergeGraphs(fileGraph, value);
  const seen = new Set();
  const nodes = merged.nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .map((n) => ({ id: n.id, ...(n.label !== n.id ? { label: n.label } : {}), ...(n.tags.length ? { tags: n.tags } : {}), ...(n.md ? { md: n.md } : {}), ...(n.slide ? { slide: n.slide } : {}) }));
  return graphValue(value, { nodes, edges: merged.edges, data: undefined });
}

/**
 * Does a parsed JSON file look like graph data ({ nodes: [...] })?
 * @param {any} json
 */
export function isGraphData(json) {
  return Boolean(json && typeof json === 'object' && Array.isArray(json.nodes));
}

/**
 * Alt text for a snapshot of the graph: its nodes.
 * @param {any} value @param {any} [fileGraph]
 * @returns {string}
 */
export function graphSnapshotAlt(value, fileGraph) {
  const { nodes, edges } = mergeGraphs(fileGraph, value);
  if (!nodes.length) return 'Graph';
  const names = nodes.slice(0, 8).map((n) => n.label);
  const more = nodes.length > 8 ? ` and ${nodes.length - 8} more` : '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}${more ? `, ${names.at(-1)}` : ` and ${names.at(-1)}`}`;
  return `Graph of ${list}${more}, with ${edges.length} link${edges.length === 1 ? '' : 's'}`;
}
