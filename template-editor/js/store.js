// @ts-check
/**
 * The template editor's store (I-106): the current state, undo and redo, and
 * subscribers. DOM-free.
 *
 *   const store = createStore(openTemplate(files));
 *   store.update((s) => setToken(s, '--slipr-color-accent', '#BC448C'), { coalesceKey: 'token:--slipr-color-accent' });
 *
 * Updates with the same `coalesceKey` in a row (typing in one field) are one
 * undo step.
 */

/**
 * @template S
 * @typedef {object} Store
 * @property {() => S} get
 * @property {(change: (state: S) => S, options?: { coalesceKey?: string, history?: boolean }) => void} update
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {(fn: (state: S, info: { coalesceKey?: string, kind: 'update' | 'undo' | 'redo' | 'replace' }) => void) => () => void} subscribe
 * @property {(state: S) => void} replace  New state without history (open, clone); clears undo.
 */

const LIMIT = 200;

/**
 * @template S
 * @param {S} initial
 * @returns {Store<S>}
 */
export function createStore(initial) {
  let state = initial;
  /** @type {S[]} */
  let past = [];
  /** @type {S[]} */
  let future = [];
  /** @type {string | undefined} */
  let lastKey;
  /** @type {Set<Function>} */
  const subscribers = new Set();

  /** @param {{ coalesceKey?: string, kind: 'update' | 'undo' | 'redo' | 'replace' }} info */
  const notify = (info) => {
    for (const fn of subscribers) fn(state, info);
  };

  return {
    get: () => state,
    update(change, options = {}) {
      const next = change(state);
      if (next === state) return;
      if (options.history !== false) {
        if (!(options.coalesceKey && options.coalesceKey === lastKey)) {
          past.push(state);
          if (past.length > LIMIT) past = past.slice(-LIMIT);
        }
        future = [];
        lastKey = options.coalesceKey;
      }
      state = next;
      notify({ coalesceKey: options.coalesceKey, kind: 'update' });
    },
    undo() {
      const prev = past.pop();
      if (prev === undefined) return;
      future.push(state);
      state = prev;
      lastKey = undefined;
      notify({ kind: 'undo' });
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return;
      past.push(state);
      state = next;
      lastKey = undefined;
      notify({ kind: 'redo' });
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    replace(next) {
      state = next;
      past = [];
      future = [];
      lastKey = undefined;
      notify({ kind: 'replace' });
    },
  };
}
