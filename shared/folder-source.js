// @ts-check
/**
 * Read-only access to a show folder through a File System Access directory
 * handle (D-012). Used by the editor (E-002) and the viewer's ?folder= (E-007).
 *
 * Paths are relative to the folder (where show.json is). A path that leaves
 * the folder, or is a URL, is never read. DOM-free: tests pass a fake handle.
 */

/**
 * The subset of FileSystemDirectoryHandle this module uses.
 * @typedef {object} DirectoryLike
 * @property {string} name
 * @property {(name: string) => Promise<DirectoryLike>} getDirectoryHandle
 * @property {(name: string) => Promise<{ getFile: () => Promise<Blob> }>} getFileHandle
 */

/**
 * @typedef {object} FolderSource
 * @property {string} name                      Folder name, for messages.
 * @property {DirectoryLike} handle
 * @property {(path: string) => Promise<Blob | null>} readFile    null when the file doesn't exist.
 * @property {(path: string) => Promise<string | null>} readText  null when the file doesn't exist.
 */

const URL_LIKE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalise a relative path inside the folder: drops `.` and empty segments and
 * resolves `..`. Returns null for URLs, absolute paths and paths that leave the folder.
 * @param {string} path
 * @returns {string | null}
 */
export function normalizePath(path) {
  if (typeof path !== 'string' || path === '' || URL_LIKE.test(path) || path.startsWith('/') || path.startsWith('\\')) {
    return null;
  }
  /** @type {string[]} */
  const parts = [];
  for (const part of path.split(/[\\/]/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(safeDecode(part));
    }
  }
  return parts.length ? parts.join('/') : null;
}

/**
 * @param {DirectoryLike} handle  The show folder.
 * @returns {FolderSource}
 */
export function createFolderSource(handle) {
  /** @param {string} path */
  async function readFile(path) {
    const normal = normalizePath(path);
    if (!normal) return null;
    const parts = normal.split('/');
    const fileName = /** @type {string} */ (parts.pop());
    try {
      let dir = handle;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      const fileHandle = await dir.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  return {
    name: handle.name,
    handle,
    readFile,
    async readText(path) {
      const file = await readFile(path);
      return file ? file.text() : null;
    },
  };
}

/** `my%20photo.png` and `my photo.png` name the same file. @param {string} part */
function safeDecode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** @param {unknown} err */
function isNotFound(err) {
  const name = /** @type {any} */ (err)?.name;
  return name === 'NotFoundError' || name === 'TypeMismatchError';
}
