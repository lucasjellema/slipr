// @ts-check
/**
 * Read and decompress zip archives in memory using standard Web APIs (I-087).
 *
 * Uses DecompressionStream('deflate-raw') (WHATWG / Web Streams standard),
 * keeping D-001/D-002 (zero build step, fully offline, no npm runtime dependencies).
 *
 * Supported compression methods:
 *   - 0: STORE (uncompressed)
 *   - 8: DEFLATE (standard deflate raw)
 */
import { normalizePath } from './folder-source.js';
import { LoadError } from './load.js';

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_CENTRAL_DIR = 0x02014b50;
const SIGNATURE_LOCAL_FILE = 0x04034b50;

/**
 * @typedef {object} DownloadProgress
 * @property {number} loaded          Bytes downloaded so far.
 * @property {number | null} total    Total bytes if known (from Content-Length), else null.
 * @property {number | null} percent  Percentage 0-100 if known, else null.
 */

/**
 * @typedef {object} ZipSourceOptions
 * @property {string} [name]          Human-readable name or URL of the zip.
 * @property {string} [path]          Subdirectory path to the show folder inside the zip.
 */

/**
 * @typedef {object} ZipSource
 * @property {string} name
 * @property {string} prefix          Subfolder prefix inside the zip ending with `/`, or empty string for root.
 * @property {string[]} fileNames     All files present in the zip.
 * @property {string[]} candidateShows All show directories found in the zip.
 * @property {(path: string) => Promise<Blob | null>} readFile
 * @property {(path: string) => Promise<string | null>} readText
 * @property {(path: string) => Uint8Array | null} getBytes
 */

const MIME = /** @type {Record<string, string>} */ ({
  js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', css: 'text/css', html: 'text/html',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', ico: 'image/x-icon',
  txt: 'text/plain', md: 'text/markdown', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm',
});

/**
 * @param {string} path
 * @returns {string}
 */
export function mimeType(path) {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

/**
 * Decompress and read all files from a zip archive buffer.
 *
 * @param {Uint8Array | ArrayBuffer} data
 * @returns {Promise<Map<string, Uint8Array>>} Map of normalized file paths to uncompressed bytes.
 */
export async function readZip(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eocdOffset = findEOCD(bytes, view);
  if (eocdOffset === -1) {
    throw new LoadError('The file is not a valid zip archive (end of central directory record not found).', { kind: 'parse' });
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > bytes.length) {
    throw new LoadError('The zip archive is corrupted (central directory exceeds file bounds).', { kind: 'parse' });
  }

  let offset = cdOffset;
  /** @type {Map<string, Uint8Array>} */
  const entries = new Map();
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== SIGNATURE_CENTRAL_DIR) {
      throw new LoadError(`Corrupted zip archive: central directory header at offset ${offset} has an invalid signature.`, { kind: 'parse' });
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
    const rawName = decoder.decode(nameBytes);

    offset += 46 + nameLen + extraLen + commentLen;

    let name = rawName.replaceAll('\\', '/');
    if (name.startsWith('/')) name = name.slice(1);

    if (name.endsWith('/') || isIgnoredEntry(name)) {
      continue;
    }

    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== SIGNATURE_LOCAL_FILE) {
      throw new LoadError(`Corrupted zip archive: local file header for "${name}" at offset ${localHeaderOffset} has an invalid signature.`, { kind: 'parse' });
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    if (dataOffset + compressedSize > bytes.length) {
      throw new LoadError(`Corrupted zip archive: entry "${name}" data extends past end of file.`, { kind: 'parse' });
    }

    const compressedData = bytes.subarray(dataOffset, dataOffset + compressedSize);
    /** @type {Uint8Array} */
    let fileData;

    if (compressedSize === 0 && uncompressedSize === 0) {
      fileData = new Uint8Array(0);
    } else if (method === 0) {
      fileData = compressedData.slice();
    } else if (method === 8) {
      try {
        const stream = new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        fileData = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (cause) {
        throw new LoadError(`Failed to decompress "${name}" from zip archive: ${cause instanceof Error ? cause.message : String(cause)}`, { kind: 'parse', cause });
      }
    } else {
      throw new LoadError(`Unsupported compression method (${method}) for "${name}" in zip archive. Only STORE (0) and DEFLATE (8) are supported.`, { kind: 'parse' });
    }

    entries.set(name, fileData);
  }

  return entries;
}

/**
 * Locate End of Central Directory Record (EOCD).
 * @param {Uint8Array} bytes
 * @param {DataView} view
 * @returns {number} Offset or -1 if not found.
 */
function findEOCD(bytes, view) {
  if (bytes.length < 22) return -1;
  const minOffset = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === SIGNATURE_EOCD) {
      return i;
    }
  }
  return -1;
}

