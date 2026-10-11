// @ts-check
/**
 * The editor's user manual (help.html): its address, and the section that
 * belongs to each inspector tab (E-016). DOM-free, so it can be tested in Node.
 */

/** Path of the manual, relative to the editor page. */
export const HELP_PAGE = 'help.html';

/** Manual section (element id in help.html) per inspector tab. */
export const HELP_SECTIONS = Object.freeze({
  slide: 'slide-tab',
  reader: 'reader-tab',
  settings: 'settings',
});

/**
 * Address of the manual, at the section for the given inspector tab.
 * @param {string | null} [activeTab]  'slide', 'reader' or 'settings'; anything else opens the start.
 * @returns {string}
 */
export function helpUrl(activeTab = null) {
  const section = activeTab ? HELP_SECTIONS[/** @type {keyof typeof HELP_SECTIONS} */ (activeTab)] : undefined;
  return section ? `${HELP_PAGE}#${section}` : HELP_PAGE;
}

/**
 * Open the manual in a new tab (or the tab it is already in).
 * @param {string | null} [activeTab]
 */
export function openHelp(activeTab = null) {
  window.open(helpUrl(activeTab), 'slipr-help', 'noopener');
}
