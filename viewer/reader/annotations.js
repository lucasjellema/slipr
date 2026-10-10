// @ts-check
/**
 * Highlights, notes and pins.
 *
 * Three kinds of annotation (see state.js):
 *  - text:  select text in a reader block, the slide summary, or a text slot
 *           on the slide visual → "Highlight" / "Add note". Drawn with the CSS
 *           Custom Highlight API and re-anchored by text quote on every render.
 *  - slide: "✎ Note" on a slide → a note about the slide as a whole.
 *  - pin:   "📍 Pin" on a slide → click anywhere on the slide visual (or pick
 *           an object from the list) → a numbered pin on that object.
 *
 * "My notes" panel: everything grouped by slide, with export (Markdown / JSON)
 * and import (JSON). Annotations hidden by the current tailoring, or whose
 * anchor no longer exists, are listed separately rather than lost.
 */
import { h } from '../js/dom.js';
import { slideTitle } from '../../shared/render.js';
import { describeQuote, locateQuote } from './quote.js';
import { annotationKind } from './state.js';
import { pinFromPoint, pinPosition, describeTarget } from './pin.js';
import { annotationsToMarkdown, annotationsToJson, mergeImportedAnnotations } from './notes-export.js';

const SCOPE = '.slipr-block[data-block-id], .reader-summary[data-block-id], .reader-slide-frame [data-slot]';

/**
 * @param {{
 *   main: HTMLElement,
 *   store: import('./state.js').Store,
 *   show: any,
 *   isVisible: (slideId: string, blockId?: string | null) => boolean,
 *   goTo: (slideId: string, blockId?: string | null) => void,
 *   toast: (message: string) => void,
 * }} io
 */
