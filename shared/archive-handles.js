// @ts-check
/**
 * Remember imported zip archives in IndexedDB under a short key, so an archive can
 * be reopened by URL (`viewer/?archive=<key>`) and mode-switched between Audience
 * and Reader modes (I-092, I-087). Same origin only. Browser only.
 *
 * Falls back to an in-memory registry when IndexedDB is unavailable (e.g. in tests
 * or private windows).
 */

const DB_NAME = 'slipr-archives';
const STORE = 'archives';

/**
 * @typedef {object} ArchiveRecord
 * @property {string} key
 * @property {ArrayBuffer | Uint8Array | Blob} data
 * @property {string} name
 * @property {string} [title]     The show's title when it was opened.
 * @property {number} lastOpened  ms since epoch
 */

/** @type {Map<string, ArchiveRecord>} */
const memoryArchives = new Map();

/** @returns {Promise<IDBDatabase | null>} */
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore(STORE, { keyPath: 'key' });
        } catch {
          // ignore upgrade error
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} run
 * @returns {Promise<T | null>}
 */
async function withStore(mode, run) {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
  }
}

/**
 * All remembered archives, most recently opened first.
 * @returns {Promise<ArchiveRecord[]>}
 */
export async function listArchives() {
  const dbResult = await withStore('readonly', (s) => s.getAll());
  if (Array.isArray(dbResult) && dbResult.length > 0) {
    return dbResult.sort((a, b) => b.lastOpened - a.lastOpened);
  }
  return Array.from(memoryArchives.values()).sort((a, b) => b.lastOpened - a.lastOpened);
}

/**
 * Recall an archive by key.
 * @param {string} key
 * @returns {Promise<ArchiveRecord | null>}
 */
export async function recallArchive(key) {
  if (!key) return null;
  const dbResult = /** @type {ArchiveRecord | null | undefined} */ (await withStore('readonly', (s) => s.get(key)));
  if (dbResult) return dbResult;
  return memoryArchives.get(key) ?? null;
}

/**
 * Remember an archive buffer and return its key.
 * @param {ArrayBuffer | Uint8Array | Blob} data
 * @param {{ name: string, title?: string }} options
 * @returns {Promise<string>}
 */
export async function rememberArchive(data, options) {
  const key = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

  /** @type {ArchiveRecord} */
  const record = {
    key,
    data,
    name: options.name,
    lastOpened: Date.now(),
    ...(options.title ? { title: options.title } : {}),
  };

  memoryArchives.set(key, record);
  await withStore('readwrite', (s) => s.put(record));
  return key;
}

/**
 * Forget an archive by key.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function forgetArchive(key) {
  memoryArchives.delete(key);
  await withStore('readwrite', (s) => s.delete(key));
}

/**
 * Clear all remembered archives (in-memory and IndexedDB).
 * @returns {Promise<void>}
 */
export async function clearArchives() {
  memoryArchives.clear();
  await withStore('readwrite', (s) => s.clear());
}
