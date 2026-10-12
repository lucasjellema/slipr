import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isDiagram, clearDiagramCache } from '../embeds/diagram.js';
import { embedHtml, embedKindForBlock, embedKindForSlot, hydrateEmbeds, usedEmbedKinds } from '../embeds/index.js';
import { externalOrigin, grantConsent, hasConsent } from '../embeds/consent.js';
import { renderBlock } from '../blocks.js';
import { validateShow, collectImagePaths } from '../validate.js';
import { readJson } from './helpers.js';

describe('diagram module', () => {
  test('isDiagram checks object shape', () => {
    assert.equal(isDiagram({ mermaid: 'graph TD; A-->B' }), true);
    assert.equal(isDiagram({ mermaid: 'graph TD; A-->B', caption: 'Flow' }), true);
    assert.equal(isDiagram({ mermaid: 42 }), false);
    assert.equal(isDiagram({ text: 'not a diagram' }), false);
    assert.equal(isDiagram(null), false);
    assert.equal(isDiagram('graph TD'), false);
    assert.equal(isDiagram([]), false);
  });

  test('clearDiagramCache runs safely', () => {
    assert.doesNotThrow(() => clearDiagramCache());
  });

  test('hydrateEmbeds is safe in non-DOM environments', async () => {
    await assert.doesNotReject(async () => {
      await hydrateEmbeds(null);
    });
  });

  test('validateShow accepts diagram slots and diagram blocks', () => {
    const template = readJson('templates/default/template.json');
    const show = {
      slipr: '0.1',
      id: 'test-diagram-show',
      meta: { title: 'Diagram test' },
      template: { ref: 'default', version: '^1.0' },
      slides: [
        {
          id: 's-diagram-test',
          layout: 'diagram',
          content: {
            title: 'Architecture overview',
            diagram: {
              mermaid: 'flowchart LR\n  A[Client] --> B[Server]',
              caption: 'Client server architecture',
            },
            caption: 'Main flow',
          },
          reader: {
            summary: 'A diagram test slide',
            blocks: [
              {
                id: 'b-arch',
                type: 'diagram',
                mermaid: 'sequenceDiagram\n  Client->>Server: Request\n  Server-->>Client: Response',
                caption: 'Detailed interaction',
              },
            ],
          },
        },
      ],
    };
    const result = validateShow(show, { template });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });
});

const ctx = { resolveAsset: (/** @type {string} */ src) => `/shows/x/${src}` };

/** A minimal show with one diagram slide and the given blocks. */
function showWith(blocks, diagram = { mermaid: 'flowchart LR\n  A --> B' }, slipr = '0.2') {
  return {
    slipr,
    id: 'embed-test',
    meta: { title: 'Embed test' },
    template: { ref: 'default', version: '^1.0' },
    slides: [{ id: 's-1', layout: 'diagram', content: { title: 'T', diagram }, reader: { blocks } }],
  };
}

describe('embed registry (I-070)', () => {
  test('slot and block types map to kinds', () => {
    assert.equal(embedKindForSlot('diagram'), 'diagram');
    assert.equal(embedKindForSlot('text'), null);
    assert.equal(embedKindForBlock('diagram'), 'diagram');
    assert.equal(embedKindForBlock('embed'), 'web');
    assert.equal(embedKindForBlock('callout'), null);
  });

  test('usedEmbedKinds finds slot and block kinds', () => {
    assert.deepEqual([...usedEmbedKinds(showWith([]))], ['diagram']);
    const show = showWith([{ id: 'w', type: 'embed', url: 'https://example.com', title: 'Ex' }]);
    show.slides[0].content = { title: 'no diagram' };
    assert.deepEqual([...usedEmbedKinds(show)], ['web']);
    assert.deepEqual([...usedEmbedKinds(readJson('shows/conclusion-demo/show.json'))], []);
  });

  test('diagram markup: kind class, template hook, escaped source as fallback', () => {
    const html = embedHtml('diagram', { mermaid: 'A --> B<script>' }, ctx);
    assert.match(html, /^<div class="slipr-embed slipr-embed--diagram slipr-diagram" data-embed="diagram" data-mermaid="A --&gt; B&lt;script&gt;">/);
    assert.match(html, /<div class="slipr-embed-fallback" data-fallback="source"><pre class="mermaid">A --&gt; B&lt;script&gt;<\/pre><\/div>/);
    assert.doesNotMatch(html, /<script>/);
  });

  test('a fallback image replaces the static content, with picture attributes', () => {
    const html = embedHtml('diagram', { mermaid: 'A', fallback: { src: 'images/a.png', alt: 'A "flow"', style: 'shadow' } }, ctx);
    assert.match(html, /data-fallback="image"><img src="\/shows\/x\/images\/a.png" alt="A &quot;flow&quot;" class="slipr-picture-shadow"/);
  });

  test('web markup: external pages ask first unless load is auto', () => {
    const click = embedHtml('web', { url: 'https://example.com/page?a=1', title: 'Example' }, ctx);
    assert.match(click, /data-embed="web"/);
    assert.match(click, /data-embed-origin="https:\/\/example.com"/);
    assert.match(click, /data-embed-print="fallback"/);
    assert.match(click, /<span class="slipr-embed-card-site">example.com<\/span>/);
    assert.match(click, /href="https:\/\/example.com\/page\?a=1" target="_blank" rel="noopener noreferrer">Open in new tab/);
    const auto = embedHtml('web', { url: 'https://example.com', title: 'Example', load: 'auto' }, ctx);
    assert.doesNotMatch(auto, /data-embed-origin/);
    const local = embedHtml('web', { url: 'embeds/dial.html', title: 'Dial', height: 50 }, ctx);
    assert.doesNotMatch(local, /data-embed-origin/);
    assert.match(local, /data-embed-src="\/shows\/x\/embeds\/dial.html"/);
    assert.match(local, /data-embed-height="100"/);
    assert.match(local, /File in this show/);
  });

  test('embed blocks render through the registry; unsafe URLs stay blocked', () => {
    const bctx = { show: { slides: [] }, resolveAsset: ctx.resolveAsset };
    const web = renderBlock({ id: 'w', type: 'embed', url: 'https://example.com', title: 'Ex' }, 's-1', bctx);
    assert.match(web, /class="slipr-block slipr-block--embed"/);
    assert.match(web, /class="slipr-embed slipr-embed--web"/);
    assert.doesNotMatch(web, /<iframe/); // no request before hydration (and consent)
    const blocked = renderBlock({ id: 'w', type: 'embed', url: 'javascript:alert(1)', title: 'X' }, 's-1', bctx);
    assert.match(blocked, /embed blocked/);
    assert.doesNotMatch(blocked, /data-embed=/);
    const diagram = renderBlock({ id: 'd', type: 'diagram', mermaid: 'A', caption: 'Cap' }, 's-1', bctx);
    assert.match(diagram, /<figure class="slipr-figure slipr-figure--diagram"><div class="slipr-embed slipr-embed--diagram slipr-diagram"/);
    assert.match(diagram, /<figcaption class="slipr-caption">Cap<\/figcaption><\/figure>/);
  });
});

