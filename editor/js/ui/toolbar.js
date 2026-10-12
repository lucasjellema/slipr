// @ts-check
/**
 * Editor top toolbar: title, dirty indicator, save, undo, redo, present, read, help.
 */

import { h } from '../dom.js';
import { THEME_CHOICES, setThemeChoice, themeChoice } from '../theme.js';
import { HELP_PAGE, helpUrl } from '../help.js';

/**
 * Mount the editor toolbar into a container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 * @param {{ onOpen?: () => void, onNew?: () => void, onSave?: () => void, onExport?: () => void, onGrid?: () => void, onGlossary?: () => void, onPresent?: () => void, onRead?: () => void, onFindReplace?: () => void }} [handlers]
 */
export function mountToolbar(container, store, handlers = {}) {
  const root = h('header', { class: 'slipr-toolbar' });
  container.append(root);

  function render() {
    root.innerHTML = '';
    const state = store.state;
    const title = state.show?.meta?.title || 'Untitled Show';
    const dirty = state.dirty;

    const brand = h('div', { class: 'slipr-toolbar-brand' }, [
      h('span', { class: 'slipr-logo-text' }, ['Slipr']),
      h('span', { class: 'slipr-toolbar-badge' }, ['Editor']),
      h('span', { class: 'slipr-toolbar-title' }, [
        title,
        dirty ? h('span', { class: 'slipr-dirty-dot', title: 'Unsaved changes' }, [' ●']) : null,
      ]),
    ]);

    const historyGroup = h('div', { class: 'slipr-toolbar-group' }, [
      h(
        'button',
        {
          class: 'slipr-btn slipr-btn-icon',
          title: 'Undo (Ctrl+Z)',
          disabled: !state.canUndo,
          onclick: () => store.undo(),
        },
        ['↶ Undo']
      ),
      h(
        'button',
        {
          class: 'slipr-btn slipr-btn-icon',
          title: 'Redo (Ctrl+Y)',
          disabled: !state.canRedo,
          onclick: () => store.redo(),
        },
        ['↷ Redo']
      ),
      h(
        'button',
        {
          class: 'slipr-btn slipr-btn-icon',
          title: 'Find and Replace (Ctrl+H or Ctrl+F)',
          onclick: () => handlers.onFindReplace?.(),
        },
        ['🔍 Find & Replace']
      ),
    ]);

    const fileGroup = h('div', { class: 'slipr-toolbar-group' }, [
      h(
        'button',
        {
          class: 'slipr-btn',
          title: 'Open show folder',
          onclick: () => handlers.onOpen?.(),
        },
        ['Open…']
      ),
      h(
        'button',
        {
          class: 'slipr-btn',
          title: 'New show from template',
          onclick: () => handlers.onNew?.(),
        },
        ['New…']
      ),
      h(
        'button',
        {
          class: `slipr-btn slipr-btn-primary ${dirty ? 'is-dirty' : ''}`,
          title: 'Save show (Ctrl+S)',
          onclick: () => handlers.onSave?.(),
        },
        ['Save']
      ),
      h(
        'button',
        {
          class: 'slipr-btn',
          title: 'Export as one HTML file that presents offline (show, template and viewer in one file)',
          onclick: () => handlers.onExport?.(),
        },
        ['Export…']
      ),
    ]);

    const runGroup = h('div', { class: 'slipr-toolbar-group' }, [
      h(
        'button',
        {
          class: 'slipr-btn',
          title: 'Show grid: all slides and chapters at a glance, to reorder, group and tidy up',
          onclick: () => handlers.onGrid?.(),
        },
        ['▦ Grid']
      ),
      h(
        'button',
        {
          class: 'slipr-btn',
          title: 'Glossary editor: dedicated full-page editor for definitions, aliases, and deck-aware completion (I-088)',
          onclick: () => handlers.onGlossary?.(),
        },
        ['📖 Glossary']
      ),
      h(
        'button',
        {
          class: 'slipr-btn slipr-btn-accent',
          title: 'Present audience view (F5)',
          onclick: () => handlers.onPresent?.(),
        },
        ['Present ▶']
      ),
      h(
        'button',
        {
          class: 'slipr-btn',
          title: 'Read interactive show',
          onclick: () => handlers.onRead?.(),
        },
        ['Read 📖']
      ),
      // A link, not a button: it opens in a new tab without a popup blocker,
      // and the click points it at the section for the current tab (E-016).
      h(
        'a',
        {
          class: 'slipr-btn',
          href: HELP_PAGE,
          target: 'slipr-help',
          rel: 'noopener',
          title: 'User manual (F1)',
          onclick: (/** @type {MouseEvent} */ e) => {
            /** @type {HTMLAnchorElement} */ (e.currentTarget).href = helpUrl(store.state.activeTab);
          },
        },
        ['? Help']
      ),
      themeSelect(),
    ]);

    root.append(brand, historyGroup, fileGroup, runGroup);
  }

  store.subscribe(({ changedKeys }) => {
    if (
      changedKeys.includes('show') ||
      changedKeys.includes('dirty') ||
      changedKeys.includes('canUndo') ||
      changedKeys.includes('canRedo')
    ) {
      render();
    }
  });

  render();
}

/** Labels of the theme choices (I-082). */
const THEME_LABELS = { system: '◐ System', light: '☀ Light', dark: '☾ Dark' };

/** The Light / Dark / System switch (I-082). */
function themeSelect() {
  const current = themeChoice();
  const select = /** @type {HTMLSelectElement} */ (h('select', {
    class: 'slipr-select slipr-select-sm slipr-theme-select',
    'aria-label': 'Theme',
    title: 'Theme: light, dark, or follow the system setting',
    onchange: () => setThemeChoice(/** @type {any} */ (select.value)),
  }, THEME_CHOICES.map((c) => h('option', { value: c, selected: c === current ? true : undefined }, [THEME_LABELS[c]]))));
  return select;
}
