// @ts-check
/**
 * Editor slide list sidebar: displays thumbnails/items, handles selection,
 * reordering, addition, duplication, and deletion of slides. A "Go to slide"
 * filter and keyboard navigation (↑/↓, PageUp/PageDown, Home/End) make long
 * shows easy to move through.
 */

import { h } from '../dom.js';
import { slideTitle } from '../../../shared/render.js';
import { matchSlides, navigateIndex } from '../slide-filter.js';

/**
 * Mount the slide list sidebar into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 */
export function mountSlideList(container, store) {
  const root = h('div', { class: 'slipr-slide-list-panel' });
  const header = h('div', { class: 'slipr-panel-header' });
  let query = '';
  /** @type {number[]} Slide numbers (1-based) the filter shows. */
  let visible = [];

  // "Go to slide": built once, so typing keeps focus while the list re-renders.
  const filterInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'search',
    class: 'slipr-input slipr-input-sm slipr-slide-filter',
    placeholder: 'Go to slide: number or title…',
    'aria-label': 'Go to slide: type a number or words from the title',
    'aria-controls': 'slipr-slide-items',
    oninput: () => {
      query = filterInput.value;
      renderList();
    },
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      if ((e.key === 'Enter' || e.key === 'ArrowDown') && visible.length) {
        e.preventDefault();
        selectIndex(visible[0] - 1, true);
      } else if (e.key === 'Escape' && query) {
        e.preventDefault();
        filterInput.value = '';
        query = '';
        renderList();
      }
    },
  }));

  const list = h('ol', {
    class: 'slipr-slide-items',
    id: 'slipr-slide-items',
    'aria-label': 'Slides',
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+↑/↓ moves the slide (shortcuts.js)
      if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        store.setActiveTab('slide');
        return;
      }
      // Navigate within the slides the filter shows.
      const slides = store.state.show?.slides ?? [];
      const indexes = visible.map((n) => n - 1);
      const current = slides.findIndex((/** @type {any} */ s) => s.id === store.state.selectedSlideId);
      const pos = navigateIndex(e.key, Math.max(0, indexes.indexOf(current)), indexes.length);
      if (pos === null) return;
      e.preventDefault();
      selectIndex(indexes[pos], true);
    },
  });

  root.append(header, h('div', { class: 'slipr-slide-filter-row' }, [filterInput]), list);
  container.append(root);

  /**
   * @param {number} index  0-based slide index.
   * @param {boolean} focus Move keyboard focus to the slide.
   */
  function selectIndex(index, focus) {
    const slide = store.state.show?.slides?.[index];
    if (!slide) return;
    store.selectSlide(slide.id);
    if (store.state.activeTab === 'settings') store.setActiveTab('slide');
    const item = list.querySelector(`[data-slide-id="${CSS.escape(slide.id)}"]`);
    if (item instanceof HTMLElement) {
      item.scrollIntoView({ block: 'nearest' });
      if (focus) item.focus();
    }
  }

  function renderHeader() {
    const state = store.state;
    const slides = Array.isArray(state.show?.slides) ? state.show.slides : [];
    header.replaceChildren(
      h('div', { class: 'slipr-panel-title' }, [`Slides (${slides.length})`]),
      h('div', { class: 'slipr-panel-actions' }, [
        h(
          'button',
          {
            class: 'slipr-btn slipr-btn-sm',
            title: 'Add new slide (Ctrl+Enter)',
            onclick: () => store.dispatch('addSlide', { afterSlideId: store.state.selectedSlideId, templateLayouts: store.state.template?.layouts }),
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
      ])
    );
  }

  function renderList() {
    const state = store.state;
    const slides = Array.isArray(state.show?.slides) ? state.show.slides : [];
    const selectedId = state.selectedSlideId;
    const hadFocus = list.contains(document.activeElement);
    const scrollTop = list.scrollTop;
    const chapterTitle = (/** @type {string} */ id) =>
      state.show?.chapters?.find((/** @type {any} */ c) => c.id === id)?.title ?? id;

    visible = matchSlides(
      slides.map((/** @type {any} */ s, /** @type {number} */ i) => ({
        number: i + 1,
        title: slideTitle(s) || s.id,
        layout: s.layout,
        chapter: s.chapter ? chapterTitle(s.chapter) : undefined,
      })),
      query
    );
    const shown = new Set(visible);
    list.replaceChildren();

    slides.forEach((/** @type {any} */ slide, /** @type {number} */ idx) => {
      if (!shown.has(idx + 1)) return;
      const isSelected = slide.id === selectedId;
      const title = slideTitle(slide) || `Slide ${idx + 1}`;
      const isAudienceHidden = Boolean(slide.audience?.hidden);
      const isReaderHidden = Boolean(slide.reader?.hidden);

      const badges = [];
      if (slide.chapter) {
        badges.push(h('span', { class: 'slipr-item-badge slipr-item-badge--chapter' }, [chapterTitle(slide.chapter)]));
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
          'data-slide-id': slide.id,
          tabindex: isSelected ? '0' : '-1',
          'aria-current': isSelected ? 'true' : undefined,
          onclick: (/** @type {MouseEvent} */ e) => {
            // Only select if not clicking an action button
            if (/** @type {HTMLElement} */ (e.target).closest('.slipr-item-btn')) return;
            store.selectSlide(slide.id);
            if (store.state.activeTab === 'settings') {
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

    if (visible.length === 0) {
      list.append(h('li', { class: 'slipr-empty-state' }, [`No slide matches “${query}”`]));
    }

    // Keep the scroll position across re-renders, and focus on the selected slide.
    list.scrollTop = scrollTop;
    const selectedItem = list.querySelector('.slipr-slide-item.is-selected');
    if (hadFocus && selectedItem instanceof HTMLElement) selectedItem.focus({ preventScroll: true });
  }

  /** Scroll the selected slide into view after a selection change from anywhere. */
  function revealSelected() {
    const item = list.querySelector('.slipr-slide-item.is-selected');
    if (item instanceof HTMLElement) item.scrollIntoView({ block: 'nearest' });
  }

  store.subscribe(({ changedKeys }) => {
    if (changedKeys.includes('show') || changedKeys.includes('activeTab')) renderHeader();
    if (changedKeys.includes('show') || changedKeys.includes('selectedSlideId')) renderList();
    if (changedKeys.includes('selectedSlideId')) revealSelected();
  });

  renderHeader();
  renderList();
}
