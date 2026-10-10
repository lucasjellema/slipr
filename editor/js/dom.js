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

const FOCUSABLE = 'input, textarea, select, button';
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/**
 * Is this an element the user types text into?
 * @param {Element | null} el
 * @returns {el is HTMLInputElement | HTMLTextAreaElement}
 */
export function isTextEntry(el) {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type));
}

/**
 * Should a form skip re-rendering for this store event? Only when the event
 * is the echo of the user's own typing: a text field inside `root` has focus
 * and the action is one of the form's typing actions. Everything else (a
 * layout change, a button, undo/redo, another slide) re-renders, otherwise
 * the form shows stale fields.
 * @param {HTMLElement} root
 * @param {{ action?: { type: string } }} event
 * @param {Set<string>} typingActions  e.g. setSlot, setNotes
 */
export function isTypingEcho(root, event, typingActions) {
  const active = document.activeElement;
  return Boolean(active && root.contains(active) && isTextEntry(active) && event.action && typingActions.has(event.action.type));
}

/**
 * Re-render a form, keeping focus (by position among its controls), the text
 * selection and the scroll position of its scrolling ancestors.
 * @param {HTMLElement} root
 * @param {() => void} render
 */
export function rerenderKeepingFocus(root, render) {
  const active = document.activeElement;
  /** @type {{ index: number, tag: string, sel: [number | null, number | null] | null } | null} */
  let restore = null;
  if (active && root.contains(active)) {
    const index = [...root.querySelectorAll(FOCUSABLE)].indexOf(active);
    restore = { index, tag: active.tagName, sel: isTextEntry(active) ? [active.selectionStart, active.selectionEnd] : null };
  }
  /** @type {[Element, number][]} */
  const scrolled = [];
  for (let el = root.parentElement; el; el = el.parentElement) {
    if (el.scrollTop > 0) scrolled.push([el, el.scrollTop]);
  }

  render();

  for (const [el, top] of scrolled) el.scrollTop = top;
  if (restore && restore.index >= 0) {
    const el = root.querySelectorAll(FOCUSABLE)[restore.index];
    if (el instanceof HTMLElement && el.tagName === restore.tag) {
      el.focus({ preventScroll: true });
      if (restore.sel && isTextEntry(el)) {
        try {
          el.setSelectionRange(restore.sel[0], restore.sel[1]);
        } catch {
          // Some input types (e.g. date) have no selection.
        }
      }
    }
  }
}
