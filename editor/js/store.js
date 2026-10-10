// @ts-check
/**
 * Editor central state store.
 *
 * Implements one-way data flow:
 *   dispatch(action, payload) -> store -> notify subscribers
 *
 * Maintains undo/redo stacks, validates with shared/validate.js,
 * tracks dirty state, and coalesces rapid text typing.
 */

import { actions } from './actions.js';
import { validateShow } from '../../shared/validate.js';

const MAX_HISTORY = 100;
const DEFAULT_COALESCE_MS = 1000;

/**
 * @typedef {object} StoreState
 * @property {any} show
 * @property {any} [template]
 * @property {Map<string, any>} [layouts]
 * @property {((src: string) => string)} [resolveAsset]
 * @property {((path: string) => string)} [resolveTemplateAsset]
 * @property {any} [folderHandle]
 * @property {string | null} selectedSlideId
 * @property {'slide' | 'reader' | 'settings'} activeTab
 * @property {'audience' | 'reader'} previewMode
 * @property {string | null} previewProfile
 * @property {number} previewDepth
 * @property {boolean} dirty
 * @property {import('../../shared/validate.js').ValidationResult} validation
 * @property {boolean} canUndo
 * @property {boolean} canRedo
 */

/**
 * Create a new editor store.
 * @param {any} initialShow
 * @param {object} [context]
 * @returns {EditorStore}
 */
export function createStore(initialShow, context = {}) {
  return new EditorStore(initialShow, context);
}

/**
 * Validation issues that belong to one slide, or to the show as a whole.
 * Issue paths name slides by index (`slides[3].content.image`), not by id.
 * @param {{ errors?: any[], warnings?: any[] } | null | undefined} validation
 * @param {number} slideIndex
 * @returns {{ errors: any[], warnings: any[] }}
 */
export function issuesForSlide(validation, slideIndex) {
  const own = `slides[${slideIndex}]`;
  /** @param {any} issue */
  const relevant = (issue) => {
    const path = String(issue.path ?? '');
    if (!path.startsWith('slides[')) return true;
    return path === own || path.startsWith(`${own}.`) || path.startsWith(`${own}[`);
  };
  return {
    errors: (validation?.errors ?? []).filter(relevant),
    warnings: (validation?.warnings ?? []).filter(relevant),
  };
}

export class EditorStore {
  /**
   * @param {any} initialShow
   * @param {object} [context]
   */
  constructor(initialShow, context = {}) {
    /** @type {any[]} */
    this._undoStack = [];
    /** @type {any[]} */
    this._redoStack = [];

    /** @type {{ key: string, timestamp: number } | null} */
    this._lastCoalesce = null;

    /** @type {Set<(event: { state: StoreState, changedKeys: string[], action?: { type: string, payload: any } }) => void>} */
    this._subscribers = new Set();

    const template = context.template ?? null;
    const validation = validateShow(initialShow, { template });

    /** @type {StoreState} */
    this.state = {
      show: initialShow,
      template,
      layouts: context.layouts ?? new Map(),
      resolveAsset: context.resolveAsset ?? ((src) => src),
      resolveTemplateAsset: context.resolveTemplateAsset ?? ((path) => path),
      folderHandle: context.folderHandle ?? null,
      selectedSlideId: initialShow?.slides?.[0]?.id ?? null,
      activeTab: 'slide',
      previewMode: 'audience',
      previewProfile: null,
      previewDepth: 2,
      dirty: false,
      validation,
      canUndo: false,
      canRedo: false,
    };
  }

