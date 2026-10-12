// @ts-check
/**
 * Show grid (I-081): the whole show as a grid of slide thumbnails in chapter
 * runs, to manage its structure. Select slides (click, Ctrl/Cmd+click,
 * Shift+click, or the keyboard), drag them, or use the selection bar: duplicate,
 * hide, assign a chapter, make a new chapter, delete. Chapters can be renamed,
 * moved (drag or ▲ ▼) and deleted. Every change is one store action, so one
 * undo step, and the slide list and inspector stay in sync.
 *
 * Keyboard: arrows move (and select), Shift+arrows extend the selection,
 * Ctrl+arrows move the focus only, Space toggles, Ctrl+A selects all,
 * Alt+← / Alt+→ move the selection, Ctrl+D duplicates, Delete deletes,
 * Enter opens the slide in the editor, Esc clears the selection, then closes.
 */
import { h } from '../dom.js';
import { renderSlide, slideTitle } from '../../../shared/render.js';
import { hydrateEmbeds } from '../../../shared/embeds/index.js';
import { issuesForSlide } from '../store.js';
import { emptyChapters, gridMove, selectRange, slideRuns } from '../show-grid-model.js';
import { uniqueId } from '../show-entities.js';
import { openConfirmDialog, showBanner } from './dialogs.js';
import { openLayoutPicker } from './layout-picker.js';

const SLIDE_TYPE = 'application/x-slipr-slides';
const CHAPTER_TYPE = 'application/x-slipr-chapter';
const SIZES = { S: 150, M: 210, L: 300 };

/**
 * Create the grid view inside the editor's main area. It is hidden until opened.
 * @param {HTMLElement} host  The element the view covers (the 3-column main area).
 * @param {import('../store.js').EditorStore} store
 * @returns {{ open: () => void, close: () => void, toggle: () => void, isOpen: () => boolean }}
 */
