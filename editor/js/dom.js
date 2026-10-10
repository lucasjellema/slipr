// @ts-check
/**
 * DOM helper functions for the editor.
 */

/**
 * Create an element with attributes, event handlers and children.
 * Strings become text nodes (safe against XSS).
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {(Node | string | null | undefined | false)[]} [children]
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false || value === null) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      const eventName = name.slice(2).toLowerCase();
      el.addEventListener(eventName, value);
    } else if (name === 'checked' || name === 'disabled' || name === 'selected') {
      if (value) el.setAttribute(name, '');
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.append(document.createTextNode(String(child)));
    } else {
      el.append(child);
    }
  }
  return el;
}

/**
 * Add a stylesheet to document head.
 * @param {string} href
 * @returns {Promise<HTMLLinkElement>}
 */
export function addStylesheet(href) {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(link);
    link.onerror = () => {
      console.warn(`Slipr: stylesheet failed to load: ${href}`);
      resolve(link);
    };
    document.head.append(link);
  });
}
