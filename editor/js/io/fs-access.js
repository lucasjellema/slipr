// @ts-check
/**
 * File System Access API: pick a show folder, check permission, write show.json,
 * create a new show (E-002, D-007). Browser only (Chromium).
 */
import { serializeShow } from './serialize.js';

/** @returns {boolean} */
export function canOpenFolders() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Let the user pick a folder. Must be called from a click or key press.
 * Resolves to null when the user cancels.
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function pickFolder() {
  if (!canOpenFolders()) {
    throw new Error('This browser cannot open folders. Use Chrome or Edge (D-007).');
  }
  try {
    return await /** @type {any} */ (window).showDirectoryPicker({ id: 'slipr-show', mode: 'readwrite' });
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Is access already granted (no prompt)?
 * @param {FileSystemDirectoryHandle} handle
 * @param {'read' | 'readwrite'} [mode]
 */
export async function hasPermission(handle, mode = 'readwrite') {
  return (await /** @type {any} */ (handle).queryPermission({ mode })) === 'granted';
}

/**
 * Make sure we may read (and write) the folder, asking if needed. Asking only
 * works from a click or key press, never on page load.
 * @param {FileSystemDirectoryHandle} handle
 * @param {'read' | 'readwrite'} [mode]
 * @returns {Promise<boolean>}
 */
export async function ensurePermission(handle, mode = 'readwrite') {
  if (await hasPermission(handle, mode)) return true;
  return (await /** @type {any} */ (handle).requestPermission({ mode })) === 'granted';
}

/**
 * @param {FileSystemDirectoryHandle} dir @param {string} name @param {string} text
 */
async function writeTextFile(dir, name, text) {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

/**
 * The parsed show.json of a folder, or null if there is none (or it is not JSON).
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<any | null>}
 */
export async function readShowJson(handle) {
  try {
    const file = await (await handle.getFileHandle('show.json')).getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

/**
 * Write show.json (canonical key order, 2-space indent).
 * @param {FileSystemDirectoryHandle} handle
 * @param {any} show
 */
export async function saveShow(handle, show) {
  await writeTextFile(handle, 'show.json', serializeShow(show));
}

/**
 * Create a new show in a folder: show.json and an empty images/ folder.
 * Refuses a folder that already has a show.json.
 * @param {FileSystemDirectoryHandle} handle
 * @param {any} show
 */
export async function createShowInFolder(handle, show) {
  let exists = true;
  try {
    await handle.getFileHandle('show.json');
  } catch (err) {
    if (/** @type {any} */ (err)?.name !== 'NotFoundError') throw err;
    exists = false;
  }
  if (exists) {
    throw new Error(`The folder "${handle.name}" already has a show.json. Use Open… for it, or pick an empty folder.`);
  }
  await handle.getDirectoryHandle('images', { create: true });
  await saveShow(handle, show);
}
