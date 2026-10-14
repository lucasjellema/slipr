// @ts-check
/**
 * A button that opens a menu (I-102), following the WAI-ARIA menu-button
 * pattern: Enter, Space or ↓ opens it at the first item, ↑ at the last;
 * arrow keys, Home, End and a typed letter move; Enter or Space chooses;
 * Esc closes and returns focus to the button; Tab or a click elsewhere closes.
 * The entries are built each time the menu opens, so they show the current
 * state (recent shows, the theme in use).
 */

import { h } from '../dom.js';
import { menuTargetIndex, menuTypeAheadIndex } from '../menu-nav.js';

/**
 * @typedef {object} MenuEntry
 * @property {'item' | 'radio' | 'link' | 'separator' | 'heading'} [kind]  Default 'item'.
 * @property {string} [label]
 * @property {string} [detail]  A second, quieter line (a recent show's folder).
 * @property {string} [hint]  A keyboard shortcut shown on the right.
 * @property {string} [title]  Tooltip.
 * @property {boolean} [disabled]
 * @property {boolean} [checked]  For 'radio'.
 * @property {boolean} [narrowOnly]  Shown only in narrow windows (the views that leave the bar).
 * @property {string} [href]  For 'link': opens in the `target` tab.
 * @property {string} [target]
 * @property {(e: Event) => void} [onSelect]  For 'link', runs before the link is followed (to adjust its href).
 */

let nextId = 0;

/**
 * Create a menu button.
 * @param {{ label: string | Node[], title: string, ariaLabel?: string, className?: string, align?: 'start' | 'end', entries: () => MenuEntry[] | Promise<MenuEntry[]> }} options
 * @returns {HTMLElement}  A wrapper holding the button and its menu.
 */
export function createMenuButton({ label, title, ariaLabel, className = '', align = 'start', entries }) {
  const id = `slipr-menu-${++nextId}`;
  const button = /** @type {HTMLButtonElement} */ (h('button', {
    type: 'button',
    class: `slipr-btn slipr-menu-button ${className}`.trim(),
    title,
    'aria-label': ariaLabel,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-controls': id,
  }, Array.isArray(label) ? label : [label]));
  const menu = h('div', { id, class: `slipr-menu slipr-menu-${align}`, role: 'menu', 'aria-label': ariaLabel ?? (typeof label === 'string' ? label : title), hidden: true });
  const wrap = h('div', { class: 'slipr-menu-wrap' }, [button, menu]);

  /** Items the keyboard can reach: enabled and visible (narrow-only items are hidden by CSS). */
  const items = () => /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role^="menuitem"]')])
    .filter((el) => el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0);

  const isOpen = () => !menu.hidden;

  /** @param {'first' | 'last'} [focus] */
  async function open(focus = 'first') {
    const list = await entries();
    menu.replaceChildren(...list.map(renderEntry));
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const reachable = items();
    (focus === 'last' ? reachable.at(-1) : reachable[0])?.focus();
    document.addEventListener('pointerdown', onOutside, true);
  }

  /** @param {boolean} [returnFocus] */
  function close(returnFocus = false) {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (returnFocus) button.focus();
  }

  /** @param {PointerEvent} e */
  function onOutside(e) {
    if (!wrap.contains(/** @type {Node} */ (e.target))) close();
  }

  /** @param {MenuEntry} entry */
  function renderEntry(entry) {
    const kind = entry.kind ?? 'item';
    const narrow = entry.narrowOnly ? ' is-narrow-only' : '';
    if (kind === 'separator') return h('div', { class: `slipr-menu-separator${narrow}`, role: 'separator' });
    if (kind === 'heading') {
      return h('div', { class: 'slipr-menu-heading', role: 'presentation' }, [entry.label ?? '']);
    }
    const role = kind === 'radio' ? 'menuitemradio' : 'menuitem';
    const content = [
      h('span', { class: 'slipr-menu-label' }, [
        h('span', {}, [entry.label ?? '']),
        entry.detail ? h('span', { class: 'slipr-menu-detail' }, [entry.detail]) : null,
      ]),
      entry.hint ? h('kbd', { class: 'slipr-menu-hint' }, [entry.hint]) : null,
    ];
    const attrs = {
      class: `slipr-menu-item${narrow}`,
      role,
      tabindex: '-1',
      title: entry.title,
      'aria-checked': kind === 'radio' ? String(Boolean(entry.checked)) : undefined,
      'aria-disabled': entry.disabled ? 'true' : undefined,
    };
    if (kind === 'link') {
      // A link, not a button: it opens a new tab without a popup blocker (E-016).
      return h('a', {
        ...attrs,
        href: entry.href,
        target: entry.target,
        rel: 'noopener',
        onclick: (/** @type {MouseEvent} */ e) => {
          entry.onSelect?.(e);
          close();
        },
      }, content);
    }
    return h('button', {
      ...attrs,
      type: 'button',
      onclick: (/** @type {MouseEvent} */ e) => {
        if (entry.disabled) return;
        close(true);
        entry.onSelect?.(e);
      },
    }, content);
  }

  button.addEventListener('click', () => {
    if (isOpen()) close();
    else void open('first');
  });

  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      void open(e.key === 'ArrowUp' ? 'last' : 'first');
    }
  });

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const current = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close();
      return;
    }
    if (e.key === ' ' && document.activeElement instanceof HTMLAnchorElement) {
      e.preventDefault();
      document.activeElement.click();
      return;
    }
    let target = menuTargetIndex(e.key, current, list.length);
    if (target === null && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      target = menuTypeAheadIndex(e.key, current, list.map((el) => el.querySelector('.slipr-menu-label > span')?.textContent ?? ''));
    }
    if (target !== null) {
      e.preventDefault();
      list[target]?.focus();
    }
  });

  return wrap;
}
