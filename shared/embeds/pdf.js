// @ts-check
/**
 * Embed kind `pdf`: a PDF document (I-072), as the audience `pdf` slot and the
 * reader `pdf` block, rendered with the vendored PDF.js (D-002, D-011; lazy-
 * loaded when the first PDF is hydrated). Follows the embed kind contract of
 * ./index.js.
 *
 * - The value names the file in `pdf` (not `src`, so it can never be taken
 *   for an image value), a `title`, and optionally `page` (one page) or
 *   `pages: [first, last]` (a range).
 * - Audience slot: the page fits the slot. With a range, the slide carries one
 *   hidden Reveal fragment per further page, and each click steps one page.
 * - Reader block: the page fills the column width, with a bar for page
 *   navigation (within the range), zoom and "Open PDF". A slot in reader mode
 *   fits the slide, with a compact bar.
 * - A PDF on another server (https; its server must allow CORS) is
 *   click-to-load in reader mode unless `load: "auto"`; files next to
 *   show.json load directly.
 * - Reader search gets the text of the shown pages via `extractPdfText()`.
 *
 * The markup functions and `pdfEntries()` are DOM-free; hydration needs a browser.
 */
import { escape } from '../markdown.js';
import { externalOrigin } from './consent.js';

/** Vendor folder (relative to the Slipr root); the export leaves it out of shows without PDFs. */
export const library = 'vendor/pdfjs-4.10.38/';
/** Not rendered in editor thumbnails (a PDF can be large, or on another server). */
export const thumbnail = false;
/** Label of the error box when the PDF cannot be shown. */
export const errorLabel = 'PDF could not be shown';
/** Reader search reads at most this many pages per PDF. */
export const SEARCH_PAGE_LIMIT = 200;
const ZOOMS = [1, 1.5, 2, 3];

/**
 * Is this a PDF value (slot value or block)?
 * @param {any} value
 */
export function isPdf(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.pdf === 'string');
}

/**
 * The PDF's address: https URLs as they are, anything else relative to show.json.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 */
export function pdfUrl(value, ctx) {
  const url = String(value?.pdf ?? '').trim();
  return /^https?:/i.test(url) ? url : ctx.resolveAsset(url);
}

/**
 * The page range a value asks for: `[first, last]`, with `last` null for
 * "to the end". `pages` wins over `page`; a reversed range is put in order.
 * @param {any} value
 * @returns {[number, number | null]}
 */
export function pageRange(value) {
  const n = (/** @type {unknown} */ x) => (Number.isInteger(x) && /** @type {number} */ (x) >= 1 ? /** @type {number} */ (x) : null);
  if (Array.isArray(value?.pages) && n(value.pages[0]) && n(value.pages[1])) {
    const [a, b] = /** @type {[number, number]} */ (value.pages);
    return [Math.min(a, b), Math.max(a, b)];
  }
  const page = n(value?.page);
  return page ? [page, page] : [1, null];
}

/**
 * "page 3", "pages 3–7" or "" (the whole document).
 * @param {any} value
 */
export function pageLabel(value) {
  const [first, last] = pageRange(value);
  if (last === null) return '';
  return first === last ? `page ${first}` : `pages ${first}–${last}`;
}

/**
 * @typedef {object} PdfOptions
 * @property {'audience' | 'reader'} [mode]  Default 'reader'.
 * @property {boolean} [slot]  A slot on a slide (fits the slot), not a reader block.
 */

/**
 * Attributes of the embed element.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {PdfOptions} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  const mode = options.mode ?? 'reader';
  const [first, last] = pageRange(value);
  /** @type {Record<string, string>} */
  const attrs = {
    'data-embed-pdf': pdfUrl(value, ctx),
    'data-embed-title': String(value?.title ?? ''),
    'data-pdf-first': String(first),
    'data-pdf-bar': options.slot ? (mode === 'audience' ? 'none' : 'compact') : 'full',
  };
  if (last !== null) attrs['data-pdf-last'] = String(last);
  const origin = externalOrigin(String(value?.pdf ?? ''));
  if (mode === 'reader' && origin && value?.load !== 'auto') attrs['data-embed-origin'] = origin;
  return attrs;
}

/**
 * Static content without a fallback image: a card with the title, which
 * pages, the source and an "Open PDF" link.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @returns {{ html: string, fallback: 'card' }}
 */
export function staticHtml(value, ctx) {
  const url = pdfUrl(value, ctx);
  const origin = externalOrigin(String(value?.pdf ?? ''));
  const [first] = pageRange(value);
  const label = pageLabel(value);
  return {
    html: `<div class="slipr-embed-card"><span class="slipr-embed-card-title">${escape(String(value?.title ?? ''))}</span>`
      + `<span class="slipr-embed-card-site">PDF${label ? ` · ${escape(label)}` : ''} · ${escape(origin ? new URL(origin).host : 'File in this show')}</span>`
      + `<a class="slipr-embed-card-link" href="${escape(url)}#page=${first}" target="_blank" rel="noopener noreferrer">Open PDF</a></div>`,
    fallback: 'card',
  };
}

