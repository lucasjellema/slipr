import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { afterHtml, attributes, graphElements, isGraph, mergeGraphs, readableOn, staticHtml, stepState, tagColors } from '../embeds/graph.js';
import { embedHtml, embedKindForBlock, embedKindForSlot, usedEmbedKinds } from '../embeds/index.js';
import { renderBlock } from '../blocks.js';
import { validateShow, collectImagePaths } from '../validate.js';
import { codes, readJson, clone } from './helpers.js';

const ctx = { resolveAsset: (/** @type {string} */ src) => `/shows/x/${src}` };
const nodes = [
  { id: 'a', label: 'Alpha', tags: ['one'] },
  { id: 'b', label: 'Beta', tags: ['two'], md: 'About **B**', slide: 's-1' },
  { id: 'c', tags: ['one'] },
];
const edges = [{ from: 'a', to: 'b', label: 'uses' }, { from: 'b', to: 'c' }];

describe('graph module (I-074)', () => {
  test('isGraph: nodes or a data file', () => {
    assert.equal(isGraph({ nodes: [] }), true);
    assert.equal(isGraph({ data: 'data/g.json' }), true);
    assert.equal(isGraph({ mermaid: 'A' }), false);
    assert.equal(isGraph([]), false);
    assert.equal(isGraph(null), false);
  });

  test('graphElements cleans nodes and edges', () => {
    const g = graphElements({ nodes: [...nodes, { label: 'no id' }, null], edges: [...edges, { from: 'a' }] });
    assert.deepEqual(g.nodes.map((n) => [n.id, n.label]), [['a', 'Alpha'], ['b', 'Beta'], ['c', 'c']]);
    assert.equal(g.edges.length, 2);
    assert.deepEqual(mergeGraphs({ nodes: [{ id: 'x' }] }, { nodes: [{ id: 'y' }] }).nodes.map((n) => n.id), ['x', 'y']);
  });

  test('stepState: nodes named in show steps wait for their step; focus ends with the next show', () => {
    const steps = [{ show: ['b'] }, { focus: 'a' }, { show: ['c'] }];
    const ids = (/** @type {number} */ k) => [...stepState(nodes, steps, k).visible].sort();
    assert.deepEqual(ids(0), ['a']);
    assert.deepEqual(ids(1), ['a', 'b']);
    assert.equal(stepState(nodes, steps, 2).focus, 'a');
    assert.deepEqual(ids(3), ['a', 'b', 'c']);
    assert.equal(stepState(nodes, steps, 3).focus, null);
    assert.deepEqual([...stepState(nodes, [], 0).visible].sort(), ['a', 'b', 'c'], 'no steps: everything');
  });

  test('tag colors in order of first use, cycling through six', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, label: '', tags: [`t${i}`] }));
    assert.deepEqual([...tagColors(graphElements({ nodes }).nodes)], [['one', 0], ['two', 1]]);
    assert.equal(tagColors(many).get('t6'), 0);
  });

  test('label color for contrast', () => {
    assert.equal(readableOn('#1F3A5F', '#1E2329'), '#FFFFFF');
    assert.equal(readableOn('#F2A900', '#1E2329'), '#1E2329');
    assert.equal(readableOn('rgb(255, 255, 255)', '#111'), '#111');
    assert.equal(readableOn('not a color', '#111'), '#111');
  });

  test('static list is escaped and names the links', () => {
    const { html, fallback } = staticHtml({ nodes: [{ id: 'x', label: '<b>X</b>' }, { id: 'y', label: 'Y' }], edges: [{ from: 'x', to: 'y', label: 'a&b' }] });
    assert.equal(fallback, 'list');
    assert.match(html, /&lt;b&gt;X&lt;\/b&gt;<\/strong> → Y \(a&amp;b\)/);
    assert.doesNotMatch(html, /<b>/);
    assert.match(staticHtml({ data: 'data/g.json' }).html, /data file/);
  });

  test('attributes carry the graph, the mode and the data file; steps only in audience slots', () => {
    const a = attributes({ nodes, edges, layout: 'grid', steps: [{ show: ['b'] }], data: 'data/g.json' }, ctx, { mode: 'audience', slot: true });
    assert.equal(a['data-graph-mode'], 'audience');
    assert.equal(a['data-graph-src'], '/shows/x/data/g.json');
    assert.equal(JSON.parse(a['data-graph']).layout, 'grid');
    assert.equal(attributes({ nodes, layout: 'spiral' }, ctx)['data-graph'].includes('"layout":"cose"'), true);
    assert.equal(attributes({ nodes, data: 'https://x/g.json' }, ctx)['data-graph-src'], undefined, 'no addresses on other servers');
    assert.equal((afterHtml({ steps: [{ show: ['b'] }, { focus: 'a' }] }, { mode: 'audience', slot: true }).match(/fragment slipr-graph-step/g) ?? []).length, 2);
    assert.equal(afterHtml({ steps: [{ show: ['b'] }] }, { mode: 'reader', slot: true }), '');
    assert.equal(afterHtml({ steps: [{ show: ['b'] }] }, { mode: 'audience' }), '');
  });

  test('registry: slot and block kind, used kinds, block markup', () => {
    assert.equal(embedKindForSlot('graph'), 'graph');
    assert.equal(embedKindForBlock('graph'), 'graph');
    const show = { slides: [{ id: 's', content: { g: { nodes } }, reader: { blocks: [] } }] };
    assert.ok(usedEmbedKinds(show).has('graph'));
    assert.match(embedHtml('graph', { nodes, edges }, ctx), /data-embed="graph"/);
    const html = renderBlock({ id: 'g', type: 'graph', title: 'Map', nodes, edges, caption: 'Cap' }, 's-1', { show: { slides: [] }, resolveAsset: ctx.resolveAsset });
    assert.match(html, /slipr-block-title">Map</);
    assert.match(html, /slipr-figure--graph/);
    assert.match(html, /<figcaption class="slipr-caption">Cap<\/figcaption>/);
  });
});

