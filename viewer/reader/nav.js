// @ts-check
/**
 * Reader navigation: the chapter table of contents and the scroll-spy that
 * tracks which slide is being read.
 */
import { h } from '../js/dom.js';
import { slideTitle } from '../../shared/render.js';

/**
 * Build the contents <nav>: chapters with their (visible) slides.
 * @param {import('./personalize.js').ReaderModel} model
 * @returns {{ nav: HTMLElement, setCurrent: (slideId: string | null) => void }}
 */
export function buildContents(model) {
  /** @type {Map<string, HTMLAnchorElement>} */
  const links = new Map();
  const slideItem = (/** @type {import('./personalize.js').VisibleSlide} */ entry) => {
    const a = /** @type {HTMLAnchorElement} */ (h('a', { href: `#${entry.slide.id}`, 'data-slide-link': entry.slide.id }, [slideTitle(entry.slide)]));
    links.set(entry.slide.id, a);
    return h('li', { class: 'reader-toc-slide' }, [a]);
  };

  const items = model.chapters.map((group) => {
    if (!group.chapter) return group.slides.map(slideItem);
    return [h('li', { class: 'reader-toc-chapter' }, [
      h('span', { class: 'reader-toc-chapter-title' }, [group.chapter.title]),
      h('ol', {}, group.slides.map(slideItem)),
    ])];
  }).flat();

  const nav = h('nav', { class: 'reader-contents', id: 'reader-contents', 'aria-label': 'Contents' }, [
    h('p', { class: 'reader-contents-heading' }, ['Contents']),
    h('ol', { class: 'reader-toc' }, items),
  ]);

  /** @type {string | null} */
  let current = null;
  const setCurrent = (/** @type {string | null} */ slideId) => {
    if (slideId === current) return;
    if (current) links.get(current)?.removeAttribute('aria-current');
    current = slideId;
    const link = slideId ? links.get(slideId) : null;
    if (link) {
      link.setAttribute('aria-current', 'location');
      link.scrollIntoView({ block: 'nearest' });
    }
  };
  return { nav, setCurrent };
}

/**
 * Report the slide currently being read: the topmost slide whose area crosses
 * a band about a third of the way down the viewport.
 * @param {HTMLElement[]} articles  Elements with data-slide-id.
 * @param {(slideId: string) => void} onChange
 */
export function createScrollSpy(articles, onChange) {
  const inBand = new Set();
  /** @type {string | null} */
  let last = null;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) inBand.add(entry.target);
      else inBand.delete(entry.target);
    }
    const first = articles.find((a) => inBand.has(a));
    const id = first?.dataset.slideId ?? null;
    if (id && id !== last) {
      last = id;
      onChange(id);
    }
  }, { rootMargin: '-30% 0px -65% 0px' });
  for (const article of articles) observer.observe(article);
  return { current: () => last };
}
