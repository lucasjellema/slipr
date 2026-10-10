// @ts-check
/**
 * Reader mode: the show as an interactive, responsive article (D-008).
 * No Reveal.js. Slide visuals come from shared/render.js, reader blocks from
 * shared/blocks.js, and what is visible from personalize.js.
 *
 * Layout: top bar · contents (drawer on small screens) · article.
 * Routing: #s-05 or #s-05/b3; the hash follows the slide being read.
 * Keys: J / K next / previous slide, A audience mode, Esc closes the drawer.
 */
import { renderSlide, slideTitle } from '../../shared/render.js';
import { renderBlocks, blockDomId } from '../../shared/blocks.js';
import { markdown } from '../../shared/markdown.js';
import { addStylesheet, h } from '../js/dom.js';
import { audienceUrl, parseReaderHash } from '../js/mode-switch.js';
import { personalize, prefsFromParams, nearestVisibleSlide } from './personalize.js';
import { buildContents, createScrollSpy } from './nav.js';
import { setupInteractions } from './interactions.js';

/**
 * @param {HTMLElement} app
 * @param {import('../../shared/load.js').ShowContext} ctx
 */
export async function startReader(app, ctx) {
  const { show, template } = ctx;
  await Promise.all([
    addStylesheet(new URL('reader.css', import.meta.url).href),
    template.reader ? addStylesheet(ctx.resolveTemplateAsset(template.reader)) : null,
  ]);

  const model = personalize(show, prefsFromParams(new URLSearchParams(location.search)));
  const slideHref = (/** @type {string} */ id) => `#${id}`;

  const present = /** @type {HTMLAnchorElement} */ (h('a', { class: 'reader-present', href: audienceUrl(null), title: 'Present this show (A)' }, ['Present ▶']));
  const menu = h('button', { type: 'button', class: 'reader-menu', 'aria-controls': 'reader-contents', 'aria-expanded': 'false' }, ['☰', h('span', { class: 'visually-hidden' }, ['Contents'])]);
  const topbar = h('header', { class: 'reader-topbar' }, [
    menu,
    h('a', { class: 'reader-topbar-title', href: '#top' }, [show.meta.title]),
    present,
  ]);

  const contents = buildContents(model);
  const main = h('main', { class: 'reader-main', id: 'top' }, [
    hero(show, model),
    ...model.chapters.map((group) => chapterSection(group, ctx, slideHref)),
    h('footer', { class: 'reader-footer' }, [
      h('p', {}, [h('a', { href: audienceUrl(null) }, ['Present this show ▶'])]),
      h('p', { class: 'reader-made-with' }, ['Made with Slipr']),
    ]),
  ]);

  document.body.classList.add('slipr-reader');
  app.replaceChildren(h('div', { class: 'reader' }, [topbar, contents.nav, main]));
  setupInteractions(main, show);

  // ----- drawer (small screens) -----
  const setDrawer = (/** @type {boolean} */ open) => {
    contents.nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setDrawer(!contents.nav.classList.contains('is-open')));
  contents.nav.addEventListener('click', (e) => {
    if (/** @type {Element} */ (e.target).closest('a')) setDrawer(false);
  });

  // ----- scroll-spy: contents highlight, hash, "Present" target -----
  /** @type {HTMLElement[]} */
  const articles = [...main.querySelectorAll('.reader-slide')];
  let programmatic = false;
  const spy = createScrollSpy(articles, (slideId) => {
    contents.setCurrent(slideId);
    present.href = audienceUrl(slideId);
    if (!programmatic && location.hash !== `#${slideId}`) history.replaceState(null, '', `#${slideId}`);
  });

  // ----- routing -----
  const go = (/** @type {string} */ hash, /** @type {ScrollBehavior} */ behavior) => {
    const { slideId, blockId } = parseReaderHash(hash);
    if (!slideId) return;
    const target = nearestVisibleSlide(show, model, slideId);
    if (!target) return;
    if (target !== slideId) history.replaceState(null, '', `#${target}`);
    const el = (blockId && target === slideId && document.getElementById(blockDomId(target, blockId)))
      || document.getElementById(target);
    if (!el) return;
    programmatic = true;
    el.scrollIntoView({ behavior, block: 'start' });
    flash(el);
    contents.setCurrent(target);
    present.href = audienceUrl(target);
    setTimeout(() => { programmatic = false; }, behavior === 'smooth' ? 800 : 50);
  };
  window.addEventListener('hashchange', () => go(location.hash, 'smooth'));
  if (location.hash) {
    go(location.hash, 'auto');
    // Late-loading images can shift the layout: settle once more after load.
    window.addEventListener('load', () => go(location.hash, 'auto'), { once: true });
  }

  // ----- keyboard -----
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') setDrawer(false);
    if (key === 'a') location.href = audienceUrl(spy.current());
    if (key === 'j' || key === 'k') {
      const ids = model.slides.map((s) => s.slide.id);
      const i = ids.indexOf(spy.current() ?? ids[0]);
      const next = ids[Math.min(ids.length - 1, Math.max(0, i + (key === 'j' ? 1 : -1)))];
      if (next) location.hash = `#${next}`;
    }
  });
}

