// @ts-check
/**
 * High-level overview aids for audience mode:
 *  - generated agenda slides (settings.agenda), highlighting the coming chapter
 *  - a chapter progress bar along the bottom edge
 */
import { h } from '../js/dom.js';

const AGENDA_LABEL = { en: 'Agenda', nl: 'Agenda', de: 'Agenda', fr: 'Programme' };

/**
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @param {string} currentChapterId  The chapter that starts after this agenda.
 */
export function buildAgendaSlide(ctx, currentChapterId) {
  const chapters = ctx.show.chapters ?? [];
  const currentIndex = chapters.findIndex((/** @type {any} */ c) => c.id === currentChapterId);
  const lang = String(ctx.show.meta?.language ?? 'en').slice(0, 2);

  const items = chapters.map((/** @type {any} */ chapter, /** @type {number} */ i) => {
    const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'next';
    return h('li', { class: `slipr-agenda-item is-${state}`, 'aria-current': state === 'current' ? 'step' : undefined }, [
      h('span', { class: 'slipr-agenda-number' }, [String(i + 1)]),
      h('span', { class: 'slipr-agenda-text' }, [
        h('span', { class: 'slipr-agenda-title' }, [chapter.title]),
        chapter.summary ? h('span', { class: 'slipr-agenda-summary' }, [chapter.summary]) : null,
      ]),
    ]);
  });

  const slide = h('div', {
    class: 'slipr-slide slipr-mode-audience',
    'data-layout': 'agenda',
    'data-aspect': ctx.show.settings?.aspectRatio ?? '16:9',
  }, [
    h('div', { class: 'slipr-canvas' }, [
      h('div', { class: 'slipr-layout slipr-layout--agenda' }, [
        h('h2', { class: 'slipr-title', 'data-id': 'agenda-title' }, [AGENDA_LABEL[/** @type {keyof AGENDA_LABEL} */ (lang)] ?? AGENDA_LABEL.en]),
        h('ol', { class: 'slipr-agenda', 'data-id': 'agenda-list' }, items),
      ]),
    ]),
  ]);

  return h('section', {
    class: 'slipr-agenda-slide',
    'data-chapter': currentChapterId,
    'data-agenda': '',
  }, [slide]);
}

/**
 * Thin segmented bar: one segment per chapter, sized by its slide count;
 * finished chapters are filled, the current one fills as you advance.
 * @param {any} deck  Reveal instance
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @param {HTMLElement} container
 */
export function createChapterBar(deck, ctx, container) {
  const chapters = ctx.show.chapters ?? [];
  /** @type {HTMLElement[]} */
  const sections = [...container.querySelectorAll('.slides > section:not(.slipr-backup)')];
  const byChapter = new Map(chapters.map((/** @type {any} */ c) => [c.id, sections.filter((s) => s.dataset.chapter === c.id)]));

  const segments = chapters.map((/** @type {any} */ c) => {
    const fill = h('span', { class: 'slipr-chapter-fill' });
    const segment = h('span', { class: 'slipr-chapter-segment', title: c.title }, [fill]);
    segment.style.flexGrow = String(Math.max(1, byChapter.get(c.id)?.length ?? 1));
    return { id: c.id, segment, fill };
  });
  const bar = h('div', { class: 'slipr-chapter-bar', 'aria-hidden': 'true' }, segments.map((s) => s.segment));
  container.append(bar);

  const update = () => {
    /** @type {HTMLElement} */
    const current = deck.getCurrentSlide();
    bar.hidden = !current || current.classList.contains('slipr-backup');
    const chapterId = current?.dataset.chapter;
    const index = chapters.findIndex((/** @type {any} */ c) => c.id === chapterId);
    segments.forEach((s, i) => {
      let fraction = 0;
      if (i < index) fraction = 1;
      else if (i === index) {
        const list = byChapter.get(s.id) ?? [];
        fraction = (list.indexOf(current) + 1) / Math.max(1, list.length);
      }
      s.fill.style.width = `${Math.round(fraction * 100)}%`;
      s.segment.classList.toggle('is-current', i === index);
    });
  };
  deck.on('slidechanged', update);
  update();
}
