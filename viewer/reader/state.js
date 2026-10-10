// @ts-check
/**
 * Reader state: everything personal about one reader and one show.
 * Stored only in the reader's own browser (D-010), keyed by show.id:
 * IndexedDB when available, else localStorage, else memory.
 *
 * The store itself (createStore, migrate) is pure and tested in Node.
 */

export const STATE_VERSION = 1;

/**
 * @typedef {object} Annotation
 * @property {string} id
 * @property {string} slideId
 * @property {string} blockId     Block id, or "_summary" for the slide summary.
 * @property {{ exact: string, prefix: string, suffix: string }} quote
 * @property {string} note        Empty for a plain highlight.
 * @property {string} created     ISO timestamp.
 * @property {string} [updated]
 */

/**
 * @typedef {object} ReaderState
 * @property {number} version
 * @property {import('./personalize.js').ReaderPrefs} prefs
 * @property {boolean} showNotes   Show the "What the presenter said" panels.
 * @property {boolean} welcomed    The welcome chooser has been completed or skipped.
 * @property {{ slideId: string } | null} position  Last slide read.
 * @property {string[]} visited
 * @property {string[]} bookmarks
 * @property {Annotation[]} annotations
 */

/** @returns {ReaderState} */
export function defaultState() {
  return {
    version: STATE_VERSION,
    prefs: { profile: null, depth: 2, path: null },
    showNotes: true,
    welcomed: false,
    position: null,
    visited: [],
    bookmarks: [],
    annotations: [],
  };
}

/**
 * Turn whatever was stored (possibly old or corrupt) into a valid state.
 * @param {any} raw
 * @returns {ReaderState}
 */
export function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const strings = (/** @type {any} */ v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string'))] : []);
  const prefs = raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {};
  const depth = [1, 2, 3].includes(prefs.depth) ? prefs.depth : base.prefs.depth;
  return {
    version: STATE_VERSION,
    prefs: {
      profile: typeof prefs.profile === 'string' ? prefs.profile : null,
      depth,
      path: typeof prefs.path === 'string' ? prefs.path : null,
    },
    showNotes: typeof raw.showNotes === 'boolean' ? raw.showNotes : base.showNotes,
    welcomed: raw.welcomed === true,
    position: raw.position && typeof raw.position.slideId === 'string' ? { slideId: raw.position.slideId } : null,
    visited: strings(raw.visited),
    bookmarks: strings(raw.bookmarks),
    annotations: Array.isArray(raw.annotations) ? raw.annotations.filter(isAnnotation) : [],
  };
}

/** @param {any} a @returns {a is Annotation} */
export function isAnnotation(a) {
  return !!a && typeof a.id === 'string' && typeof a.slideId === 'string' && typeof a.blockId === 'string'
    && !!a.quote && typeof a.quote.exact === 'string' && a.quote.exact.length > 0
    && typeof a.quote.prefix === 'string' && typeof a.quote.suffix === 'string'
    && typeof a.note === 'string' && typeof a.created === 'string';
}

/**
 * @typedef {object} Store
 * @property {() => ReaderState} get
 * @property {(change: Partial<ReaderState> | ((s: ReaderState) => Partial<ReaderState>)) => ReaderState} update
 * @property {(fn: (s: ReaderState) => void) => () => void} subscribe
 * @property {() => Promise<void>} flush  Write pending changes now.
 */

/**
 * @param {ReaderState} initial
 * @param {{ save: (state: ReaderState) => Promise<void> | void, delay?: number }} options
 * @returns {Store}
 */
export function createStore(initial, { save, delay = 300 }) {
  let state = initial;
  /** @type {Set<(s: ReaderState) => void>} */
  const listeners = new Set();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      await save(state);
    } catch (err) {
      console.warn('Slipr: could not save reader state', err);
    }
  };

  return {
    get: () => state,
    update(change) {
      const patch = typeof change === 'function' ? change(state) : change;
      state = { ...state, ...patch };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
      for (const fn of listeners) fn(state);
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush,
  };
}

// ---------------------------------------------------------------------------
// Storage adapters

/** @typedef {{ name: string, load: (key: string) => Promise<any>, save: (key: string, value: any) => Promise<void> }} Adapter */

/** @returns {Adapter} */
export function memoryAdapter() {
  const data = new Map();
  return {
    name: 'memory',
    load: async (key) => structuredClone(data.get(key)),
    save: async (key, value) => { data.set(key, structuredClone(value)); },
  };
}

/** @returns {Adapter | null} */
export function localStorageAdapter() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__slipr_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      name: 'localStorage',
      load: async (key) => {
        const text = ls.getItem(`slipr-reader:${key}`);
        return text ? JSON.parse(text) : undefined;
      },
      save: async (key, value) => ls.setItem(`slipr-reader:${key}`, JSON.stringify(value)),
    };
  } catch {
    return null;
  }
}

/** @returns {Promise<Adapter | null>} */
export async function indexedDbAdapter(dbName = 'slipr-reader') {
  if (!globalThis.indexedDB) return null;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('shows');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    /** @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest} fn */
    const run = (mode, fn) => new Promise((resolve, reject) => {
      const req = fn(/** @type {IDBDatabase} */ (db).transaction('shows', mode).objectStore('shows'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return {
      name: 'indexedDB',
      load: (key) => run('readonly', (s) => s.get(key)),
      save: async (key, value) => { await run('readwrite', (s) => s.put(value, key)); },
    };
  } catch {
    return null;
  }
}

/**
 * Open (or create) the reader state for a show.
 * @param {string} showId
 * @param {{ adapter?: Adapter }} [options]
 * @returns {Promise<Store & { adapter: string }>}
 */
export async function openReaderState(showId, options = {}) {
  const adapter = options.adapter ?? (await indexedDbAdapter()) ?? localStorageAdapter() ?? memoryAdapter();
  let raw;
  try {
    raw = await adapter.load(showId);
  } catch (err) {
    console.warn('Slipr: could not read reader state', err);
  }
  const store = createStore(migrate(raw), { save: (s) => adapter.save(showId, s) });
  // Last-moment save when the tab is hidden or closed.
  globalThis.addEventListener?.('pagehide', () => { store.flush(); });
  globalThis.document?.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
  return { ...store, adapter: adapter.name };
}
