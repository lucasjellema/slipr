// @ts-check
/**
 * Draft store for autosave and crash recovery (I-020).
 *
 * Persists unsaved show drafts to IndexedDB (falling back to localStorage
 * and memory) every 5 seconds while the store is dirty, and immediately
 * on tab hide/close.
 *
 * Provides crash recovery on open if an unsaved draft is found.
 */

import { serializeShow } from './serialize.js';

export const DB_NAME = 'slipr-drafts';
export const STORE_NAME = 'drafts';
export const DEFAULT_AUTOSAVE_MS = 5000;

/**
 * @typedef {object} DraftRecord
 * @property {string} key          Primary key, e.g. 'folder:abc' or 'url:path' or 'id:show-id'
 * @property {any} show            Complete show JSON
 * @property {string | null} [showId]
 * @property {string | null} [folderKey]
 * @property {string | null} [showUrl]
 * @property {string | null} [title]
 * @property {number} updatedAt    ms since epoch
 */

/**
 * Stable key to identify which show the draft belongs to.
 * @param {{ folderKey?: string | null, showUrl?: string | null, showId?: string | null }} [target]
 * @returns {string}
 */
export function getDraftKey({ folderKey, showUrl, showId } = {}) {
  if (folderKey) return `folder:${folderKey}`;
  if (showUrl) return `url:${showUrl}`;
  if (showId) return `id:${showId}`;
  return 'draft:default';
}

/**
 * Format a draft's timestamp for human display in dialogs and banners.
 * @param {number | null | undefined} timestamp
 * @returns {string}
 */
