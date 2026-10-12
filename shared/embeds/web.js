// @ts-check
/**
 * Embed kind `web`: a web page in a sandboxed frame. Used by the reader
 * `embed` block; the audience `web` slot follows in I-071. Follows the embed
 * kind contract of ./index.js.
 *
 * A page on another server is click-to-load unless the author set
 * `load: "auto"` (D-011); a file next to show.json always loads directly.
 * The static fallback is a link card (or the author's fallback image), which
 * is also what prints, since a frame does not.
 */
import { escape } from '../markdown.js';
import { externalOrigin } from './consent.js';

/** No library: the browser's own frame. */
export const library = null;
/** Not rendered in editor thumbnails: a live page is too heavy there. */
export const thumbnail = false;
/** Label of the error box when the frame cannot be made. */
export const errorLabel = 'Page could not be shown';
/** The frame's sandbox: never allow-same-origin (that opt-in is I-071). */
export const FRAME_SANDBOX = 'allow-scripts allow-forms allow-popups';

/**
 * Addresses that are never embedded.
 * @param {string} url
 */
export function isBlockedUrl(url) {
  return /^\s*(javascript|data|vbscript):/i.test(String(url ?? ''));
}

/**
 * The frame's address: absolute http(s) URLs as they are, anything else relative to show.json.
 * @param {any} value  An embed block (`url`, `title`, `height`, `load`).
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
 * Attributes of the embed element. `data-embed-origin` (external pages
 * without `load: "auto"`) makes ./index.js ask before loading.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx) {
  const src = frameSrc(value, ctx);
  const origin = externalOrigin(String(value?.url ?? ''));
  /** @type {Record<string, string>} */
  const attrs = {
    'data-embed-src': src,
    'data-embed-title': String(value?.title ?? ''),
    'data-embed-height': String(frameHeight(value)),
    'data-embed-print': 'fallback',
  };
  if (origin && value?.load !== 'auto') attrs['data-embed-origin'] = origin;
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
 * Create the sandboxed frame in `live`.
 * @param {HTMLElement} el  The embed element (carries data-embed-src, -title, -height).
 * @param {HTMLElement} live
 */
export async function hydrate(el, live) {
  const src = el.dataset.embedSrc ?? '';
  if (!src || isBlockedUrl(src)) throw new Error('This address cannot be embedded.');
  const doc = el.ownerDocument;
  const frame = doc.createElement('iframe');
  // In a single-file export (I-054) a page from the show lives in the file.
  frame.src = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src;
  frame.title = el.dataset.embedTitle ?? '';
  frame.loading = 'lazy';
  frame.setAttribute('sandbox', FRAME_SANDBOX);
  frame.referrerPolicy = 'no-referrer';
  frame.style.height = `${Number(el.dataset.embedHeight) || 400}px`;
  live.replaceChildren(frame);
}
