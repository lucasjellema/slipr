// @ts-check
/**
 * Reading and writing template files (I-106): from Slipr's own templates by
 * URL, from a folder handle (File System Access API, D-007), to a folder, and
 * as a `.zip`. Browser only.
 */
import { referencedFiles, optionalFiles, isTextFile } from './template-files.js';
import { fontFaceFamilies } from './css-tokens.js';
import { writeZip } from '../../shared/zip.js';

/** @typedef {import('./actions.js').FileContent} FileContent */

/**
 * The templates Slipr offers (templates/index.json), with name and description.
 * @returns {Promise<Array<{ id: string, name: string, description: string }>>}
 */
export async function listBuiltInTemplates() {
  const index = await fetchJson(new URL('../templates/index.json', location.href));
  const ids = Array.isArray(index?.templates) ? index.templates : [];
  return Promise.all(ids.map(async (/** @type {string} */ id) => {
    try {
      const t = await fetchJson(new URL(`../templates/${encodeURIComponent(id)}/template.json`, location.href));
      return { id, name: String(t.name ?? id), description: String(t.description ?? '') };
    } catch {
      return { id, name: id, description: '' };
    }
  }));
}

/**
 * Read a template by URL: template.json, everything it refers to, its README
 * and font licences (when they exist).
 * @param {URL} base  The template folder, ending in `/`.
 * @returns {Promise<Map<string, FileContent>>}
 */
export async function readTemplateFromUrl(base) {
  /** @type {Map<string, FileContent>} */
  const files = new Map();
  /** @param {string} path @param {boolean} optional */
  const get = async (path, optional) => {
    if (files.has(path)) return;
    const response = await fetch(new URL(path.split('/').map(encodeURIComponent).join('/'), base)).catch(() => null);
    if (!response?.ok) {
      if (optional) return;
      throw new Error(`Could not read ${path} of the template (${response ? response.status : 'no answer'}).`);
    }
    files.set(path, isTextFile(path) ? await response.text() : await response.blob());
  };
  await get('template.json', false);
  const template = JSON.parse(/** @type {string} */ (files.get('template.json')));
  const text = (/** @type {string} */ path) => {
    const v = files.get(path);
    return typeof v === 'string' ? v : null;
  };
  // Stylesheets and layouts first, then what they refer to.
  const direct = referencedFiles(template, () => null);
  await Promise.all(direct.map((p) => get(p, p !== 'template.json' && !p.endsWith('.css') && !p.endsWith('.html'))));
  const all = referencedFiles(template, text);
  await Promise.all(all.map((p) => get(p, true)));
  const families = fontFaceFamilies(text(template.theme ?? 'theme.css') ?? '');
  await Promise.all(optionalFiles(all, families).map((p) => get(p, true)));
  return files;
}

/**
 * Read every file of a template folder (hidden files and folders left out).
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<Map<string, FileContent>>}
 */
export async function readTemplateFromFolder(handle) {
  /** @type {Map<string, FileContent>} */
  const files = new Map();
  /** @param {FileSystemDirectoryHandle} dir @param {string} prefix */
  const walk = async (dir, prefix) => {
    // @ts-ignore: values() is not in every lib.dom version
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue;
      const path = prefix + entry.name;
      if (entry.kind === 'directory') await walk(entry, `${path}/`);
      else {
        const file = await entry.getFile();
        files.set(path, isTextFile(path) ? await file.text() : file);
      }
    }
  };
  await walk(handle, '');
  if (!files.has('template.json')) {
    throw new Error(`The folder "${handle.name}" has no template.json. Pick the folder that contains the template.`);
  }
  return files;
}

/**
 * Write files into a folder, creating subfolders.
 * @param {FileSystemDirectoryHandle} dir
 * @param {Map<string, FileContent>} files
 * @param {string[]} [paths]  Only these (default: all).
 */
export async function writeTemplateFiles(dir, files, paths = [...files.keys()]) {
  for (const path of paths) {
    const content = files.get(path);
    if (content === undefined) continue;
    const parts = path.split('/');
    let folder = dir;
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
    const handle = await folder.getFileHandle(/** @type {string} */ (parts.at(-1)), { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

/**
 * Delete files from a template folder (a removed layout's file, I-111). A file
 * that is not there is skipped.
 * @param {FileSystemDirectoryHandle} dir
 * @param {string[]} paths
 */
export async function removeTemplateFiles(dir, paths) {
  for (const path of paths) {
    const parts = path.split('/');
    try {
      let folder = dir;
      for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
      await folder.removeEntry(/** @type {string} */ (parts.at(-1)));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) throw err;
    }
  }
}

/**
 * Ask for a folder to write into (read-write). Null when the user cancels.
 * @param {string} id  Remembers the last place per purpose.
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function pickFolder(id) {
  try {
    // @ts-ignore: showDirectoryPicker is Chromium-only
    return await window.showDirectoryPicker({ id, mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

/** Can this browser open and save folders? */
export function canUseFolders() {
  return 'showDirectoryPicker' in window;
}

/**
 * Ask for read-write access again (after a reload, from a click).
 * @param {FileSystemDirectoryHandle} handle
 */
export async function ensureWritable(handle) {
  // @ts-ignore: permission methods are Chromium-only
  if ((await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  // @ts-ignore
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

/**
 * The template as a zip with one folder named after its id.
 * @param {Map<string, FileContent>} files @param {string} id
 * @returns {Promise<Blob>}
 */
export async function templateZip(files, id) {
  const entries = [...files].map(([path, content]) => /** @type {[string, string | Blob]} */ ([`${id}/${path}`, content]));
  const bytes = await writeZip(entries);
  return new Blob([bytes], { type: 'application/zip' });
}

/**
 * Let the browser download a file.
 * @param {Blob} blob @param {string} name
 */
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** @param {URL} url */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
  return response.json();
}
