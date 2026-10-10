// @ts-check
/**
 * Reader mode: the show as an interactive, personal article (D-008).
 * No Reveal.js. Slide visuals come from shared/render.js, reader blocks from
 * shared/blocks.js, what is visible from personalize.js, and everything
 * personal (prefs, progress, bookmarks, notes) from state.js (D-010).
 *
 * Layout: top bar · contents (drawer on small screens) · article · My notes.
 * Routing: #s-05 or #s-05/b3; the hash follows the slide being read.
 * Keys: J/K next/previous · / search · D depth · M bookmark · N my notes ·
 *       A audience mode · Esc close panels.
 */
import { renderSlide, slideTitle } from '../../shared/render.js';
import { renderBlocks, blockDomId } from '../../shared/blocks.js';
import { markdown } from '../../shared/markdown.js';
import { addStylesheet, h } from '../js/dom.js';
import { audienceUrl, parseReaderHash } from '../js/mode-switch.js';
import { personalize, prefsFromParams, normalisePrefs, nearestVisibleSlide } from './personalize.js';
import { buildContents, createScrollSpy, trackVisits } from './nav.js';
import { setupInteractions } from './interactions.js';
import { openReaderState } from './state.js';
import { openWelcome, createTailorPanel, DEPTHS } from './tailor.js';
import { buildSearchIndex } from './search-index.js';
import { createSearch } from './search.js';
import { createAnnotations } from './annotations.js';

/**
 * @param {HTMLElement} app
 * @param {import('../../shared/load.js').ShowContext} ctx
 */