/**
 * Ignore OS metadata entries like macOS AppleDouble resource forks and .DS_Store.
 * @param {string} name
 * @returns {boolean}
 */
function isIgnoredEntry(name) {
  if (name.startsWith('__MACOSX/') || name.includes('/__MACOSX/')) return true;
  const base = name.split('/').pop() ?? '';
  return base === '.DS_Store' || base === 'Thumbs.db';
}

/**
 * If all files in the zip share a single top-level directory (e.g. GitHub archive `repo-main/`),
 * return that directory with a trailing `/`. Otherwise return null.
 * @param {Map<string, Uint8Array>} entries
 * @returns {string | null}
 */
function getSingleTopLevelDirectory(entries) {
  /** @type {string | null} */
  let topDir = null;
  for (const name of entries.keys()) {
    const slashIndex = name.indexOf('/');
    if (slashIndex === -1) {
      return null;
    }
    const dir = name.slice(0, slashIndex + 1);
    if (topDir === null) {
      topDir = dir;
    } else if (topDir !== dir) {
      return null;
    }
  }
  return topDir;
}

/**
 * Adapt decompressed zip entries into a FolderSource-compatible source.
 * Handles root shows, single-directory wrappers (e.g. GitHub archives `repo-main/show.json`),
 * auto-detection of single shows in nested folders, and explicit `options.path`.
 *
 * @param {Map<string, Uint8Array>} entries
 * @param {ZipSourceOptions} [options]
 * @returns {ZipSource}
 */
export function createZipSource(entries, options = {}) {
  const allShowFiles = Array.from(entries.keys()).filter((name) => name === 'show.json' || name.endsWith('/show.json'));
  const candidateShows = allShowFiles.map((f) => f === 'show.json' ? '' : f.slice(0, f.lastIndexOf('/') + 1));

  let chosenPrefix = '';

  if (options.path !== undefined && options.path !== null && options.path.trim() !== '') {
    const target = options.path.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '');
    const targetFile = target ? `${target}/show.json` : 'show.json';

    if (entries.has(targetFile)) {
      chosenPrefix = target ? `${target}/` : '';
    } else {
      const singleWrapper = getSingleTopLevelDirectory(entries);
      if (singleWrapper && entries.has(`${singleWrapper}${targetFile}`)) {
        chosenPrefix = `${singleWrapper}${target ? target + '/' : ''}`;
      } else {
        const matching = allShowFiles.filter((f) => f === targetFile || f.endsWith(`/${targetFile}`));
        if (matching.length === 1) {
          chosenPrefix = matching[0].slice(0, matching[0].length - 'show.json'.length);
        } else {
          const availableList = candidateShows.length > 0
            ? `\nAvailable presentations in this archive:\n${candidateShows.map((s) => `  - ${s || '(root)'}`).join('\n')}`
            : '';
          throw new LoadError(`Could not find a presentation at "${options.path}" in the zip archive.${availableList}`, { kind: 'fetch', status: 404 });
        }
      }
    }
  } else {
    if (entries.has('show.json')) {
      chosenPrefix = '';
    } else {
      if (allShowFiles.length === 0) {
        throw new LoadError(`The zip archive "${options.name ?? 'archive.zip'}" does not contain a show.json file. Pick or upload a valid Slipr show archive.`, { kind: 'fetch', status: 404 });
      }

      const singleWrapper = getSingleTopLevelDirectory(entries);
      if (singleWrapper && entries.has(`${singleWrapper}show.json`)) {
        chosenPrefix = singleWrapper;
      } else if (allShowFiles.length === 1) {
        chosenPrefix = candidateShows[0];
      } else {
        const showList = candidateShows.map((s) => `  - ${s || '(root)'}`).join('\n');
        throw new LoadError(
          `Found multiple presentations in this zip archive:\n${showList}\n\nPlease specify which one to present with the "path" parameter, e.g.: ?zip=...&path=${encodeURIComponent(candidateShows[0].replace(/\/$/, ''))}`,
          { kind: 'fetch', status: 400 }
        );
      }
    }
  }

  const decoder = new TextDecoder('utf-8');

  /** @param {string} path */
  function getBytes(path) {
    const normal = normalizePath(path);
    if (!normal) return null;
    const fullKey = chosenPrefix + normal;
    return entries.get(fullKey) ?? null;
  }

  return {
    name: options.name ?? 'presentation.zip',
    prefix: chosenPrefix,
    fileNames: Array.from(entries.keys()),
    candidateShows,
    getBytes,
    async readFile(path) {
      const bytes = getBytes(path);
      if (!bytes) return null;
      return new Blob([bytes], { type: mimeType(path) });
    },
    async readText(path) {
      const bytes = getBytes(path);
      if (!bytes) return null;
      return decoder.decode(bytes);
    },
  };
}

