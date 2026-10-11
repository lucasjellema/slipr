// @ts-check
/**
 * Light / dark theme (I-082). The choice (System, Light or Dark) is an editor
 * preference, kept per browser in localStorage, never in the show. The page
 * sets `data-theme` on <html> before the first paint with the same rule
 * (inline script in index.html and help.html); this module changes it later.
 */

export const THEME_KEY = 'slipr-editor-theme';
/** @typedef {'system' | 'light' | 'dark'} ThemeChoice */
export const THEME_CHOICES = /** @type {ThemeChoice[]} */ (['system', 'light', 'dark']);

/**
 * The theme to show for a choice. Pure.
 * @param {string | null | undefined} choice
 * @param {boolean} systemPrefersLight
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(choice, systemPrefersLight) {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemPrefersLight ? 'light' : 'dark';
}

/** @returns {ThemeChoice} */
export function themeChoice() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEME_CHOICES.includes(/** @type {ThemeChoice} */ (value)) ? /** @type {ThemeChoice} */ (value) : 'system';
  } catch {
    return 'system';
  }
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: light)');

/** Apply the current choice to the page. */
export function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme(themeChoice(), systemQuery().matches);
}

/**
 * Remember a choice and apply it.
 * @param {ThemeChoice} choice
 */
export function setThemeChoice(choice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice holds for this page only.
  }
  document.documentElement.dataset.theme = resolveTheme(choice, systemQuery().matches);
}

/**
 * Follow the system when the choice is System, and other tabs (the manual) when
 * the choice changes there.
 */
export function watchTheme() {
  systemQuery().addEventListener('change', () => {
    if (themeChoice() === 'system') applyTheme();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === null) applyTheme();
  });
}