/**
 * @param {any} show
 * @param {import('./personalize.js').ReaderModel} model
 */
function hero(show, model) {
  const { meta } = show;
  const byline = [meta.author, formatDate(meta.date, meta.language)].filter(Boolean).join(' · ');
  const tailored = [
    model.prefs.profile && `for ${show.profiles.find((/** @type {any} */ p) => p.id === model.prefs.profile)?.label}`,
    model.prefs.depth !== 2 && (model.prefs.depth === 1 ? 'essentials only' : 'deep dive'),
    model.path && `path: ${model.path.label}`,
  ].filter(Boolean);
  const everything = new URL(location.href);
  for (const p of ['profile', 'depth', 'path']) everything.searchParams.delete(p);
  everything.hash = '';
  return h('header', { class: 'reader-hero' }, [
    h('h1', {}, [meta.title]),
    meta.subtitle ? h('p', { class: 'reader-hero-subtitle' }, [meta.subtitle]) : null,
    byline ? h('p', { class: 'reader-hero-byline' }, [byline]) : null,
    meta.description ? h('p', { class: 'reader-hero-description' }, [meta.description]) : null,
    tailored.length ? h('p', { class: 'reader-hero-tailored' }, [
      `Tailored: ${tailored.join(' · ')}. `,
      h('a', { href: everything.href }, ['Show the standard version']),
    ]) : null,
  ]);
}

/**
 * @param {import('./personalize.js').VisibleChapter} group
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @param {(id: string) => string} slideHref
 */
function chapterSection(group, ctx, slideHref) {
  const slides = group.slides.map((entry) => slideArticle(entry, ctx, slideHref));
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
 */
function slideArticle(entry, ctx, slideHref) {
  const { slide, blocks } = entry;
  const { show } = ctx;
  const reader = slide.reader ?? {};
  const showVisual = reader.showSlide !== false;
  const titleId = `${slide.id}--title`;

  const article = h('article', { class: 'reader-slide', id: slide.id, 'data-slide-id': slide.id, 'aria-labelledby': titleId }, [
    h('h3', { class: showVisual ? 'reader-slide-title visually-hidden' : 'reader-slide-title', id: titleId }, [slideTitle(slide)]),
  ]);
  if (showVisual) {
    const frame = h('div', { class: 'reader-slide-frame' });
    frame.append(renderSlide(slide, ctx, { mode: 'reader', slideHref }));
    article.append(frame);
  }
  if (reader.summary) article.append(h('p', { class: 'reader-summary' }, [reader.summary]));
  if (blocks.length) {
    const wrap = h('div', { class: 'reader-blocks' });
    wrap.innerHTML = renderBlocks(blocks, slide.id, { show, resolveAsset: ctx.resolveAsset, slideHref });
    article.append(wrap);
  }
  if (slide.notes) {
    const body = h('div', { class: 'slipr-block-body' });
    body.innerHTML = markdown(slide.notes, { mode: 'reader', glossary: show.glossary, slideHref });
    article.append(h('details', { class: 'slipr-block slipr-block--details reader-notes' }, [
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