describe('graph validation (I-074)', () => {
  const demo = readJson('shows/demo/show.json');
  const template = readJson('templates/default/template.json');
  const withGraph = (/** @type {any} */ graph, version = '0.2') => {
    const show = clone(demo);
    show.slipr = version;
    show.slides.find((/** @type {any} */ s) => s.id === 's-concepts').content.graph = graph;
    return validateShow(show, { template });
  };
  const withBlock = (/** @type {any} */ block) => {
    const show = clone(demo);
    show.slides[0].reader = { blocks: [{ id: 'gb', type: 'graph', ...block }] };
    return validateShow(show, { template });
  };

  test('the demo has a graph slide and a graph block from a data file, valid without warnings', () => {
    const s = demo.slides.find((/** @type {any} */ x) => x.id === 's-concepts');
    assert.equal(s.layout, 'graph');
    assert.ok(collectImagePaths(demo).includes('data/show-format.json'), 'data files are show files');
    const r = validateShow(demo, { template });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  test('schema: nodes or data, ids, edge ends, steps, layout, data address', () => {
    assert.equal(withGraph({ nodes, edges }).ok, true);
    assert.equal(withGraph({ data: 'data/g.json' }).ok, true);
    assert.equal(withGraph({ edges }).ok, false, 'neither nodes nor data');
    assert.equal(withGraph({ nodes: [{ label: 'x' }] }).ok, false);
    assert.equal(withGraph({ nodes, edges: [{ from: 'a' }] }).ok, false);
    assert.equal(withGraph({ nodes, layout: 'spiral' }).ok, false);
    assert.equal(withGraph({ nodes, steps: [{ show: [] }] }).ok, false);
    assert.equal(withGraph({ nodes, steps: [{ zoom: 'a' }] }).ok, false);
    for (const bad of ['https://x.org/g.json', '/abs/g.json', 'data/g.txt', 'javascript:alert(1).json']) {
      assert.equal(withGraph({ data: bad }).ok, false, bad);
    }
    assert.equal(withBlock({ nodes, steps: [{ show: ['a'] }] }).ok, false, 'no steps on a block');
    assert.equal(withBlock({ nodes, title: 'T', depth: 2 }).ok, true);
  });

  test('a graph in a 0.1 show is an error', () => {
    assert.ok(codes(withGraph({ nodes }, '0.1').errors).includes('format-version'));
  });

  test('warnings: duplicate node, unknown node in an edge or step, unknown slide, missing data file, unknown glossary id', () => {
    const w = (/** @type {any} */ r) => codes(r.warnings);
    assert.ok(w(withGraph({ nodes: [...nodes, { id: 'a' }] })).includes('duplicate-node'));
    assert.ok(w(withGraph({ nodes, edges: [{ from: 'a', to: 'zz' }] })).includes('unknown-node'));
    assert.ok(w(withGraph({ nodes, steps: [{ focus: 'zz' }] })).includes('unknown-node'));
    assert.ok(w(withGraph({ nodes: [{ id: 'a', slide: 's-nope' }] })).includes('unknown-slide'));
    assert.ok(w(withGraph({ nodes: [{ id: 'a', md: 'See [[nope]]' }] })).includes('unknown-glossary'));
    const show = clone(demo);
    const { warnings } = validateShow(show, { template, imageExists: (src) => src !== 'data/show-format.json' });
    assert.ok(warnings.some((x) => x.code === 'missing-file' && x.path.endsWith('.data')));
  });
});
