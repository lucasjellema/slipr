// @ts-check
/**
 * Load a show together with its template and layout fragments, and validate it.
 *
 *   const ctx = await loadShow('../shows/demo/show.json');
 *   if (!ctx.validation.ok) …show errors…
 *
 * Paths: `template.ref` is resolved against show.json; layout files, theme and
 * reader CSS against template.json; image `src` against show.json.
 *
 * Fetch failures and malformed JSON throw a LoadError (with a readable
 * message). Validation problems do NOT throw: they are returned in
 * `ctx.validation` so the caller can decide what to show.
 */
import { validateShow, validateTemplate, collectImagePaths } from './validate.js';

/**
 * @typedef {object} LayoutInfo
 * @property {any} def       The layout entry from template.json.
 * @property {string} html   The layout's HTML fragment.
 * @property {URL} base      URL of the fragment file (for resolving relative URLs in it).
 */

/**
 * @typedef {object} ShowContext
 * @property {any} show
 * @property {any} template
 * @property {URL} showUrl
 * @property {URL} templateUrl         URL of template.json
 * @property {Map<string, LayoutInfo>} layouts
 * @property {import('./validate.js').ValidationResult} validation  show + template issues combined
 * @property {(src: string) => string} resolveAsset  Resolve a path relative to show.json.
 * @property {(path: string) => string} resolveTemplateAsset  Resolve a path relative to template.json.
 */

/**
 * @typedef {object} LoadOptions
 * @property {typeof fetch} [fetch]   Injected for tests.
 * @property {string | URL} [baseUrl] Base for resolving `showUrl` (default: document location).
 * @property {boolean} [checkImages]  HEAD-request every image to warn about missing files (default true).
 */

export class LoadError extends Error {
  /**
   * @param {string} message  Human-readable explanation.
   * @param {{ url?: string, status?: number, cause?: unknown, kind: 'fetch' | 'parse' | 'template' }} details
   */
  constructor(message, details) {
    super(message, { cause: details.cause });
    this.name = 'LoadError';
    this.kind = details.kind;
    this.url = details.url;
    this.status = details.status;
  }
}

/**
 * @param {string | URL} showUrl  URL or path of show.json.
 * @param {LoadOptions} [options]
 * @returns {Promise<ShowContext>}
 */
export async function loadShow(showUrl, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = options.baseUrl ?? globalThis.location?.href;
  const showHref = new URL(showUrl, base);

  const show = await fetchJson(showHref, doFetch, 'show');
  const ref = show?.template?.ref;
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new LoadError('The show does not say which template it uses (missing "template.ref").', { kind: 'template', url: showHref.href });
  }
  const templateHref = new URL(ref.replace(/\/?$/, '/') + 'template.json', showHref);
  const template = await fetchJson(templateHref, doFetch, 'template');

  /** @type {Map<string, LayoutInfo>} */
  const layouts = new Map();
  const layoutDefs = Array.isArray(template?.layouts) ? template.layouts : [];
  await Promise.all(layoutDefs.map(async (def) => {
    if (typeof def?.id !== 'string' || typeof def?.file !== 'string') return;
    const url = new URL(def.file, templateHref);
    const html = await fetchText(url, doFetch, `layout "${def.id}"`);
    layouts.set(def.id, { def, html, base: url });
  }));

  let existing = /** @type {Set<string> | null} */ (null);
  if (options.checkImages !== false) {
    existing = await findExistingImages(collectImagePaths(show), showHref, doFetch);
  }

  const templateResult = validateTemplate(template);
  const showResult = validateShow(show, {
    template,
    imageExists: existing ? (src) => existing.has(src) : undefined,
  });
  const prefix = (/** @type {import('./schema-check.js').Issue} */ i) => ({ ...i, path: `template: ${i.path || '(root)'}` });
  const validation = {
    ok: templateResult.ok && showResult.ok,
    errors: [...templateResult.errors.map(prefix), ...showResult.errors],
    warnings: [...templateResult.warnings.map(prefix), ...showResult.warnings],
  };

  return {
    show,
    template,
    showUrl: showHref,
    templateUrl: templateHref,
    layouts,
    validation,
    resolveAsset: (src) => new URL(src, showHref).href,
    resolveTemplateAsset: (path) => new URL(path, templateHref).href,
  };
}

/**
 * @param {URL} url @param {typeof fetch} doFetch @param {string} what
 */
async function fetchText(url, doFetch, what) {
  let response;
  try {
    response = await doFetch(url.href);
  } catch (cause) {
    throw new LoadError(`Could not load the ${what} from ${url.href}. Is the Slipr dev server running (npm run serve)? Opening files directly (file://) does not work.`, { kind: 'fetch', url: url.href, cause });
  }
  if (!response.ok) {
    const hint = response.status === 404 ? ' The file was not found; check the path.' : '';
    throw new LoadError(`Could not load the ${what}: ${url.href} answered ${response.status} ${response.statusText}.${hint}`, { kind: 'fetch', url: url.href, status: response.status });
  }
  return response.text();
}

/**
 * @param {URL} url @param {typeof fetch} doFetch @param {string} what
 */
async function fetchJson(url, doFetch, what) {
  const text = await fetchText(url, doFetch, what);
  try {
    return JSON.parse(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new LoadError(`The ${what} file ${url.href} is not valid JSON: ${detail}`, { kind: 'parse', url: url.href, cause });
  }
}

/**
 * HEAD-request each image; network failures count as "exists" so that an
 * offline check never produces false warnings.
 * @param {string[]} srcs @param {URL} showHref @param {typeof fetch} doFetch
 */
async function findExistingImages(srcs, showHref, doFetch) {
  const found = new Set();
  await Promise.all(srcs.map(async (src) => {
    try {
      const response = await doFetch(new URL(src, showHref).href, { method: 'HEAD' });
      if (response.ok || response.status === 405) found.add(src);
    } catch {
      found.add(src);
    }
  }));
  return found;
}
