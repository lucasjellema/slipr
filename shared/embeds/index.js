// @ts-check
/**
 * Rich embeds (I-070, D-011): the shared foundation for content that needs a
 * library or another server: diagrams, web pages, PDFs and graphs (maps
 * next). Every kind is available as an audience slot type and a reader block
 * type, and has one module `shared/embeds/<kind>.js`:
 *
 *   library      vendor folder it lazy-loads, or null (the export skips it when unused)
 *   thumbnail    whether editor thumbnails render it live
 *   errorLabel   heading of the error box
 *   attributes(value, ctx, options)  data attributes for the embed element
 *                            (options: { mode, slot }, see EmbedOptions)
 *   staticHtml(value, ctx)   { html, fallback } when the value has no fallback image
 *   afterHtml(value, options) optional: markup after the fallback (e.g. Reveal fragments)
 *   hydrate(el, live)        render the live content into `live` (async, may throw)
 *
 * Rendering is two-step. `render.js` and `blocks.js` write an embed element
 * with a static fallback inside (the value's `fallback` image, or the kind's
 * own static content), so print, thumbnails and failures always show
 * something. `hydrateEmbeds(root)` then renders the live content, loading a
 * kind's library only when a slide uses that kind:
 *
 *   <div class="slipr-embed slipr-embed--<kind> …" data-embed="<kind>" data-embed-state="…">
 *     <div class="slipr-embed-fallback" data-fallback="image|source|card">…</div>
 *     <div class="slipr-embed-live">…</div>            (after hydration)
 *     <div class="slipr-embed-consent">…</div>          (external, waiting for a click)
 *     <div class="slipr-embed-error">…</div>            (hydration failed)
 *   </div>
 *
 * States: none (static), `waiting` (click-to-load), `loading`, `ready`, `error`.
 * An element with `data-embed-static` keeps its fallback and is never hydrated
 * (e.g. a web page set to present as a screenshot in audience mode).
 * Styling: ./embeds.css, from the template's --slipr-* tokens; added to the page
 * by the first hydrateEmbeds().
 *
 * The markup functions are DOM-free (strings, built with escape() only, so safe
 * for innerHTML); hydrateEmbeds() needs a DOM.
 */
import { escape } from '../markdown.js';
import { pictureAttributes } from '../picture.js';
import { grantConsent, hasConsent } from './consent.js';
import { applyCropFallback } from '../crop.js';
import * as diagram from './diagram.js';
import * as graph from './graph.js';
import * as pdf from './pdf.js';
import * as web from './web.js';

/**
 * @typedef {object} EmbedKind
 * @property {string | null} library
 * @property {boolean} thumbnail
 * @property {string} errorLabel
 * @property {(value: any, ctx: EmbedContext, options?: EmbedOptions) => Record<string, string>} attributes
 * @property {(value: any, ctx: EmbedContext) => { html: string, fallback: string }} staticHtml
 * @property {(el: HTMLElement, live: HTMLElement) => Promise<void>} hydrate
 * @property {(value: any, options?: EmbedOptions) => string} [afterHtml]
 */
/** @typedef {{ resolveAsset: (src: string) => string }} EmbedContext */
/**
 * @typedef {object} EmbedOptions
 * @property {'audience' | 'reader'} [mode]  The mode it is shown in (default 'reader').
 * @property {boolean} [slot]  A slot on a slide (the layout sizes it), not a reader block.
 */

/** @type {Record<string, EmbedKind>} */
export const EMBED_KINDS = { diagram, web, pdf, graph };

/** Slot type → embed kind. */
const SLOT_KINDS = /** @type {Record<string, string>} */ ({ diagram: 'diagram', web: 'web', pdf: 'pdf', graph: 'graph' });
/** Reader block type → embed kind. */
const BLOCK_KINDS = /** @type {Record<string, string>} */ ({ diagram: 'diagram', embed: 'web', pdf: 'pdf', graph: 'graph' });

/**
 * The embed kind behind a slot type, or null.
 * @param {string} slotType
 */
export function embedKindForSlot(slotType) {
  return SLOT_KINDS[slotType] ?? null;
}

/**
 * The embed kind behind a reader block type, or null.
 * @param {string} blockType
 */