/**
 * Extra markup after the fallback: in an audience slot with a page range, one
 * hidden Reveal fragment per further page, so each click steps one page.
 * @param {any} value
 * @param {PdfOptions} [options]
 */
export function afterHtml(value, options = {}) {
  if (!options.slot || (options.mode ?? 'reader') !== 'audience') return '';
  const [first, last] = pageRange(value);
  if (last === null || last <= first) return '';
  let html = '';
  for (let page = first + 1; page <= last; page++) {
    html += `<span class="fragment slipr-pdf-step" data-pdf-page="${page}" aria-hidden="true"></span>`;
  }
  return html;
}

/**
 * Every PDF in a show, with where it is: `blockId` is the block's id, or
 * `slot:<name>` for a slot (the same ids reader search uses). DOM-free.
 * @param {any} show
 * @returns {{ slideId: string, blockId: string, value: any }[]}
 */
export function pdfEntries(show) {
  /** @type {{ slideId: string, blockId: string, value: any }[]} */
  const found = [];
  for (const slide of Array.isArray(show?.slides) ? show.slides : []) {
    for (const [name, value] of Object.entries(slide?.content && typeof slide.content === 'object' ? slide.content : {})) {
      if (isPdf(value)) found.push({ slideId: slide.id, blockId: `slot:${name}`, value });
    }
    for (const block of Array.isArray(slide?.reader?.blocks) ? slide.reader.blocks : []) {
      if (block?.type === 'pdf' && isPdf(block)) found.push({ slideId: slide.id, blockId: block.id, value: block });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Browser part: PDF.js, documents and pages.

/** @type {Promise<any> | null} */
let pdfjsPromise = null;
/** @type {Map<string, Promise<any>>} */
const documents = new Map();

/** Lazy-load the vendored PDF.js once, with its worker. */
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import(new URL('../../vendor/pdfjs-4.10.38/build/pdf.min.mjs', import.meta.url).href);
      const workerUrl = new URL('../../vendor/pdfjs-4.10.38/build/pdf.worker.min.mjs', import.meta.url).href;
      if (/** @type {any} */ (globalThis).SLIPR_BUNDLE) {
        // A single-file export (I-054) has no file to start a worker from: load the
        // worker module on the page instead (it sets globalThis.pdfjsWorker, which
        // PDF.js then uses in place of a worker).
        await import(workerUrl);
      } else {
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      return lib;
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

/**
 * Open a PDF once per address (cached).
 * @param {string} src  The resolved address.
 */
async function openDocument(src) {
  const url = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src;
  let promise = documents.get(url);
  if (!promise) {
    promise = (async () => {
      const lib = await getPdfjs();
      /** @type {Record<string, any>} */
      const params = { url, isEvalSupported: false };
      if (!(/** @type {any} */ (globalThis).SLIPR_BUNDLE)) {
        // Character maps and the standard fonts, so PDFs without embedded fonts render offline.
        params.cMapUrl = new URL('../../vendor/pdfjs-4.10.38/cmaps/', import.meta.url).href;
        params.cMapPacked = true;
        params.standardFontDataUrl = new URL('../../vendor/pdfjs-4.10.38/standard_fonts/', import.meta.url).href;
      }
      return lib.getDocument(params).promise;
    })();
    promise.catch(() => documents.delete(url));
    documents.set(url, promise);
  }
  return promise;
}

/**
 * The text of pages `first`…`last` of a PDF (one string per page), for
 * reader search. At most SEARCH_PAGE_LIMIT pages.
 * @param {string} src  The resolved address.
 * @param {number} first
 * @param {number | null} last  null: to the end.
 * @returns {Promise<{ page: number, text: string }[]>}
 */
export async function extractPdfText(src, first, last) {
  const doc = await openDocument(src);
  const end = Math.min(last ?? doc.numPages, doc.numPages, first + SEARCH_PAGE_LIMIT - 1);
  /** @type {{ page: number, text: string }[]} */
  const pages = [];
  for (let n = Math.max(1, first); n <= end; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((/** @type {any} */ item) => `${item.str ?? ''}${item.hasEOL ? '\n' : ''}`).join('').replace(/[ \t]+/g, ' ').trim();
    if (text) pages.push({ page: n, text });
  }
  return pages;
}

/**
 * Render the PDF into `live`: a page (fitted or full width), and the bar.
 * Listens for `slipr:pdf-page` (detail: page number) to go to a page, e.g.
 * from a search result; `data-pdf-goto` sets the page to open at.
 * @param {HTMLElement} el  The embed element (carries the data-* attributes).
 * @param {HTMLElement} live
 */
export async function hydrate(el, live) {
  const src = el.dataset.embedPdf ?? '';
  if (!src) throw new Error('No PDF file given.');
  const doc = await openDocument(src);
  const ownerDoc = el.ownerDocument;
  const title = el.dataset.embedTitle ?? 'PDF';
  const first = Math.min(Math.max(1, Number(el.dataset.pdfFirst) || 1), doc.numPages);
  const last = Math.min(Math.max(first, Number(el.dataset.pdfLast) || doc.numPages), doc.numPages);
  const bar = el.dataset.pdfBar ?? 'full';
  const fit = bar !== 'full';
  let current = Math.min(last, Math.max(first, Number(el.dataset.pdfGoto) || first));
  let zoom = 0; // index into ZOOMS
  /** @type {any} */
  let task = null;

  const frame = ownerDoc.createElement('div');
  frame.className = `slipr-pdf-page${fit ? ' slipr-pdf-page--fit' : ''}`;
  const canvas = ownerDoc.createElement('canvas');
  canvas.setAttribute('role', 'img');
  frame.append(canvas);
  const text = ownerDoc.createElement('div');
  text.className = 'slipr-pdf-text'; // the page's text for screen readers (reader mode)

  const status = ownerDoc.createElement('span');
  status.className = 'slipr-pdf-status';
  status.setAttribute('aria-live', 'polite');
  /** @param {string} label @param {string} symbol @param {() => void} action */
  const button = (label, symbol, action) => {
    const b = ownerDoc.createElement('button');
    b.type = 'button';
    b.className = 'slipr-pdf-button';
    b.textContent = symbol;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', action);
    return b;
  };
  const prev = button('Previous page', '‹', () => go(current - 1));
  const next = button('Next page', '›', () => go(current + 1));
  const zoomOut = button('Zoom out', '−', () => { zoom = Math.max(0, zoom - 1); render(); });
  const zoomIn = button('Zoom in', '+', () => { zoom = Math.min(ZOOMS.length - 1, zoom + 1); render(); });
  const open = ownerDoc.createElement('a');
  open.className = 'slipr-embed-open';
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = 'Open PDF ↗';

  /** @type {HTMLElement[]} */
  const parts = [frame];
  if (bar !== 'none') {
    const tools = ownerDoc.createElement('div');
    tools.className = 'slipr-pdf-bar';
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', `${title}: pages`);
    tools.append(prev, status, next);
    if (bar === 'full') tools.append(zoomOut, zoomIn);
    tools.append(open);
    parts.push(tools);
    if (bar === 'full') parts.push(text);
  }
  live.replaceChildren(...parts);

  const render = async () => {
    const page = await doc.getPage(current);
    const base = page.getViewport({ scale: 1 });
    let scale;
    if (fit) {
      const w = el.clientWidth || 800;
      const h = (el.clientHeight || 450) - (bar === 'none' ? 0 : 36);
      scale = Math.min(w / base.width, Math.max(40, h) / base.height);
    } else {
      scale = ((frame.clientWidth || el.clientWidth || 640) / base.width) * ZOOMS[zoom];
    }
    const ratio = globalThis.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * ratio });
    task?.cancel();
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    canvas.setAttribute('aria-label', `${title}, page ${current} of ${doc.numPages}`);
    // intent "print": PDF.js then paints without requestAnimationFrame, so a page
    // also renders in a hidden or background tab (it would otherwise wait until
    // the tab is shown). It leaves out annotations meant for screens only.
    task = page.render({ canvasContext: /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')), viewport, intent: 'print' });
    try {
      await task.promise;
    } catch (err) {
      if (/** @type {any} */ (err)?.name !== 'RenderingCancelledException') throw err;
    }
    status.textContent = first === last ? `Page ${current}`
      : first === 1 && last === doc.numPages ? `Page ${current} of ${doc.numPages}`
        : `Page ${current} (pages ${first}–${last})`;
    prev.disabled = current <= first;
    next.disabled = current >= last;
    zoomOut.disabled = zoom === 0;
    zoomIn.disabled = zoom === ZOOMS.length - 1;
    open.href = `${/** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src}#page=${current}`;
    if (bar === 'full') {
      const content = await page.getTextContent();
      text.textContent = content.items.map((/** @type {any} */ item) => item.str ?? '').join(' ');
    }
  };
  /** @param {number} page */
  const go = (page) => {
    const target = Math.min(last, Math.max(first, page));
    if (target === current) return;
    current = target;
    render().catch((err) => console.warn('Slipr: PDF page render failed:', err));
  };

  await render();

  // Audience mode: Reveal shows the step fragments one by one (class "visible").
  const steps = /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-pdf-step')]);
  if (steps.length) {
    const sync = () => go(first + steps.filter((s) => s.classList.contains('visible')).length);
    new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
  el.addEventListener('slipr:pdf-page', (e) => go(Number(/** @type {CustomEvent} */ (e).detail) || first));
  // Re-fit when the space changes (window, reader column, slide scaling).
  let width = el.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - width) < 2) return;
    width = el.clientWidth;
    render().catch(() => {});
  }).observe(el);
}
