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
 * A show can also be loaded from a folder handle (D-012):
 *
 *   const ctx = await loadShowFromFolder(createFolderSource(handle));
 *
 * Then images become blob: URLs, and a template ref that leaves the folder is
 * resolved by name against Slipr's own templates/ folder.
 *
 * Fetch failures and malformed JSON throw a LoadError (with a readable
 * message). Validation problems do NOT throw: they are returned in
 * `ctx.validation` so the caller can decide what to show.
 */
import { validateShow, validateTemplate, collectImagePaths } from './validate.js';
import { normalizePath } from './folder-source.js';

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
 * @property {(path: string) => Promise<Blob | null>} [readAsset]  Read a show file by its path: shows from a
 *   folder or a zip, whose files have no URL until read (map tiles, I-099). Absent for shows loaded by URL.
 * @property {(path: string) => string} resolveTemplateAsset  Resolve a path relative to template.json.
 * @property {(src: string, blob: Blob) => void} registerAsset  Make a file just added to the show folder
 *   resolvable (folder shows use blob: URLs; for URL shows the server serves it, so this does nothing).
 * @property {string[]} notices        Things the user should know that are not validation issues.
 * @property {import('./folder-source.js').FolderSource} [folder]  Set when loaded from a folder.
 */

/**
 * @typedef {object} LoadOptions
 * @property {typeof fetch} [fetch]   Injected for tests.
 * @property {string | URL} [baseUrl] Base for resolving `showUrl` (default: document location).
 * @property {boolean} [checkImages]  HEAD-request every image to warn about missing files (default true).
 */

/**
 * @typedef {object} FolderLoadOptions
 * @property {typeof fetch} [fetch]   Injected for tests (templates are still fetched).
 * @property {string | URL} [appBase] Slipr's root URL, where templates/ lives (default: one level above the page).
 * @property {(blob: Blob) => string} [createObjectURL]  Injected for tests.
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
  const ref = templateRef(show, showHref.href);
  const templateHref = new URL(ref.replace(/\/?$/, '/') + 'template.json', showHref);
  const { template, layouts } = await loadTemplate(templateHref, doFetch);

  let existing = /** @type {Set<string> | null} */ (null);
  if (options.checkImages !== false) {
    existing = await findExistingImages(collectImagePaths(show), showHref, doFetch);
  }

  return {
    show,
    template,
    showUrl: showHref,
    templateUrl: templateHref,
    layouts,
    validation: validateAll(show, template, existing ? (src) => existing.has(src) : undefined),
    resolveAsset: (src) => new URL(src, showHref).href,
    resolveTemplateAsset: (path) => new URL(path, templateHref).href,
    registerAsset: () => {},
    notices: [],
  };
}

/**
 * Load a show from a folder (File System Access handle, D-012).
 * @param {import('./folder-source.js').FolderSource} source
 * @param {FolderLoadOptions} [options]
 * @returns {Promise<ShowContext>}
 */
export async function loadShowFromFolder(source, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const appBase = new URL(options.appBase ?? new URL('../', globalThis.location?.href));
  const createObjectURL = options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
  const showHref = new URL(`slipr-folder:///${encodeURIComponent(source.name)}/show.json`);

  const text = await source.readText('show.json');
  if (text === null) {
    throw new LoadError(`The folder "${source.name}" has no show.json. Pick the folder that contains the show, or create a new show.`, { kind: 'fetch', url: showHref.href, status: 404 });
  }
  const show = parseJson(text, `show.json in the folder "${source.name}"`, showHref.href);
  const { href: templateHref, notice } = resolveFolderTemplate(templateRef(show, showHref.href), appBase);
  const { template, layouts } = await loadTemplate(templateHref, doFetch);

  /** @type {Map<string, string>} */
  const blobUrls = new Map();
  await Promise.all(collectImagePaths(show).map(async (src) => {
    const path = normalizePath(src);
    const file = path ? await source.readFile(path) : null;
    if (file) blobUrls.set(src, createObjectURL(file));
  }));
  // URLs and paths outside the folder can't be checked here; don't warn about them.
  const imageExists = (/** @type {string} */ src) => blobUrls.has(src) || normalizePath(src) === null;

  return {
    show,
    template,
    showUrl: showHref,
    templateUrl: templateHref,
    layouts,
    validation: validateAll(show, template, imageExists),
    resolveAsset: (src) => blobUrls.get(src) ?? src,
    readAsset: (path) => source.readFile(path),
    resolveTemplateAsset: (path) => new URL(path, templateHref).href,
    registerAsset: (src, blob) => {
      if (!blobUrls.has(src)) blobUrls.set(src, createObjectURL(blob));
    },
    notices: notice ? [notice] : [],
    folder: source,
  };
}

/**
 * Load a show from a zip source (I-087).
 * @param {import('./zip.js').ZipSource} source
 * @param {FolderLoadOptions} [options]
 * @returns {Promise<ShowContext>}
 */
