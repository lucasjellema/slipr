import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isDiagram, clearDiagramCache } from '../embeds/diagram.js';
import { embedAttributes, embedHtml, embedInnerHtml, embedKindForBlock, embedKindForSlot, hydrateEmbeds, usedEmbedKinds } from '../embeds/index.js';
import { afterHtml, pageLabel, pageRange, pdfEntries, pdfUrl } from '../embeds/pdf.js';
import { ALLOW_OPTIONS, FRAME_SANDBOX, frameAspect, frameSandbox } from '../embeds/web.js';
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
    assert.deepEqual([...usedEmbedKinds(readJson('shows/conclusion-demo/show.json'))].sort(), ['pdf', 'web']);
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

describe('web pages (I-071)', () => {
  const template = readJson('templates/default/template.json');
  /** A 0.2 show with one web slide. */
  const webShow = (page, slipr = '0.2') => ({
    slipr,
    id: 'web-test',
    meta: { title: 'Web test' },
    template: { ref: 'default', version: '^1.0' },
    slides: [{ id: 's-1', layout: 'web', content: { title: 'T', page } }],
  });

  test('sandbox: base plus extras; same-origin only for other servers', () => {
    assert.equal(frameSandbox({ url: 'https://x.example' }), FRAME_SANDBOX);
    assert.equal(
      frameSandbox({ url: 'https://x.example', allow: ['same-origin', 'modals', 'downloads', 'presentation', 'fullscreen', 'modals'] }),
      `${FRAME_SANDBOX} allow-same-origin allow-modals allow-downloads allow-presentation`,
    );
    assert.equal(frameSandbox({ url: 'embeds/page.html', allow: ['same-origin', 'modals'] }), `${FRAME_SANDBOX} allow-modals`);
    assert.deepEqual(ALLOW_OPTIONS, ['same-origin', 'fullscreen', 'modals', 'downloads', 'presentation']);
  });

  test('aspect ratio wins over height; slots get neither', () => {
    assert.equal(frameAspect({ aspect: '16:9' }), '16 / 9');
    assert.equal(frameAspect({ aspect: '16x9' }), null);
    const block = embedHtml('web', { url: 'https://x.example', title: 'X', aspect: '4:3', height: 300 }, ctx);
    assert.match(block, /data-embed-aspect="4 \/ 3"/);
    assert.doesNotMatch(block, /data-embed-height/);
    const slot = embedAttributes('web', { url: 'https://x.example', title: 'X', aspect: '4:3' }, ctx, { slot: true });
    assert.equal(slot['data-embed-aspect'], undefined);
    assert.equal(slot['data-embed-height'], undefined);
    assert.equal(embedAttributes('web', { url: 'https://x.example', title: 'X', allow: ['fullscreen'] }, ctx)['data-embed-fullscreen'], '');
  });

  test('audience mode: live loads without asking, static keeps the screenshot', () => {
    const live = embedAttributes('web', { url: 'https://x.example', title: 'X' }, ctx, { mode: 'audience', slot: true });
    assert.equal(live['data-embed-origin'], undefined);
    assert.equal(live['data-embed-static'], undefined);
    const still = embedAttributes('web', { url: 'https://x.example', title: 'X', present: 'static' }, ctx, { mode: 'audience', slot: true });
    assert.equal(still['data-embed-static'], '');
    const reader = embedAttributes('web', { url: 'https://x.example', title: 'X', present: 'static' }, ctx, { mode: 'reader', slot: true });
    assert.equal(reader['data-embed-origin'], 'https://x.example', 'reader mode asks, whatever present says');
    assert.equal(reader['data-embed-static'], undefined);
  });

  test('web slots: kind, validation and format version', () => {
    assert.equal(embedKindForSlot('web'), 'web');
    const page = { url: 'https://x.example', title: 'X', allow: ['fullscreen'], present: 'static', fallback: { src: 'images/x.png', alt: 'X' } };
    assert.deepEqual([...usedEmbedKinds(webShow(page))], ['web']);
    const ok = validateShow(webShow(page), { template });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.warnings, []);
    assert.ok(validateShow(webShow(page, '0.1'), { template }).errors.some((e) => e.code === 'format-version' && e.path === 'slides[0].content.page'));
    assert.equal(validateShow(webShow({ ...page, allow: ['camera'] }), { template }).ok, false);
  });

  test('web warnings and errors', () => {
    const codesOf = (page) => {
      const r = validateShow(webShow(page), { template });
      return [...r.errors, ...r.warnings].map((i) => i.code).sort();
    };
    assert.deepEqual(codesOf({ url: 'https://x.example', title: 'X', present: 'static' }), ['static-without-fallback']);
    assert.deepEqual(codesOf({ url: 'embeds/x.html', title: 'X', allow: ['same-origin'] }), ['same-origin-local']);
    assert.deepEqual(codesOf({ url: 'javascript:alert(1)', title: 'X' }), ['unsafe-url']);
  });

  test('embed blocks: allow and aspect need 0.2', () => {
    const show = showWith([{ id: 'w', type: 'embed', url: 'https://x.example', title: 'X', allow: ['modals'], aspect: '16:9' }], undefined, '0.1');
    const paths = validateShow(show, { template }).errors.filter((e) => e.code === 'format-version').map((e) => e.path);
    assert.deepEqual(paths, ['slides[0].reader.blocks[0].allow', 'slides[0].reader.blocks[0].aspect']);
  });
});

