// @ts-check
/**
 * Reading a file of the open show by its path (relative to show.json),
 * wherever the show lives: files added in this session, its folder, the zip
 * it was opened from, or its URL. Used by the slide library (I-029) and by
 * the preview for map tiles in the show folder (I-099).
 */

/** @typedef {import('../store.js').EditorStore} EditorStore */

/**
 * A file in a folder, by a `/`-separated path, or null.
 * @param {FileSystemDirectoryHandle} handle @param {string} path
 * @returns {Promise<Blob | null>}
 */
async function readFolderFile(handle, path) {
  const parts = path.split('/').filter((p) => p && p !== '.');
  if (!parts.length || parts.includes('..')) return null;
  try {
    let dir = handle;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await (await dir.getFileHandle(/** @type {string} */ (parts.at(-1)))).getFile();
  } catch {
    return null;
  }
}

/**
 * A file of the open show (a path relative to show.json), or null when it is missing.
 * @param {EditorStore['state']} state
 * @param {string} path
 * @returns {Promise<Blob | null>}
 */
export async function readShowFile(state, path) {
  const own = state.inMemoryAssets?.get(path);
  if (own) return own;
  if (state.folderHandle) return readFolderFile(state.folderHandle, path);
  if (state.zipSource) {
    const blob = await state.zipSource.readFile(path).catch(() => null);
    if (blob) return blob;
  }
  try {
    const res = await fetch(state.resolveAsset?.(path) ?? path);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}
