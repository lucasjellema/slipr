// @ts-check
/**
 * Export to zip (.zip / .slipr) (I-092): packages the open show as a standard
 * zip archive containing show.json, referenced images, data files, and docs.
 *
 * Compresses client-side using standard Web Streams (CompressionStream('deflate-raw'))
 * via shared/zip.js without external runtime dependencies (D-001/D-002/D-010).
 */
import { writeZip } from '../../shared/zip.js';
import { serializeShow } from './io/serialize.js';
import { collectImagePaths } from '../../shared/validate.js';
import { showBanner } from './ui/dialogs.js';

/**
 * Traverses a FileSystemDirectoryHandle recursively, returning a Map of relative paths to Uint8Array bytes.
 * Ignores .git, .DS_Store, Thumbs.db, and show.json (which is provided from editor state).
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} [prefix]
 * @returns {Promise<Map<string, Uint8Array>>}
 */
async function collectFilesFromDirectory(dirHandle, prefix = '') {
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  // @ts-ignore
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.') || name === 'Thumbs.db') continue;
    const relPath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') {
      if (relPath === 'show.json') continue;
      const file = await handle.getFile();
      files.set(relPath, new Uint8Array(await file.arrayBuffer()));
    } else if (handle.kind === 'directory') {
      const subFiles = await collectFilesFromDirectory(handle, relPath);
      for (const [subPath, bytes] of subFiles) {
        files.set(subPath, bytes);
      }
    }
  }
  return files;
}

/**
 * Ask where to save the zip file via File System Access API if available,
 * or returns null to trigger a standard browser download.
 * @param {string} suggestedName
 * @returns {Promise<FileSystemFileHandle | null | 'cancelled'>}
 */
async function askWhereToSaveZip(suggestedName) {
  const picker = /** @type {any} */ (window).showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  try {
    return await picker({
      suggestedName,
      id: 'slipr-export-zip',
      types: [
        { description: 'Slipr show archive (.zip)', accept: { 'application/zip': ['.zip'] } },
        { description: 'Slipr package (.slipr)', accept: { 'application/x-slipr': ['.slipr'] } },
      ],
    });
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

/**
 * Trigger download via an invisible <a> tag for browsers without showSaveFilePicker.
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Gather all files and package the current show as a zip archive (I-092).
 *
 * @param {import('./store.js').EditorStore} store
 * @param {{
 *   suggestedName?: string,
 *   deflate?: boolean,
 *   download?: boolean,
 * }} [options]
 * @returns {Promise<{ name: string, bytes: Uint8Array, warnings: string[] } | null>}
 */
export async function exportZip(store, options = {}) {
  const show = store.state.show;
  if (!show) throw new Error('No show is currently open.');

  const baseName = String(show.id ?? 'show').replace(/[^\w.-]+/g, '-') || 'presentation';
  const suggestedName = options.suggestedName ?? `${baseName}.zip`;

  // If download is requested and running in a browser, prompt for save location early
  let target = null;
  const shouldDownload = options.download !== false && typeof document !== 'undefined';
  if (shouldDownload) {
    target = await askWhereToSaveZip(suggestedName);
    if (target === 'cancelled') return null;
  }

  if (typeof showBanner === 'function' && typeof document !== 'undefined') {
    showBanner('Exporting zip… packaging show.json and assets.', 'info', { timeout: 3000 });
  }

  /** @type {Map<string, Uint8Array | Blob | string>} */
  const archiveFiles = new Map();
  /** @type {string[]} */
  const warnings = [];

  // 1. Current in-memory show.json
  archiveFiles.set('show.json', serializeShow(show));

  // 2. Existing files if opened from a zip archive
  const zipSource = store.state.zipSource;
  if (zipSource && Array.isArray(zipSource.fileNames)) {
    const prefix = zipSource.prefix ?? '';
    for (const name of zipSource.fileNames) {
      if (name.startsWith(prefix)) {
        const rel = name.slice(prefix.length);
        if (rel && rel !== 'show.json' && !rel.endsWith('/')) {
          const bytes = zipSource.getBytes(rel);
          if (bytes) archiveFiles.set(rel, bytes);
        }
      }
    }
  }

  // 3. Existing files if opened from a local directory handle
  const folderHandle = store.state.folderHandle;
  if (folderHandle && typeof folderHandle.entries === 'function') {
    try {
      const diskFiles = await collectFilesFromDirectory(folderHandle);
      for (const [relPath, bytes] of diskFiles) {
        archiveFiles.set(relPath, bytes);
      }
    } catch (err) {
      warnings.push(`Could not read all files from show folder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Newly registered in-memory assets (e.g. dropped/pasted images)
  const inMemory = store.state.inMemoryAssets;
  if (inMemory instanceof Map) {
    for (const [relPath, blob] of inMemory) {
      archiveFiles.set(relPath, blob);
    }
  }

  // 5. Referenced images, graphs, fallbacks, and local documents
  const referenced = collectImagePaths(show);
  for (const src of referenced) {
    if (archiveFiles.has(src)) continue;
    // Attempt resolving via store.state.resolveAsset
    const resolved = store.state.resolveAsset?.(src);
    if (resolved && typeof fetch === 'function') {
      try {
        const res = await fetch(resolved);
        if (res.ok) {
          archiveFiles.set(src, new Uint8Array(await res.arrayBuffer()));
        } else {
          warnings.push(`Missing asset "${src}" (${res.status} ${res.statusText})`);
        }
      } catch (err) {
        warnings.push(`Could not fetch asset "${src}": ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      warnings.push(`Could not resolve asset "${src}"`);
    }
  }

  // 6. Build zip archive
  const zipBytes = await writeZip(archiveFiles, { deflate: options.deflate !== false });
  const blob = new Blob([zipBytes], { type: 'application/zip' });

  // 7. Write to file or trigger browser download
  let finalName = suggestedName;
  if (target && typeof target !== 'string') {
    const writable = await target.createWritable();
    await writable.write(blob);
    await writable.close();
    finalName = target.name;
  } else if (shouldDownload) {
    downloadBlob(blob, suggestedName);
  }

  const mb = (zipBytes.byteLength / 1024 / 1024).toFixed(1);
  if (typeof showBanner === 'function' && typeof document !== 'undefined') {
    showBanner(`Exported to ${finalName} (${mb} MB).`, 'success', { timeout: 6000 });
    for (const warning of warnings) {
      showBanner(`Zip export warning: ${warning}`, 'info');
    }
  }

  return { name: finalName, bytes: zipBytes, warnings };
}
