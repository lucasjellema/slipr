// @ts-check
/**
 * Slide library storage (I-029): entries, collections and file bytes in the
 * browser's IndexedDB (database `slipr-library`). Nothing leaves the browser
 * (D-010); export / import as a zip moves a library between browsers.
 *
 * Files are stored once per content hash, so the same picture in many entries
 * takes its space once; removing entries removes files nothing uses any more.
 * The adapter is swappable: tests use memoryLibraryAdapter().
 */
import { readZip, writeZip, mimeType } from '../../../shared/zip.js';
import { libraryManifest, parseManifest, planImport, zipFilePath } from './library-model.js';

export const LIBRARY_DB = 'slipr-library';

/** @typedef {import('./library-model.js').LibraryEntry} LibraryEntry */
/** @typedef {import('./library-model.js').LibraryCollection} LibraryCollection */

/**
 * @typedef {object} LibraryAdapter
 * @property {string} name
 * @property {(store: 'entries' | 'collections' | 'files') => Promise<any[]>} all
 * @property {(store: 'entries' | 'collections' | 'files', key: string) => Promise<any>} get
 * @property {(store: 'entries' | 'collections' | 'files', values: any[]) => Promise<void>} put
 * @property {(store: 'entries' | 'collections' | 'files', keys: string[]) => Promise<void>} remove
 * @property {(store: 'files') => Promise<string[]>} keys
 */

/**
 * The browser's IndexedDB, or null where it is missing or blocked.
 * @param {string} [dbName]
 * @returns {Promise<LibraryAdapter | null>}
 */
export async function indexedDbLibraryAdapter(dbName = LIBRARY_DB) {
  if (!globalThis.indexedDB) return null;
  try {
    /** @type {IDBDatabase} */
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('entries', { keyPath: 'id' });
        req.result.createObjectStore('collections', { keyPath: 'id' });
        req.result.createObjectStore('files', { keyPath: 'hash' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    /**
     * @template T
     * @param {string} store @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest<T> | void} fn
     * @returns {Promise<T | undefined>}
     */
    const run = (store, mode, fn) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('The library could not be written (storage full?).'));
    });
    return {
      name: 'indexedDB',
      all: async (store) => (await run(store, 'readonly', (s) => s.getAll())) ?? [],
      get: async (store, key) => (await run(store, 'readonly', (s) => s.get(key))) ?? null,
      put: async (store, values) => {
        await run(store, 'readwrite', (s) => { for (const v of values) s.put(v); });
      },
      remove: async (store, keys) => {
        await run(store, 'readwrite', (s) => { for (const k of keys) s.delete(k); });
      },
      keys: async (store) => /** @type {string[]} */ ((await run(store, 'readonly', (s) => s.getAllKeys())) ?? []),
    };
  } catch {
    return null;
  }
}

/**
 * An in-memory library (tests, and browsers without IndexedDB: the library
 * then lasts until the tab closes).
 * @returns {LibraryAdapter}
 */
export function memoryLibraryAdapter() {
  /** @type {Record<string, Map<string, any>>} */
  const data = { entries: new Map(), collections: new Map(), files: new Map() };
  const keyOf = (/** @type {string} */ store, /** @type {any} */ v) => (store === 'files' ? v.hash : v.id);
  return {
    name: 'memory',
    all: async (store) => [...data[store].values()].map((v) => (store === 'files' ? v : structuredClone(v))),
    get: async (store, key) => {
      const v = data[store].get(key);
      return v === undefined ? null : store === 'files' ? v : structuredClone(v);
    },
    put: async (store, values) => {
      for (const v of values) data[store].set(keyOf(store, v), store === 'files' ? v : structuredClone(v));
    },
    remove: async (store, keys) => {
      for (const k of keys) data[store].delete(k);
    },
    keys: async (store) => [...data[store].keys()],
  };
}

/**
 * Hex SHA-256 of bytes (the first 32 characters): the key of a library file.
 * @param {ArrayBuffer | Uint8Array} bytes
 */
