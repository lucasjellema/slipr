// @ts-check
/**
 * Collapsible slide list (I-101): the left column shrinks to a rail of slide
 * numbers, so the slide form and the preview get its width. The state is a
 * class on <body> (`is-sidebar-collapsed`, styled in editor.css) and is
 * remembered in localStorage (a per-browser convenience; it may be missing).
 */

export const SIDEBAR_KEY = 'slipr-editor-sidebar';

/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} SimpleStorage */

/** @returns {SimpleStorage | null} */
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Was the slide list collapsed last time?
 * @param {SimpleStorage | null} [store]
 * @returns {boolean}
 */
export function savedCollapsed(store = storage()) {
  try {
    return store?.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/** @param {boolean} collapsed @param {SimpleStorage | null} [store] */
function save(collapsed, store = storage()) {
  try {
    store?.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // storage full or blocked: the choice lasts until the page is reloaded
  }
}

/** Is the slide list collapsed now? */
export function isSidebarCollapsed() {
  return typeof document !== 'undefined' && document.body.classList.contains('is-sidebar-collapsed');
}

/**
 * Collapse or expand the slide list, update its toggle buttons, and remember it.
 * @param {boolean} collapsed
 * @param {{ remember?: boolean }} [options]
 */
export function setSidebarCollapsed(collapsed, { remember = true } = {}) {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('is-sidebar-collapsed', collapsed);
  for (const button of document.querySelectorAll('[data-sidebar-toggle]')) {
    button.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Show the slide list (Ctrl+\\)' : 'Collapse the slide list to make room for the preview (Ctrl+\\)';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }
  if (remember) save(collapsed);
}

/** Collapse an expanded slide list, or expand a collapsed one. */
export function toggleSidebar() {
  setSidebarCollapsed(!isSidebarCollapsed());
}
