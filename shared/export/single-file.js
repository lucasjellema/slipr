// @ts-check
/**
 * Single-file HTML export (I-054): pack a show, its template and the viewer
 * into one HTML file that presents offline. Spec: docs/specs/I-054-single-file-export.md
 *
 * DOM-free and environment-free: all file access goes through `readFile(path)`
 * (paths relative to the Slipr folder, with `/`), so the same code runs in Node
 * (`npm run export`) and in the browser (the editor).
 *
 * In the output, every file has a virtual address under VIRTUAL_ROOT. ES modules
 * go into an import map as `data:` URLs, with their relative imports and
 * `import.meta.url` rewritten to virtual addresses; all other files go into an
 * embedded file table served by a small runtime (`globalThis.SLIPR_BUNDLE`).
 */
import { collectImagePaths } from '../validate.js';
import { EMBED_KINDS, usedEmbedKinds } from '../embeds/index.js';

export const VIRTUAL_ROOT = 'https://slipr.invalid/';

/** @typedef {(path: string) => Promise<Uint8Array | null>} ReadFile */
/** @typedef {{ type: string, text?: string, b64?: string }} BundledFile */

const MIME = /** @type {Record<string, string>} */ ({
  js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', css: 'text/css', html: 'text/html',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', ico: 'image/x-icon',
  txt: 'text/plain', md: 'text/markdown', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm',
});
const TEXT_TYPES = new Set(['text/javascript', 'application/json', 'text/css', 'text/html', 'image/svg+xml', 'text/plain', 'text/markdown']);