export async function startReader(app, ctx) {
  const { show, template } = ctx;
  const [store] = await Promise.all([
    openReaderState(show.id),
    addStylesheet(new URL('reader.css', import.meta.url).href),
    template.reader ? addStylesheet(ctx.resolveTemplateAsset(template.reader)) : null,
  ]);

  // URL parameters override stored prefs for this visit (until changed in the UI).
  let urlPrefs = prefsFromParams(new URLSearchParams(location.search));
  const prefs = () => normalisePrefs(show, { ...store.get().prefs, ...urlPrefs });
  let model = personalize(show, prefs());
  const slideHref = (/** @type {string} */ id) => `#${id}`;

  // ----- shell -----
  const toast = createToast();
  const present = /** @type {HTMLAnchorElement} */ (h('a', { class: 'reader-present', href: audienceUrl(null), title: 'Present this show (A)' }, ['Present ▶']));
  const menu = h('button', { type: 'button', class: 'reader-menu', 'aria-controls': 'reader-contents', 'aria-expanded': 'false' }, ['☰', h('span', { class: 'visually-hidden' }, ['Contents'])]);
  const tailor = createTailorPanel(show, {
    prefs,
    showNotes: () => store.get().showNotes,
    onPrefs: (p) => setPrefs(p),
    onShowNotes: (v) => { store.update({ showNotes: v }); render(); },
  });
  const docs = buildSearchIndex(show);
  const searchUi = createSearch({
    docs,
    visible: (doc) => isVisibleDoc(doc),
    includeNotes: () => store.get().showNotes,
    onSelect: (doc) => {
      if (!doc.slideId) return null; // glossary entries have no place to jump to
      return go(doc.blockId ? `#${doc.slideId}/${doc.blockId}` : `#${doc.slideId}`, 'smooth');
    },
    onShowEverything: () => setPrefs({ profile: null, depth: 3, path: null }),
  });
  const main = h('main', { class: 'reader-main', id: 'top' });
  const notes = createAnnotations({
    main,
    store,
    show,
    isVisible: (slideId, blockId) => isVisibleBlock(slideId, blockId),
    goTo: (slideId, blockId) => go(`#${slideId}/${blockId}`, 'smooth'),
    toast,
  });

  const topbar = h('header', { class: 'reader-topbar' }, [
    menu,
    h('a', { class: 'reader-topbar-title', href: '#top' }, [show.meta.title]),
    h('div', { class: 'reader-tools' }, [tailor.button, searchUi.button, notes.button]),
    present,
  ]);
  let contents = buildContents(model, marks);
  const shell = h('div', { class: 'reader' }, [topbar, contents.nav, main, notes.panel]);
  document.body.classList.add('slipr-reader');
  document.body.append(tailor.panel);
  app.replaceChildren(shell);
  setupInteractions(main, show);

  // ----- drawer (small screens) -----
  const setDrawer = (/** @type {boolean} */ open) => {
    contents.nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setDrawer(!contents.nav.classList.contains('is-open')));
  shell.addEventListener('click', (e) => {
    if (/** @type {Element} */ (e.target).closest('.reader-contents a')) setDrawer(false);
  });

  // ----- bookmarks -----
  main.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.reader-bookmark'));
    if (btn?.dataset.slideId) toggleBookmark(btn.dataset.slideId);
  });
  const toggleBookmark = (/** @type {string} */ slideId) => {
    const set = new Set(store.get().bookmarks);
    const on = !set.has(slideId);
    if (on) set.add(slideId); else set.delete(slideId);
    store.update({ bookmarks: [...set] });
    const btn = main.querySelector(`.reader-bookmark[data-slide-id="${CSS.escape(slideId)}"]`);
    btn?.setAttribute('aria-pressed', String(on));
    contents.update();
    toast(on ? 'Bookmarked' : 'Bookmark removed');
  };

  // ----- render (again) -----
  /** @type {ReturnType<typeof createScrollSpy> | null} */
  let spy = null;
  /** @type {ReturnType<typeof trackVisits> | null} */
  let visits = null;
  let programmatic = false;

  function render(keep = spy?.current() ?? null) {
    spy?.disconnect();
    visits?.disconnect();
    model = personalize(show, prefs());
    main.replaceChildren(
      hero(show, model),
      ...model.chapters.map((group) => chapterSection(group, ctx, slideHref, store.get())),
      h('footer', { class: 'reader-footer' }, [
        h('p', {}, [h('a', { href: audienceUrl(null) }, ['Present this show ▶'])]),
        h('p', { class: 'reader-made-with' }, ['Made with Slipr']),
      ]),
    );
    const fresh = buildContents(model, marks);
    contents.nav.replaceWith(fresh.nav);
    if (contents.nav.classList.contains('is-open')) fresh.nav.classList.add('is-open');
    contents = fresh;

    /** @type {HTMLElement[]} */
    const articles = [...main.querySelectorAll('.reader-slide')];
    spy = createScrollSpy(articles, (slideId) => {
      contents.setCurrent(slideId);
      present.href = audienceUrl(slideId);
      if (!programmatic) {
        if (location.hash !== `#${slideId}`) history.replaceState(null, '', `#${slideId}`);
        store.update({ position: { slideId } });
      }
    });
    visits = trackVisits(articles.filter((a) => !store.get().visited.includes(a.dataset.slideId ?? '')), (slideId) => {
      store.update((s) => ({ visited: [...new Set([...s.visited, slideId])] }));
      contents.update();
    });
    notes.refresh();
    if (keep) go(`#${keep}`, 'auto');
  }

  function setPrefs(/** @type {import('./personalize.js').ReaderPrefs} */ next) {
    store.update({ prefs: next });
    // The UI choice now wins over URL parameters: drop them from the URL.
    if (Object.keys(urlPrefs).length) {
      urlPrefs = {};
      const url = new URL(location.href);
      for (const p of ['profile', 'depth', 'path']) url.searchParams.delete(p);
      history.replaceState(null, '', url.href);
    }
    render();
  }

  // ----- routing -----
  /** @returns {HTMLElement | null} the element scrolled to */
  function go(/** @type {string} */ hash, /** @type {ScrollBehavior} */ behavior) {
    const { slideId, blockId } = parseReaderHash(hash);
    if (!slideId) return null;
    const target = nearestVisibleSlide(show, model, slideId);
    if (!target) return null;
    const el = (blockId && target === slideId && document.getElementById(blockDomId(target, blockId)))
      || document.getElementById(target);
    if (!el) return null;
    if (location.hash !== `#${target}${blockId && target === slideId ? `/${blockId}` : ''}`) {
      history.replaceState(null, '', `#${target}${blockId && target === slideId ? `/${blockId}` : ''}`);
    }
    programmatic = true;
    el.scrollIntoView({ behavior, block: 'start' });
    flash(el);
    contents.setCurrent(target);
    present.href = audienceUrl(target);
    store.update({ position: { slideId: target } });
    setTimeout(() => { programmatic = false; }, behavior === 'smooth' ? 800 : 50);
    return el;
  }
  window.addEventListener('hashchange', () => go(location.hash, 'smooth'));

  // ----- visibility helpers (search, notes) -----
  function isVisibleBlock(/** @type {string} */ slideId, /** @type {string} */ blockId) {
    const entry = model.slides.find((s) => s.slide.id === slideId);
    if (!entry) return false;
    if (blockId === '_summary') return !!entry.slide.reader?.summary;
    return entry.blocks.some((b) => b.id === blockId);
  }
  function isVisibleDoc(/** @type {import('./search-index.js').SearchDoc} */ doc) {
    if (doc.kind === 'glossary') return true;
    if (!doc.slideId || !model.slides.some((s) => s.slide.id === doc.slideId)) return false;
    return doc.kind !== 'block' || isVisibleBlock(doc.slideId, /** @type {string} */ (doc.blockId));
  }
  function marks() {
    return { visited: new Set(store.get().visited), bookmarks: new Set(store.get().bookmarks) };
  }

  // ----- first render, welcome, resume -----
  render(null);
  const initialHash = location.hash;
  if (initialHash) {
    go(initialHash, 'auto');
    // Late-loading images can shift the layout: settle once more after load.
    window.addEventListener('load', () => go(location.hash, 'auto'), { once: true });
  }

  const hasChoices = (show.profiles?.length ?? 0) > 0 || (show.paths ?? []).some((/** @type {any} */ p) => p.slides !== '*');
  if (!store.get().welcomed && Object.keys(urlPrefs).length === 0 && hasChoices) {
    const chosen = await openWelcome(show, prefs());
    store.update({ welcomed: true });
    if (chosen) setPrefs(chosen);
    if (initialHash) go(initialHash, 'auto');
  } else if (!initialHash) {
    const last = store.get().position?.slideId;
    const target = last ? nearestVisibleSlide(show, model, last) : null;
    if (target && target !== model.slides[0]?.slide.id) {
      const slide = show.slides.find((/** @type {any} */ s) => s.id === target);
      const resume = h('button', { type: 'button', class: 'reader-link-button' }, [`Continue with “${slideTitle(slide)}”`]);
      resume.addEventListener('click', () => go(`#${target}`, 'smooth'));
      toast(['Welcome back. ', resume], 10000);
    }
  }

  // ----- keyboard -----
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    if (document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      setDrawer(false);
      if (!notes.panel.hidden) notes.toggle(false);
    } else if (key === '/') {
      event.preventDefault();
      searchUi.open();
    } else if (key === 'a') {
      location.href = audienceUrl(spy?.current());
    } else if (key === 'm') {
      const id = spy?.current() ?? model.slides[0]?.slide.id;
      if (id) toggleBookmark(id);
    } else if (key === 'n') {
      notes.toggle();
    } else if (key === 'd') {
      const p = prefs();
      const depth = /** @type {1|2|3} */ ((p.depth % 3) + 1);
      setPrefs({ ...p, depth });
      toast(`Detail: ${DEPTHS.find((d) => d.value === depth)?.label}`);
    } else if (key === 'j' || key === 'k') {
      const ids = model.slides.map((s) => s.slide.id);
      const i = ids.indexOf(spy?.current() ?? ids[0]);
      const next = ids[Math.min(ids.length - 1, Math.max(0, i + (key === 'j' ? 1 : -1)))];
      if (next) location.hash = `#${next}`;
    }
  });
}

