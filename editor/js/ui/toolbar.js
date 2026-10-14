// @ts-check
/**
 * Editor top bar (I-102): one row, grouped by task.
 * File ▾ · title ● · Save · ↶ ↷ 🔍 · Grid Glossary Library · Read · Present ▶ · ⋯
 * In narrow windows Grid, Glossary and Library move into ⋯ (CSS).
 */

import { h } from '../dom.js';
import { THEME_CHOICES, setThemeChoice, themeChoice } from '../theme.js';
import { HELP_PAGE, helpUrl } from '../help.js';
import { createMenuButton } from './menu-button.js';

/** Labels of the theme choices (I-082). */
const THEME_LABELS = { system: '◐ System', light: '☀ Light', dark: '☾ Dark' };

/**
 * @typedef {{ key: string, name: string, title?: string }} RecentShow
 */

/**
 * Mount the editor toolbar into a container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 * @param {{ onOpen?: () => void, onOpenZip?: () => void, onNew?: () => void, onSave?: () => void, onExport?: () => void, onExportZip?: () => void, onGrid?: () => void, onGlossary?: () => void, onLibrary?: () => void, onPresent?: () => void, onRead?: () => void, onFindReplace?: () => void, canOpenFolders?: boolean, listRecent?: () => Promise<RecentShow[]>, onRecent?: (key: string) => void }} [handlers]
 */
