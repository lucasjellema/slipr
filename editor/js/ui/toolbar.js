// @ts-check
/**
 * Editor top toolbar: title, dirty indicator, save, undo, redo, present, read.
 */

import { h } from '../dom.js';

/**
 * Mount the editor toolbar into a container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 * @param {{ onOpen?: () => void, onNew?: () => void, onSave?: () => void, onPresent?: () => void, onRead?: () => void }} [handlers]
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
    ]);

    const runGroup = h('div', { class: 'slipr-toolbar-group' }, [
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