/** @param {string} path */
export function mimeType(path) {
  return MIME[/\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/**
 * Resolve `..` and `.` in a `/`-separated path. null if it leaves the root.
 * @param {string} path
 * @returns {string | null}
 */
export function normalizePath(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

/**
 * `rel` relative to the folder of `fromFile` (both `/`-separated). Query and hash are dropped.
 * @param {string} fromFile @param {string} rel
 */
export function resolvePath(fromFile, rel) {
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/') + 1) : '';
  return normalizePath(dir + rel.split(/[?#]/)[0]);
}

/** Absolute URL, data: URI, in-page anchor or protocol-relative: left alone. */
const NOT_RELATIVE = /^([a-z][a-z0-9+.-]*:|#|\/\/)/i;

/** Relative module specifiers in static imports, `import './x'`, `export … from` and dynamic `import('./x')`. */
const IMPORT_SPECIFIER = /(\b(?:from|import)\s*\(?\s*)(["'])(\.{1,2}\/[^"'\n]+)\2/g;
/** `new URL('literal', import.meta.url)`: files a module loads next to itself. */
const META_URL = /new URL\(\s*(["'])([^"'\n]+)\1\s*,\s*import\.meta\.url\s*\)/g;

/**
 * Rewrite a module for the bundle: relative import specifiers become virtual
 * URLs, `import.meta.url` becomes the module's own virtual URL.
 * @param {string} source
 * @param {string} path  The module's path.
 * @returns {{ code: string, imports: string[], metaUrls: string[] }}
 *   imports: paths of the modules it imports; metaUrls: paths it builds with import.meta.url.
 */
export function rewriteModule(source, path) {
  /** @type {string[]} */
  const imports = [];
  /** @type {string[]} */
  const metaUrls = [];
  for (const m of source.matchAll(META_URL)) {
    if (m[2].endsWith('/')) continue;   // a folder, not a file
    const target = resolvePath(path, m[2]);
    if (target) metaUrls.push(target);
  }
  let code = source.replace(IMPORT_SPECIFIER, (whole, lead, quote, spec) => {
    const target = resolvePath(path, spec);
    if (!target) return whole;
    imports.push(target);
    return `${lead}${quote}${VIRTUAL_ROOT}${target}${quote}`;
  });
  code = code.replace(/\bimport\.meta\.url\b/g, JSON.stringify(VIRTUAL_ROOT + path));
  return { code, imports: [...new Set(imports)], metaUrls: [...new Set(metaUrls)] };
}

/**
 * Base64 of bytes (browser and Node: both have btoa).
 * @param {Uint8Array} bytes
 */
export function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** @param {Uint8Array} bytes @param {string} type */
const dataUri = (bytes, type) => `data:${type};base64,${toBase64(bytes)}`;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Replace relative `url(…)`s in CSS with data: URIs.
 * @param {string} css @param {string} cssPath @param {ReadFile} readFile @param {string[]} warnings
 */
export async function inlineCssUrls(css, cssPath, readFile, warnings) {
  const found = [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)];
  /** @type {Map<string, string>} */
  const uris = new Map();
  for (const m of found) {
    const ref = m[2].trim();
    if (NOT_RELATIVE.test(ref) || uris.has(ref)) continue;
    const target = resolvePath(cssPath, ref);
    const bytes = target ? await readFile(target) : null;
    if (!bytes) {
      warnings.push(`${cssPath}: ${ref} not found; left out`);
      continue;
    }
    uris.set(ref, dataUri(bytes, mimeType(target ?? ref)));
  }
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, q, ref) => {
    const uri = uris.get(ref.trim());
    return uri ? `url("${uri}")` : whole;
  });
}

/**
 * Replace relative src/href in an HTML fragment (a layout) with data: URIs.
 * @param {string} html @param {string} htmlPath @param {ReadFile} readFile @param {string[]} warnings
 */
export async function inlineHtmlUrls(html, htmlPath, readFile, warnings) {
  const pattern = /\b(src|href)=(["'])([^"']+)\2/g;
  /** @type {Map<string, string>} */
  const uris = new Map();
  for (const m of html.matchAll(pattern)) {
    const ref = m[3];
    if (NOT_RELATIVE.test(ref) || uris.has(ref)) continue;
    const target = resolvePath(htmlPath, ref);
    const bytes = target ? await readFile(target) : null;
    if (!bytes) {
      warnings.push(`${htmlPath}: ${ref} not found; left out`);
      continue;
    }
    uris.set(ref, dataUri(bytes, mimeType(target ?? ref)));
  }
  return html.replace(pattern, (whole, attr, q, ref) => {
    const uri = uris.get(ref);
    return uri ? `${attr}=${q}${uri}${q}` : whole;
  });
}

/**
 * Where the show's template lives (a folder path), from `template.ref`.
 * Root-relative refs (`/templates/x`) and refs that leave the Slipr folder
 * resolve by name to `templates/<name>` (as for shows opened from a folder, D-012).
 * @param {string} showDir @param {string} ref
 */
export function templateFolder(showDir, ref) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return null;   // a URL: not packable
  const clean = ref.replace(/\/+$/, '');
  if (clean.startsWith('/')) return normalizePath(clean);
  const joined = normalizePath(`${showDir}/${clean}`);
  if (joined !== null) return joined;
  const name = clean.split('/').filter((p) => p && p !== '.' && p !== '..').pop();
  return name ? `templates/${name}` : null;
}

/**
 * Show-relative files the show needs besides show.json: images (slots, cards,
 * image blocks), slide background images and embed pages in the show folder.
 * @param {any} show
 * @returns {string[]}
 */
export function showFiles(show) {
  const files = new Set(collectImagePaths(show));
  for (const slide of Array.isArray(show?.slides) ? show.slides : []) {
    const bg = slide?.audience?.background;
    if (typeof bg === 'string' && /\.[a-z0-9]{2,5}$/i.test(bg) && !NOT_RELATIVE.test(bg)) files.add(bg);
    for (const block of Array.isArray(slide?.reader?.blocks) ? slide.reader.blocks : []) {
      if (block?.type === 'embed' && typeof block.url === 'string' && block.url && !NOT_RELATIVE.test(block.url)) files.add(block.url);
    }
  }
  return [...files].filter((f) => typeof f === 'string' && f && !NOT_RELATIVE.test(f));
}

/**
 * Vendor folders of embed kinds the show does not use (I-070): their libraries
 * are loaded by computed URL, so they stay out of the file.
 * @param {any} show
 * @returns {string[]}
 */
const unusedLibraries = (show) => {
  const used = usedEmbedKinds(show);
  return Object.entries(EMBED_KINDS)
    .filter(([kind, def]) => def.library && !used.has(kind))
    .map(([, def]) => /** @type {string} */ (def.library));
};

/** JSON for inside a <script> element: `<` escaped so `</script>` cannot end it. */
const scriptJson = (/** @type {any} */ value) => JSON.stringify(value).replace(/</g, '\\u003c');

/** @param {string} text */
const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** The bundle runtime (a classic script; runs before any module). */
const RUNTIME = `(() => {
  const ROOT = ${JSON.stringify(VIRTUAL_ROOT)};
  const files = JSON.parse(document.getElementById('slipr-files').textContent);
  const urls = new Map();
  const bytes = (f) => f.b64 != null ? Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(f.text);
  const key = (href) => {
    try {
      const u = new URL(String(href));
      return u.href.startsWith(ROOT) ? decodeURIComponent(u.pathname.slice(1)) : null;
    } catch { return null; }
  };
  globalThis.SLIPR_BUNDLE = {
    root: ROOT,
    showUrl: ROOT + 'show/show.json',
    /** A virtual URL as an object URL (images, stylesheets, embeds); other URLs unchanged. */
    url(href) {
      const k = key(href);
      if (!k || !files[k]) return href;
      if (!urls.has(k)) urls.set(k, URL.createObjectURL(new Blob([bytes(files[k])], { type: files[k].type })));
      return urls.get(k);
    },
    /** fetch() for virtual URLs, for loadShow(). */
    async fetch(href, init) {
      const k = key(href);
      const f = k && files[k];
      if (!f) return new Response('', { status: 404, statusText: 'Not in this file' });
      return new Response(init && init.method === 'HEAD' ? null : bytes(f), { status: 200, headers: { 'content-type': f.type } });
    },
  };
})();`;

/**
 * Pack a show into one HTML file.
 * @param {{ readFile: ReadFile, showDir: string, templateDir?: string, entry?: string, viewerCss?: string }} options
 *   showDir: the show folder (contains show.json), relative to the Slipr folder.
 * @returns {Promise<{ html: string, title: string, modules: string[], files: string[], warnings: string[] }>}
 */
export async function packShow({ readFile, showDir, templateDir, entry = 'viewer/js/main.js', viewerCss = 'viewer/css/viewer.css' }) {
  /** @type {string[]} */
  const warnings = [];
  const readText = async (/** @type {string} */ path) => {
    const bytes = await readFile(path);
    return bytes ? decoder.decode(bytes) : null;
  };
  const dir = normalizePath(showDir) ?? '';

  // ---- the show ----
  const showText = await readText(`${dir}/show.json`);
  if (showText === null) throw new Error(`No show.json in ${showDir}`);
  const show = JSON.parse(showText);
  const tplDir = templateDir ?? templateFolder(dir, String(show?.template?.ref ?? ''));
  if (!tplDir) throw new Error(`The show's template ("${show?.template?.ref}") is not a folder that can be packed.`);
  const template = JSON.parse((await readText(`${tplDir}/template.json`)) ?? 'null');
  if (!template) throw new Error(`No template.json in ${tplDir}`);

  /** @type {Record<string, BundledFile>} */
  const files = {};
  /** @param {string} path @param {Uint8Array | string} content @param {string} [type] */
  const addFile = (path, content, type = mimeType(path)) => {
    if (typeof content === 'string') files[path] = { type, text: content };
    else if (TEXT_TYPES.has(type)) files[path] = { type, text: decoder.decode(content) };
    else files[path] = { type, b64: toBase64(content) };
  };

  addFile('show/show.json', JSON.stringify({ ...show, template: { ...show.template, ref: '../template' } }));
  for (const rel of showFiles(show)) {
    const path = normalizePath(`${dir}/${rel}`);
    const bytes = path ? await readFile(path) : null;
    if (!bytes) {
      warnings.push(`show: ${rel} not found; left out`);
      continue;
    }
    // Keep the path exactly as the show writes it, so resolveAsset finds it.
    addFile(normalizePath(`show/${rel}`) ?? `show/${rel}`, bytes);
  }

  // ---- the template: template.json, layouts (URLs inlined), stylesheets (URLs inlined) ----
  addFile('template/template.json', JSON.stringify(template));
  for (const layout of Array.isArray(template.layouts) ? template.layouts : []) {
    if (typeof layout?.file !== 'string') continue;
    const path = `${tplDir}/${layout.file}`;
    const html = await readText(path);
    if (html === null) {
      warnings.push(`template: layout ${layout.file} not found`);
      continue;
    }
    addFile(`template/${layout.file}`, await inlineHtmlUrls(html, path, readFile, warnings), 'text/html');
  }
  for (const css of [template.theme, template.reader]) {
    if (typeof css !== 'string') continue;
    const text = await readText(`${tplDir}/${css}`);
    if (text === null) {
      warnings.push(`template: ${css} not found`);
      continue;
    }
    addFile(`template/${css}`, await inlineCssUrls(text, `${tplDir}/${css}`, readFile, warnings), 'text/css');
  }

  // ---- the viewer: follow the module graph from the entry ----
  const skipLibraries = unusedLibraries(show);
  /** @type {Record<string, string>} */
  const importMap = {};
  const queue = [entry];
  const seen = new Set();
  while (queue.length) {
    const path = /** @type {string} */ (queue.shift());
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await readText(path);
    if (text === null) {
      warnings.push(`viewer: ${path} not found`);
      continue;
    }
    if (path.endsWith('.json')) {
      importMap[VIRTUAL_ROOT + path] = `data:application/json;base64,${toBase64(encoder.encode(text))}`;
      continue;
    }
    const { code, imports, metaUrls } = rewriteModule(text, path);
    importMap[VIRTUAL_ROOT + path] = `data:text/javascript;base64,${toBase64(encoder.encode(code))}`;
    queue.push(...imports);
    for (const target of metaUrls) {
      if (/\.m?js$/.test(target)) {
        // A module loaded by computed URL: an embed library, needed only when its kind is used.
        if (!skipLibraries.some((lib) => target.startsWith(lib))) queue.push(target);
      } else if (target.endsWith('.css')) {
        const css = await readText(target);
        if (css !== null) addFile(target, await inlineCssUrls(css, target, readFile, warnings), 'text/css');
        else warnings.push(`viewer: ${target} not found`);
      } else if (!target.endsWith('/')) {
        const bytes = await readFile(target);
        if (bytes) addFile(target, bytes);
      }
    }
  }

  // ---- the page ----
  const css = await readText(viewerCss);
  const title = String(show?.meta?.title ?? 'Slipr show');
  const html = `<!doctype html>
<html lang="${escapeHtml(String(show?.meta?.language ?? 'en'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Slipr single-file export">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 40'%3E%3Cpath d='M4 32 L16 8 H26 L14 32 Z' fill='%23F2A900'/%3E%3Cpath d='M16 32 L28 8 H34 L22 32 Z' fill='%231F3A5F'/%3E%3C/svg%3E">
<style>${css ? (await inlineCssUrls(css, viewerCss, readFile, warnings)).replace(/<\/style/gi, '<\\/style') : ''}</style>
<script type="importmap">${scriptJson({ imports: importMap })}</script>
<script type="application/json" id="slipr-files">${scriptJson(files)}</script>
<script>${RUNTIME}</script>
</head>
<body>
<div id="app" class="slipr-app"><p class="slipr-loading">Loading show…</p></div>
<script type="module">import ${JSON.stringify(VIRTUAL_ROOT + entry)};</script>
</body>
</html>
`;
  return { html, title, modules: [...seen], files: Object.keys(files), warnings };
}