// ---------------------------------------------------------------------------

/**
 * @param {any} show
 * @param {import('./personalize.js').ReaderModel} model
 */
function hero(show, model) {
  const { meta } = show;
  const byline = [meta.author, formatDate(meta.date, meta.language)].filter(Boolean).join(' · ');
  const tailored = [
    model.prefs.profile && `for ${show.profiles.find((/** @type {any} */ p) => p.id === model.prefs.profile)?.label}`,
    model.prefs.depth !== 2 && DEPTHS.find((d) => d.value === model.prefs.depth)?.label.toLowerCase(),
    model.path && `route: ${model.path.label}`,
  ].filter(Boolean);
  return h('header', { class: 'reader-hero' }, [
    h('h1', {}, [meta.title]),
    meta.subtitle ? h('p', { class: 'reader-hero-subtitle' }, [meta.subtitle]) : null,
    byline ? h('p', { class: 'reader-hero-byline' }, [byline]) : null,
    meta.description ? h('p', { class: 'reader-hero-description' }, [meta.description]) : null,
    tailored.length ? h('p', { class: 'reader-hero-tailored' }, [
      `Tailored: ${tailored.join(' · ')}. `,
      h('button', { type: 'button', class: 'reader-link-button', popovertarget: 'reader-tailor' }, ['Change']),
    ]) : null,
  ]);
}

/**
 * @param {import('./personalize.js').VisibleChapter} group
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @param {(id: string) => string} slideHref
 * @param {import('./state.js').ReaderState} state
 */
