// @ts-check
/**
 * Editor show settings tab: metadata, global presentation settings,
 * chapters, glossary, profiles, and curated paths.
 */

import { h, isTypingEcho, rerenderKeepingFocus } from '../dom.js';

/** Actions the settings form dispatches while the user types. */
const TYPING_ACTIONS = new Set(['setMeta', 'setSettings', 'upsertChapter']);

/**
 * Mount the show settings panel into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountShowSettings(container, store) {
  const root = h('div', { class: 'slipr-show-settings-panel' });
  container.append(root);

  function render() {
    root.innerHTML = '';
    const state = store.state;
    const show = state.show ?? {};
    const meta = show.meta ?? {};
    const settings = show.settings ?? {};

    const heading = h('h2', { class: 'slipr-panel-title' }, ['Show Settings']);

    // Meta section
    const metaSection = h('fieldset', { class: 'slipr-fieldset' }, [
      h('legend', {}, ['Metadata']),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Show Title']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.title ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { title: /** @type {HTMLInputElement} */ (e.target).value }, {
              coalesceKey: 'meta-title',
            });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Subtitle']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.subtitle ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { subtitle: /** @type {HTMLInputElement} */ (e.target).value }, {
              coalesceKey: 'meta-subtitle',
            });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Author']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.author ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { author: /** @type {HTMLInputElement} */ (e.target).value }, {
              coalesceKey: 'meta-author',
            });
          },
        }),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Date']),
        h('input', {
          type: 'text',
          class: 'slipr-input',
          value: meta.date ?? '',
          oninput: (e) => {
            store.dispatch('setMeta', { date: /** @type {HTMLInputElement} */ (e.target).value }, {
              coalesceKey: 'meta-date',
            });
          },
        }),
      ]),
    ]);

    // Presentation Settings
    const settingsSection = h('fieldset', { class: 'slipr-fieldset' }, [
      h('legend', {}, ['Audience Presentation Settings']),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Aspect Ratio']),
        h(
          'select',
          {
            class: 'slipr-select',
            onchange: (e) => {
              store.dispatch('setSettings', { aspectRatio: /** @type {HTMLSelectElement} */ (e.target).value });
            },
          },
          [
            h('option', { value: '16:9', selected: settings.aspectRatio === '16:9' ? true : undefined }, ['16:9 (Standard Widescreen)']),
            h('option', { value: '4:3', selected: settings.aspectRatio === '4:3' ? true : undefined }, ['4:3 (Traditional)']),
          ]
        ),
      ]),
      h('div', { class: 'slipr-form-group' }, [
        h('label', { class: 'slipr-label' }, ['Slide Transition']),
        h(
          'select',
          {
            class: 'slipr-select',
            onchange: (e) => {
              store.dispatch('setSettings', { transition: /** @type {HTMLSelectElement} */ (e.target).value });
            },
          },
          [
            h('option', { value: 'fade', selected: settings.transition === 'fade' ? true : undefined }, ['Fade']),
            h('option', { value: 'slide', selected: settings.transition === 'slide' ? true : undefined }, ['Slide']),
            h('option', { value: 'none', selected: settings.transition === 'none' ? true : undefined }, ['None']),
          ]
        ),
      ]),
    ]);

    // Chapters list
    const chapters = show.chapters ?? [];
    const chaptersSection = h('fieldset', { class: 'slipr-fieldset' }, [
      h('legend', {}, [`Chapters (${chapters.length})`]),
      h(
        'button',
        {
          class: 'slipr-btn slipr-btn-sm',
          onclick: () => {
            const id = `chap-${Math.random().toString(36).slice(2, 6)}`;
            store.dispatch('upsertChapter', { id, title: 'New Chapter' });
          },
        },
        ['+ Add Chapter']
      ),
      h(
        'div',
        { class: 'slipr-entity-list' },
        chapters.map((chap) =>
          h('div', { class: 'slipr-entity-item' }, [
            h('input', {
              type: 'text',
              class: 'slipr-input slipr-input-sm',
              value: chap.title,
              onchange: (e) => {
                store.dispatch('upsertChapter', { ...chap, title: /** @type {HTMLInputElement} */ (e.target).value });
              },
            }),
            h(
              'button',
              {
                class: 'slipr-item-btn slipr-item-btn-danger',
                title: 'Delete chapter',
                onclick: () => store.dispatch('deleteChapter', { chapterId: chap.id }),
              },
              ['🗑']
            ),
          ])
        )
      ),
    ]);

    root.append(heading, metaSection, settingsSection, chaptersSection);
  }

  store.subscribe((event) => {
    if (event.changedKeys.includes('show')) {
      // Leave the form alone while it echoes the user's own typing; re-render for anything else.
      if (isTypingEcho(root, event, TYPING_ACTIONS)) return;
      rerenderKeepingFocus(root, render);
    }
  });

  render();
}
