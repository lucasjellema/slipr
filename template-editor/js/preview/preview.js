// @ts-check
/**
 * Runs inside the template editor's preview iframe (I-106). The editor calls
 * `window.sliprPreview`:
 *
 * - `setStyles(theme, reader)`: replace the template's stylesheet text (a
 *   token change: immediate, nothing is re-rendered);
 * - `render(payload)`: draw the sample slides with the shared renderer, in
 *   audience mode (a grid) or reader mode (an article with reader blocks).
 *
 * The payload's objects come from the editor's window; they are copied here
 * with structuredClone so the renderer works with this window's own objects.
 */
import { renderSlide, slideTitle } from '../../../shared/render.js';
import { renderBlocks } from '../../../shared/blocks.js';
import { hydrateEmbeds } from '../../../shared/embeds/index.js';

const root = /** @type {HTMLElement} */ (document.getElementById('slipr-preview-root'));
const themeEl = /** @type {HTMLStyleElement} */ (document.getElementById('slipr-preview-theme'));
const readerEl = /** @type {HTMLStyleElement} */ (document.getElementById('slipr-preview-reader'));

/** Layouts are rendered with absolute (blob:) URLs already; this base is never used. */
const LAYOUT_BASE = new URL('https://slipr.invalid/template/layouts/');

/**
 * @typedef {object} PreviewPayload
 * @property {any} template
 * @property {Array<{ id: string, def: any, html: string }>} layouts  Relative URLs already rewritten.
 * @property {any} show
 * @property {string} showUrl     Base for the show's own images and data files.
 * @property {'audience' | 'reader'} mode
 */

let generation = 0;

/**
 * @param {string} theme @param {string} reader
 */
function setStyles(theme, reader) {
  if (themeEl.textContent !== theme) themeEl.textContent = theme;
  if (readerEl.textContent !== reader) readerEl.textContent = reader;
}

/**
 * @param {PreviewPayload} payload
 */
async function render(payload) {
  const run = ++generation;
  const { template, layouts, show, showUrl, mode } = structuredClone(payload);
  const showBase = new URL(showUrl, location.href);
  /** @type {import('../../../shared/load.js').ShowContext} */
  const ctx = {
    show,
    template,
    showUrl: showBase,
    templateUrl: LAYOUT_BASE,
    layouts: new Map(layouts.map((l) => [l.id, { def: l.def, html: l.html, base: LAYOUT_BASE }])),
    validation: { ok: true, errors: [], warnings: [] },
    resolveAsset: (src) => new URL(src, showBase).href,
    resolveTemplateAsset: (path) => new URL(path, LAYOUT_BASE).href,
    registerAsset: () => {},
    notices: [],
  };
  document.body.className = mode === 'reader' ? 'pv-reader' : 'pv-audience';
  const slides = (show.slides ?? []).filter((/** @type {any} */ s) => !(mode === 'reader' && s.reader?.hidden));
  const fragment = document.createDocumentFragment();
  if (!slides.length) {
    const p = document.createElement('p');
    p.className = 'pv-empty';
    p.textContent = 'This sample has no slides with this template\'s layouts.';
    fragment.append(p);
  }
  slides.forEach((/** @type {any} */ slide, /** @type {number} */ i) => {
    try {
      fragment.append(mode === 'reader' ? readerSection(slide, ctx) : audienceCard(slide, ctx, i));
    } catch (err) {
      const p = document.createElement('p');
      p.className = 'pv-empty';
      p.textContent = `Slide ${i + 1} (${slide.layout}) could not be drawn: ${err instanceof Error ? err.message : err}`;
      fragment.append(p);
    }
  });
  root.replaceChildren(fragment);
  window.scrollTo(0, 0);
  if (run !== generation) return;
  await hydrateEmbeds(root, { thumbnail: mode === 'audience' }).catch((err) => console.warn('Slipr preview: embeds', err));
}

/**
 * @param {any} slide @param {import('../../../shared/load.js').ShowContext} ctx @param {number} i
 */
function audienceCard(slide, ctx, i) {
  const figure = document.createElement('figure');
  figure.className = 'pv-card';
  figure.append(renderSlide(slide, ctx, { mode: 'audience' }));
  const caption = document.createElement('figcaption');
  const code = document.createElement('code');
  code.textContent = slide.layout;
  caption.append(`${i + 1}. `, code, ` · ${slideTitle(slide) || 'Untitled'}`);
  figure.append(caption);
  return figure;
}

/**
 * @param {any} slide @param {import('../../../shared/load.js').ShowContext} ctx
 */
function readerSection(slide, ctx) {
  const section = document.createElement('section');
  section.className = 'pv-section';
  const h2 = document.createElement('h2');
  h2.textContent = slideTitle(slide) || slide.layout;
  section.append(h2);
  if (!slide.reader?.hideSlide) {
    const frame = document.createElement('div');
    frame.className = 'pv-slide';
    frame.append(renderSlide(slide, ctx, { mode: 'reader', slideHref: (id) => `#${id}` }));
    section.append(frame);
  }
  if (slide.reader?.summary) {
    const p = document.createElement('p');
    p.className = 'pv-summary';
    p.textContent = slide.reader.summary;
    section.append(p);
  }
  const blocks = document.createElement('div');
  blocks.className = 'pv-blocks';
  blocks.innerHTML = renderBlocks(slide.reader?.blocks ?? [], slide.id, { ...ctx, slideHref: (/** @type {string} */ id) => `#${id}` }); // escaped by blocks.js
  section.append(blocks);
  return section;
}

// Links inside the preview go nowhere.
document.addEventListener('click', (e) => {
  const a = /** @type {Element} */ (e.target).closest?.('a[href]');
  if (a) e.preventDefault();
});

Object.assign(window, { sliprPreview: { setStyles, render } });
window.dispatchEvent(new Event('slipr-preview-ready'));
