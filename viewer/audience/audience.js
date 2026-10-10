// @ts-check
/**
 * Audience mode: a thin layer over Reveal.js (D-008). Builds one <section>
 * per slide from shared/render.js output, maps Slipr's audience options onto
 * Reveal attributes, and starts Reveal.
 */
import Reveal from '../../vendor/reveal.js-6.0.2/dist/reveal.mjs';
import RevealNotes from '../../vendor/reveal.js-6.0.2/dist/plugin/notes.mjs';
import RevealZoom from '../../vendor/reveal.js-6.0.2/dist/plugin/zoom.mjs';
import RevealSearch from '../../vendor/reveal.js-6.0.2/dist/plugin/search.mjs';
import { renderSlide } from '../../shared/render.js';
import { markdown } from '../../shared/markdown.js';
import { addStylesheet, h } from '../js/dom.js';
import { buildAgendaSlide, createChapterBar } from './agenda.js';
import { readerUrl } from '../js/mode-switch.js';

const VENDOR = new URL('../../vendor/reveal.js-6.0.2/dist/', import.meta.url);
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|color)\(.*\)|[a-z]+)$/i;

/**
 * @param {HTMLElement} app
 * @param {import('../../shared/load.js').ShowContext} ctx
 * @returns {Promise<any>} the Reveal deck instance
 */
export async function startAudience(app, ctx) {
  await Promise.all([
    addStylesheet(new URL('reset.css', VENDOR).href),
    addStylesheet(new URL('reveal.css', VENDOR).href),
    addStylesheet(new URL('audience.css', import.meta.url).href),
  ]);
  await document.fonts.ready;

  const { show } = ctx;
  const slidesEl = h('div', { class: 'slides' });
  const revealEl = h('div', { class: 'reveal' }, [slidesEl]);

  const main = show.slides.filter((/** @type {any} */ s) => !s.audience?.hidden);
  const backups = show.slides.filter((/** @type {any} */ s) => s.audience?.hidden);
  const agenda = Boolean(show.settings?.agenda) && (show.chapters?.length ?? 0) > 1;

  let currentChapter = null;
  main.forEach((/** @type {any} */ slide, /** @type {number} */ i) => {
    const opensChapter = agenda && slide.chapter && slide.chapter !== currentChapter;
    // An agenda goes before a chapter's first slide, except at the very start
    // of the show, where it follows the title slide.
    if (opensChapter && i > 0) slidesEl.append(buildAgendaSlide(ctx, slide.chapter));
    slidesEl.append(buildSection(slide, ctx));
    if (opensChapter && i === 0) slidesEl.append(buildAgendaSlide(ctx, slide.chapter));
    if (slide.chapter) currentChapter = slide.chapter;
  });
  for (const slide of backups) {
    const section = buildSection(slide, ctx);
    section.dataset.visibility = 'uncounted';
    section.classList.add('slipr-backup');
    slidesEl.append(section);
  }

  document.body.classList.add('slipr-audience');
  app.replaceChildren(revealEl);

  const [width, height] = show.settings?.aspectRatio === '4:3' ? [1440, 1080] : [1920, 1080];
  const deck = new Reveal(revealEl, {
    width,
    height,
    margin: 0,
    minScale: 0.05,
    maxScale: 4,
    center: false,
    hash: true,
    controls: true,
    controlsTutorial: false,
    progress: false, // replaced by the chapter bar
    slideNumber: show.settings?.slideNumbers ? 'c/t' : false,
    transition: show.settings?.transition ?? 'fade',
    backgroundTransition: 'fade',
    autoAnimateDuration: 0.7,
    plugins: [RevealNotes, RevealZoom, RevealSearch],
  });
  await deck.initialize();

  // R: continue reading this slide in reader mode. Agenda slides map to the
  // first slide of the chapter they introduce.
  deck.addKeyBinding({ keyCode: 82, key: 'R', description: 'Reader mode' }, () => {
    /** @type {HTMLElement | null} */
    let section = deck.getCurrentSlide();
    while (section && !section.dataset.slideId) section = /** @type {HTMLElement | null} */ (section.nextElementSibling);
    location.href = readerUrl(section?.dataset.slideId);
  });

  if (show.chapters?.length) createChapterBar(deck, ctx, revealEl);
  return deck;
}

/**
 * @param {any} slide
 * @param {import('../../shared/load.js').ShowContext} ctx
 */
function buildSection(slide, ctx) {
  const options = slide.audience ?? {};
  const section = document.createElement('section');
  section.id = slide.id; // enables Reveal's #/slide-id deep links
  section.dataset.slideId = slide.id;
  if (slide.chapter) section.dataset.chapter = slide.chapter;
  if (options.transition) section.dataset.transition = options.transition;
  if (options.autoAnimate) section.dataset.autoAnimate = '';
  if (options.background) {
    if (COLOR.test(options.background)) section.dataset.backgroundColor = options.background;
    else section.dataset.backgroundImage = ctx.resolveAsset(options.background);
  }

  const rendered = renderSlide(slide, ctx, { mode: 'audience', slideHref: (id) => `#/${id.split('/')[0]}` });

  // Stable ids let auto-animate morph the same slot from one slide to the next.
  for (const el of rendered.querySelectorAll('[data-slot]')) {
    /** @type {HTMLElement} */ (el).dataset.id = `slot-${/** @type {HTMLElement} */ (el).dataset.slot}`;
  }
  if (options.fragments) {
    const style = typeof options.fragments === 'string' ? options.fragments : null;
    // Cards build one by one; list items inside a card come with their card.
    for (const li of rendered.querySelectorAll('.slipr-card, li:not(.slipr-card li)')) {
      li.classList.add('fragment');
      if (style) li.classList.add(style);
    }
  }
  section.append(rendered);

  if (slide.notes) {
    const notes = document.createElement('aside');
    notes.className = 'notes';
    notes.innerHTML = markdown(slide.notes, { mode: 'audience', glossary: ctx.show.glossary });
    section.append(notes);
  }
  return section;
}
