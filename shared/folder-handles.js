// @ts-check
/**
 * Remember show folder handles in IndexedDB under a short key, so a folder can
 * be reopened by URL (`editor/?folder=<key>`, later `viewer/?folder=<key>`)
 * and listed as a recent show (D-012). Same origin only. Browser only.
 *
 * Handles survive a reload, but their permission may not: callers check
 * `queryPermission()` and ask with `requestPermission()` from a click.
 */

const DB_NAME = 'slipr-folders';
const STORE = 'folders';

/**
 * @typedef {object} FolderRecord
 * @property {string} key
 * @property {FileSystemDirectoryHandle} handle
 * @property {string} name
 * @property {string} [title]     The show's title when it was last opened.
 * @property {number} lastOpened  ms since epoch
 */

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} run
 * @returns {Promise<T>}
 */
async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * All remembered folders, most recently opened first.
 * @returns {Promise<FolderRecord[]>}
 */
export async function listFolders() {
  const all = /** @type {FolderRecord[]} */ (await withStore('readonly', (s) => s.getAll()));
  return all.sort((a, b) => b.lastOpened - a.lastOpened);
}

/**
 * @param {string} key
 * @returns {Promise<FolderRecord | null>}
 */
export async function recallFolder(key) {
  return (await withStore('readonly', (s) => s.get(key))) ?? null;
}

/**
 * Remember a folder and return its key. The same folder keeps the same key.
 * @param {FileSystemDirectoryHandle} handle
 * @param {{ title?: string }} [info]
 * @returns {Promise<string>}
 */
export async function rememberFolder(handle, info = {}) {
  let key = null;
  for (const record of await listFolders()) {
    if (await record.handle.isSameEntry(handle)) {
      key = record.key;
      break;
    }
  }
  key ??= crypto.randomUUID().slice(0, 8);
  /** @type {FolderRecord} */
  const record = { key, handle, name: handle.name, lastOpened: Date.now(), ...(info.title ? { title: info.title } : {}) };
  await withStore('readwrite', (s) => s.put(record));
  return key;
}

/**
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function forgetFolder(key) {
  await withStore('readwrite', (s) => s.delete(key));
}