describe('click-to-load consent (I-070)', () => {
  const fakeStorage = () => {
    const data = new Map();
    return { getItem: (/** @type {string} */ k) => data.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => data.set(k, v) };
  };

  test('externalOrigin: only http(s) URLs contact another server', () => {
    assert.equal(externalOrigin('https://example.com/a/b?c'), 'https://example.com');
    assert.equal(externalOrigin('HTTP://Example.com:8080/x'), 'http://example.com:8080');
    assert.equal(externalOrigin('embeds/page.html'), null);
    assert.equal(externalOrigin('blob:https://x/1'), null);
    assert.equal(externalOrigin('https://'), null);
  });

  test('consent is remembered per origin', () => {
    const storage = fakeStorage();
    assert.equal(hasConsent('https://a.example', storage), false);
    grantConsent('https://a.example', storage);
    grantConsent('https://a.example', storage);
    assert.equal(hasConsent('https://a.example', storage), true);
    assert.equal(hasConsent('https://b.example', storage), false);
    assert.equal(storage.getItem('slipr-embed-consent'), '["https://a.example"]');
  });

  test('broken or missing storage never throws', () => {
    const broken = { getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
    assert.equal(hasConsent('https://a.example', broken), false);
    assert.doesNotThrow(() => grantConsent('https://a.example', broken));
    assert.equal(hasConsent('https://a.example', null), false);
  });
});

describe('embed validation (I-070)', () => {
  const template = readJson('templates/default/template.json');

  test('fallback and load are valid in 0.2', () => {
    const show = showWith(
      [{ id: 'w', type: 'embed', url: 'https://example.com', title: 'Ex', load: 'auto', fallback: { src: 'images/w.png', alt: 'Page' } }],
      { mermaid: 'A', fallback: { src: 'images/d.png', alt: 'Diagram' } },
    );
    const result = validateShow(show, { template });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(collectImagePaths(show).sort(), ['images/d.png', 'images/w.png']);
  });

  test('fallback and load need 0.2', () => {
    const show = showWith(
      [{ id: 'w', type: 'embed', url: 'https://example.com', title: 'Ex', load: 'auto' }],
      { mermaid: 'A', fallback: { src: 'images/d.png', alt: 'Diagram' } },
      '0.1',
    );
    const paths = validateShow(show, { template }).errors.filter((e) => e.code === 'format-version').map((e) => e.path);
    assert.deepEqual(paths, ['slides[0].content.diagram.fallback', 'slides[0].reader.blocks[0].load']);
  });

  test('a fallback image is checked like any image', () => {
    const show = showWith([], { mermaid: 'A', fallback: { src: 'images/d.png' } });
    const result = validateShow(show, { template, imageExists: () => false });
    assert.deepEqual(result.warnings.map((w) => w.code).sort(), ['missing-alt', 'missing-file']);
  });

  test('an unknown load value is an error', () => {
    const show = showWith([{ id: 'w', type: 'embed', url: 'https://example.com', title: 'Ex', load: 'never' }]);
    assert.equal(validateShow(show, { template }).ok, false);
  });
});
