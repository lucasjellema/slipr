// @ts-check
/**
 * Embed kind `web`: a web page in a sandboxed frame (I-070, I-071), as the
 * audience `web` slot and the reader `embed` block. Follows the embed kind
 * contract of ./index.js.
 *
 * - Reader mode: a page on another server is click-to-load unless the author
 *   set `load: "auto"` (D-011); a file next to show.json loads directly.
 * - Audience mode (slots): `present: "live"` (default) loads the page on the
 *   slide without asking (the presenter's own laptop); `"static"` shows the
 *   fallback screenshot and never contacts the page.
 * - The sandbox is `allow-scripts allow-forms allow-popups`, plus the
 *   author's `allow` extras. `same-origin` only applies to pages on other
 *   servers: a file in the show folder shares Slipr's origin, and with scripts
 *   it could lift its own sandbox and read the reader's notes.
 * - The static fallback is a link card (or the author's fallback image), which
 *   is also what prints. Once loaded, an "Open in new tab" link stays below
 *   the frame, for sites that refuse to be framed.
 */
import { escape } from '../markdown.js';
import { externalOrigin } from './consent.js';

/** No library: the browser's own frame. */
export const library = null;
/** Not rendered in editor thumbnails: a live page is too heavy there. */
export const thumbnail = false;
/** Label of the error box when the frame cannot be made. */
export const errorLabel = 'Page could not be shown';
/** The frame's base sandbox. */
export const FRAME_SANDBOX = 'allow-scripts allow-forms allow-popups';
/** `allow` value → sandbox token (`fullscreen` is a frame permission instead). */
const SANDBOX_EXTRAS = /** @type {Record<string, string>} */ ({
  'same-origin': 'allow-same-origin',
  modals: 'allow-modals',
  downloads: 'allow-downloads',
  presentation: 'allow-presentation',
});
/** The values `allow` may hold, in display order. */
export const ALLOW_OPTIONS = ['same-origin', 'fullscreen', 'modals', 'downloads', 'presentation'];

/**
 * @typedef {object} WebOptions
 * @property {'audience' | 'reader'} [mode]  Default 'reader'.
 * @property {boolean} [slot]  A slot on a slide: the layout decides the size.
 */

/**
 * Addresses that are never embedded.
 * @param {string} url
 */
export function isBlockedUrl(url) {
  return /^\s*(javascript|data|vbscript):/i.test(String(url ?? ''));
}

/**
 * Is this a web slot value (`{ url, title, … }`)?
 * @param {any} value
 */
export function isWeb(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.url === 'string');
}

/**
 * The frame's address: absolute http(s) URLs as they are, anything else relative to show.json.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 */
export function frameSrc(value, ctx) {
  const url = String(value?.url ?? '').trim();
  return /^https?:/i.test(url) ? url : ctx.resolveAsset(url);
}

/**
 * The frame height in pixels (at least 100, default 400).
 * @param {any} value
 */
export function frameHeight(value) {
  return Math.max(100, Number(value?.height) || 400);
}

/**
 * The aspect ratio as CSS (`16 / 9`), or null.
 * @param {any} value
 */
export function frameAspect(value) {
  const m = /^([1-9]\d{0,3}):([1-9]\d{0,3})$/.exec(String(value?.aspect ?? ''));
  return m ? `${m[1]} / ${m[2]}` : null;
}

/**
 * The sandbox attribute for this embed: the base plus the author's extras.
 * `same-origin` is dropped for pages that are not on another server.
 * @param {any} value
 */
export function frameSandbox(value) {
  const external = externalOrigin(String(value?.url ?? '')) !== null;
  const extras = (Array.isArray(value?.allow) ? value.allow : [])
    .filter((/** @type {string} */ a) => a !== 'same-origin' || external)
    .map((/** @type {string} */ a) => SANDBOX_EXTRAS[a])
    .filter(Boolean);
  return [FRAME_SANDBOX, ...new Set(extras)].join(' ');
}

/**
 * Attributes of the embed element. `data-embed-origin` makes ./index.js ask
 * before loading; `data-embed-static` keeps the fallback.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {WebOptions} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  const mode = options.mode ?? 'reader';
  const src = frameSrc(value, ctx);
  const origin = externalOrigin(String(value?.url ?? ''));
  /** @type {Record<string, string>} */
  const attrs = {
    'data-embed-src': src,
    'data-embed-title': String(value?.title ?? ''),
    'data-embed-sandbox': frameSandbox(value),
    'data-embed-print': 'fallback',
  };
  if (Array.isArray(value?.allow) && value.allow.includes('fullscreen')) attrs['data-embed-fullscreen'] = '';
  if (!options.slot) {
    const aspect = frameAspect(value);
    if (aspect) attrs['data-embed-aspect'] = aspect;
    else attrs['data-embed-height'] = String(frameHeight(value));
  }
  if (mode === 'audience') {
    if (value?.present === 'static') attrs['data-embed-static'] = '';
  } else if (origin && value?.load !== 'auto') {
    attrs['data-embed-origin'] = origin;
  }
  return attrs;
}

/**
 * Static content without a fallback image: a card with the title, the site
 * and an "Open in new tab" link.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @returns {{ html: string, fallback: 'card' }}
 */
export function staticHtml(value, ctx) {
  const src = frameSrc(value, ctx);
  const origin = externalOrigin(String(value?.url ?? ''));
  const site = origin ? new URL(origin).host : 'File in this show';
  return {
    html: `<div class="slipr-embed-card"><span class="slipr-embed-card-title">${escape(String(value?.title ?? ''))}</span>`
      + `<span class="slipr-embed-card-site">${escape(site)}</span>`
      + `<a class="slipr-embed-card-link" href="${escape(src)}" target="_blank" rel="noopener noreferrer">Open in new tab</a></div>`,
    fallback: 'card',
  };
}

/**
 * Create the sandboxed frame in `live`, with an "Open in new tab" link below.
 * @param {HTMLElement} el  The embed element (carries the data-embed-* attributes).
 * @param {HTMLElement} live
 */
export async function hydrate(el, live) {
  const src = el.dataset.embedSrc ?? '';
  if (!src || isBlockedUrl(src)) throw new Error('This address cannot be embedded.');
  const doc = el.ownerDocument;
  // In a single-file export (I-054) a page from the show lives in the file.
  const href = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src;
  const frame = doc.createElement('iframe');
  frame.className = 'slipr-embed-frame';
  frame.src = href;
  frame.title = el.dataset.embedTitle ?? '';
  frame.loading = 'lazy';
  frame.setAttribute('sandbox', el.dataset.embedSandbox || FRAME_SANDBOX);
  frame.referrerPolicy = 'no-referrer';
  if (el.dataset.embedFullscreen !== undefined) {
    frame.allow = 'fullscreen';
    frame.allowFullscreen = true;
  }
  if (el.dataset.embedAspect) frame.style.aspectRatio = el.dataset.embedAspect;
  else if (el.dataset.embedHeight) frame.style.height = `${Number(el.dataset.embedHeight) || 400}px`;
  const open = doc.createElement('a');
  open.className = 'slipr-embed-open';
  open.href = href;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = 'Open in new tab ↗';
  open.setAttribute('aria-label', `Open ${el.dataset.embedTitle || 'the page'} in a new tab`);
  live.replaceChildren(frame, open);
}
