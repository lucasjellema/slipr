// @ts-check
/**
 * The slide overview in audience mode (I-098): a grid of thumbnails instead
 * of Reveal's single long row. Esc or O opens and closes it.
 *
 * Thumbnails wrap into rows that fit the window, grouped by chapter. The row
 * under the mouse (or with the keyboard focus) grows, and the other rows make
 * room, so the slides you look at become readable. Click, tap or Enter goes
 * to a slide; Esc or O returns to where you were. Arrow keys move through
 * the grid.
 *
 * Thumbnails are copies of the presented slides (so agenda slides and
 * fragments look as presented, all steps shown), made when they scroll into
 * view; embeds show their static fallback.
 *
 * `gridColumns`, `chunkRows` and `moveInGrid` are DOM-free (tested in Node).
 */

/**
 * Columns for a width: thumbnails of about 260–340 px, 2 to 8 per row.
 * @param {number} width  Width of the grid area in px.
 */
export function gridColumns(width) {
  return Math.min(8, Math.max(2, Math.round(width / 300)));
}

/**
 * Split items into rows of `cols`.
 * @template T
 * @param {T[]} items @param {number} cols
 * @returns {T[][]}
 */
export function chunkRows(items, cols) {
  /** @type {T[][]} */
  const rows = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return rows;
}

/**
 * The position after an arrow key, in rows of different lengths (chapters
 * end in shorter rows). Up / down keep the column where they can.
 * @param {number[]} rowLengths @param {number} row @param {number} col @param {string} key
 * @returns {{ row: number, col: number }}
 */
export function moveInGrid(rowLengths, row, col, key) {
  const last = rowLengths.length - 1;
  if (key === 'ArrowRight') {
    if (col < rowLengths[row] - 1) return { row, col: col + 1 };
    return row < last ? { row: row + 1, col: 0 } : { row, col };
  }
  if (key === 'ArrowLeft') {
    if (col > 0) return { row, col: col - 1 };
    return row > 0 ? { row: row - 1, col: rowLengths[row - 1] - 1 } : { row, col };
  }
  if (key === 'ArrowDown' && row < last) return { row: row + 1, col: Math.min(col, rowLengths[row + 1] - 1) };
  if (key === 'ArrowUp' && row > 0) return { row: row - 1, col: Math.min(col, rowLengths[row - 1] - 1) };
  if (key === 'Home') return { row: 0, col: 0 };
  if (key === 'End') return { row: last, col: rowLengths[last] - 1 };
  return { row, col };
}