describe('PDF documents (I-072)', () => {
  const template = readJson('templates/default/template.json');
  /** A 0.2 show with one PDF slide and optional blocks. */
  const pdfShow = (document, blocks = [], slipr = '0.2') => ({
    slipr,
    id: 'pdf-test',
    meta: { title: 'PDF test' },
    template: { ref: 'default', version: '^1.0' },
    slides: [{ id: 's-1', layout: 'pdf', content: { title: 'T', document }, reader: { blocks } }],
  });

  test('page ranges: pages wins, reversed ranges are ordered, nothing means all', () => {
    assert.deepEqual(pageRange({ page: 3 }), [3, 3]);
    assert.deepEqual(pageRange({ pages: [2, 5], page: 9 }), [2, 5]);
    assert.deepEqual(pageRange({ pages: [5, 2] }), [2, 5]);
    assert.deepEqual(pageRange({}), [1, null]);
    assert.deepEqual(pageRange({ page: 0 }), [1, null]);
    assert.equal(pageLabel({ page: 3 }), 'page 3');
    assert.equal(pageLabel({ pages: [3, 7] }), 'pages 3–7');
    assert.equal(pageLabel({}), '');
  });

  test('markup: card fallback, range attributes, bar per place', () => {
    const block = embedHtml('pdf', { pdf: 'docs/a.pdf', title: 'A <b>', pages: [2, 4] }, ctx);
    assert.match(block, /data-embed="pdf" data-embed-pdf="\/shows\/x\/docs\/a.pdf" data-embed-title="A &lt;b&gt;" data-pdf-first="2" data-pdf-bar="full" data-pdf-last="4"/);
    assert.match(block, /PDF · pages 2–4 · File in this show/);
    assert.match(block, /href="\/shows\/x\/docs\/a.pdf#page=2"/);
    assert.doesNotMatch(block, /data-embed-origin|slipr-pdf-step/);
    assert.equal(embedAttributes('pdf', { pdf: 'a.pdf', title: 'A' }, ctx, { slot: true, mode: 'reader' })['data-pdf-bar'], 'compact');
    assert.equal(embedAttributes('pdf', { pdf: 'a.pdf', title: 'A' }, ctx, { slot: true, mode: 'audience' })['data-pdf-bar'], 'none');
  });

  test('audience slots step through a range with hidden fragments', () => {
    const html = embedInnerHtml('pdf', { pdf: 'a.pdf', title: 'A', pages: [3, 5] }, ctx, { mode: 'audience', slot: true });
    assert.equal((html.match(/class="fragment slipr-pdf-step"/g) ?? []).length, 2);
    assert.match(html, /data-pdf-page="4".*data-pdf-page="5"/);
    assert.equal(afterHtml({ pdf: 'a.pdf', title: 'A', pages: [3, 5] }, { mode: 'reader', slot: true }), '');
    assert.equal(afterHtml({ pdf: 'a.pdf', title: 'A', page: 3 }, { mode: 'audience', slot: true }), '');
  });

  test('remote PDFs: click-to-load in reader mode only', () => {
    const remote = { pdf: 'https://docs.example/a.pdf', title: 'A' };
    assert.equal(embedAttributes('pdf', remote, ctx)['data-embed-origin'], 'https://docs.example');
    assert.equal(embedAttributes('pdf', { ...remote, load: 'auto' }, ctx)['data-embed-origin'], undefined);
    assert.equal(embedAttributes('pdf', remote, ctx, { mode: 'audience', slot: true })['data-embed-origin'], undefined);
    assert.equal(pdfUrl(remote, ctx), 'https://docs.example/a.pdf');
  });

  test('pdfEntries and usedEmbedKinds find slots and blocks', () => {
    const show = pdfShow({ pdf: 'a.pdf', title: 'A' }, [{ id: 'b', type: 'pdf', pdf: 'b.pdf', title: 'B' }]);
    assert.deepEqual(pdfEntries(show).map((e) => [e.slideId, e.blockId, e.value.pdf]), [['s-1', 'slot:document', 'a.pdf'], ['s-1', 'b', 'b.pdf']]);
    assert.deepEqual([...usedEmbedKinds(show)], ['pdf']);
    assert.equal(embedKindForSlot('pdf'), 'pdf');
    assert.equal(embedKindForBlock('pdf'), 'pdf');
    assert.deepEqual(collectImagePaths(pdfShow({ pdf: 'https://x.example/a.pdf', title: 'A' }, [{ id: 'b', type: 'pdf', pdf: 'b.pdf', title: 'B' }])), ['b.pdf']);
  });

  test('validation: valid in 0.2, errors and warnings', () => {
    const ok = validateShow(pdfShow({ pdf: 'a.pdf', title: 'A', pages: [1, 3] }, [{ id: 'b', type: 'pdf', pdf: 'a.pdf', title: 'B', page: 2 }]), { template, imageExists: () => true });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.warnings, []);
    const old = validateShow(pdfShow({ pdf: 'a.pdf', title: 'A' }, [{ id: 'b', type: 'pdf', pdf: 'a.pdf', title: 'B' }], '0.1'), { template });
    assert.deepEqual(old.errors.filter((e) => e.code === 'format-version').map((e) => e.path), ['slides[0].content.document', 'slides[0].reader.blocks[0]']);
    const codesOf = (document) => {
      const r = validateShow(pdfShow(document), { template, imageExists: () => false });
      return [...r.errors, ...r.warnings].map((i) => i.code).sort();
    };
    assert.deepEqual(codesOf({ pdf: 'a.pdf', title: 'A', page: 1, pages: [3, 2] }), ['missing-file', 'pdf-page-and-pages', 'pdf-pages-order']);
    assert.deepEqual(codesOf({ pdf: 'javascript:x', title: 'A' }), ['unsafe-url']);
    assert.deepEqual(codesOf({ pdf: 'https://x.example/a.pdf', title: 'A' }), []);
    assert.equal(validateShow(pdfShow({ pdf: 'a.pdf', title: 'A', pages: [1] }), { template }).ok, false);
  });
});