export async function contentHash(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export class SlideLibrary {
  /** @param {LibraryAdapter} adapter */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /** @returns {Promise<LibraryEntry[]>} */
  entries() {
    return this.adapter.all('entries');
  }

  /** @returns {Promise<LibraryCollection[]>} */
  async collections() {
    return (await this.adapter.all('collections')).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  /**
   * Add entries with their files (hash → blob; files the library has are not stored again).
   * @param {LibraryEntry[]} entries
   * @param {Map<string, Blob>} files
   */
  async add(entries, files) {
    const have = new Set(await this.adapter.keys('files'));
    const fresh = [...files].filter(([hash]) => !have.has(hash)).map(([hash, blob]) => ({ hash, blob, type: blob.type }));
    if (fresh.length) await this.adapter.put('files', fresh);
    await this.adapter.put('entries', entries);
  }

  /**
   * Save changed entries (title, tags, note, collection, order, or a new slide with update()).
   * @param {LibraryEntry[]} entries
   */
  async save(entries) {
    await this.adapter.put('entries', entries.map((e) => ({ ...e, updatedAt: Date.now() })));
  }

  /**
   * Replace an entry's slide (and files), then drop files nothing uses.
   * @param {LibraryEntry} entry
   * @param {Map<string, Blob>} files
   */
  async update(entry, files) {
    await this.add([{ ...entry, updatedAt: Date.now() }], files);
    await this.collectGarbage();
  }

  /** @param {string[]} ids */
  async remove(ids) {
    await this.adapter.remove('entries', ids);
    await this.collectGarbage();
  }

  /** Remove stored files no entry uses. */
  async collectGarbage() {
    const used = new Set((await this.entries()).flatMap((e) => e.files.map((f) => f.hash)));
    const unused = (await this.adapter.keys('files')).filter((h) => !used.has(h));
    if (unused.length) await this.adapter.remove('files', unused);
  }

  /**
   * The bytes of a library file, or null.
   * @param {string} hash
   * @returns {Promise<Blob | null>}
   */
  async file(hash) {
    return (await this.adapter.get('files', hash))?.blob ?? null;
  }

  /** @param {LibraryCollection} collection */
  async saveCollection(collection) {
    await this.adapter.put('collections', [collection]);
  }

  /**
   * Remove a collection; its entries stay, in no collection.
   * @param {string} id
   */
  async removeCollection(id) {
    const moved = (await this.entries()).filter((e) => e.collection === id).map((e) => ({ ...e, collection: null }));
    if (moved.length) await this.save(moved);
    await this.adapter.remove('collections', [id]);
  }

  /**
   * A zip of entries (all when `ids` is absent) with their files and collections.
   * @param {string[]} [ids]
   * @returns {Promise<{ bytes: Uint8Array, count: number, missing: number }>}
   */
  async exportZip(ids) {
    const all = await this.entries();
    const entries = ids ? all.filter((e) => ids.includes(e.id)) : all;
    /** @type {Map<string, Uint8Array | string>} */
    const files = new Map();
    let missing = 0;
    for (const e of entries) {
      for (const f of e.files) {
        const name = zipFilePath(f);
        if (files.has(name)) continue;
        const blob = await this.file(f.hash);
        if (blob) files.set(name, new Uint8Array(await blob.arrayBuffer()));
        else missing += 1;
      }
    }
    files.set('library.json', JSON.stringify(libraryManifest(entries, await this.collections()), null, 2));
    return { bytes: await writeZip(files), count: entries.length, missing };
  }

  /**
   * Add a library zip to this library: new entries are added, newer copies of
   * entries replace older ones, the rest is skipped. Collections are merged by id.
   * @param {Uint8Array | ArrayBuffer} data
   * @returns {Promise<{ added: number, replaced: number, skipped: number }>}
   */
  async importZip(data) {
    const zip = await readZip(data);
    const manifestBytes = zip.get('library.json');
    if (!manifestBytes) throw new Error('This zip is not a Slipr slide library (no library.json).');
    let json;
    try {
      json = JSON.parse(new TextDecoder().decode(manifestBytes));
    } catch {
      throw new Error('The library.json in this zip cannot be read.');
    }
    const { entries, collections } = parseManifest(json);
    const plan = planImport(entries, await this.entries());
    /** @type {Map<string, Blob>} */
    const files = new Map();
    for (const e of [...plan.add, ...plan.replace]) {
      for (const f of e.files) {
        const bytes = zip.get(zipFilePath(f));
        if (bytes && !files.has(f.hash)) files.set(f.hash, new Blob([bytes], { type: f.type || mimeType(f.path) }));
      }
    }
    const known = new Set((await this.collections()).map((c) => c.id));
    const newCollections = collections.filter((c) => !known.has(c.id));
    if (newCollections.length) await this.adapter.put('collections', newCollections);
    await this.add([...plan.add, ...plan.replace], files);
    if (plan.replace.length) await this.collectGarbage();
    return { added: plan.add.length, replaced: plan.replace.length, skipped: plan.skip.length };
  }
}

/**
 * Open the slide library: IndexedDB, or memory where it is unavailable.
 * @param {{ adapter?: LibraryAdapter }} [options]
 * @returns {Promise<SlideLibrary>}
 */
export async function openSlideLibrary(options = {}) {
  return new SlideLibrary(options.adapter ?? (await indexedDbLibraryAdapter()) ?? memoryLibraryAdapter());
}