export function createAnnotations(io) {
  const { main, store, show } = io;
  const registry = /** @type {any} */ (globalThis.CSS)?.highlights;
  /** Current DOM range of each anchored text annotation, by id. */
  /** @type {Map<string, Range>} */
  let ranges = new Map();
  const newId = () => globalThis.crypto?.randomUUID?.() ?? `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  /** @param {import('./state.js').Annotation} a */
  const add = (a) => {
    store.update((s) => ({ annotations: [...s.annotations, a] }));
    refresh();
  };

  // =====================================================================
  // Text annotations: selection toolbar
  // =====================================================================
  const highlightBtn = h('button', { type: 'button' }, ['Highlight']);
  const noteBtn = h('button', { type: 'button' }, ['Add note']);
  const tools = h('div', { class: 'reader-selection-tools', role: 'toolbar', 'aria-label': 'Selection', hidden: true }, [highlightBtn, noteBtn]);
  document.body.append(tools);
  tools.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the selection

  /** @returns {{ range: Range, scope: HTMLElement, blockId: string } | null} */
  const currentSelection = () => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const start = /** @type {HTMLElement | null} */ (nodeElement(range.startContainer)?.closest(SCOPE) ?? null);
    const end = nodeElement(range.endContainer)?.closest(SCOPE);
    if (!start || start !== end || !main.contains(start) || !range.toString().trim()) return null;
    const blockId = start.dataset.blockId ?? (start.dataset.slot ? `slot:${start.dataset.slot}` : null);
    return blockId ? { range, scope: start, blockId } : null;
  };

  let selTimer = 0;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = window.setTimeout(() => {
      const current = currentSelection();
      if (!current) { tools.hidden = true; return; }
      const r = current.range.getBoundingClientRect();
      tools.hidden = false;
      const w = tools.offsetWidth;
      tools.style.left = `${Math.round(Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)))}px`;
      tools.style.top = `${Math.round(r.top > 56 ? r.top - tools.offsetHeight - 8 : r.bottom + 8)}px`;
    }, 150);
  });

  const createText = (/** @type {boolean} */ withNote) => {
    const current = currentSelection();
    tools.hidden = true;
    if (!current) return;
    const { range, scope, blockId } = current;
    const slideId = /** @type {HTMLElement | null} */ (scope.closest('.reader-slide'))?.dataset.slideId;
    if (!slideId) return;
    const before = document.createRange();
    before.selectNodeContents(scope);
    before.setEnd(range.startContainer, range.startOffset);
    const text = scope.textContent ?? '';
    let start = before.toString().length;
    let end = start + range.toString().length;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    const annotation = {
      id: newId(), kind: /** @type {const} */ ('text'), slideId, blockId,
      quote: describeQuote(text, start, end), note: '', created: new Date().toISOString(),
    };
    getSelection()?.removeAllRanges();
    add(annotation);
    if (withNote) openNote(annotation.id);
    else io.toast('Highlighted. Find it under “My notes”.');
  };
  highlightBtn.addEventListener('click', () => createText(false));
  noteBtn.addEventListener('click', () => createText(true));

  // =====================================================================
  // Slide notes and pins
  // =====================================================================
  const addSlideNote = (/** @type {string} */ slideId) => {
    const annotation = { id: newId(), kind: /** @type {const} */ ('slide'), slideId, note: '', created: new Date().toISOString() };
    add(annotation);
    openNote(annotation.id);
  };

  /** @type {{ slideId: string, frame: HTMLElement, cleanup: () => void } | null} */
  let pinning = null;

  const stopPinning = () => {
    pinning?.cleanup();
    pinning = null;
  };

  const startPinning = (/** @type {string} */ slideId) => {
    stopPinning();
    const article = document.getElementById(slideId);
    const frame = /** @type {HTMLElement | null} */ (article?.querySelector('.reader-slide-frame') ?? null);
    const canvas = /** @type {HTMLElement | null} */ (frame?.querySelector('.slipr-canvas') ?? null);
    if (!frame || !canvas) {
      io.toast('This slide has no picture to pin on. Use ✎ Note instead.');
      return;
    }
    const capture = h('div', { class: 'reader-pin-capture', 'aria-hidden': 'true' });
    const objectButtons = slideObjects(canvas).map((obj) => {
      const b = h('button', { type: 'button', class: 'reader-pin-object' }, [obj.label]);
      b.addEventListener('click', () => {
        const r = obj.el.getBoundingClientRect();
        placePin(slideId, canvas, obj, r.left + r.width / 2, r.top + r.height / 2);
      });
      return b;
    });
    const cancel = h('button', { type: 'button', class: 'reader-button' }, ['Cancel']);
    const bar = h('div', { class: 'reader-pin-bar', role: 'group', 'aria-label': 'Place a pin' }, [
      h('p', {}, ['Click on the slide to place a pin, or pin to an object:']),
      h('div', { class: 'reader-pin-objects' }, objectButtons),
      cancel,
    ]);
    frame.classList.add('is-pinning');
    frame.append(capture);
    frame.after(bar);
    capture.addEventListener('click', (e) => {
      const target = objectAt(canvas, e.clientX, e.clientY);
      placePin(slideId, canvas, target, e.clientX, e.clientY);
    });
    cancel.addEventListener('click', stopPinning);
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') stopPinning(); };
    document.addEventListener('keydown', onKey);
    /** @type {HTMLElement | undefined} */ (objectButtons[0])?.focus({ preventScroll: true });
    pinning = {
      slideId, frame,
      cleanup: () => {
        frame.classList.remove('is-pinning');
        capture.remove();
        bar.remove();
        document.removeEventListener('keydown', onKey);
      },
    };
  };

  /**
   * @param {string} slideId @param {HTMLElement} canvas
   * @param {{ el: HTMLElement, slot: string | null, item: number | null, label: string }} target
   * @param {number} clientX @param {number} clientY
   */
  const placePin = (slideId, canvas, target, clientX, clientY) => {
    const geo = pinFromPoint(target.el.getBoundingClientRect(), canvas.getBoundingClientRect(), clientX, clientY);
    stopPinning();
    const annotation = {
      id: newId(), kind: /** @type {const} */ ('pin'), slideId,
      pin: { slot: target.slot, item: target.item, ...geo, label: target.label },
      note: '', created: new Date().toISOString(),
    };
    add(annotation);
    openNote(annotation.id);
  };

  main.addEventListener('click', (e) => {
    const el = /** @type {Element} */ (e.target);
    const noteBtn = /** @type {HTMLElement | null} */ (el.closest('.reader-slide-note'));
    const pinBtn = /** @type {HTMLElement | null} */ (el.closest('.reader-slide-pin'));
    const pin = /** @type {HTMLElement | null} */ (el.closest('.reader-pin, .reader-slide-notes-chip'));
    if (noteBtn?.dataset.slideId) addSlideNote(noteBtn.dataset.slideId);
    else if (pinBtn?.dataset.slideId) {
      if (pinning?.slideId === pinBtn.dataset.slideId) stopPinning();
      else startPinning(pinBtn.dataset.slideId);
    } else if (pin?.dataset.annotation) openNote(pin.dataset.annotation);
  });

  // =====================================================================
  // Panel
  // =====================================================================
  const countBadge = h('span', { class: 'reader-tool-count' });
  const button = h('button', { type: 'button', class: 'reader-tool', 'aria-controls': 'reader-notes', 'aria-expanded': 'false', title: 'My notes (N)' }, [
    h('span', { 'aria-hidden': 'true' }, ['✎']), h('span', { class: 'reader-tool-label' }, ['My notes']), countBadge,
  ]);
  const list = h('div', { class: 'reader-notes-list' });
  const fileInput = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.json,application/json', hidden: true }));
  const exportMd = h('button', { type: 'button', class: 'reader-button' }, ['Export Markdown']);
  const exportJson = h('button', { type: 'button', class: 'reader-button' }, ['Export JSON']);
  const importJson = h('button', { type: 'button', class: 'reader-button' }, ['Import…']);
  const closeBtn = h('button', { type: 'button', class: 'reader-panel-close', 'aria-label': 'Close my notes' }, ['×']);
  const panel = h('aside', { class: 'reader-notes', id: 'reader-notes', 'aria-labelledby': 'reader-notes-title', hidden: true }, [
    h('div', { class: 'reader-notes-header' }, [h('h2', { id: 'reader-notes-title' }, ['My notes']), closeBtn]),
    h('p', { class: 'reader-notes-hint' }, ['Select text to highlight it, or use ✎ and 📍 on a slide to add a note or pin. Your notes are stored only in this browser.']),
    list,
    h('div', { class: 'reader-notes-actions' }, [exportMd, exportJson, importJson, fileInput]),
  ]);

  const toggle = (/** @type {boolean | undefined} */ force) => {
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('reader-notes-open', open);
    if (open) renderList();
    // The docked panel narrows the article: pins must follow.
    setTimeout(renderMarkers, 0);
  };
  button.addEventListener('click', () => toggle());
  closeBtn.addEventListener('click', () => toggle(false));

  const download = (/** @type {string} */ name, /** @type {string} */ type, /** @type {string} */ content) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    /** @type {HTMLAnchorElement} */ (a).click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  exportMd.addEventListener('click', () => {
    const s = store.get();
    download(`slipr-notes-${show.id}.md`, 'text/markdown', annotationsToMarkdown(show, s.annotations, { bookmarks: s.bookmarks, date: new Date().toISOString().slice(0, 10) }));
  });
  exportJson.addEventListener('click', () => download(`slipr-notes-${show.id}.json`, 'application/json', annotationsToJson(show, store.get().annotations)));
  importJson.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const merged = mergeImportedAnnotations(await file.text(), show, store.get().annotations);
    if (!merged) {
      io.toast('That file is not a Slipr notes file for this show.');
      return;
    }
    store.update({ annotations: merged.annotations });
    refresh();
    io.toast(`Imported: ${merged.added} new, ${merged.updated} updated.`);
  });

  /** Status of an annotation in the current rendering: 'ok' | 'hidden' | 'orphan'. */
  const status = (/** @type {import('./state.js').Annotation} */ a) => {
    const slide = show.slides?.find((/** @type {any} */ s) => s.id === a.slideId);
    if (!slide) return 'orphan';
    const kind = annotationKind(a);
    if (kind === 'slide') return io.isVisible(a.slideId, null) ? 'ok' : 'hidden';
    if (kind === 'pin') {
      if (!io.isVisible(a.slideId, null)) return 'hidden';
      return document.querySelector(`#${CSS.escape(a.slideId)} .reader-slide-frame`) ? 'ok' : 'hidden';
    }
    const blockId = a.blockId ?? '';
    const exists = blockId === '_summary' ? !!slide.reader?.summary
      : blockId.startsWith('slot:') ? slide.content?.[blockId.slice(5)] !== undefined
        : slide.reader?.blocks?.some((/** @type {any} */ b) => b.id === blockId);
    if (!exists) return 'orphan';
    if (!io.isVisible(a.slideId, blockId)) return 'hidden';
    return ranges.has(a.id) ? 'ok' : 'orphan';
  };

  /** Pin numbers per slide, in creation order. */
  const pinNumbers = () => {
    /** @type {Map<string, number>} */
    const numbers = new Map();
    /** @type {Map<string, number>} */
    const perSlide = new Map();
    for (const a of [...store.get().annotations].sort((x, y) => x.created.localeCompare(y.created))) {
      if (annotationKind(a) !== 'pin') continue;
      const n = (perSlide.get(a.slideId) ?? 0) + 1;
      perSlide.set(a.slideId, n);
      numbers.set(a.id, n);
    }
    return numbers;
  };

  const renderList = () => {
    const anns = store.get().annotations;
    countBadge.textContent = anns.length ? String(anns.length) : '';
    if (panel.hidden) return;
    const order = new Map((show.slides ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => [s.id, i]));
    const sorted = [...anns].sort((a, b) => (order.get(a.slideId) ?? 1e9) - (order.get(b.slideId) ?? 1e9) || a.created.localeCompare(b.created));
    const groups = { ok: /** @type {any[]} */ ([]), hidden: /** @type {any[]} */ ([]), orphan: /** @type {any[]} */ ([]) };
    for (const a of sorted) groups[/** @type {'ok' | 'hidden' | 'orphan'} */ (status(a))].push(a);
    const numbers = pinNumbers();

    const card = (/** @type {import('./state.js').Annotation} */ a, /** @type {string} */ state) => {
      const kind = annotationKind(a);
      const slide = show.slides?.find((/** @type {any} */ s) => s.id === a.slideId);
      const note = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: '2', placeholder: 'Add a note…', 'aria-label': 'Note', 'data-note-for': a.id }));
      note.value = a.note;
      let t = 0;
      note.addEventListener('input', () => {
        clearTimeout(t);
        t = window.setTimeout(() => {
          store.update((s) => ({
            annotations: s.annotations.map((x) => (x.id === a.id ? { ...x, note: note.value, updated: new Date().toISOString() } : x)),
          }));
          renderMarkers();
        }, 400);
      });
      const go = h('button', { type: 'button', class: 'reader-link-button' }, [kind === 'text' ? 'Go to text' : kind === 'pin' ? 'Show pin' : 'Go to slide']);
      go.addEventListener('click', () => {
        io.goTo(a.slideId, kind === 'text' ? a.blockId : null);
        if (kind === 'pin') {
          const marker = main.querySelector(`.reader-pin[data-annotation="${CSS.escape(a.id)}"]`);
          marker?.classList.remove('is-target');
          void (/** @type {HTMLElement | null} */ (marker))?.offsetWidth;
          marker?.classList.add('is-target');
        }
      });
      const del = h('button', { type: 'button', class: 'reader-link-button reader-link-button--danger' }, ['Delete']);
      del.addEventListener('click', () => {
        store.update((s) => ({ annotations: s.annotations.filter((x) => x.id !== a.id) }));
        refresh();
      });
      const what = kind === 'text' && a.quote ? h('blockquote', {}, [truncate(a.quote.exact, 220)])
        : kind === 'pin' && a.pin ? h('p', { class: 'reader-note-what' }, [h('span', { class: 'reader-pin-mini', 'aria-hidden': 'true' }, [String(numbers.get(a.id) ?? '•')]), ` ${a.pin.label}`])
          : h('p', { class: 'reader-note-what' }, ['✎ Note on the slide']);
      return h('article', { class: `reader-note is-${state}`, 'data-annotation': a.id }, [
        h('p', { class: 'reader-note-slide' }, [slide ? slideTitle(slide) : a.slideId]),
        what,
        note,
        h('div', { class: 'reader-note-actions' }, [state === 'ok' ? go : null, del]),
      ]);
    };

    const sections = [];
    if (!anns.length) sections.push(h('p', { class: 'reader-notes-empty' }, ['No notes yet.']));
    sections.push(...groups.ok.map((a) => card(a, 'ok')));
    if (groups.hidden.length) {
      sections.push(h('h3', {}, ['Hidden by your tailoring']), ...groups.hidden.map((a) => card(a, 'hidden')));
    }
    if (groups.orphan.length) {
      sections.push(h('h3', {}, ['No longer found']), h('p', { class: 'reader-notes-hint' }, ['The show has changed since you made these.']),
        ...groups.orphan.map((a) => card(a, 'orphan')));
    }
    list.replaceChildren(...sections);
  };

  const openNote = (/** @type {string} */ id) => {
    toggle(true);
    setTimeout(() => {
      const el = /** @type {HTMLTextAreaElement | null} */ (list.querySelector(`[data-note-for="${CSS.escape(id)}"]`));
      el?.scrollIntoView({ block: 'nearest' });
      el?.focus();
    }, 0);
  };

  // =====================================================================
  // Drawing: text highlights, pins, slide-note chips
  // =====================================================================
  /** The element a text annotation is anchored in. */
  const textScope = (/** @type {import('./state.js').Annotation} */ a) => {
    const blockId = a.blockId ?? '';
    if (blockId.startsWith('slot:')) {
      return document.querySelector(`#${CSS.escape(a.slideId)} .reader-slide-frame [data-slot="${CSS.escape(blockId.slice(5))}"]`);
    }
    return document.getElementById(`${a.slideId}--${blockId}`);
  };

  const renderMarkers = () => {
    for (const old of main.querySelectorAll('.reader-pin, .reader-slide-notes-chip')) old.remove();
    const numbers = pinNumbers();
    /** @type {Map<string, import('./state.js').Annotation[]>} */
    const slideNotes = new Map();
    for (const a of store.get().annotations) {
      const kind = annotationKind(a);
      if (kind === 'slide') {
        slideNotes.set(a.slideId, [...(slideNotes.get(a.slideId) ?? []), a]);
        continue;
      }
      if (kind !== 'pin' || !a.pin) continue;
      const frame = /** @type {HTMLElement | null} */ (document.querySelector(`#${CSS.escape(a.slideId)} .reader-slide-frame`));
      const canvas = frame?.querySelector('.slipr-canvas');
      if (!frame || !canvas) continue;
      const object = findObject(canvas, a.pin.slot, a.pin.item);
      const pos = pinPosition(a.pin, object ? object.getBoundingClientRect() : null, canvas.getBoundingClientRect(), frame.getBoundingClientRect());
      const n = numbers.get(a.id) ?? 0;
      const summary = a.note.trim() ? `: ${truncate(a.note, 80)}` : '';
      frame.append(h('button', {
        type: 'button', class: `reader-pin${pos.approximate ? ' is-approximate' : ''}`, 'data-annotation': a.id,
        style: `left:${pos.left}%;top:${pos.top}%`,
        title: `${a.pin.label}${summary}`, 'aria-label': `Pin ${n} on ${a.pin.label}${summary}`,
      }, [h('span', { class: 'reader-pin-n' }, [String(n)])]));
    }
    for (const [slideId, notes] of slideNotes) {
      const head = document.querySelector(`#${CSS.escape(slideId)} .reader-slide-head`);
      if (!head) continue;
      const label = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
      head.prepend(h('button', {
        type: 'button', class: 'reader-slide-notes-chip', 'data-annotation': notes[0].id,
        title: notes.map((n) => truncate(n.note || '(empty note)', 60)).join('\n'), 'aria-label': `${label} on this slide`,
      }, [`✎ ${label}`]));
    }
  };

  const refresh = () => {
    stopPinning();
    ranges = new Map();
    for (const a of store.get().annotations) {
      if (annotationKind(a) !== 'text' || !a.quote) continue;
      const el = textScope(a);
      if (!el) continue;
      const loc = locateQuote(el.textContent ?? '', a.quote);
      const range = loc && rangeFromOffsets(el, loc.start, loc.end);
      if (range) ranges.set(a.id, range);
    }
    if (registry) {
      // @ts-ignore Highlight is not in every lib.dom version yet
      registry.set('slipr-annotation', new Highlight(...ranges.values()));
    }
    renderMarkers();
    renderList();
  };

  // Pins are positioned in % of the frame, but objects move when the slide
  // reflows (e.g. phone width): recompute on resize.
  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderMarkers, 120);
  }).observe(main);

  // Clicking on highlighted text opens its note.
  main.addEventListener('click', (e) => {
    if (!ranges.size || !getSelection()?.isCollapsed) return;
    if (/** @type {Element} */ (e.target).closest('button, a, .reader-pin-capture')) return;
    const pos = caretAt(e.clientX, e.clientY);
    if (!pos) return;
    for (const [id, range] of ranges) {
      if (range.isPointInRange(pos.node, pos.offset)) {
        openNote(id);
        return;
      }
    }
  });

  return { button, panel, toggle, refresh };
}

