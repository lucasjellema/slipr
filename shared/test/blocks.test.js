import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock, renderBlocks, blockDomId } from '../blocks.js';
import { readJson } from './helpers.js';

const demo = readJson('shows/demo/show.json');
const ctx = {
  show: demo,
  resolveAsset: (src) => `http://host/shows/demo/${src}`,
  slideHref: (id) => `#${id}`,
};
const slide = (id) => demo.slides.find((s) => s.id === id);
const block = (slideId, blockId) => slide(slideId).reader.blocks.find((b) => b.id === blockId);

describe('block wrapper', () => {
  test('ids, data attributes and badges', () => {
    const html = renderBlock(block('s-data-2', 'dev-code'), 's-data-2', ctx);
    assert.match(html, /^<div class="slipr-block slipr-block--tabs" id="s-data-2--dev-code" data-block-id="dev-code" data-depth="3" data-for="dev">/);
    assert.match(html, /<span class="slipr-badge" data-kind="profile">For Developer<\/span>/);
    assert.match(html, /data-kind="depth" data-depth="3">Deep dive</);
  });

  test('blocks without for/depth have no badges', () => {
    assert.doesNotMatch(renderBlock(block('s-problem', 'layers'), 's-problem', ctx), /slipr-badge/);
  });

  test('blockDomId', () => {
    assert.equal(blockDomId('s-1', 'b2'), 's-1--b2');
  });
});

describe('block types', () => {
  test('text: Markdown in reader mode, with glossary buttons and footnotes', () => {
    const html = renderBlock(block('s-problem', 'story'), 's-problem', ctx);
    assert.match(html, /class="slipr-block-body"><p>A good talk/);
    assert.match(html, /class="slipr-footnote-ref"/);
    const layers = renderBlock(block('s-problem', 'layers'), 's-problem', ctx);
    assert.match(layers, /<button type="button" class="slipr-term" data-term="audience-layer">audience layer<\/button>/);
  });

  test('details: native <details> with summary', () => {
    const html = renderBlock(block('s-problem', 'vs-pptx'), 's-problem', ctx);
    assert.match(html, /^<details class="slipr-block slipr-block--details"[^>]*><summary>Isn&#39;t this what PowerPoint notes pages are for\?<\/summary>/);
    assert.doesNotMatch(html, / open>/);
  });

  test('callout: aside with variant and title', () => {
    const html = renderBlock(block('s-problem', 'mgr-value'), 's-problem', ctx);
    assert.match(html, /^<aside class="slipr-block slipr-block--callout"[^>]* data-variant="tip" aria-label="The business case">/);
    assert.match(html, /<p class="slipr-block-title">The business case<\/p>/);
  });

  test('tabs: ARIA tablist with one visible panel', () => {
    const html = renderBlock(block('s-data-2', 'dev-code'), 's-data-2', ctx);
    assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
    assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 3);
    assert.equal((html.match(/role="tabpanel"[^>]* hidden/g) ?? []).length, 2);
    assert.match(html, /aria-selected="true" tabindex="0">show\.json</);
    assert.match(html, /<pre><code class="language-json">/);
  });

  test('image: resolved src, lazy loading, positioned hotspots with hidden content', () => {
    const html = renderBlock(block('s-architecture', 'diagram'), 's-architecture', ctx);
    assert.match(html, /<img src="http:\/\/host\/shows\/demo\/images\/architecture\.svg" alt="Slipr architecture diagram with clickable components" loading="lazy"/);
    assert.equal((html.match(/class="slipr-hotspot"/g) ?? []).length, 6);
    assert.match(html, /style="left:28\.75%;top:36\.7%" data-hotspot="0" aria-label="Converter">1<\/button>/);
    assert.match(html, /<span class="slipr-hotspot-content" data-hotspot="0" hidden><span class="slipr-popover-title">Converter<\/span>/);
    assert.match(html, /<figcaption>Click the markers/);
  });

  test('embed: sandboxed lazy iframe, relative URL resolved', () => {
    const html = renderBlock(block('s-tailored', 'dial'), 's-tailored', ctx);
    assert.match(html, /<iframe src="http:\/\/host\/shows\/demo\/embeds\/depth-dial\.html" title="Interactive depth demo" loading="lazy" sandbox="allow-scripts allow-forms allow-popups"/);
    assert.match(html, /style="height:260px"/);
    assert.doesNotMatch(html, /allow-same-origin/);
  });

  test('embed: dangerous URLs are blocked', () => {
    const html = renderBlock({ id: 'x', type: 'embed', title: 't', url: 'javascript:alert(1)' }, 's', ctx);
    assert.doesNotMatch(html, /<iframe/);
  });

  test('slide-ref: label, or the target slide title', () => {
    assert.match(renderBlock(block('s-roadmap', 'back'), 's-roadmap', ctx), /<a href="#s-two-modes" data-slide-link="s-two-modes">Back to the two modes<\/a>/);
    assert.match(renderBlock({ id: 'r', type: 'slide-ref', slide: 's-ai' }, 's', ctx), />AI help, kept in its cage<\/a>/);
  });

  test('unknown types render nothing', () => {
    assert.equal(renderBlock({ id: 'x', type: 'carousel' }, 's', ctx), '');
  });
});

describe('safety', () => {
  test('titles, labels and captions are escaped', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const html = renderBlocks([
      { id: 'a', type: 'details', title: evil, md: 'x' },
      { id: 'b', type: 'tabs', tabs: [{ label: evil, md: 'x' }] },
      { id: 'c', type: 'image', image: { src: 'a.png', alt: '"><script>' }, caption: evil, hotspots: [{ x: 2, y: -1, title: evil, md: 'x' }] },
    ], 's', ctx);
    assert.doesNotMatch(html, /<img src=x|<script>/);
    assert.match(html, /left:100%;top:0%/, 'hotspot coordinates are clamped');
  });
});

test('every block in the demo renders', () => {
  for (const s of demo.slides) {
    for (const b of s.reader?.blocks ?? []) {
      assert.notEqual(renderBlock(b, s.id, ctx), '', `${s.id}/${b.id}`);
    }
  }
});
