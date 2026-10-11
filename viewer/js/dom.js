// @ts-check
/** Small DOM helpers shared by the viewer's modes. */

/**
 * Create an element with attributes and children. Strings become text nodes,
 * so this never interprets HTML.
 * @param {string} tag
 * @param {Record<string, string | boolean | undefined>} [attrs]
 * @param {(Node | string | null | undefined | false)[]} [children]
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/**
 * Add a stylesheet and resolve once it has loaded (or failed: a missing
 * stylesheet should degrade the looks, not block the show).
 * @param {string} href
 * @returns {Promise<HTMLLinkElement>}
 */
export function addStylesheet(href) {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // In a single-file export (I-054) stylesheets live in the file, not on a server.
    link.href = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(href) ?? href;
    link.onload = () => resolve(link);
    link.onerror = () => {
      console.warn(`Slipr: stylesheet failed to load: ${href}`);
      resolve(link);
    };
    document.head.append(link);
  });
}