// ---------------------------------------------------------------------------
// Slide objects

/**
 * The items of a slot that pins can attach to: its cards (cards slots) or its
 * list items. `kind` decides the label ("Card 2" / "Bullet 2").
 * @param {Element} slotEl
 * @returns {{ items: HTMLElement[], kind: 'card' | 'bullet' }}
 */
function itemsOf(slotEl) {
  const cards = /** @type {HTMLElement[]} */ ([...slotEl.querySelectorAll(':scope > .slipr-card')]);
  if (cards.length) return { items: cards, kind: 'card' };
  return { items: /** @type {HTMLElement[]} */ ([...slotEl.querySelectorAll('li')]), kind: 'bullet' };
}

/**
 * The pinnable objects of a slide visual: every filled slot, with list and
 * cards slots split into their items.
 * @param {Element} canvas
 * @returns {{ el: HTMLElement, slot: string | null, item: number | null, label: string }[]}
 */
function slideObjects(canvas) {
  const objects = [];
  for (const slotEl of /** @type {NodeListOf<HTMLElement>} */ (canvas.querySelectorAll('[data-slot]:not([data-empty])'))) {
    const slot = slotEl.dataset.slot ?? null;
    const { items, kind } = itemsOf(slotEl);
    if (items.length) {
      const top = kind === 'card' ? items
        : items.filter((li) => li.parentElement === slotEl || li.parentElement?.parentElement === slotEl);
      for (const el of top) {
        const item = items.indexOf(el);
        objects.push({ el, slot, item, label: describeTarget({ slot, item, kind, text: itemText(el, kind), isImage: false }) });
      }
    } else {
      objects.push({ el: slotEl, slot, item: null, label: describeTarget({ slot, item: null, text: slotEl.textContent ?? '', isImage: isImage(slotEl) }) });
    }
  }
  return objects;
}

