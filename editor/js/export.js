// @ts-check
/**
 * Export… (I-085): save the open show as one HTML file that presents offline,
 * with the same packer as `npm run export` (shared/export/single-file.js).
 *
 * The show is exported as it is in the editor (unsaved changes included).
 * Its files come from the show folder (folder shows) or the server (shows
 * opened by URL); the viewer and the template come from the Slipr server.
 */
import { packShow, normalizePath } from '../../shared/export/single-file.js';
import { serializeShow } from './io/serialize.js';
import { showBanner } from './ui/dialogs.js';

/** The show folder's place in the packer's path space when it is a folder handle. */
const FOLDER = '__show__';

/**
 * The packer's `readFile` for the open show: app files (viewer, vendor,
 * templates) from the server, show files from the folder or the show's URL,
 * and show.json from the editor's current state.
 * @param {import('./store.js').EditorStore} store
 * @param {{ showDir: string, appBase: URL, showBase: URL | null }} where
 * @returns {(path: string) => Promise<Uint8Array | null>}
 */
function fileReader(store, { showDir, appBase, showBase }) {
  const encoder = new TextEncoder();
  /** @param {URL} url */
  const fetchBytes = async (url) => {
    try {
      const response = await fetch(url);
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    } catch {
      return null;
    }
  };
  return async (path) => {
    if (path === `${showDir}/show.json`) return encoder.encode(serializeShow(store.state.show));
    if (path.startsWith(`${showDir}/`)) {
      const rel = path.slice(showDir.length + 1);
      const handle = store.state.folderHandle;
      if (handle && showDir === FOLDER) {
        try {
          let dir = handle;
          const parts = rel.split('/');
          const name = /** @type {string} */ (parts.pop());
          for (const part of parts) dir = await dir.getDirectoryHandle(part);
          const file = await (await dir.getFileHandle(name)).getFile();
          return new Uint8Array(await file.arrayBuffer());
        } catch {
          return null;
        }
      }
      if (showBase) return fetchBytes(new URL(rel, showBase));
    }
    return fetchBytes(new URL(path, appBase));
  };
}

/**
 * Where the show is in the packer's path space: the folder (`__show__`), or for
 * a show opened by URL its path under the Slipr folder.
 * @param {import('./store.js').EditorStore} store
 * @param {string | undefined} showUrl  The ?show= the editor was opened with.
 * @param {URL} appBase
 */
function showLocation(store, showUrl, appBase) {
  if (store.state.folderHandle) return { showDir: FOLDER, showBase: null };
  if (!showUrl) throw new Error('This show has no folder or address to export from.');
  const showJson = new URL(showUrl, location.href);
  const showBase = new URL('./', showJson);
  const rel = showBase.href.startsWith(appBase.href) ? normalizePath(decodeURIComponent(showBase.href.slice(appBase.href.length))) : null;
  if (!rel) throw new Error('Only shows inside the Slipr folder can be exported when opened by URL. Open the show folder instead.');
  return { showDir: rel, showBase };
}

/** A file name for the export, from the show id. @param {any} show */
const fileName = (show) => `${String(show?.id ?? 'show').replace(/[^\w.-]+/g, '-')}.html`;

/**
 * Ask where to save (must run inside the click), or null when the browser
 * has no save dialog (then the file is downloaded).
 * @param {string} suggestedName
 * @returns {Promise<FileSystemFileHandle | null | 'cancelled'>}
 */
async function askWhereToSave(suggestedName) {
  const picker = /** @type {any} */ (window).showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  try {
    return await picker({
      suggestedName,
      id: 'slipr-export',
      types: [{ description: 'Web page (one file)', accept: { 'text/html': ['.html'] } }],
    });
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

/**
 * Export… : pick a file, pack the show, write it.
 * @param {import('./store.js').EditorStore} store
 * @param {string | undefined} showUrl
 */
export async function exportShow(store, showUrl) {
  const show = store.state.show;
  const appBase = new URL('../', location.href);
  const where = showLocation(store, showUrl, appBase);   // fails early, before any dialog

  const target = await askWhereToSave(fileName(show));
  if (target === 'cancelled') return;

  showBanner('Exporting… packing the show, its template and the viewer into one file.', 'info', { timeout: 4000 });
  const result = await packShow({ readFile: fileReader(store, { ...where, appBase }), showDir: where.showDir });
  const blob = new Blob([result.html], { type: 'text/html' });

  let name = fileName(show);
  if (target) {
    const writable = await target.createWritable();
    await writable.write(blob);
    await writable.close();
    name = target.name;
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const mb = (blob.size / 1024 / 1024).toFixed(1);
  showBanner(`Exported to ${name} (${mb} MB). It presents offline: open it in a browser; add ?mode=reader for reader mode.`, 'success', { timeout: 8000 });
  for (const warning of result.warnings) showBanner(`Export: ${warning}`, 'info');
}
