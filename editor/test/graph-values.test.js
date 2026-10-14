import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addEdge, addGraphStep, addNode, graphSnapshotAlt, graphValue, isGraphData, moveDataInline, moveGraphStep, moveNode,
  nodeIds, removeEdge, removeGraphStep, removeNode, reverseEdge, setGraphLayout, updateEdge, updateGraphStep, updateNode,
} from '../js/graph-values.js';
import { BLOCK_TYPES, convertBlock, setBlockType, setSlot } from '../js/actions.js';
import { slotEditorKind } from '../js/slot-values.js';
import { withFallback } from '../js/block-values.js';
import { validateShow } from '../../shared/validate.js';
import { readJson, clone } from '../../shared/test/helpers.js';

const demo = readJson('shows/demo/show.json');
const template = readJson('templates/default/template.json');

/** Three nodes a → b → c, with a show step and a focus step. */
function sample() {
  return {
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', tags: ['x'] }, { id: 'c', label: 'C' }],
    edges: [{ from: 'a', to: 'b', label: 'uses' }, { from: 'b', to: 'c' }],
    steps: [{ show: ['b', 'c'] }, { focus: 'c' }],
  };
}

describe('graph values (E-020)', () => {
  test('a value keeps nodes or a data file; empty edges and steps go', () => {
    assert.deepEqual(graphValue(undefined, {}), { nodes: [] });
    assert.deepEqual(graphValue({ nodes: [], data: 'data/g.json', edges: [] }, {}), { data: 'data/g.json' });
    assert.deepEqual(graphValue({ nodes: [{ id: 'a' }] }, { caption: undefined, steps: [] }), { nodes: [{ id: 'a' }] });
  });

  test('add a node: id from its label, unique also against a data file\'s ids', () => {
    let { value, id } = addNode(sample(), { label: 'A' });
    assert.equal(id, 'a-2');
    ({ value, id } = addNode(value, {}, ['node-5']));
    assert.equal(id, 'node-5-2', '“Node 5” is taken by the file');
    assert.equal(value.nodes.length, 5);
  });

  test('renaming a node renames it in links and steps; ids stay unique', () => {
    let value = updateNode(sample(), 2, { id: 'end' });
    assert.deepEqual(value.edges[1], { from: 'b', to: 'end' });
    assert.deepEqual(value.steps, [{ show: ['b', 'end'] }, { focus: 'end' }]);
    value = updateNode(value, 0, { id: 'b' });
    assert.equal(value.nodes[0].id, 'b-2');
    assert.equal(value.edges[0].from, 'b-2');
    value = updateNode(value, 1, { tags: 'one, two', md: '', label: '' });
    assert.deepEqual(value.nodes[1], { id: 'b', tags: ['one', 'two'] });
  });

  test('removing a node removes its links and its steps', () => {
    const value = removeNode(sample(), 2);
    assert.deepEqual(value.edges, [{ from: 'a', to: 'b', label: 'uses' }]);
    assert.deepEqual(value.steps, [{ show: ['b'] }], 'c leaves the show step; its focus step goes');
    const all = removeNode(removeNode(value, 1), 0);
    assert.deepEqual(all, { nodes: [] });
    assert.deepEqual(moveNode(sample(), 0, 1).nodes.map((n) => n.id), ['b', 'a', 'c']);
  });

  test('links: no self-links or doubles; update, reverse, remove', () => {
    const value = sample();
    assert.equal(addEdge(value, 'a', 'a'), value);
    assert.equal(addEdge(value, 'a', 'b'), value);
    let next = addEdge(value, 'c', 'a', 'back');
    assert.deepEqual(next.edges.at(-1), { from: 'c', to: 'a', label: 'back' });
    next = updateEdge(next, 0, { label: '' });
    assert.deepEqual(next.edges[0], { from: 'a', to: 'b' });
    next = reverseEdge(next, 1);
    assert.deepEqual(next.edges[1], { from: 'c', to: 'b' });
    assert.equal(removeEdge(removeEdge(removeEdge(next, 0), 0), 0).edges, undefined);
  });

  test('steps: show the nodes not shown yet, focus, change kind, reorder', () => {
    let value = addGraphStep(sample(), 'show');
    assert.deepEqual(value.steps.at(-1), { show: ['a'] }, 'the last node not shown yet');
    value = addGraphStep(value, 'focus');
    assert.deepEqual(value.steps.at(-1), { focus: 'a' });
    value = updateGraphStep(value, 0, { kind: 'focus' });
    assert.deepEqual(value.steps[0], { focus: 'b' });
    value = updateGraphStep(value, 1, { kind: 'show' });
    assert.deepEqual(value.steps[1], { show: ['c'] });
    value = updateGraphStep(value, 1, { show: [] });
    assert.deepEqual(value.steps[1], { show: ['c'] }, 'a show step keeps at least one node');
    value = moveGraphStep(value, 0, 1);
    assert.deepEqual(value.steps.slice(0, 2), [{ show: ['c'] }, { focus: 'b' }]);
    value = removeGraphStep(value, 0);
    assert.equal(value.steps.length, 3);
    assert.equal(addGraphStep({ nodes: [] }, 'show').steps, undefined, 'no nodes: no step');
  });

  test('layout: cose is the default and stored as nothing', () => {
    assert.equal(setGraphLayout(sample(), 'grid').layout, 'grid');
    assert.equal(setGraphLayout({ ...sample(), layout: 'grid' }, 'cose').layout, undefined);
    assert.equal(setGraphLayout(sample(), 'spiral').layout, undefined);
  });

  test('a data file: its ids count, and it can move inline', () => {
    const file = { nodes: [{ id: 'f1', label: 'File one', tags: ['t'] }, { id: 'a' }], edges: [{ from: 'f1', to: 'a' }] };
    const value = { data: 'data/g.json', nodes: [{ id: 'a', label: 'Inline A' }, { id: 'z' }], edges: [{ from: 'z', to: 'f1' }] };
    assert.deepEqual(nodeIds(value, file), ['f1', 'a', 'a', 'z']);
    const inline = moveDataInline(value, file);
    assert.equal(inline.data, undefined);
    assert.deepEqual(inline.nodes, [{ id: 'f1', label: 'File one', tags: ['t'] }, { id: 'a' }, { id: 'z' }], 'the file comes first; a duplicate id keeps the first');
    assert.deepEqual(inline.edges, [{ from: 'f1', to: 'a' }, { from: 'z', to: 'f1' }]);
    assert.ok(isGraphData(file));
    assert.ok(!isGraphData({ type: 'FeatureCollection' }));
  });

  test('snapshot alt text', () => {
    assert.equal(graphSnapshotAlt({ nodes: [] }), 'Graph');
    assert.equal(graphSnapshotAlt(sample()), 'Graph of A, B and C, with 2 links');
    const many = { nodes: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` })) };
    assert.equal(graphSnapshotAlt(many), 'Graph of n0, n1, n2, n3, n4, n5, n6, n7 and 2 more, with 0 links');
  });

  test('every value the editor makes is valid in a show', () => {
    let { value } = addNode(undefined, { label: 'Show' });
    ({ value } = addNode(value, { label: 'Template' }));
    value = addGraphStep(addEdge(value, 'show', 'template', 'names'), 'show');
    value = setGraphLayout(value, 'breadthfirst');
    const show = clone(demo);
    show.slides.find((s) => s.id === 's-concepts').content.graph = value;
    const r = validateShow(show, { template });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings.filter((w) => w.path.includes('graph')), []);
  });
});

describe('graph slot and block in the editor (E-020)', () => {
  test('the graph slot has an editor; Graph is a block type', () => {
    assert.equal(slotEditorKind('graph', undefined), 'graph');
    assert.ok(BLOCK_TYPES.includes('graph'));
  });

  test('converting a block to a graph starts with one node', () => {
    assert.deepEqual(convertBlock({ id: 'b1', type: 'text', md: 'x', title: 'Who', depth: 2 }, 'graph'),
      { id: 'b1', type: 'graph', depth: 2, title: 'Who', nodes: [{ id: 'node-1', label: 'Node 1' }] });
    assert.deepEqual(convertBlock({ id: 'b2', type: 'graph', data: 'data/g.json' }, 'graph').data, 'data/g.json');
  });

  test('a fallback image keeps each embed value’s own shape (a graph got web page fields)', () => {
    const image = { src: 'images/s.png', alt: 'S' };
    assert.deepEqual(withFallback({ nodes: [{ id: 'a' }] }, image), { nodes: [{ id: 'a' }], fallback: image });
    assert.deepEqual(withFallback({ data: 'data/g.json' }, image), { data: 'data/g.json', fallback: image });
    assert.deepEqual(withFallback({ markers: [{ lat: 1, lng: 2 }] }, image), { markers: [{ lat: 1, lng: 2 }], fallback: image });
    assert.equal(withFallback({ pdf: 'docs/a.pdf', title: 'A' }, image).pdf, 'docs/a.pdf');
    assert.equal(withFallback({ url: 'https://x.org', title: 'X' }, image).url, 'https://x.org');
    assert.equal('fallback' in withFallback({ nodes: [], fallback: image }, undefined), false, 'undefined removes it');
  });

  test('a graph block or slot makes a 0.1 show 0.2', () => {
    const show = { slipr: '0.1', slides: [{ id: 's', layout: 'graph', content: {}, reader: { blocks: [{ id: 'b', type: 'text', md: '' }] } }] };
    assert.equal(setBlockType(show, { slideId: 's', blockId: 'b', type: 'graph' }).slipr, '0.2');
    assert.equal(setSlot(show, { slideId: 's', slot: 'graph', value: { nodes: [] } }).slipr, '0.2');
  });
});