/**
 * @param {any} deck  An initialised Reveal deck (with `overview: false`).
 * @param {{ chapterTitle?: (id: string) => string | undefined, onOpen?: () => void }} [options]
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function mountGridOverview(deck, options = {}) {
  const doc = document;
  const revealEl = /** @type {HTMLElement} */ (deck.getRevealElement());
  /** @type {HTMLElement | null} */
  let overlay = null;
  /** @type {HTMLElement[][]} */
  let rows = [];
  let focus = { row: 0, col: 0 };
  /** @type {IntersectionObserver | null} */
  let observer = null;

  /** A copy of a presented slide, fit for a thumbnail. @param {HTMLElement} section */
  const thumbnailOf = (section) => {
    const slide = section.querySelector('.slipr-slide');
    if (!slide) return doc.createElement('div');
    const copy = /** @type {HTMLElement} */ (slide.cloneNode(true));
    // Static fallbacks instead of live embeds (no second frame, no empty canvas).
    for (const el of copy.querySelectorAll('[data-embed]')) {
      el.querySelector(':scope > .slipr-embed-live')?.remove();
      el.removeAttribute('data-embed-state');
    }
    for (const el of copy.querySelectorAll('iframe, video, audio, canvas')) el.remove();
    for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
    // Every step shown: Reveal hides fragments anywhere inside .reveal.
    for (const el of copy.querySelectorAll('.fragment')) el.classList.remove('fragment', 'visible', 'current-fragment');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    return copy;
  };

  /** Slides with their Reveal indices, and the chapter they belong to. */
  const slides = () => /** @type {HTMLElement[]} */ (deck.getSlides()).map((section) => ({
    section,
    indices: deck.getIndices(section),
    chapter: section.dataset.chapter ?? '',
    backup: section.classList.contains('slipr-backup'),
  }));

  function build() {
    if (!overlay) return;
    const area = /** @type {HTMLElement} */ (overlay.querySelector('.slipr-grid-body'));
    area.replaceChildren();
    observer?.disconnect();
    const cols = gridColumns(area.clientWidth || revealEl.clientWidth || 1200);
    overlay.style.setProperty('--slipr-grid-cols', String(cols));
    const all = slides();
    const current = deck.getIndices();
    // Groups: a run of slides with the same chapter (backups in their own group at the end).
    /** @type {{ title: string, items: typeof all }[]} */
    const groups = [];
    for (const s of all) {
      const key = s.backup ? '\u0000backup' : s.chapter;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(s);
      else groups.push(Object.assign({ title: s.backup ? 'Backup slides' : (s.chapter && options.chapterTitle?.(s.chapter)) || '', items: [s] }, { key }));
    }
    rows = [];
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cell = /** @type {HTMLElement} */ (entry.target);
        const frame = cell.querySelector('.slipr-grid-frame');
        if (frame && !frame.childElementCount) frame.append(thumbnailOf(all[Number(cell.dataset.index)].section));
        observer?.unobserve(cell);
      }
    }, { root: area, rootMargin: '200px' });

    for (const group of groups) {
      if (group.title) area.append(Object.assign(doc.createElement('h2'), { className: 'slipr-grid-chapter', textContent: group.title }));
      for (const rowItems of chunkRows(group.items, cols)) {
        const rowEl = doc.createElement('div');
        rowEl.className = 'slipr-grid-row';
        rowEl.dataset.row = String(rows.length);
        const cells = rowItems.map((s, c) => {
          const index = all.indexOf(s);
          const cell = doc.createElement('button');
          cell.type = 'button';
          cell.className = 'slipr-grid-cell';
          cell.dataset.index = String(index);
          cell.dataset.row = String(rows.length);
          cell.dataset.col = String(c);
          if (s.backup) cell.classList.add('is-backup');
          const isCurrent = s.indices.h === current.h && (s.indices.v ?? 0) === (current.v ?? 0);
          if (isCurrent) {
            cell.classList.add('is-current');
            cell.setAttribute('aria-current', 'true');
          }
          const title = s.section.querySelector('h1, h2, .slipr-title, [data-slot="title"]')?.textContent?.trim() || `Slide ${index + 1}`;
          cell.setAttribute('aria-label', `${index + 1}. ${title}${s.backup ? ' (backup)' : ''}`);
          const frame = doc.createElement('span');
          frame.className = 'slipr-grid-frame';
          const number = doc.createElement('span');
          number.className = 'slipr-grid-number';
          number.textContent = String(index + 1);
          cell.append(frame, number);
          cell.addEventListener('click', () => go(s.indices));
          cell.addEventListener('focus', () => setFocus(Number(cell.dataset.row), Number(cell.dataset.col), false));
          observer?.observe(cell);
          return cell;
        });
        rowEl.append(...cells);
        area.append(rowEl);
        rows.push(cells);
      }
    }
    const currentCell = /** @type {HTMLElement | null} */ (area.querySelector('.slipr-grid-cell.is-current'));
    const start = currentCell ? { row: Number(currentCell.dataset.row), col: Number(currentCell.dataset.col) } : { row: 0, col: 0 };
    setFocus(start.row, start.col, true);
  }

  /** Enlarge a row (hover or focus). @param {number} row */
  const enlarge = (row) => {
    for (const el of overlay?.querySelectorAll('.slipr-grid-row') ?? []) el.classList.toggle('is-enlarged', Number(/** @type {HTMLElement} */ (el).dataset.row) === row);
  };

  /** @param {number} row @param {number} col @param {boolean} moveFocus */
  function setFocus(row, col, moveFocus) {
    focus = { row, col };
    enlarge(row);
    const cell = rows[row]?.[col];
    if (moveFocus && cell) {
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest' });
    }
  }

  /** @param {{ h: number, v?: number }} indices */
  function go(indices) {
    close();
    // At the slide's start (-1: no steps shown yet), also when going back.
    deck.slide(indices.h, indices.v ?? 0, -1);
  }

  function open() {
    if (overlay) return;
    options.onOpen?.();
    overlay = doc.createElement('div');
    overlay.className = 'slipr-grid';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Slide overview');
    const head = doc.createElement('div');
    head.className = 'slipr-grid-head';
    head.textContent = 'Slide overview: click a slide, or use the arrow keys and Enter. Esc returns.';
    const body = doc.createElement('div');
    body.className = 'slipr-grid-body';
    overlay.append(head, body);
    // Reveal listens for swipes on its element: keep the grid's touches to itself.
    for (const type of ['touchstart', 'touchmove', 'touchend', 'wheel']) overlay.addEventListener(type, (e) => e.stopPropagation());
    body.addEventListener('pointerover', (e) => {
      const cell = /** @type {HTMLElement} */ (e.target).closest?.('.slipr-grid-cell');
      if (cell instanceof HTMLElement) enlarge(Number(cell.dataset.row));
    });
    body.addEventListener('pointerleave', () => enlarge(focus.row));
    revealEl.append(overlay);
    revealEl.classList.add('slipr-grid-open');
    build();
  }

  function close() {
    if (!overlay) return;
    observer?.disconnect();
    observer = null;
    overlay.remove();
    overlay = null;
    rows = [];
    revealEl.classList.remove('slipr-grid-open');
    /** @type {HTMLElement} */ (revealEl).focus?.({ preventScroll: true });
  }

  // While open, the grid has the keyboard (before Reveal, which would change slides).
  window.addEventListener('keydown', (e) => {
    if (!overlay) return;
    if (e.key === 'Escape' || e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    } else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const next = moveInGrid(rows.map((r) => r.length), focus.row, focus.col, e.key);
      setFocus(next.row, next.col, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopImmediatePropagation();
      rows[focus.row]?.[focus.col]?.click();
    } else if (e.key !== 'Tab' && e.key !== 'f' && e.key !== 'F') {
      e.stopImmediatePropagation(); // no slide changes, pauses or tools underneath
    }
  }, true);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    if (!overlay) return;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 150);
  });

  /** Esc closes Reveal's own overlays (help, preview) first. */
  const toggle = () => {
    if (deck.isOverlayOpen?.()) deck.closeOverlay();
    else if (overlay) close();
    else open();
  };
  deck.addKeyBinding({ keyCode: 79, key: 'O', description: 'Slide overview' }, toggle);
  deck.addKeyBinding({ keyCode: 27, key: 'ESC', description: 'Slide overview' }, toggle);

  return { open, close, isOpen: () => Boolean(overlay) };
}