/**
 * Download a zip archive client-side via fetch with progress reporting.
 *
 * @param {string | URL} url
 * @param {{
 *   fetch?: typeof fetch,
 *   baseUrl?: string | URL,
 *   onProgress?: (progress: DownloadProgress) => void,
 * }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function downloadZip(url, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = options.baseUrl ?? globalThis.location?.href;
  const targetUrl = new URL(url, base);

  let response;
  try {
    response = await doFetch(targetUrl.href);
  } catch (cause) {
    if (isCrossOrigin(targetUrl)) {
      throw new LoadError(
        `Could not download the zip file from ${targetUrl.href}.\n\n` +
        `This request was blocked by the browser's Cross-Origin Resource Sharing (CORS) security restrictions. ` +
        `The remote web server hosting the file does not send an "Access-Control-Allow-Origin" header allowing this origin to access it.\n\n` +
        `How to resolve:\n` +
        `  - For GitHub files, host them on GitHub Pages or use a raw CORS-friendly host.\n` +
        `  - Configure your web server to send "Access-Control-Allow-Origin: *".\n` +
        `  - Or download the zip file to your computer, unzip it, and use "Open a show folder…" on the Slipr viewer start page.`,
        { kind: 'fetch', url: targetUrl.href, cause }
      );
    }
    throw new LoadError(
      `Could not download the zip file from ${targetUrl.href}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { kind: 'fetch', url: targetUrl.href, cause }
    );
  }

  if (!response.ok) {
    const hint = response.status === 404 ? ' The file was not found; check the URL.' : '';
    throw new LoadError(
      `Could not download the zip file: ${targetUrl.href} answered ${response.status} ${response.statusText}.${hint}`,
      { kind: 'fetch', url: targetUrl.href, status: response.status }
    );
  }

  const contentLength = response.headers?.get ? response.headers.get('content-length') : null;
  const total = contentLength ? parseInt(contentLength, 10) : null;
  const validTotal = total !== null && !isNaN(total) && total > 0 ? total : null;
  const onProgress = options.onProgress;

  if (!response.body || typeof response.body.getReader !== 'function') {
    const arrayBuffer = await response.arrayBuffer();
    if (onProgress) {
      onProgress({ loaded: arrayBuffer.byteLength, total: arrayBuffer.byteLength, percent: 100 });
    }
    return new Uint8Array(arrayBuffer);
  }

  const reader = response.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      if (onProgress) {
        const percent = validTotal ? Math.min(100, Math.round((loaded / validTotal) * 100)) : null;
        onProgress({ loaded, total: validTotal, percent });
      }
    }
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Check whether a target URL is on another origin.
 * @param {URL} url
 * @returns {boolean}
 */
function isCrossOrigin(url) {
  try {
    const origin = globalThis.location?.origin;
    return Boolean(origin && url.origin && url.origin !== origin && url.origin !== 'null');
  } catch {
    return false;
  }
}