/**
 * The object under a point: the card or innermost list item, else the slot,
 * else the slide background.
 * @param {HTMLElement} canvas @param {number} x @param {number} y
 */
function objectAt(canvas, x, y) {
  const hit = document.elementsFromPoint(x, y).find((el) => canvas.contains(el) && el !== canvas);
  const slotEl = /** @type {HTMLElement | null} */ (hit?.closest('[data-slot]:not([data-field])') ?? null);
  if (slotEl && canvas.contains(slotEl)) {
    const slot = slotEl.dataset.slot ?? null;
    const { items, kind } = itemsOf(slotEl);
    const el = /** @type {HTMLElement | null} */ (hit?.closest(kind === 'card' ? '.slipr-card' : 'li') ?? null);
    if (el && items.includes(el)) {
      const item = items.indexOf(el);
      return { el, slot, item, label: describeTarget({ slot, item, kind, text: itemText(el, kind), isImage: false }) };
    }
    return { el: slotEl, slot, item: null, label: describeTarget({ slot, item: null, text: slotEl.textContent ?? '', isImage: isImage(slotEl) }) };
  }
  return { el: canvas, slot: null, item: null, label: describeTarget({ slot: null, item: null, text: '', isImage: false }) };
}

/** @param {Element} canvas @param {string | null} slot @param {number | null} item */
function findObject(canvas, slot, item) {
  if (!slot) return null;
  const slotEl = canvas.querySelector(`[data-slot="${CSS.escape(slot)}"]:not([data-empty])`);
  if (!slotEl) return null;
  if (item === null) return slotEl;
  return itemsOf(slotEl).items[item] ?? null;
}