export function formatDraftTime(timestamp) {
  if (!timestamp || typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return 'a previous session';
  }
  const d = new Date(timestamp);
  const now = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((nowDay - dDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return `today at ${time}`;
  if (diffDays === 1) return `yesterday at ${time}`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = months[d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${monthStr} at ${time}`;
  }
  return `${d.getDate()} ${monthStr} ${d.getFullYear()} at ${time}`;
}

// ---------------------------------------------------------------------------
// Adapters (IndexedDB -> localStorage -> memory)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} DraftAdapter
 * @property {string} name
 * @property {(key: string) => Promise<DraftRecord | null>} get
 * @property {(key: string, record: DraftRecord) => Promise<void>} set
 * @property {(key: string) => Promise<void>} delete
 * @property {() => Promise<DraftRecord[]>} list
 * @property {() => Promise<void>} clear
 * @property {(() => void)} [close]
 */

/**
 * @param {string} [dbName]
 * @returns {Promise<DraftAdapter | null>}
 */
export async function indexedDbAdapter(dbName = DB_NAME) {
  if (!globalThis.indexedDB) return null;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('updatedAt', 'updatedAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    /**
     * @param {IDBTransactionMode} mode
     * @param {(s: IDBObjectStore) => IDBRequest} fn
     */
    const run = (mode, fn) =>
      new Promise((resolve, reject) => {
        const tx = /** @type {IDBDatabase} */ (db).transaction(STORE_NAME, mode);
        const req = fn(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        req.onerror = () => reject(req.error);
      });

    return {
      name: 'indexedDB',
      get: async (key) => (await run('readonly', (s) => s.get(key))) ?? null,
      set: async (key, record) => {
        await run('readwrite', (s) => s.put({ ...record, key }));
      },
      delete: async (key) => {
        await run('readwrite', (s) => s.delete(key));
      },
      list: async () => {
        const all = /** @type {DraftRecord[]} */ (await run('readonly', (s) => s.getAll()));
        return (all ?? []).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      },
      clear: async () => {
        await run('readwrite', (s) => s.clear());
      },
      close: () => /** @type {IDBDatabase} */ (db).close(),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} [prefix]
 * @returns {DraftAdapter | null}
 */
export function localStorageAdapter(prefix = 'slipr-draft:') {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = '__slipr_draft_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);

    return {
      name: 'localStorage',
      get: async (key) => {
        const item = ls.getItem(prefix + key);
        return item ? JSON.parse(item) : null;
      },
      set: async (key, record) => {
        ls.setItem(prefix + key, JSON.stringify({ ...record, key }));
      },
      delete: async (key) => {
        ls.removeItem(prefix + key);
      },
      list: async () => {
        /** @type {DraftRecord[]} */
        const items = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k?.startsWith(prefix)) {
            try {
              items.push(JSON.parse(ls.getItem(k) ?? ''));
            } catch {}
          }
        }
        return items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      },
      clear: async () => {
        const toDelete = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k?.startsWith(prefix)) toDelete.push(k);
        }
        for (const k of toDelete) ls.removeItem(k);
      },
    };
  } catch {
    return null;
  }
}

/**
 * In-memory adapter (for tests and unsupported environments).
 * @returns {DraftAdapter}
 */
export function memoryAdapter() {
  const data = new Map();
  return {
    name: 'memory',
    get: async (key) => structuredClone(data.get(key) ?? null),
    set: async (key, record) => {
      data.set(key, structuredClone({ ...record, key }));
    },
    delete: async (key) => {
      data.delete(key);
    },
    list: async () => {
      const items = Array.from(data.values()).map((v) => structuredClone(v));
      return items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    },
    clear: async () => {
      data.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// DraftStore
// ---------------------------------------------------------------------------

export class DraftStore {
  /**
   * @param {DraftAdapter} adapter
   */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /**
   * @param {string} key
   * @returns {Promise<DraftRecord | null>}
   */
  async getDraft(key) {
    try {
      return await this.adapter.get(key);
    } catch (err) {
      console.warn('Slipr: could not read draft', err);
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {any} show
   * @param {object} [meta]
   * @returns {Promise<void>}
   */
  async saveDraft(key, show, meta = {}) {
    try {
      /** @type {DraftRecord} */
      const record = {
        key,
        show,
        showId: show?.id ?? null,
        title: show?.meta?.title ?? null,
        updatedAt: Date.now(),
        ...meta,
      };
      await this.adapter.set(key, record);
    } catch (err) {
      console.warn('Slipr: could not save draft', err);
    }
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async deleteDraft(key) {
    try {
      await this.adapter.delete(key);
    } catch (err) {
      console.warn('Slipr: could not delete draft', err);
    }
  }

  /**
   * @returns {Promise<DraftRecord[]>}
   */
  async listDrafts() {
    try {
      return await this.adapter.list();
    } catch (err) {
      console.warn('Slipr: could not list drafts', err);
      return [];
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await this.adapter.clear();
    } catch (err) {
      console.warn('Slipr: could not clear drafts', err);
    }
  }
}

/**
 * Open or create the draft store.
 * @param {{ adapter?: DraftAdapter }} [options]
 * @returns {Promise<DraftStore>}
 */
export async function openDraftStore(options = {}) {
  const adapter = options.adapter ?? (await indexedDbAdapter()) ?? localStorageAdapter() ?? memoryAdapter();
  return new DraftStore(adapter);
}

// ---------------------------------------------------------------------------
// Autosave watcher
// ---------------------------------------------------------------------------

/**
 * Automatically persist drafts every `intervalMs` while the store is dirty,
 * flush immediately on tab hide/close, and delete the draft when saved.
 *
 * @param {import('../store.js').EditorStore} store
 * @param {{
 *   draftKey: string,
 *   draftStore: DraftStore,
 *   intervalMs?: number,
 *   meta?: object,
 * }} options
 * @returns {{ stop: () => void, flush: () => Promise<void> }}
 */
export function startAutosave(store, { draftKey, draftStore, intervalMs = DEFAULT_AUTOSAVE_MS, meta = {} }) {
  let lastDraftJson = null;
  /** @type {any} */
  let timer = null;

  async function saveIfDirty() {
    if (!store?.state?.dirty) return;
    const currentShow = store.state.show;
    try {
      const json = JSON.stringify(currentShow);
      if (json === lastDraftJson) return;
      await draftStore.saveDraft(draftKey, currentShow, meta);
      lastDraftJson = json;
    } catch (err) {
      console.warn('Slipr: could not autosave draft', err);
    }
  }

  // Periodic autosave timer
  timer = setInterval(() => {
    saveIfDirty();
  }, intervalMs);

  // Clean up draft when the show is saved to disk
  const unsubscribe = store.subscribe(async ({ changedKeys }) => {
    if (changedKeys.includes('dirty') && !store.state.dirty) {
      lastDraftJson = null;
      try {
        await draftStore.deleteDraft(draftKey);
      } catch (err) {
        console.warn('Slipr: could not clear draft on clean save', err);
      }
    }
  });

  const flush = async () => {
    await saveIfDirty();
  };

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flush();
    }
  };

  const onPageHide = () => {
    flush();
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
  }

  return {
    stop() {
      if (timer) clearInterval(timer);
      unsubscribe();
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('beforeunload', onPageHide);
      }
    },
    flush,
  };
}