export function embedKindForBlock(blockType) {
  return BLOCK_KINDS[blockType] ?? null;
}

/**
 * The embed kinds a show uses (slots by value shape, blocks by type). DOM-free;
 * the single-file export uses it to leave unused libraries out.
 * @param {any} show
 * @returns {Set<string>}
 */
export function usedEmbedKinds(show) {
  const kinds = new Set();
  for (const slide of Array.isArray(show?.slides) ? show.slides : []) {
    const content = slide?.content && typeof slide.content === 'object' ? slide.content : {};
    for (const value of Object.values(content)) {
      if (diagram.isDiagram(value)) kinds.add('diagram');
      if (web.isWeb(value)) kinds.add('web');
      if (pdf.isPdf(value)) kinds.add('pdf');
      if (graph.isGraph(value)) kinds.add('graph');
    }
    for (const block of Array.isArray(slide?.reader?.blocks) ? slide.reader.blocks : []) {
      const kind = embedKindForBlock(block?.type);
      if (kind) kinds.add(kind);
    }
  }
  return kinds;
}

/**
 * Attributes of an embed element: class, data-embed and the kind's own.
 * @param {string} kind
 * @param {any} value
 * @param {EmbedContext} ctx
 * @param {EmbedOptions} [options]
 * @returns {Record<string, string>}
 */
export function embedAttributes(kind, value, ctx, options = {}) {
  const def = EMBED_KINDS[kind];
  const own = def ? def.attributes(value, ctx, options) : {};
  const { class: ownClass = '', ...rest } = own;
  return { class: `slipr-embed slipr-embed--${kind}${ownClass ? ` ${ownClass}` : ''}`, 'data-embed': kind, ...rest };
}

/**
 * The static content of an embed element: the value's fallback image, or the
 * kind's own static content.
 * @param {string} kind
 * @param {any} value
 * @param {EmbedContext} ctx
 * @param {EmbedOptions} [options]
 * @returns {string}
 */
export function embedInnerHtml(kind, value, ctx, options = {}) {
  const def = EMBED_KINDS[kind];
  const after = def?.afterHtml ? def.afterHtml(value, options) : '';
  const image = value?.fallback;
  if (image && typeof image === 'object' && typeof image.src === 'string' && image.src) {
    return `<div class="slipr-embed-fallback" data-fallback="image">`
      + `<img src="${escape(ctx.resolveAsset(image.src))}" alt="${escape(String(image.alt ?? ''))}"${pictureAttributes(image)} loading="lazy" decoding="async"></div>${after}`;
  }
  const { html, fallback } = def ? def.staticHtml(value, ctx) : { html: '', fallback: 'none' };
  return `<div class="slipr-embed-fallback" data-fallback="${escape(fallback)}">${html}</div>${after}`;
}

/**
 * A complete embed element as an HTML string (for reader blocks).
 * @param {string} kind
 * @param {any} value
 * @param {EmbedContext} ctx
 * @param {EmbedOptions} [options]
 * @returns {string}
 */
export function embedHtml(kind, value, ctx, options = {}) {
  const attrs = Object.entries(embedAttributes(kind, value, ctx, options)).map(([k, v]) => ` ${k}="${escape(v)}"`).join('');
  return `<div${attrs}>${embedInnerHtml(kind, value, ctx, options)}</div>`;
}

/**
 * Turn an existing element (a layout's slot) into an embed element.
 * @param {HTMLElement} el
 * @param {string} kind
 * @param {any} value
 * @param {EmbedContext} ctx
 * @param {EmbedOptions} [options]  `slot` is implied.
 */
export function fillEmbedElement(el, kind, value, ctx, options = {}) {
  for (const [name, v] of Object.entries(embedAttributes(kind, value, ctx, { ...options, slot: true }))) {
    if (name === 'class') el.classList.add(...v.split(' '));
    else el.setAttribute(name, v);
  }
  el.innerHTML = embedInnerHtml(kind, value, ctx, { ...options, slot: true }); // built with escape() only
}

/**
 * @typedef {object} HydrateOptions
 * @property {boolean} [thumbnail]  Editor thumbnails: only kinds with `thumbnail`, never a Load button.
 */