  /**
   * Subscribe to store updates.
   * @param {(event: { state: StoreState, changedKeys: string[], action?: { type: string, payload: any } }) => void} fn
   * @returns {() => void} Unsubscribe function
   */
  subscribe(fn) {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  /**
   * Notify all subscribers of state changes.
   * @param {string[]} changedKeys
   * @param {{ type: string, payload: any }} [action]
   */
  _notify(changedKeys, action) {
    this.state.canUndo = this._undoStack.length > 0;
    this.state.canRedo = this._redoStack.length > 0;
    const event = { state: this.state, changedKeys, action };
    for (const sub of this._subscribers) {
      try {
        sub(event);
      } catch (err) {
        console.error('Store subscriber error:', err);
      }
    }
  }

  /**
   * Dispatch an action to update the show.
   * @param {string} type Action name in actions registry
   * @param {any} payload
   * @param {{ coalesceKey?: string, coalesceWindow?: number }} [options]
   */
  dispatch(type, payload, options = {}) {
    const actionFn = /** @type {Function} */ (actions[type]);
    if (typeof actionFn !== 'function') {
      throw new Error(`Unknown editor action: ${type}`);
    }

    const prevShow = this.state.show;
    const nextShow = actionFn(prevShow, payload);
    if (nextShow === prevShow) return;

    // Check coalescing (e.g. typing text within 1s pause)
    const now = Date.now();
    const coalesceKey = options.coalesceKey;
    const coalesceWindow = options.coalesceWindow ?? DEFAULT_COALESCE_MS;

    const isCoalescing =
      Boolean(coalesceKey) &&
      this._lastCoalesce?.key === coalesceKey &&
      now - this._lastCoalesce.timestamp < coalesceWindow;

    if (!isCoalescing) {
      this._undoStack.push(prevShow);
      if (this._undoStack.length > MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
    }

    if (coalesceKey) {
      this._lastCoalesce = { key: coalesceKey, timestamp: now };
    } else {
      this._lastCoalesce = null;
    }

    this.state.show = nextShow;
    this.state.dirty = true;
    this.state.validation = validateShow(nextShow, { template: this.state.template });

    // If selected slide was deleted, select adjacent slide
    if (this.state.selectedSlideId) {
      const stillExists = nextShow.slides?.some((s) => s.id === this.state.selectedSlideId);
      if (!stillExists) {
        this.state.selectedSlideId = nextShow.slides?.[0]?.id ?? null;
      }
    }

    this._notify(['show', 'dirty', 'validation', 'canUndo', 'canRedo'], { type, payload });
  }

  /**
   * Undo the last show modification.
   * @returns {boolean} Whether an undo occurred
   */
  undo() {
    if (this._undoStack.length === 0) return false;
    const prevShow = this._undoStack.pop();
    this._redoStack.push(this.state.show);
    this._lastCoalesce = null;

    this.state.show = prevShow;
    this.state.dirty = true;
    this.state.validation = validateShow(prevShow, { template: this.state.template });

    if (this.state.selectedSlideId) {
      const exists = prevShow.slides?.some((s) => s.id === this.state.selectedSlideId);
      if (!exists) {
        this.state.selectedSlideId = prevShow.slides?.[0]?.id ?? null;
      }
    }

    this._notify(['show', 'dirty', 'validation', 'canUndo', 'canRedo']);
    return true;
  }

  /**
   * Redo the previously undone modification.
   * @returns {boolean} Whether a redo occurred
   */
  redo() {
    if (this._redoStack.length === 0) return false;
    const nextShow = this._redoStack.pop();
    this._undoStack.push(this.state.show);
    this._lastCoalesce = null;

    this.state.show = nextShow;
    this.state.dirty = true;
    this.state.validation = validateShow(nextShow, { template: this.state.template });

    if (this.state.selectedSlideId) {
      const exists = nextShow.slides?.some((s) => s.id === this.state.selectedSlideId);
      if (!exists) {
        this.state.selectedSlideId = nextShow.slides?.[0]?.id ?? null;
      }
    }

    this._notify(['show', 'dirty', 'validation', 'canUndo', 'canRedo']);
    return true;
  }

  /**
   * Reset dirty flag (after saving).
   */
  markClean() {
    if (!this.state.dirty) return;
    this.state.dirty = false;
    this._notify(['dirty']);
  }

  /**
   * Select a slide by ID.
   * @param {string | null} slideId
   */
  selectSlide(slideId) {
    if (this.state.selectedSlideId === slideId) return;
    this.state.selectedSlideId = slideId;
    this._notify(['selectedSlideId']);
  }

  /**
   * Switch the active editor tab.
   * @param {'slide' | 'reader' | 'settings'} tab
   */
  setActiveTab(tab) {
    if (this.state.activeTab === tab) return;
    this.state.activeTab = tab;
    this._notify(['activeTab']);
  }

  /**
   * Switch preview mode ('audience' | 'reader').
   * @param {'audience' | 'reader'} mode
   */
  setPreviewMode(mode) {
    if (this.state.previewMode === mode) return;
    this.state.previewMode = mode;
    this._notify(['previewMode']);
  }

  /**
   * Set target preview profile for reader mode.
   * @param {string | null} profileId
   */
  setPreviewProfile(profileId) {
    if (this.state.previewProfile === profileId) return;
    this.state.previewProfile = profileId;
    this._notify(['previewProfile']);
  }

  /**
   * Set preview depth level (1, 2, 3).
   * @param {number} depth
   */
  setPreviewDepth(depth) {
    if (this.state.previewDepth === depth) return;
    this.state.previewDepth = depth;
    this._notify(['previewDepth']);
  }

  /**
   * Load a new show context (e.g. from loadShow).
   * @param {any} showContext
   * @param {any} [folderHandle]
   */
  loadContext(showContext, folderHandle = null) {
    this._undoStack = [];
    this._redoStack = [];
    this._lastCoalesce = null;

    this.state.show = showContext.show;
    this.state.template = showContext.template;
    this.state.layouts = showContext.layouts ?? new Map();
    this.state.resolveAsset = showContext.resolveAsset ?? ((src) => src);
    this.state.resolveTemplateAsset = showContext.resolveTemplateAsset ?? ((path) => path);
    this.state.folderHandle = folderHandle;
    this.state.selectedSlideId = showContext.show?.slides?.[0]?.id ?? null;
    this.state.dirty = false;
    this.state.validation = validateShow(showContext.show, { template: showContext.template });

    this._notify([
      'show',
      'template',
      'layouts',
      'selectedSlideId',
      'dirty',
      'validation',
      'canUndo',
      'canRedo',
    ]);
  }
}