/** Label text of a pinnable item: a card's first text field, or a list item's own text. */
function itemText(/** @type {HTMLElement} */ el, /** @type {'card' | 'bullet'} */ kind) {
  if (kind === 'card') {
    const first = [...el.querySelectorAll('[data-field]:not([data-empty])')].find((f) => f.tagName !== 'IMG' && (f.textContent ?? '').trim() && f.getAttribute('data-field') !== '#');
    return first?.textContent ?? el.textContent ?? '';
  }
  return ownText(el);
}

/** Text of a list item without its nested sub-list. */
function ownText(/** @type {Element} */ li) {
  return [...li.childNodes].filter((n) => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join('');
}

function isImage(/** @type {Element} */ el) {
  return el.tagName === 'IMG' || (!!el.querySelector('img') && !(el.textContent ?? '').trim());
}

// ---------------------------------------------------------------------------

/** @param {Node} node */
function nodeElement(node) {
  return node.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (node) : node.parentElement;
}

/**
 * Map text offsets within `root` (as in root.textContent) to a DOM Range.
 * @param {Element} root @param {number} start @param {number} end
 */
function rangeFromOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.textContent?.length ?? 0;
    if (!started && start <= pos + len) {
      range.setStart(node, start - pos);
      started = true;
    }
    if (started && end <= pos + len) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos += len;
  }
  return null;
}

/** @param {number} x @param {number} y @returns {{ node: Node, offset: number } | null} */
function caretAt(x, y) {
  const d = /** @type {any} */ (document);
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

/** @param {string} text @param {number} max */
function truncate(text, max) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