export function mountShowGrid(host, store) {
  const view = h('section', { class: 'slipr-grid-view', hidden: true, 'aria-label': 'Show grid' });
  host.append(view);

  /** @type {Set<string>} */
  let selected = new Set();
  /** @type {string | null} */
  let anchorId = null;   // where a Shift-selection starts
  /** @type {string | null} */
  let focusId = null;    // the card with the keyboard focus (roving tabindex)
  let size = /** @type {keyof typeof SIZES} */ ('M');
  /** Rendered thumbnails per slide object: unchanged slides are not rendered again. */
  let thumbs = new WeakMap();
  let lastTemplate = null;
  /** @type {{ kind: 'slides', ids: string[] } | { kind: 'chapter', id: string } | null} */
  let drag = null;

  const header = h('div', { class: 'slipr-grid-header' });
  const selectionBar = h('div', { class: 'slipr-grid-selection', role: 'toolbar', 'aria-label': 'Selected slides' });
  const body = h('div', { class: 'slipr-grid-body' });
  const live = h('div', { class: 'slipr-visually-hidden', 'aria-live': 'polite' });
  view.append(header, selectionBar, body, live);

  const slides = () => /** @type {any[]} */ (store.state.show?.slides ?? []);
  const order = () => slides().map((s) => s.id);
  const say = (/** @type {string} */ text) => { live.textContent = text; };
  const selection = () => order().filter((id) => selected.has(id));   // in show order

  // ------------------------------------------------------------------ open / close
  function open() {
    view.hidden = false;
    document.body.classList.add('is-grid-open');
    const current = store.state.selectedSlideId;
    if (current && !selected.size) {
      selected = new Set([current]);
      anchorId = current;
    }
    focusId = current ?? order()[0] ?? null;
    render();
    focusCard(focusId);
  }

  function close() {
    view.hidden = true;
    document.body.classList.remove('is-grid-open');
    document.querySelector('.slipr-slide-item.is-selected')?.scrollIntoView({ block: 'nearest' });
  }

  /** Open a slide in the normal editor. @param {string} id */
  function openSlide(id) {
    close();
    store.selectSlide(id);
    store.setActiveTab('slide');
  }

  // ------------------------------------------------------------------ rendering
  function thumbnail(/** @type {any} */ slide) {
    let el = thumbs.get(slide);
    if (!el) {
      const state = store.state;
      try {
        el = renderSlide(slide, {
          show: state.show, template: state.template, layouts: state.layouts, validation: state.validation,
          resolveAsset: state.resolveAsset, resolveTemplateAsset: state.resolveTemplateAsset,
        }, { mode: 'audience' });
      } catch {
        el = h('span', { class: 'slipr-layout-thumb-error' }, ['No preview']);
      }
      // Diagrams (Mermaid) are drawn after rendering, as in the preview and the viewer.
      hydrateEmbeds(el, { thumbnail: true }).catch(() => {});
      thumbs.set(slide, el);
    }
    return el;
  }

  function renderHeader() {
    const all = slides();
    header.replaceChildren(
      h('h2', { class: 'slipr-grid-title' }, [`Show grid · ${all.length} slide${all.length === 1 ? '' : 's'}`]),
      h('div', { class: 'slipr-grid-actions' }, [
        h('div', { class: 'slipr-grid-sizes', role: 'group', 'aria-label': 'Thumbnail size' },
          Object.keys(SIZES).map((key) => h('button', {
            type: 'button',
            class: `slipr-btn slipr-btn-sm ${size === key ? 'is-active' : ''}`,
            'aria-pressed': size === key ? 'true' : 'false',
            title: `${key === 'S' ? 'Small' : key === 'M' ? 'Medium' : 'Large'} thumbnails`,
            onclick: () => { size = /** @type {any} */ (key); render(); },
          }, [key]))),
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Add a slide after the selection (or at the end), in a layout you choose',
          onclick: () => {
            const after = selection().at(-1) ?? order().at(-1) ?? null;
            openLayoutPicker({ store, mode: 'add', slideId: after });
          },
        }, ['+ Add slide…']),
        h('button', {
          type: 'button', class: 'slipr-btn slipr-btn-sm',
          title: 'New chapter: of the selected slides, or an empty one',
          onclick: () => newChapter(),
        }, ['+ Chapter']),
        h('button', { type: 'button', class: 'slipr-btn slipr-btn-primary slipr-btn-sm', title: 'Back to the editor (Esc)', onclick: close }, ['Back to editor']),
      ]),
    );
  }

  function renderSelectionBar() {
    const ids = selection();
    if (!ids.length) {
      selectionBar.replaceChildren(h('span', { class: 'slipr-help' }, [
        'Click a slide to select it; Ctrl-click or Shift-click for more. Drag to move. Double-click (or Enter) opens a slide.',
      ]));
      return;
    }
    const all = slides().filter((s) => selected.has(s.id));
    const allHidden = all.every((s) => s.audience?.hidden);
    const chapters = store.state.show?.chapters ?? [];
    const chapterSelect = /** @type {HTMLSelectElement} */ (h('select', {
      class: 'slipr-select slipr-select-sm', 'aria-label': 'Chapter of the selected slides',
      onchange: () => {
        const v = chapterSelect.value;
        chapterSelect.value = '';
        if (v === '__new') newChapter();
        else if (v) {
          store.dispatch('setSlidesChapter', { slideIds: ids, chapter: v === '__none' ? null : v });
          say(`${ids.length} slide${ids.length === 1 ? '' : 's'} assigned`);
        }
      },
    }, [
      h('option', { value: '' }, ['Chapter…']),
      ...chapters.map((/** @type {any} */ c) => h('option', { value: c.id }, [c.title])),
      h('option', { value: '__none' }, ['(No chapter)']),
      h('option', { value: '__new' }, ['New chapter from selection…']),
    ]));
    selectionBar.replaceChildren(
      h('span', { class: 'slipr-grid-count' }, [`${ids.length} selected`]),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Duplicate (Ctrl+D)', onclick: () => duplicate() }, ['Duplicate']),
      h('button', {
        type: 'button', class: 'slipr-btn slipr-btn-sm',
        title: allHidden ? 'Show in audience mode again' : 'Hide from audience mode (backup slides; reader mode still shows them)',
        onclick: () => store.dispatch('setSlidesHidden', { slideIds: ids, audienceHidden: !allHidden }),
      }, [allHidden ? 'Show to audience' : 'Hide from audience']),
      chapterSelect,
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Move earlier (Alt+←)', 'aria-label': 'Move the selection earlier', onclick: () => nudge(-1) }, ['◀']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Move later (Alt+→)', 'aria-label': 'Move the selection later', onclick: () => nudge(1) }, ['▶']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm slipr-btn-danger', title: 'Delete (Delete key)', onclick: () => remove() }, ['Delete']),
      h('button', { type: 'button', class: 'slipr-btn slipr-btn-sm', title: 'Clear the selection (Esc)', onclick: () => { selected.clear(); render(); } }, ['Clear']),
    );
  }

  function card(/** @type {any} */ slide, /** @type {number} */ index, /** @type {string | null} */ chapterId) {
    const state = store.state;
    const { errors, warnings } = issuesForSlide(state.validation, index);
    const isSelected = selected.has(slide.id);
    const title = slideTitle(slide) || slide.id;
    const badges = [
      slide.audience?.hidden ? h('span', { class: 'slipr-grid-badge', title: 'Backup slide: hidden from the audience sequence' }, ['◌ backup']) : null,
      slide.reader?.hidden ? h('span', { class: 'slipr-grid-badge', title: 'Hidden from reader mode' }, ['no reader']) : null,
      errors.length ? h('span', { class: 'slipr-grid-badge is-error', title: errors[0].message }, [`✖ ${errors.length}`]) : null,
      warnings.length ? h('span', { class: 'slipr-grid-badge is-warning', title: warnings[0].message }, [`⚠ ${warnings.length}`]) : null,
    ].filter(Boolean);
    const thumb = h('div', { class: 'slipr-grid-thumb', 'aria-hidden': 'true' }, [thumbnail(slide)]);
    thumb.inert = true;
    return h('li', {
      class: `slipr-grid-card ${isSelected ? 'is-selected' : ''} ${slide.audience?.hidden ? 'is-backup' : ''}`,
      role: 'option',
      'aria-selected': isSelected ? 'true' : 'false',
      'aria-label': `Slide ${index + 1}: ${title}${slide.audience?.hidden ? ', backup slide' : ''}${errors.length ? `, ${errors.length} errors` : ''}`,
      tabindex: slide.id === focusId ? '0' : '-1',
      draggable: 'true',
      'data-slide-id': slide.id,
      'data-chapter-id': chapterId ?? '',
    }, [
      thumb,
      h('div', { class: 'slipr-grid-caption' }, [
        h('span', { class: 'slipr-grid-number' }, [String(index + 1)]),
        h('span', { class: 'slipr-grid-name' }, [title]),
      ]),
      badges.length ? h('div', { class: 'slipr-grid-badges' }, badges) : null,
    ]);
  }

  function runHeader(/** @type {import('../show-grid-model.js').SlideRun} */ run) {
    const count = h('span', { class: 'slipr-help' }, [`${run.slides.length} slide${run.slides.length === 1 ? '' : 's'}${run.continued ? ' · continued' : ''}`]);
    if (!run.chapterId) {
      return h('div', { class: 'slipr-grid-run-header', 'data-chapter-id': '' }, [h('span', { class: 'slipr-grid-run-title is-none' }, ['No chapter']), count]);
    }
    const chapter = run.chapter ?? { id: run.chapterId, title: run.chapterId };
    const titleInput = h('input', {
      type: 'text', class: 'slipr-input slipr-input-sm slipr-grid-run-input', value: chapter.title ?? '',
      'aria-label': `Chapter "${chapter.title}": title`,
      'data-chapter-title': chapter.id,
      oninput: (/** @type {Event} */ e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        const empty = input.value.trim() === '';
        input.setAttribute('aria-invalid', empty ? 'true' : 'false');
        if (!empty) store.dispatch('upsertChapter', { id: chapter.id, title: input.value }, { coalesceKey: `grid-chapter-${chapter.id}` });
      },
    });
    const firstSlideOfNext = () => {
      // The first slide after this chapter's last slide that belongs to another chapter.
      const all = slides();
      const last = all.map((s) => s.chapter).lastIndexOf(chapter.id);
      return all.slice(last + 1).find((s) => s.chapter !== chapter.id)?.id ?? null;
    };
    const firstSlideOfPrevious = () => {
      const all = slides();
      const first = all.findIndex((s) => s.chapter === chapter.id);
      const prev = all[first - 1];
      if (!prev) return undefined;
      // Move before the start of the previous run.
      let i = first - 1;
      while (i > 0 && all[i - 1].chapter === prev.chapter) i--;
      return all[i].id;
    };
    return h('div', {
      class: 'slipr-grid-run-header', draggable: 'true', 'data-chapter-id': chapter.id,
      title: 'Drag to move the whole chapter',
    }, [
      h('span', { class: 'slipr-grid-handle', 'aria-hidden': 'true' }, ['⠿']),
      titleInput,
      count,
      h('div', { class: 'slipr-entity-tools' }, [
        h('button', {
          type: 'button', class: 'slipr-item-btn', title: 'Move the chapter earlier', 'aria-label': `Move chapter "${chapter.title}" earlier`,
          disabled: firstSlideOfPrevious() === undefined ? true : undefined,
          onclick: () => store.dispatch('moveChapter', { chapterId: chapter.id, beforeSlideId: firstSlideOfPrevious() }),
        }, ['▲']),
        h('button', {
          type: 'button', class: 'slipr-item-btn', title: 'Move the chapter later', 'aria-label': `Move chapter "${chapter.title}" later`,
          disabled: firstSlideOfNext() === null ? true : undefined,
          onclick: () => {
            // Before the slide after the next run.
            const all = slides();
            const next = firstSlideOfNext();
            const start = all.findIndex((s) => s.id === next);
            let i = start;
            while (i < all.length && all[i].chapter === all[start].chapter) i++;
            store.dispatch('moveChapter', { chapterId: chapter.id, beforeSlideId: all[i]?.id ?? null });
          },
        }, ['▼']),
        h('button', {
          type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', title: 'Delete the chapter (its slides stay)', 'aria-label': `Delete chapter "${chapter.title}"`,
          onclick: () => openConfirmDialog({
            title: `Delete chapter "${chapter.title}"?`,
            text: 'Its slides stay, without a chapter.',
            actions: [{ label: 'Delete chapter', kind: 'danger', run: () => store.dispatch('deleteChapter', { chapterId: chapter.id }) }],
          }),
        }, ['🗑']),
      ]),
    ]);
  }

  function render() {
    if (view.hidden) return;
    const state = store.state;
    if (state.template !== lastTemplate) {
      thumbs = new WeakMap();
      lastTemplate = state.template;
    }
    const ids = new Set(order());
    selected = new Set([...selected].filter((id) => ids.has(id)));
    if (focusId && !ids.has(focusId)) focusId = order()[0] ?? null;
    const hadFocus = view.contains(document.activeElement);
    const activeIsCard = /** @type {HTMLElement | null} */ (document.activeElement)?.classList?.contains('slipr-grid-card');
    const scrollTop = body.scrollTop;

    view.style.setProperty('--slipr-grid-card', `${SIZES[size]}px`);
    renderHeader();
    renderSelectionBar();

    const runs = slideRuns(state.show);
    const empties = emptyChapters(state.show);
    const list = h('div', { class: 'slipr-grid-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Slides' },
      runs.map((run, r) => h('section', {
        class: 'slipr-grid-run', role: 'group',
        'aria-label': run.chapterId ? `Chapter ${run.chapter?.title ?? run.chapterId}` : 'No chapter',
        'data-run': String(r),
      }, [
        runHeader(run),
        h('ul', { class: 'slipr-grid-cards', role: 'presentation' }, run.slides.map(({ slide, index }) => card(slide, index, run.chapterId))),
      ])));
    const emptyList = empties.length
      ? h('section', { class: 'slipr-grid-empty' }, [
        h('h3', { class: 'slipr-label' }, ['Chapters without slides']),
        h('div', { class: 'slipr-grid-empty-chips' }, empties.map((/** @type {any} */ c) => h('div', {
          class: 'slipr-grid-chip', 'data-empty-chapter': c.id, title: 'Drop slides here to put them in this chapter',
        }, [
          c.title,
          h('button', {
            type: 'button', class: 'slipr-item-btn slipr-item-btn-danger', 'aria-label': `Delete chapter "${c.title}"`, title: 'Delete this chapter',
            onclick: () => store.dispatch('deleteChapter', { chapterId: c.id }),
          }, ['🗑']),
        ]))),
      ])
      : null;
    body.replaceChildren(list, ...(emptyList ? [emptyList] : []));
    body.scrollTop = scrollTop;
    if (hadFocus && activeIsCard) focusCard(focusId, { preventScroll: true });
  }

  // ------------------------------------------------------------------ helpers
  function cards() {
    return /** @type {HTMLElement[]} */ ([...body.querySelectorAll('.slipr-grid-card')]);
  }

  function focusCard(/** @type {string | null} */ id, /** @type {FocusOptions} */ options = {}) {
    if (!id) return;
    focusId = id;
    for (const c of cards()) c.tabIndex = c.dataset.slideId === id ? 0 : -1;
    const el = body.querySelector(`.slipr-grid-card[data-slide-id="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      el.focus(options);
      if (!options.preventScroll) el.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * The card visually above or below the focused one: the nearest card (by
   * horizontal centre) in the next row up or down. Rows restart at each chapter
   * run, so this goes by what is on screen, not by index.
   * @param {string} fromId @param {1 | -1} direction
   * @returns {string | null}
   */
  function verticalNeighbour(fromId, direction) {
    const all = cards();
    const from = all.find((c) => c.dataset.slideId === fromId);
    if (!from) return null;
    const box = from.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    const rows = all
      .map((c) => ({ c, r: c.getBoundingClientRect() }))
      .filter(({ r }) => (direction > 0 ? r.top > box.top + 2 : r.top < box.top - 2));
    if (!rows.length) return null;
    const rowTop = direction > 0 ? Math.min(...rows.map(({ r }) => r.top)) : Math.max(...rows.map(({ r }) => r.top));
    const row = rows.filter(({ r }) => Math.abs(r.top - rowTop) < 2);
    row.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - centre) - Math.abs(b.r.left + b.r.width / 2 - centre));
    return row[0]?.c.dataset.slideId ?? null;
  }

  function selectOnly(/** @type {string} */ id) {
    selected = new Set([id]);
    anchorId = id;
  }

  function duplicate() {
    const ids = selection();
    if (!ids.length) return;
    store.dispatch('duplicateSlides', { slideIds: ids });
    say(`Duplicated ${ids.length} slide${ids.length === 1 ? '' : 's'}`);
  }

  function remove() {
    const ids = selection();
    if (!ids.length) return;
    if (ids.length >= slides().length) {
      showBanner('A show needs at least one slide: not every slide can be deleted.', 'info', { timeout: 4000 });
      return;
    }
    const run = () => {
      store.dispatch('deleteSlides', { slideIds: ids });
      selected.clear();
      say(`Deleted ${ids.length} slide${ids.length === 1 ? '' : 's'}; Ctrl+Z brings them back`);
    };
    openConfirmDialog({
      title: `Delete ${ids.length} slide${ids.length === 1 ? '' : 's'}?`,
      text: 'Undo (Ctrl+Z) brings them back.',
      items: slides().filter((s) => selected.has(s.id)).slice(0, 8).map((s) => slideTitle(s) || s.id),
      actions: [{ label: 'Delete', kind: 'danger', run }],
    });
  }

  /** Move the selection one slide earlier (-1) or later (+1), as a block. */
  function nudge(/** @type {number} */ step) {
    const ids = selection();
    if (!ids.length) return;
    const all = order();
    const rest = all.filter((id) => !selected.has(id));
    const firstIndex = all.indexOf(ids[0]);
    const before = all.slice(0, firstIndex).filter((id) => !selected.has(id)).length;   // position among the others
    const target = Math.max(0, Math.min(rest.length, before + step));
    if (target === before) return;
    store.dispatch('moveSlides', { slideIds: ids, beforeSlideId: rest[target] ?? null });
  }

  function newChapter() {
    const chapters = store.state.show?.chapters ?? [];
    const id = uniqueId('New chapter', chapters.map((/** @type {any} */ c) => c.id), 'chapter');
    const ids = selection();
    if (ids.length) store.dispatch('createChapterFromSlides', { chapterId: id, title: 'New chapter', slideIds: ids });
    else store.dispatch('upsertChapter', { id, title: 'New chapter' });
    queueMicrotask(() => {
      const input = view.querySelector(`[data-chapter-title="${CSS.escape(id)}"]`);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      } else {
        showBanner('New empty chapter added: drop slides on it under "Chapters without slides".', 'info', { timeout: 4000 });
      }
    });
  }

  // ------------------------------------------------------------------ mouse
  body.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('.slipr-grid-card');
    if (!(el instanceof HTMLElement)) return;
    const id = /** @type {string} */ (el.dataset.slideId);
    if (e.shiftKey && anchorId) selected = new Set(selectRange(order(), anchorId, id));
    else if (e.ctrlKey || e.metaKey) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      anchorId = id;
    } else selectOnly(id);
    focusId = id;
    render();
    focusCard(id, { preventScroll: true });
  });
  body.addEventListener('dblclick', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('.slipr-grid-card');
    if (el instanceof HTMLElement && el.dataset.slideId) openSlide(el.dataset.slideId);
  });

  // ------------------------------------------------------------------ keyboard
  view.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.matches('input, textarea, select')) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const ids = order();
    const index = focusId ? ids.indexOf(focusId) : -1;
    /** @param {Event} ev */
    const handled = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

    if (e.key === 'Escape') {
      handled(e);
      if (selected.size) { selected.clear(); render(); focusCard(focusId); }
      else close();
      return;
    }
    if (!target.closest('.slipr-grid-list')) return;   // buttons in the bars keep their own keys

    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      handled(e);
      if (!selected.size && focusId) selectOnly(focusId);
      nudge(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
      queueMicrotask(() => focusCard(focusId));
      return;
    }
    const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    const next = vertical ? null : gridMove(e.key, Math.max(0, index), ids.length, 1);
    const verticalId = vertical && focusId ? verticalNeighbour(focusId, e.key === 'ArrowDown' ? 1 : -1) : null;
    if (vertical && !verticalId) {
      handled(e);   // at the top or bottom: stay
      return;
    }
    if (next !== null || verticalId) {
      handled(e);
      const id = verticalId ?? ids[/** @type {number} */ (next)];
      if (e.shiftKey && anchorId) selected = new Set(selectRange(ids, anchorId, id));
      else if (!mod) selectOnly(id);
      focusId = id;
      render();
      focusCard(id);
      return;
    }
    if (e.key === ' ' && focusId) {
      handled(e);
      if (selected.has(focusId)) selected.delete(focusId);
      else selected.add(focusId);
      anchorId = focusId;
      render();
      focusCard(focusId);
    } else if (e.key === 'Enter' && focusId) {
      handled(e);
      openSlide(focusId);
    } else if (mod && (e.key === 'a' || e.key === 'A')) {
      handled(e);
      selected = new Set(ids);
      render();
      focusCard(focusId);
    } else if (mod && (e.key === 'd' || e.key === 'D')) {
      handled(e);
      if (!selected.size && focusId) selectOnly(focusId);
      duplicate();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      handled(e);
      if (!selected.size && focusId) selectOnly(focusId);
      remove();
    }
  });

  // ------------------------------------------------------------------ drag and drop
  /** @type {{ el: HTMLElement, cls: string } | null} */
  let marker = null;
  const clearMarker = () => {
    marker?.el.classList.remove(marker.cls);
    marker = null;
  };
  const setMarker = (/** @type {HTMLElement} */ el, /** @type {string} */ cls) => {
    if (marker?.el === el && marker.cls === cls) return;
    clearMarker();
    el.classList.add(cls);
    marker = { el, cls };
  };

  view.addEventListener('dragstart', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const cardEl = target.closest?.('.slipr-grid-card');
    const headerEl = target.closest?.('.slipr-grid-run-header');
    if (cardEl instanceof HTMLElement && cardEl.dataset.slideId) {
      const id = cardEl.dataset.slideId;
      if (!selected.has(id)) { selectOnly(id); renderSelectionBar(); markSelection(); }
      drag = { kind: 'slides', ids: selection() };
      e.dataTransfer?.setData(SLIDE_TYPE, drag.ids.join(','));
    } else if (headerEl instanceof HTMLElement && headerEl.dataset.chapterId && !target.matches('input')) {
      drag = { kind: 'chapter', id: headerEl.dataset.chapterId };
      e.dataTransfer?.setData(CHAPTER_TYPE, drag.id);
    } else return;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    view.classList.add('is-dragging');
  });

  /** Mark selected cards without re-rendering (a re-render would cancel the drag). */
  function markSelection() {
    for (const c of cards()) {
      const on = selected.has(/** @type {string} */ (c.dataset.slideId));
      c.classList.toggle('is-selected', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  /**
   * Where a drop at this point would go.
   * @param {DragEvent} e
   * @returns {{ el: HTMLElement, cls: string, beforeSlideId: string | null, chapter: string | null | undefined } | null}
   */
  function dropTarget(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const cardEl = target.closest?.('.slipr-grid-card');
    if (cardEl instanceof HTMLElement) {
      const r = cardEl.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      const ids = order();
      const at = ids.indexOf(/** @type {string} */ (cardEl.dataset.slideId));
      return {
        el: cardEl, cls: after ? 'is-drop-after' : 'is-drop-before',
        beforeSlideId: after ? ids[at + 1] ?? null : ids[at],
        chapter: cardEl.dataset.chapterId || null,
      };
    }
    const headerEl = target.closest?.('.slipr-grid-run-header');
    if (headerEl instanceof HTMLElement) {
      const firstCard = headerEl.parentElement?.querySelector('.slipr-grid-card');
      return { el: headerEl, cls: 'is-drop-into', beforeSlideId: firstCard instanceof HTMLElement ? firstCard.dataset.slideId ?? null : null, chapter: headerEl.dataset.chapterId || null };
    }
    const chip = target.closest?.('[data-empty-chapter]');
    if (chip instanceof HTMLElement) {
      // An empty chapter: put the slides where the chapter order says, before the next chapter that has slides.
      const chapters = store.state.show?.chapters ?? [];
      const id = /** @type {string} */ (chip.dataset.emptyChapter);
      const later = chapters.slice(chapters.findIndex((/** @type {any} */ c) => c.id === id) + 1).map((/** @type {any} */ c) => c.id);
      const nextSlide = slides().find((s) => later.includes(s.chapter));
      return { el: chip, cls: 'is-drop-into', beforeSlideId: nextSlide?.id ?? null, chapter: id };
    }
    return null;
  }

  view.addEventListener('dragover', (e) => {
    if (!drag) return;
    // Scroll near the edges.
    const box = body.getBoundingClientRect();
    if (e.clientY < box.top + 50) body.scrollTop -= 16;
    else if (e.clientY > box.bottom - 50) body.scrollTop += 16;
    const t = dropTarget(e);
    if (!t || (drag.kind === 'chapter' && t.el.matches('[data-empty-chapter]'))) {
      clearMarker();
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setMarker(t.el, t.cls);
  });

  view.addEventListener('drop', (e) => {
    if (!drag) return;
    const t = dropTarget(e);
    clearMarker();
    if (!t) return;
    e.preventDefault();
    if (drag.kind === 'slides') {
      const ids = drag.ids;
      store.dispatch('moveSlides', { slideIds: ids, beforeSlideId: t.beforeSlideId, chapter: t.chapter });
      say(`Moved ${ids.length} slide${ids.length === 1 ? '' : 's'}`);
    } else if (!t.el.matches('[data-empty-chapter]')) {
      // A chapter dropped onto a card or a header: before that point (onto itself: nothing).
      const chapterId = drag.id;
      const before = t.beforeSlideId && slides().find((s) => s.id === t.beforeSlideId)?.chapter === chapterId ? undefined : t.beforeSlideId;
      if (before !== undefined) store.dispatch('moveChapter', { chapterId, beforeSlideId: before });
    }
    drag = null;
  });

  view.addEventListener('dragend', () => {
    clearMarker();
    view.classList.remove('is-dragging');
    drag = null;
  });

  // ------------------------------------------------------------------ store
  store.subscribe(({ changedKeys }) => {
    if (view.hidden) return;
    if (changedKeys.includes('show') || changedKeys.includes('template') || changedKeys.includes('validation')) {
      // Keep the store's selected slide selected here too when it changed (e.g. a slide added by the picker).
      render();
    }
    if (changedKeys.includes('selectedSlideId') && store.state.selectedSlideId) {
      const id = store.state.selectedSlideId;
      if (!selected.has(id)) {
        selectOnly(id);
        focusId = id;
        render();
        focusCard(id);
      }
    }
  });

  return {
    open,
    close,
    toggle: () => (view.hidden ? open() : close()),
    isOpen: () => !view.hidden,
  };
}