export async function loadShowFromZip(source, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseHref = globalThis.location?.href ?? 'http://localhost:8080/viewer/';
  const appBase = new URL(options.appBase ?? new URL('../', baseHref));
  const createObjectURL = options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
  const showHref = new URL(`slipr-zip:///${encodeURIComponent(source.name)}/${source.prefix}show.json`);

  const text = await source.readText('show.json');
  if (text === null) {
    throw new LoadError(`The zip archive "${source.name}" has no show.json in "${source.prefix}".`, { kind: 'fetch', url: showHref.href, status: 404 });
  }
  const show = parseJson(text, `show.json in the zip archive "${source.name}"`, showHref.href);
  const { href: templateHref, notice } = resolveFolderTemplate(templateRef(show, showHref.href), appBase);
  const { template, layouts } = await loadTemplate(templateHref, doFetch);

  /** @type {Map<string, string>} */
  const blobUrls = new Map();
  await Promise.all(collectImagePaths(show).map(async (src) => {
    const path = normalizePath(src);
    const file = path ? await source.readFile(path) : null;
    if (file) blobUrls.set(src, createObjectURL(file));
  }));
  // URLs and paths outside the folder can't be checked here; don't warn about them.
  const imageExists = (/** @type {string} */ src) => blobUrls.has(src) || normalizePath(src) === null;

  return {
    show,
    template,
    showUrl: showHref,
    templateUrl: templateHref,
    layouts,
    validation: validateAll(show, template, imageExists),
    resolveAsset: (src) => blobUrls.get(src) ?? src,
    readAsset: (path) => source.readFile(path),
    resolveTemplateAsset: (path) => new URL(path, templateHref).href,
    registerAsset: (src, blob) => {
      if (!blobUrls.has(src)) blobUrls.set(src, createObjectURL(blob));
    },
    notices: notice ? [notice] : [],
    folder: source,
  };
}

/**
 * Where the template of a show loaded from a folder lives (D-012). A URL is used
 * as is. A ref that leaves the folder (`../../templates/default`, or the
 * root-relative `/templates/default` that new shows get) resolves by its last
 * segment against Slipr's `templates/` folder.
 * @param {string} ref    The show's `template.ref`.
 * @param {URL} appBase   Slipr's root URL.
 * @returns {{ href: URL, name: string | null, notice: string | null }}
 */
export function resolveFolderTemplate(ref, appBase) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return { href: new URL(ref.replace(/\/?$/, '/') + 'template.json'), name: null, notice: null };
  }
  if (!ref.startsWith('/') && normalizePath(ref) !== null) {
    throw new LoadError(`The show's template ("${ref}") is inside the show folder. That isn't supported yet: use a template from Slipr's templates folder, for example "/templates/default".`, { kind: 'template' });
  }
  const name = ref.split(/[\\/]/).filter((part) => part !== '' && part !== '.' && part !== '..').pop();
  if (!name) {
    throw new LoadError(`The show's template ref "${ref}" does not name a template.`, { kind: 'template' });
  }
  const href = new URL(`templates/${encodeURIComponent(name)}/template.json`, appBase);
  const canonical = ref.replace(/\/$/, '') === `/templates/${name}`;
  const notice = canonical
    ? null
    : `The show's template ref "${ref}" points outside its folder, so the template "${name}" from Slipr's templates folder is used.`;
  return { href, name, notice };
}

/**
 * @param {any} show @param {string} where  URL for the error.
 * @returns {string}
 */
function templateRef(show, where) {
  const ref = show?.template?.ref;
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new LoadError('The show does not say which template it uses (missing "template.ref").', { kind: 'template', url: where });
  }
  return ref;
}

/**
 * Load template.json and its layout fragments.
 * @param {URL} templateHref @param {typeof fetch} doFetch
 */
async function loadTemplate(templateHref, doFetch) {
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
  return { template, layouts };
}

/**
 * Validate the show and its template together.
 * @param {any} show @param {any} template @param {((src: string) => boolean) | undefined} imageExists
 * @returns {import('./validate.js').ValidationResult}
 */
function validateAll(show, template, imageExists) {
  const templateResult = validateTemplate(template);
  const showResult = validateShow(show, { template, imageExists });
  const prefix = (/** @type {import('./schema-check.js').Issue} */ i) => ({ ...i, path: `template: ${i.path || '(root)'}` });
  return {
    ok: templateResult.ok && showResult.ok,
    errors: [...templateResult.errors.map(prefix), ...showResult.errors],
    warnings: [...templateResult.warnings.map(prefix), ...showResult.warnings],
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
  return parseJson(text, `${what} file ${url.href}`, url.href);
}

/**
 * @param {string} text @param {string} label  What the text is, for the message. @param {string} href
 */
function parseJson(text, label, href) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new LoadError(`The ${label} is not valid JSON: ${detail}`, { kind: 'parse', url: href, cause });
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