/**
 * Render the live content of every embed element in `root` that has not been
 * hydrated yet. Safe to call repeatedly, and a no-op without a DOM.
 * @param {ParentNode | null} [root]
 * @param {HydrateOptions} [options]
 */
export async function hydrateEmbeds(root, options = {}) {
  const target = root ?? (typeof document !== 'undefined' ? document : null);
  if (!target || typeof target.querySelectorAll !== 'function') return;
  // Cropped pictures in reader blocks, where the browser lacks object-view-box (I-090).
  applyCropFallback(target);
  const all = /** @type {HTMLElement[]} */ ([...target.querySelectorAll('[data-embed]')]);
  if (!all.length) return;
  addEmbedStylesheet(all[0].ownerDocument); // static embeds need it too
  const elements = all.filter((el) => el.dataset.embedState === undefined && el.dataset.embedStatic === undefined);
  await Promise.all(elements.map((el) => {
    const def = EMBED_KINDS[el.dataset.embed ?? ''];
    if (!def || (options.thumbnail && !def.thumbnail)) return null;
    const origin = el.dataset.embedOrigin;
    if (origin && !hasConsent(origin)) {
      if (!options.thumbnail) showConsent(el, origin);
      return null;
    }
    return hydrateOne(el, def);
  }));
}

/**
 * @param {HTMLElement} el
 * @param {EmbedKind} def
 */
async function hydrateOne(el, def) {
  el.querySelector(':scope > .slipr-embed-consent')?.remove();
  el.querySelector(':scope > .slipr-embed-error')?.remove();
  el.dataset.embedState = 'loading';
  const live = el.ownerDocument.createElement('div');
  live.className = 'slipr-embed-live';
  try {
    await def.hydrate(el, live);
    el.querySelector(':scope > .slipr-embed-live')?.remove();
    el.append(live);
    el.dataset.embedState = 'ready';
  } catch (err) {
    console.warn(`Slipr: ${el.dataset.embed} embed failed:`, err);
    const box = el.ownerDocument.createElement('div');
    box.className = 'slipr-embed-error';
    box.setAttribute('role', 'note');
    const badge = el.ownerDocument.createElement('span');
    badge.className = 'slipr-embed-error-badge';
    badge.textContent = def.errorLabel;
    const text = el.ownerDocument.createElement('pre');
    text.className = 'slipr-embed-error-text';
    text.textContent = err instanceof Error ? err.message : String(err);
    box.append(badge, text);
    el.append(box);
    el.dataset.embedState = 'error';
  }
}

/**
 * Click-to-load: a note naming the site and a Load button. Loading one embed
 * loads every waiting embed from the same site on the page.
 * @param {HTMLElement} el
 * @param {string} origin
 */
function showConsent(el, origin) {
  const doc = el.ownerDocument;
  const host = hostOf(origin);
  const box = doc.createElement('div');
  box.className = 'slipr-embed-consent';
  const note = doc.createElement('p');
  note.append('This content comes from ');
  const strong = doc.createElement('strong');
  strong.textContent = host;
  note.append(strong, '. Loading it contacts that site.');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'slipr-embed-load';
  button.textContent = 'Load';
  button.setAttribute('aria-label', `Load content from ${host}`);
  button.addEventListener('click', () => {
    grantConsent(origin);
    const waiting = /** @type {HTMLElement[]} */ ([...doc.querySelectorAll('[data-embed][data-embed-state="waiting"]')])
      .filter((other) => other.dataset.embedOrigin === origin);
    for (const other of waiting) {
      const def = EMBED_KINDS[other.dataset.embed ?? ''];
      if (def) hydrateOne(other, def);
    }
  });
  box.append(note, button);
  el.append(box);
  el.dataset.embedState = 'waiting';
}

/** @param {string} origin */
function hostOf(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/**
 * Add ./embeds.css to the document once.
 * @param {Document} doc
 */
function addEmbedStylesheet(doc) {
  if (doc.querySelector('link[data-slipr-embeds]')) return;
  const href = new URL('./embeds.css', import.meta.url).href;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.sliprEmbeds = '';
  // In a single-file export (I-054) stylesheets live in the file, not on a server.
  link.href = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(href) ?? href;
  doc.head.append(link);
}