function chapterSection(group, ctx, slideHref, state) {
  const slides = group.slides.map((entry) => slideArticle(entry, ctx, slideHref, state));
  if (!group.chapter) return h('div', { class: 'reader-chapter reader-chapter--none' }, slides);
  const headingId = `chapter-${group.chapter.id}`;
  return h('section', { class: 'reader-chapter', 'aria-labelledby': headingId }, [
    h('header', { class: 'reader-chapter-header' }, [
      h('h2', { id: headingId }, [group.chapter.title]),
      group.chapter.summary ? h('p', {}, [group.chapter.summary]) : null,
    ]),
    ...slides,
  ]);
}

/**
 * @param {import('./personalize.js').VisibleSlide} entry
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @param {(id: string) => string} slideHref
 * @param {import('./state.js').ReaderState} state
 */
function slideArticle(entry, ctx, slideHref, state) {
  const { slide, blocks } = entry;
  const { show } = ctx;
  const reader = slide.reader ?? {};
  const showVisual = reader.showSlide !== false;
  const titleId = `${slide.id}--title`;
  const title = slideTitle(slide);
  const bookmarked = state.bookmarks.includes(slide.id);

  const article = h('article', { class: 'reader-slide', id: slide.id, 'data-slide-id': slide.id, 'aria-labelledby': titleId }, [
    h('div', { class: 'reader-slide-head' }, [
      h('h3', { class: showVisual ? 'reader-slide-title visually-hidden' : 'reader-slide-title', id: titleId }, [title]),
      h('button', {
        type: 'button', class: 'reader-bookmark', 'data-slide-id': slide.id, 'aria-pressed': String(bookmarked),
        title: 'Bookmark this slide (M)', 'aria-label': `Bookmark “${title}”`,
      }, [h('span', { 'aria-hidden': 'true' }, ['★'])]),
    ]),
  ]);
  if (showVisual) {
    const frame = h('div', { class: 'reader-slide-frame' });
    frame.append(renderSlide(slide, ctx, { mode: 'reader', slideHref }));
    article.append(frame);
  }
  if (reader.summary) {
    article.append(h('p', { class: 'reader-summary', id: `${slide.id}--_summary`, 'data-block-id': '_summary' }, [reader.summary]));
  }
  if (blocks.length) {
    const wrap = h('div', { class: 'reader-blocks' });
    wrap.innerHTML = renderBlocks(blocks, slide.id, { show, resolveAsset: ctx.resolveAsset, slideHref });
    article.append(wrap);
  }
  if (slide.notes && state.showNotes) {
    const body = h('div', { class: 'slipr-block-body' });
    body.innerHTML = markdown(slide.notes, { mode: 'reader', glossary: show.glossary, slideHref });
    article.append(h('details', { class: 'slipr-block slipr-block--details reader-notes-presenter' }, [
      h('summary', {}, ['What the presenter said']),
      body,
    ]));
  }
  const related = (reader.related ?? [])
    .map((/** @type {string} */ id) => show.slides.find((/** @type {any} */ s) => s.id === id))
    .filter(Boolean);
  if (related.length) {
    article.append(h('aside', { class: 'reader-related', 'aria-label': 'See also' }, [
      h('p', { class: 'reader-related-heading' }, ['See also']),
      h('ul', {}, related.map((/** @type {any} */ s) => h('li', {}, [h('a', { href: slideHref(s.id), 'data-slide-link': s.id }, [slideTitle(s)])]))),
    ]));
  }
  return article;
}

/** A small polite status message at the bottom of the screen. */
function createToast() {
  const el = h('div', { class: 'reader-toast', role: 'status', 'aria-live': 'polite', hidden: true });
  document.body.append(el);
  let timer = 0;
  return (/** @type {string | (Node | string)[]} */ content, ms = 2500) => {
    clearTimeout(timer);
    el.replaceChildren(...(Array.isArray(content) ? content : [content]));
    el.hidden = false;
    timer = window.setTimeout(() => { el.hidden = true; }, ms);
  };
}

/** Briefly highlight a navigation target. */
function flash(/** @type {Element} */ el) {
  el.classList.remove('is-target');
  void (/** @type {HTMLElement} */ (el)).offsetWidth; // restart the animation
  el.classList.add('is-target');
  setTimeout(() => el.classList.remove('is-target'), 1600);
}

/** @param {EventTarget | null} target */
function isTyping(target) {
  const el = /** @type {HTMLElement | null} */ (target);
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/** @param {string | undefined} iso @param {string | undefined} lang */
function formatDate(iso, lang) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(lang || 'en', { dateStyle: 'long' }).format(date);
  } catch {
    return iso;
  }
}
