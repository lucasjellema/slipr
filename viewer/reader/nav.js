// @ts-check
/**
 * Reader navigation: the chapter table of contents (with progress marks and
 * bookmarks), the scroll-spy that tracks which slide is being read, and the
 * visit tracker that marks slides as read.
 */
import { h } from '../js/dom.js';
import { slideTitle } from '../../shared/render.js';

/**
 * Build the contents <nav>: progress, bookmarks, chapters with their slides.
 * @param {import('./personalize.js').ReaderModel} model
 * @param {() => { visited: Set<string>, bookmarks: Set<string> }} getMarks  Read on every update().
 */
export function buildContents(model, getMarks) {
  /** @type {Map<string, HTMLAnchorElement>} */
  const links = new Map();
  const ids = model.slides.map((s) => s.slide.id);

  const slideItem = (/** @type {import('./personalize.js').VisibleSlide} */ entry) => {
    const id = entry.slide.id;
    const a = /** @type {HTMLAnchorElement} */ (h('a', { href: `#${id}`, 'data-slide-link': id }, [
      h('span', { class: 'reader-toc-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'reader-toc-text' }, [slideTitle(entry.slide)]),
      h('span', { class: 'reader-toc-bookmark', 'aria-hidden': 'true' }, ['★']),
    ]));
    links.set(id, a);
    return h('li', { class: 'reader-toc-slide' }, [a]);
  };
  const items = model.chapters.map((group) => {
    if (!group.chapter) return group.slides.map(slideItem);
    return [h('li', { class: 'reader-toc-chapter' }, [
      h('span', { class: 'reader-toc-chapter-title' }, [group.chapter.title]),
      h('ol', {}, group.slides.map(slideItem)),
    ])];
  }).flat();

  const progressText = h('span', { class: 'reader-progress-text' });
  const progressFill = h('span', { class: 'reader-progress-fill' });
  const bookmarkList = h('ol', { class: 'reader-bookmarks-list' });
  const bookmarkSection = h('div', { class: 'reader-bookmarks', hidden: true }, [
    h('p', { class: 'reader-contents-heading' }, ['Bookmarks']),
    bookmarkList,
  ]);

  const nav = h('nav', { class: 'reader-contents', id: 'reader-contents', 'aria-label': 'Contents' }, [
    h('div', { class: 'reader-progress' }, [progressText, h('span', { class: 'reader-progress-bar', 'aria-hidden': 'true' }, [progressFill])]),
    bookmarkSection,
    h('p', { class: 'reader-contents-heading' }, [model.path ? `Contents · ${model.path.label}` : 'Contents']),
    h('ol', { class: 'reader-toc' }, items),
  ]);

  const update = () => {
    const marks = getMarks();
    let read = 0;
    for (const [id, a] of links) {
      const visited = marks.visited.has(id);
      if (visited) read++;
      a.classList.toggle('is-visited', visited);
      a.classList.toggle('is-bookmarked', marks.bookmarks.has(id));
      a.title = visited ? 'Read' : 'Not read yet';
    }
    progressText.textContent = `${read} of ${ids.length} read`;
    progressFill.style.width = `${ids.length ? Math.round((read / ids.length) * 100) : 0}%`;
    const bookmarked = model.slides.filter((s) => marks.bookmarks.has(s.slide.id));
    bookmarkSection.hidden = bookmarked.length === 0;
    bookmarkList.replaceChildren(...bookmarked.map((s) =>
      h('li', {}, [h('a', { href: `#${s.slide.id}`, 'data-slide-link': s.slide.id }, ['★ ', slideTitle(s.slide)])])));
  };
  update();

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
  return { nav, setCurrent, update };
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
  return { current: () => last, disconnect: () => observer.disconnect() };
}

/**
 * Mark a slide as read once it has been substantially in view for a while:
 * half of it visible (or, for tall slides, half the viewport filled) for 3 s.
 * @param {HTMLElement[]} articles
 * @param {(slideId: string) => void} onVisited
 */
export function trackVisits(articles, onVisited, dwellMs = 3000) {
  /** @type {Map<Element, number>} */
  const timers = new Map();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = /** @type {HTMLElement} */ (entry.target);
      const enough = entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= innerHeight * 0.5;
      if (enough && !timers.has(el)) {
        timers.set(el, window.setTimeout(() => {
          observer.unobserve(el);
          timers.delete(el);
          if (el.dataset.slideId) onVisited(el.dataset.slideId);
        }, dwellMs));
      } else if (!enough && timers.has(el)) {
        clearTimeout(timers.get(el));
        timers.delete(el);
      }
    }
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  for (const a of articles) observer.observe(a);
  return {
    disconnect() {
      observer.disconnect();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