export function mountToolbar(container, store, handlers = {}) {
  const canOpenFolders = handlers.canOpenFolders ?? true;

  // File ▾: everything about the show as a file (replaces six buttons).
  const fileMenu = createMenuButton({
    label: 'File ▾',
    title: 'Open, create, save and export shows',
    ariaLabel: 'File',
    className: 'slipr-toolbar-file',
    entries: async () => {
      const recent = canOpenFolders ? await (handlers.listRecent?.() ?? Promise.resolve([])).catch(() => []) : [];
      return [
        { label: 'New show…', onSelect: () => handlers.onNew?.() },
        {
          label: 'Open folder…',
          hint: 'Ctrl+O',
          disabled: !canOpenFolders,
          title: canOpenFolders ? 'Open a show folder on your disk' : 'Opening folders needs Chrome or Edge; open a zip instead',
          onSelect: () => handlers.onOpen?.(),
        },
        { label: 'Open zip…', title: 'Open a show from a zip archive (.zip or .slipr)', onSelect: () => handlers.onOpenZip?.() },
        ...(recent.length
          ? [
              { kind: /** @type {const} */ ('separator') },
              { kind: /** @type {const} */ ('heading'), label: 'Recent shows' },
              ...recent.map((r) => ({
                label: r.title ?? r.name,
                detail: r.title && r.title !== r.name ? r.name : undefined,
                title: `Open the show in folder "${r.name}"`,
                onSelect: () => handlers.onRecent?.(r.key),
              })),
            ]
          : []),
        { kind: /** @type {const} */ ('separator') },
        { label: 'Save', hint: 'Ctrl+S', onSelect: () => handlers.onSave?.() },
        { kind: /** @type {const} */ ('separator') },
        {
          label: 'Export as one HTML file…',
          title: 'One file with show, template and viewer that presents offline',
          onSelect: () => handlers.onExport?.(),
        },
        {
          label: 'Export as zip…',
          title: 'The show folder (show.json, images, data and documents) as a .zip or .slipr archive',
          onSelect: () => handlers.onExportZip?.(),
        },
      ];
    },
  });

  const titleText = h('span', { class: 'slipr-toolbar-title-text' });
  const dirtyDot = h('span', { class: 'slipr-dirty-dot', title: 'Unsaved changes', 'aria-label': 'Unsaved changes' }, [' ●']);
  const title = h('span', { class: 'slipr-toolbar-title' }, [titleText, dirtyDot]);

  const saveButton = /** @type {HTMLButtonElement} */ (h('button', {
    type: 'button',
    class: 'slipr-btn slipr-btn-primary',
    title: 'Save show (Ctrl+S)',
    onclick: () => handlers.onSave?.(),
  }, ['Save']));

  /**
   * @param {string} icon
   * @param {string} label
   * @param {() => void} onclick
   */
  const iconButton = (icon, label, onclick) => /** @type {HTMLButtonElement} */ (h('button', {
    type: 'button',
    class: 'slipr-btn slipr-btn-icon',
    title: label,
    'aria-label': label,
    onclick,
  }, [h('span', { 'aria-hidden': 'true' }, [icon])]));

  const undoButton = iconButton('↶', 'Undo (Ctrl+Z)', () => store.undo());
  const redoButton = iconButton('↷', 'Redo (Ctrl+Y)', () => store.redo());
  const findButton = iconButton('🔍', 'Find and replace (Ctrl+F)', () => handlers.onFindReplace?.());

  const views = h('div', { class: 'slipr-toolbar-group slipr-toolbar-views' }, [
    h('button', {
      type: 'button',
      class: 'slipr-btn',
      title: 'Show grid: all slides and chapters at a glance, to reorder, group and tidy up',
      onclick: () => handlers.onGrid?.(),
    }, ['▦ Grid']),
    h('button', {
      type: 'button',
      class: 'slipr-btn',
      title: 'Glossary editor: all terms, their definitions and other names',
      onclick: () => handlers.onGlossary?.(),
    }, ['📖 Glossary']),
    h('button', {
      type: 'button',
      class: 'slipr-btn',
      title: 'Slide library: reuse slides from your other shows, and copy slides into it',
      onclick: () => handlers.onLibrary?.(),
    }, ['📚 Library']),
  ]);

  // ⋯ More: the theme, the manual, and (in narrow windows) the views.
  const moreMenu = createMenuButton({
    label: [h('span', { 'aria-hidden': 'true' }, ['⋯'])],
    title: 'More: theme, help, keyboard shortcuts',
    ariaLabel: 'More',
    className: 'slipr-btn-icon',
    align: 'end',
    entries: () => {
      const theme = themeChoice();
      return [
        { label: '▦ Grid', narrowOnly: true, onSelect: () => handlers.onGrid?.() },
        { label: '📖 Glossary', narrowOnly: true, onSelect: () => handlers.onGlossary?.() },
        { label: '📚 Library', narrowOnly: true, onSelect: () => handlers.onLibrary?.() },
        { kind: 'separator', narrowOnly: true },
        { kind: 'heading', label: 'Theme' },
        ...THEME_CHOICES.map((c) => ({
          kind: /** @type {const} */ ('radio'),
          label: THEME_LABELS[c],
          checked: c === theme,
          title: c === 'system' ? 'Follow the light or dark setting of your computer' : undefined,
          onSelect: () => setThemeChoice(c),
        })),
        { kind: 'separator' },
        {
          kind: 'link',
          label: 'Help',
          hint: 'F1',
          href: HELP_PAGE,
          target: 'slipr-help',
          title: 'User manual, at the section for the current tab',
          onSelect: (/** @type {Event} */ e) => {
            /** @type {HTMLAnchorElement} */ (e.currentTarget).href = helpUrl(store.state.activeTab);
          },
        },
        { kind: 'link', label: 'Keyboard shortcuts', href: `${HELP_PAGE}#shortcuts`, target: 'slipr-help' },
      ];
    },
  });
  const root = h('header', { class: 'slipr-toolbar' }, [
    h('div', { class: 'slipr-toolbar-group slipr-toolbar-start' }, [
      h('span', { class: 'slipr-logo-text' }, ['Slipr']),
      fileMenu,
      title,
      saveButton,
    ]),
    h('div', { class: 'slipr-toolbar-group slipr-toolbar-edit' }, [undoButton, redoButton, findButton]),
    views,
    h('div', { class: 'slipr-toolbar-group slipr-toolbar-end' }, [
      h('button', {
        type: 'button',
        class: 'slipr-btn',
        title: 'Save, then open reader mode at this slide',
        'aria-label': 'Read',
        onclick: () => handlers.onRead?.(),
      }, [h('span', { class: 'slipr-btn-text' }, ['Read']), ' 📖']),
      h('button', {
        type: 'button',
        class: 'slipr-btn slipr-btn-accent',
        title: 'Save, then present to an audience from this slide (F5)',
        'aria-label': 'Present',
        onclick: () => handlers.onPresent?.(),
      }, [h('span', { class: 'slipr-btn-text' }, ['Present']), ' ▶']),
      moreMenu,
    ]),
  ]);
  container.append(root);

  function update() {
    const state = store.state;
    const showTitle = state.show?.meta?.title || 'Untitled Show';
    titleText.textContent = showTitle;
    title.title = showTitle;
    dirtyDot.hidden = !state.dirty;
    saveButton.classList.toggle('is-dirty', Boolean(state.dirty));
    undoButton.disabled = !state.canUndo;
    redoButton.disabled = !state.canRedo;
  }

  store.subscribe(({ changedKeys }) => {
    if (['show', 'dirty', 'canUndo', 'canRedo'].some((k) => changedKeys.includes(k))) update();
  });

  update();
}
