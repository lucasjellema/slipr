// @ts-check
/**
 * Editor slide list sidebar: displays thumbnails/items, handles selection,
 * reordering, addition, duplication, and deletion of slides. A "Go to slide"
 * filter and keyboard navigation (↑/↓, PageUp/PageDown, Home/End) make long
 * shows easy to move through.
 */

import { h } from '../dom.js';
import { slideTitle } from '../../../shared/render.js';
import { dropIndex, matchSlides, navigateIndex } from '../slide-filter.js';
import { openLayoutPicker } from './layout-picker.js';

/**
 * Mount the slide list sidebar into container.
 * @param {HTMLElement} container
 * @param {import('../store.js').EditorStore} store
 * @param {{ onGrid?: () => void }} [handlers]  onGrid: open the show grid (I-081).
 */
export function mountSlideList(container, store, handlers = {}) {
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

  wireDragAndDrop(list, store);
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
            class: 'slipr-btn slipr-btn-sm',
            title: 'Add a slide with a layout you choose',
            'aria-label': 'Add a slide with a layout you choose',
            onclick: () => openLayoutPicker({ store, mode: 'add', slideId: store.state.selectedSlideId }),
          },
          ['▾']
        ),
        h(
          'button',
          {
            class: 'slipr-btn slipr-btn-sm',
            title: 'Show grid: all slides and chapters at a glance',
            'aria-label': 'Open the show grid',
            onclick: () => handlers.onGrid?.(),
          },
          ['▦']
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
          class: `slipr-slide-item ${isSelected ? 'is-selected' : ''} ${isAudienceHidden ? 'is-audience-hidden' : ''}`,
          'data-slide-id': slide.id,
          draggable: 'true',
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
                class: `slipr-item-btn slipr-hide-toggle ${isAudienceHidden ? 'is-on' : ''}`,
                'aria-pressed': isAudienceHidden ? 'true' : 'false',
                'aria-label': `Hide "${title}" from audience mode`,
                title: isAudienceHidden
                  ? 'Hidden from audience mode (still in reader mode). Click to show it again'
                  : 'Hide from audience mode (for backup slides; reader mode still shows it)',
                onclick: () => store.dispatch('setHidden', { slideId: slide.id, audienceHidden: !isAudienceHidden }),
              },
              [isAudienceHidden ? '◌' : '◉']
            ),
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

/**
 * Reorder slides by dragging them in the list (E-003). A line shows where the
 * slide will land (above or below the slide under the pointer); near the top or
 * bottom edge the list scrolls. The keyboard alternative is Alt+↑ / Alt+↓.
 * @param {HTMLElement} list
 * @param {import('../store.js').EditorStore} store
 */
function wireDragAndDrop(list, store) {
  const TYPE = 'application/x-slipr-slide';
  /** @type {string | null} */
  let dragId = null;
  /** @type {{ el: HTMLElement, after: boolean } | null} */
  let marker = null;

  const clearMarker = () => {
    marker?.el.classList.remove('is-drop-before', 'is-drop-after');
    marker = null;
  };
  const indexOf = (/** @type {string} */ id) => (store.state.show?.slides ?? []).findIndex((/** @type {any} */ s) => s.id === id);

  list.addEventListener('dragstart', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest?.('.slipr-slide-item');
    if (!(item instanceof HTMLElement) || !e.dataTransfer) return;
    dragId = item.dataset.slideId ?? null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TYPE, dragId ?? '');
    item.classList.add('is-dragging');
  });

  list.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // Scroll when near the top or bottom edge.
    const box = list.getBoundingClientRect();
    if (e.clientY < box.top + 40) list.scrollTop -= 12;
    else if (e.clientY > box.bottom - 40) list.scrollTop += 12;

    const item = /** @type {HTMLElement} */ (e.target).closest?.('.slipr-slide-item');
    if (!(item instanceof HTMLElement) || item.dataset.slideId === dragId) {
      clearMarker();
      return;
    }
    const r = item.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    if (marker?.el === item && marker.after === after) return;
    clearMarker();
    item.classList.add(after ? 'is-drop-after' : 'is-drop-before');
    marker = { el: item, after };
  });

  list.addEventListener('dragleave', (e) => {
    if (!list.contains(/** @type {Node | null} */ (e.relatedTarget))) clearMarker();
  });

  list.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const target = marker;
    clearMarker();
    if (!target) return;
    const from = indexOf(dragId);
    const to = indexOf(target.el.dataset.slideId ?? '');
    if (from === -1 || to === -1) return;
    const slideId = dragId;
    store.dispatch('moveSlide', { slideId, toIndex: dropIndex(from, to, target.after) });
    store.selectSlide(slideId);
  });

  list.addEventListener('dragend', () => {
    list.querySelector('.is-dragging')?.classList.remove('is-dragging');
    clearMarker();
    dragId = null;
  });
}
