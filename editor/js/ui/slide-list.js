// @ts-check
/**
 * Editor slide list sidebar: displays thumbnails/items, handles selection,
 * reordering, addition, duplication, and deletion of slides.
 */

import { h } from '../dom.js';
import { slideTitle } from '../../../shared/render.js';

/**
 * Mount the slide list sidebar into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountSlideList(container, store) {
  const root = h('div', { class: 'slipr-slide-list-panel' });
  container.append(root);

  function render() {
    root.innerHTML = '';
    const state = store.state;
    const slides = Array.isArray(state.show?.slides) ? state.show.slides : [];
    const selectedId = state.selectedSlideId;

    // Header with actions
    const header = h('div', { class: 'slipr-panel-header' }, [
      h('div', { class: 'slipr-panel-title' }, [`Slides (${slides.length})`]),
      h('div', { class: 'slipr-panel-actions' }, [
        h(
          'button',
          {
            class: 'slipr-btn slipr-btn-sm',
            title: 'Add new slide (Ctrl+Enter)',
            onclick: () => store.dispatch('addSlide', { afterSlideId: selectedId, templateLayouts: state.template?.layouts }),
          },
          ['+ Add']
        ),
        h(
          'button',
          {
            class: `slipr-btn slipr-btn-sm ${state.activeTab === 'settings' ? 'is-active' : ''}`,
            title: 'Show Settings',
            onclick: () => store.setActiveTab('settings'),
          },
          ['⚙ Show']
        ),
      ]),
    ]);

    // Slides scrollable list
    const list = h('ol', { class: 'slipr-slide-items' });

    slides.forEach((slide, idx) => {
      const isSelected = slide.id === selectedId;
      const title = slideTitle(slide) || `Slide ${idx + 1}`;
      const isAudienceHidden = Boolean(slide.audience?.hidden);
      const isReaderHidden = Boolean(slide.reader?.hidden);

      const badges = [];
      if (slide.chapter) {
        const chapterTitle = state.show?.chapters?.find((c) => c.id === slide.chapter)?.title ?? slide.chapter;
        badges.push(h('span', { class: 'slipr-item-badge slipr-item-badge--chapter' }, [chapterTitle]));
      }
      if (isAudienceHidden) {
        badges.push(h('span', { class: 'slipr-item-badge slipr-item-badge--dim' }, ['No Audience']));
      }
      if (isReaderHidden) {
        badges.push(h('span', { class: 'slipr-item-badge slipr-item-badge--dim' }, ['No Reader']));
      }

      const item = h(
        'li',
        {
          class: `slipr-slide-item ${isSelected ? 'is-selected' : ''}`,
          onclick: (e) => {
            // Only select if not clicking an action button
            if (/** @type {HTMLElement} */ (e.target).closest('.slipr-item-btn')) return;
            store.selectSlide(slide.id);
            if (state.activeTab === 'settings') {
              store.setActiveTab('slide');
            }
          },
        },
        [
          h('div', { class: 'slipr-slide-item-num' }, [String(idx + 1)]),
          h('div', { class: 'slipr-slide-item-info' }, [
            h('div', { class: 'slipr-slide-item-title' }, [title]),
            h('div', { class: 'slipr-slide-item-meta' }, [
              h('span', { class: 'slipr-slide-item-layout' }, [slide.layout]),
              ...badges,
            ]),
          ]),
          h('div', { class: 'slipr-slide-item-tools' }, [
            h(
              'button',
              {
                class: 'slipr-item-btn',
                title: 'Move up (Alt+↑)',
                disabled: idx === 0,
                onclick: () => store.dispatch('moveSlide', { slideId: slide.id, toIndex: idx - 1 }),
              },
              ['▲']
            ),
            h(
              'button',
              {
                class: 'slipr-item-btn',
                title: 'Move down (Alt+↓)',
                disabled: idx === slides.length - 1,
                onclick: () => store.dispatch('moveSlide', { slideId: slide.id, toIndex: idx + 1 }),
              },
              ['▼']
            ),
            h(
              'button',
              {
                class: 'slipr-item-btn',
                title: 'Duplicate (Ctrl+D)',
                onclick: () => store.dispatch('duplicateSlide', { slideId: slide.id }),
              },
              ['⎘']
            ),
            h(
              'button',
              {
                class: 'slipr-item-btn slipr-item-btn-danger',
                title: 'Delete slide',
                disabled: slides.length <= 1,
                onclick: () => {
                  const hasContent = Object.keys(slide.content ?? {}).length > 0;
                  if (!hasContent || confirm(`Delete slide "${title}"?`)) {
                    store.dispatch('deleteSlide', { slideId: slide.id });
                  }
                },
              },
              ['🗑']
            ),
          ]),
        ]
      );

      list.append(item);
    });

    root.append(header, list);
  }

  store.subscribe(({ changedKeys }) => {
    if (
      changedKeys.includes('show') ||
      changedKeys.includes('selectedSlideId') ||
      changedKeys.includes('activeTab')
    ) {
      render();
    }
  });

  render();
}
