// @ts-check
/**
 * The viewer's user manual (help.html): its address, and section mappings
 * for contextual help in audience and reader modes (V-019).
 * DOM-free, so it can be tested in Node.
 */

/** Path of the manual, relative to the viewer root. */
export const HELP_PAGE = 'help.html';

/** Manual section (element id in help.html) for various viewer topics. */
export const HELP_SECTIONS = Object.freeze({
  concept: 'concept',
  audience: 'audience',
  remote: 'remote',
  reader: 'reader',
  tailoring: 'tailoring',
  blocks: 'blocks',
  glossary: 'glossary',
  annotations: 'annotations',
  search: 'search',
  open: 'open',
  shortcuts: 'shortcuts',
  troubleshooting: 'troubleshooting',
});

/**
 * Address of the manual, optionally navigated to a specific section.
 * @param {string | null} [topic] Section key or id in help.html.
 * @returns {string}
 */
export function helpUrl(topic = null) {
  if (!topic) return HELP_PAGE;
  const section = HELP_SECTIONS[/** @type {keyof typeof HELP_SECTIONS} */ (topic)] || topic;
  return `${HELP_PAGE}#${section}`;
}

/**
 * Open the manual in a new browser tab or focus an existing one.
 * @param {string | null} [topic]
 */
export function openHelp(topic = null) {
  window.open(helpUrl(topic), 'slipr-viewer-help', 'noopener');
}
