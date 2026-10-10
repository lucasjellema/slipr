// @ts-check
/**
 * Highlights and notes.
 *  - Select text inside a reader block (or a slide summary): a small toolbar
 *    offers "Highlight" and "Add note".
 *  - Highlights are drawn with the CSS Custom Highlight API (the content DOM
 *    is never modified) and re-anchored by text quote after every re-render.
 *  - "My notes" panel: every highlight with its note, grouped by slide, plus
 *    export (Markdown / JSON) and import (JSON). Notes whose text can no longer
 *    be found, or that sit in content hidden by the current tailoring, are
 *    listed separately rather than lost.
 */
import { h } from '../js/dom.js';
import { slideTitle } from '../../shared/render.js';
import { describeQuote, locateQuote } from './quote.js';
import { annotationsToMarkdown, annotationsToJson, mergeImportedAnnotations } from './notes-export.js';

const SCOPE = '.slipr-block[data-block-id], .reader-summary[data-block-id]';

/**
 * @param {{
 *   main: HTMLElement,
 *   store: import('./state.js').Store,
 *   show: any,
 *   isVisible: (slideId: string, blockId: string) => boolean,
 *   goTo: (slideId: string, blockId: string) => void,
 *   toast: (message: string) => void,
 * }} io
 */
export function createAnnotations(io) {
  const { main, store, show } = io;
  const registry = /** @type {any} */ (globalThis.CSS)?.highlights;
  /** Current DOM range of each anchored annotation, by id. */
  /** @type {Map<string, Range>} */
  let ranges = new Map();

  // ----- selection toolbar -----
  const highlightBtn = h('button', { type: 'button' }, ['Highlight']);
  const noteBtn = h('button', { type: 'button' }, ['Add note']);
  const tools = h('div', { class: 'reader-selection-tools', role: 'toolbar', 'aria-label': 'Selection', hidden: true }, [highlightBtn, noteBtn]);
  document.body.append(tools);
  tools.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the selection

  /** @returns {{ range: Range, scope: HTMLElement } | null} */
  const currentSelection = () => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const start = /** @type {Element | null} */ (nodeElement(range.startContainer)?.closest(SCOPE) ?? null);
    const end = nodeElement(range.endContainer)?.closest(SCOPE);
    if (!start || start !== end || !main.contains(start) || !range.toString().trim()) return null;
    return { range, scope: /** @type {HTMLElement} */ (start) };
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

  const create = (/** @type {boolean} */ withNote) => {
    const current = currentSelection();
    tools.hidden = true;
    if (!current) return;
    const { range, scope } = current;
    const slideId = /** @type {HTMLElement | null} */ (scope.closest('.reader-slide'))?.dataset.slideId;
    const blockId = scope.dataset.blockId;
    if (!slideId || !blockId) return;
    const before = document.createRange();
    before.selectNodeContents(scope);
    before.setEnd(range.startContainer, range.startOffset);
    const text = scope.textContent ?? '';
    let start = before.toString().length;
    let end = start + range.toString().length;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    /** @type {import('./state.js').Annotation} */
    const annotation = {
      id: globalThis.crypto?.randomUUID?.() ?? `a-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      slideId, blockId,
      quote: describeQuote(text, start, end),
      note: '',
      created: new Date().toISOString(),
    };
    store.update((s) => ({ annotations: [...s.annotations, annotation] }));
    getSelection()?.removeAllRanges();
    refresh();
    if (withNote) {
      toggle(true);
      focusNote(annotation.id);
    } else {
      io.toast('Highlighted. Find it under “My notes”.');
    }
  };
  highlightBtn.addEventListener('click', () => create(false));
  noteBtn.addEventListener('click', () => create(true));

  // ----- panel -----
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
    h('p', { class: 'reader-notes-hint' }, ['Select text in the article to highlight it or add a note. Your notes are stored only in this browser.']),
    list,
    h('div', { class: 'reader-notes-actions' }, [exportMd, exportJson, importJson, fileInput]),
  ]);

  const toggle = (/** @type {boolean | undefined} */ force) => {
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('reader-notes-open', open);
    if (open) renderList();
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

  /** Status of each annotation in the current rendering. */
  const status = (/** @type {import('./state.js').Annotation} */ a) => {
    const slide = show.slides?.find((/** @type {any} */ s) => s.id === a.slideId);
    const exists = slide && (a.blockId === '_summary' ? !!slide.reader?.summary : slide.reader?.blocks?.some((/** @type {any} */ b) => b.id === a.blockId));
    if (!exists) return 'orphan';
    if (!io.isVisible(a.slideId, a.blockId)) return 'hidden';
    return ranges.has(a.id) ? 'ok' : 'orphan';
  };

  const renderList = () => {
    const anns = store.get().annotations;
    countBadge.textContent = anns.length ? String(anns.length) : '';
    if (panel.hidden) return;
    const order = new Map((show.slides ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => [s.id, i]));
    const sorted = [...anns].sort((a, b) => (order.get(a.slideId) ?? 1e9) - (order.get(b.slideId) ?? 1e9) || a.created.localeCompare(b.created));
    const groups = { ok: /** @type {any[]} */ ([]), hidden: /** @type {any[]} */ ([]), orphan: /** @type {any[]} */ ([]) };
    for (const a of sorted) groups[status(a)].push(a);

    const card = (/** @type {import('./state.js').Annotation} */ a, /** @type {string} */ state) => {
      const slide = show.slides?.find((/** @type {any} */ s) => s.id === a.slideId);
      const note = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: '2', placeholder: 'Add a note…', 'aria-label': 'Note', 'data-note-for': a.id }));
      note.value = a.note;
      let t = 0;
      note.addEventListener('input', () => {
        clearTimeout(t);
        t = window.setTimeout(() => store.update((s) => ({
          annotations: s.annotations.map((x) => (x.id === a.id ? { ...x, note: note.value, updated: new Date().toISOString() } : x)),
        })), 400);
      });
      const go = h('button', { type: 'button', class: 'reader-link-button' }, ['Go to text']);
      go.addEventListener('click', () => io.goTo(a.slideId, a.blockId));
      const del = h('button', { type: 'button', class: 'reader-link-button reader-link-button--danger' }, ['Delete']);
      del.addEventListener('click', () => {
        store.update((s) => ({ annotations: s.annotations.filter((x) => x.id !== a.id) }));
        refresh();
      });
      return h('article', { class: `reader-note is-${state}`, 'data-annotation': a.id }, [
        h('p', { class: 'reader-note-slide' }, [slide ? slideTitle(slide) : a.slideId]),
        h('blockquote', {}, [truncate(a.quote.exact, 220)]),
        note,
        h('div', { class: 'reader-note-actions' }, [state === 'ok' ? go : null, del]),
      ]);
    };

    const sections = [];
    if (!anns.length) sections.push(h('p', { class: 'reader-notes-empty' }, ['No highlights yet.']));
    sections.push(...groups.ok.map((a) => card(a, 'ok')));
    if (groups.hidden.length) {
      sections.push(h('h3', {}, ['Hidden by your tailoring']), ...groups.hidden.map((a) => card(a, 'hidden')));
    }
    if (groups.orphan.length) {
      sections.push(h('h3', {}, ['Text no longer found']), h('p', { class: 'reader-notes-hint' }, ['The show has changed since you made these.']),
        ...groups.orphan.map((a) => card(a, 'orphan')));
    }
    list.replaceChildren(...sections);
  };

  const focusNote = (/** @type {string} */ id) => {
    setTimeout(() => {
      const el = /** @type {HTMLTextAreaElement | null} */ (list.querySelector(`[data-note-for="${CSS.escape(id)}"]`));
      el?.scrollIntoView({ block: 'nearest' });
      el?.focus();
    }, 0);
  };

  // ----- highlights -----
  const refresh = () => {
    ranges = new Map();
    for (const a of store.get().annotations) {
      const el = document.getElementById(`${a.slideId}--${a.blockId}`);
      if (!el) continue;
      const loc = locateQuote(el.textContent ?? '', a.quote);
      const range = loc && rangeFromOffsets(el, loc.start, loc.end);
      if (range) ranges.set(a.id, range);
    }
    if (registry) {
      // @ts-ignore Highlight is not in every lib.dom version yet
      registry.set('slipr-annotation', new Highlight(...ranges.values()));
    }
    renderList();
  };

  // Clicking on highlighted text opens its note.
  main.addEventListener('click', (e) => {
    if (!ranges.size || !getSelection()?.isCollapsed) return;
    const pos = caretAt(e.clientX, e.clientY);
    if (!pos) return;
    for (const [id, range] of ranges) {
      if (range.isPointInRange(pos.node, pos.offset)) {
        toggle(true);
        focusNote(id);
        return;
      }
    }
  });

  return { button, panel, toggle, refresh };
}

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
