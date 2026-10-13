// @ts-check
/**
 * Render one slide visual: clone the template's layout fragment and fill its
 * [data-slot] elements from slide.content. The only slide renderer in Slipr
 * (D-005): used by audience mode, reader mode and the editor preview.
 *
 * Output structure (see docs/template-format.md):
 *   <div class="slipr-slide slipr-mode-…" data-layout data-aspect data-slide-id>
 *     <div class="slipr-canvas">
 *       …filled layout fragment…
 *       <div class="slipr-overlays">   (extra images D-013, text elements D-016)
 *         <div class="slipr-overlay"> <img> </div>
 *         <div class="slipr-overlay slipr-overlay--text"> <div class="slipr-overlay-text">…</div> </div>
 *       </div>
 *     </div>
 *   </div>
 *
 * A reader-mode slide with overlays gets the mode class
 * `slipr-mode-reader-fixed` instead of `slipr-mode-reader`, so the templates'
 * narrow-screen reflow rules leave it a picture (I-083).
 *
 * Text goes in via textContent; Markdown via shared/markdown.js (escaped);
 * embed slots via shared/embeds/ (escaped; live content added later by
 * hydrateEmbeds()); nothing else from the show reaches innerHTML.
 */
import { markdown, markdownInline, markdownListItems, escape } from './markdown.js';
import { applyPictureStyle } from './picture.js';
import { textStyleDeclarations } from './text-style.js';
import { applyCropFallback } from './crop.js';
import { linkGlossaryTerms } from './glossary.js';
import { embedKindForSlot, fillEmbedElement } from './embeds/index.js';
import { isBlockedUrl } from './embeds/web.js';

/**
 * @typedef {object} RenderOptions
 * @property {'audience' | 'reader'} [mode]  Default 'audience'.
 * @property {(slideId: string) => string} [slideHref]  Href for in-show links.
 * @property {Document} [document]  Default: the global document.
 */

/**
 * @param {any} slide
 * @param {import('./load.js').ShowContext} ctx
 * @param {RenderOptions} [options]
 * @returns {HTMLElement}
 */
export function renderSlide(slide, ctx, options = {}) {
  const doc = options.document ?? globalThis.document;
  const mode = options.mode ?? 'audience';
  const mdOptions = { mode, glossary: ctx.show.glossary ?? {}, slideHref: options.slideHref };

  const overlays = Array.isArray(slide.overlays) ? slide.overlays : [];
  const root = doc.createElement('div');
  root.className = `slipr-slide slipr-mode-${mode}${mode === 'reader' && overlays.length ? '-fixed' : ''}`;
  root.dataset.layout = slide.layout;
  root.dataset.aspect = ctx.show.settings?.aspectRatio ?? '16:9';
  root.dataset.slideId = slide.id;
  if (slide.chapter) root.dataset.chapter = slide.chapter;

  const canvas = doc.createElement('div');
  canvas.className = 'slipr-canvas';
  root.append(canvas);

  const layout = ctx.layouts.get(slide.layout);
  if (!layout) {
    canvas.innerHTML = `<div class="slipr-layout slipr-layout--missing"><p class="slipr-body">Unknown layout “${escape(String(slide.layout))}”</p></div>`;
    return root;
  }

  const tpl = doc.createElement('template');
  tpl.innerHTML = layout.html.trim(); // template files are trusted author files
  resolveRelativeUrls(tpl.content, layout.base);
  canvas.append(tpl.content);

  const slotDefs = new Map((layout.def.slots ?? []).map((/** @type {any} */ s) => [s.name, s]));
  const content = slide.content ?? {};

  for (const el of canvas.querySelectorAll('[data-slot]')) {
    const name = /** @type {HTMLElement} */ (el).dataset.slot ?? '';
    const def = slotDefs.get(name);
    const value = content[name];
    if (isEmpty(value) || !def) {
      el.setAttribute('data-empty', '');
      continue;
    }
    fillSlot(/** @type {HTMLElement} */ (el), def.type, value, ctx, mdOptions, doc, { mode, def });
  }
  if (overlays.length) canvas.append(renderOverlays(overlays, ctx, doc, mode, mdOptions));
  // Reader mode: glossary terms in the slide's text open their definition (I-086).
  if (mode === 'reader') linkGlossaryTerms(canvas, ctx.show.glossary);
  // The overlay layer lets clicks through; links, terms and popups in text elements take them.
  for (const el of canvas.querySelectorAll('.slipr-overlay--text :is(a, button, [tabindex])')) {
    /** @type {HTMLElement} */ (el).style.pointerEvents = 'auto';
  }
  // Cropped pictures in browsers without object-view-box (I-090).
  applyCropFallback(canvas);
  return root;
}

/**
 * The layer of extra images (D-013, I-083) and text elements (D-016, I-089):
 * absolutely positioned in front of the layout, as fractions of the canvas.
 * Positioning is inline so every template supports it; values are clamped
 * numbers or checked values (shared/text-style.js), never raw strings.
 * @param {any[]} overlays
 * @param {import('./load.js').ShowContext} ctx
 * @param {Document} doc
 * @param {string} mode
 * @param {import('./markdown.js').MarkdownOptions} md
 * @returns {HTMLElement}
 */
function renderOverlays(overlays, ctx, doc, mode, md) {
  const layer = doc.createElement('div');
  layer.className = 'slipr-overlays';
  Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '10', pointerEvents: 'none' });
  overlays.forEach((overlay, i) => {
    const isText = typeof overlay?.text === 'string';
    const src = overlay?.image?.src;
    if (!isText && (typeof src !== 'string' || !src)) return;
    // The box (position, fragment) and its content (picture style, opacity)
    // are separate elements: a picture's inline opacity would otherwise beat
    // Reveal's fragment opacity, and the image would show before its click.
    const box = doc.createElement('div');
    box.className = isText ? 'slipr-overlay slipr-overlay--text' : 'slipr-overlay';
    box.dataset.overlay = String(i);
    Object.assign(box.style, {
      position: 'absolute',
      left: percent(overlay.x),
      top: percent(overlay.y),
      width: percent(overlay.w),
      height: percent(overlay.h),
    });
    if (isText) {
      fillTextOverlay(box, overlay, doc, md);
      layer.append(box);
      return;
    }
    const img = doc.createElement('img');
    img.src = ctx.resolveAsset(src);
    img.alt = overlay.image.alt ?? '';
    img.decoding = 'async';
    if (mode === 'reader') img.loading = 'lazy';
    Object.assign(img.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: overlay.image.fit === 'cover' ? 'cover' : 'contain',
      margin: '0',
    });
    if (typeof overlay.image.focus === 'string') img.style.objectPosition = overlay.image.focus;
    applyPictureStyle(img, overlay.image);
    box.append(img);
    layer.append(box);
  });
  return layer;
}

/**
 * A text element (I-089): inline Markdown per line, in a flex column so it can
 * be aligned vertically. The look comes from shared/text-style.js.
 * @param {HTMLElement} box @param {any} overlay @param {Document} doc
 * @param {import('./markdown.js').MarkdownOptions} md
 */
function fillTextOverlay(box, overlay, doc, md) {
  Object.assign(box.style, {
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    lineHeight: '1.2',
    overflowWrap: 'break-word',
  });
  for (const [property, value] of textStyleDeclarations(overlay.style)) box.style.setProperty(property, value);
  const text = doc.createElement('div');
  text.className = 'slipr-overlay-text';
  text.innerHTML = String(overlay.text).split(/\r?\n/).map((line) => markdownInline(line, md)).join('<br>');
  box.append(text);
}

/** A fraction 0–1 as a CSS percentage, clamped. @param {unknown} n */
function percent(n) {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  return `${Math.round(v * 100000) / 1000}%`;
}

/**
 * Best-effort title of a slide, for agendas, contents and search.
 * @param {any} slide
 * @returns {string}
 */
export function slideTitle(slide) {
  const c = slide?.content ?? {};
  for (const key of ['title', 'heading', 'caption']) {
    if (typeof c[key] === 'string' && c[key].trim()) return c[key].trim();
  }
  if (c.image?.alt) return c.image.alt;
  return slide?.id ?? '';
}

// ---------------------------------------------------------------------------

/**
 * @param {HTMLElement} el @param {string} type @param {any} value
 * @param {import('./load.js').ShowContext} ctx
 * @param {import('./markdown.js').MarkdownOptions} md
 * @param {Document} doc
 * @param {{ mode: string, def?: any }} options
 */
function fillSlot(el, type, value, ctx, md, doc, options) {
  switch (type) {
    case 'cards':
      fillCards(el, options.def ?? {}, value, ctx, md, doc, options);
      break;

    case 'text':
      el.textContent = String(value);
      break;

    case 'richtext':
      el.innerHTML = markdown(String(value), md);
      break;

    case 'list':
      if (el.tagName === 'UL' || el.tagName === 'OL') el.innerHTML = markdownListItems(value, md);
      else el.innerHTML = markdown(Array.isArray(value) ? value.map((v) => `- ${v}`).join('\n') : value, md);
      break;

    case 'image': {
      const img = el.tagName === 'IMG' ? /** @type {HTMLImageElement} */ (el) : el.appendChild(doc.createElement('img'));
      img.src = ctx.resolveAsset(value.src);
      img.alt = value.alt ?? '';
      img.decoding = 'async';
      if (options.mode === 'reader') img.loading = 'lazy';
      if (value.fit) {
        img.dataset.fit = value.fit;
        img.style.objectFit = value.fit;
      }
      if (value.focus) img.style.objectPosition = value.focus;
      applyPictureStyle(img, value);   // picture style class and opacity (D-014)
      break;
    }

    case 'code': {
      const pre = el.tagName === 'PRE' ? el : el.appendChild(doc.createElement('pre'));
      const code = doc.createElement('code');
      if (value.language) code.className = `language-${value.language}`;
      code.textContent = value.code;
      pre.replaceChildren(code);
      break;
    }

    case 'quote': {
      el.innerHTML = `<p>${markdownInline(value.text, md)}</p>${value.source ? `<cite>${escape(value.source)}</cite>` : ''}`;
      break;
    }

    case 'diagram': {
      // An embed slot (I-070): static fallback now, live content from hydrateEmbeds().
      fillEmbedElement(el, /** @type {string} */ (embedKindForSlot(type)), value, ctx, { mode: /** @type {any} */ (options.mode) });
      if (value.caption && !el.parentElement?.querySelector('[data-slot="caption"]')) {
        const figcaption = doc.createElement('figcaption');
        figcaption.className = 'slipr-caption';
        figcaption.textContent = value.caption;
        el.parentElement?.append(figcaption);
      }
      break;
    }

    case 'web':
      // A web page (I-071): link card or screenshot now, the frame from hydrateEmbeds().
      if (isBlockedUrl(value.url)) el.innerHTML = '<p class="slipr-placeholder">[web page blocked: unsupported URL]</p>';
      else fillEmbedElement(el, 'web', value, ctx, { mode: /** @type {any} */ (options.mode) });
      break;

    case 'pdf':
      // A PDF (I-072): card or fallback image now, the page from hydrateEmbeds().
      if (isBlockedUrl(value.pdf)) el.innerHTML = '<p class="slipr-placeholder">[PDF blocked: unsupported URL]</p>';
      else fillEmbedElement(el, 'pdf', value, ctx, { mode: /** @type {any} */ (options.mode) });
      break;

    case 'graph': {
      // A graph (I-074): node list now, the drawing from hydrateEmbeds().
      fillEmbedElement(el, 'graph', value, ctx, { mode: /** @type {any} */ (options.mode) });
      if (value.caption && !el.parentElement?.querySelector('[data-slot="caption"]')) {
        const figcaption = doc.createElement('figcaption');
        figcaption.className = 'slipr-caption';
        figcaption.textContent = value.caption;
        el.parentElement?.append(figcaption);
      }
      break;
    }

    default: // chart: planned slot type
      el.innerHTML = `<p class="slipr-placeholder">[${escape(type)}: not supported yet]</p>`;
  }
}

/**
 * Fill a `cards` slot. The slot element may contain a `<template>` with the
 * blueprint of one card; its `[data-field]` elements are filled per card
 * (`data-field="#"` gets the card number). Without a blueprint, a plain card
 * with one element per field is built. Every card root gets `slipr-card`.
 * @param {HTMLElement} el @param {any} def @param {any[]} cards
 * @param {import('./load.js').ShowContext} ctx
 * @param {import('./markdown.js').MarkdownOptions} md
 * @param {Document} doc @param {{ mode: string }} options
 */
function fillCards(el, def, cards, ctx, md, doc, options) {
  const fields = new Map((def.fields ?? []).map((/** @type {any} */ f) => [f.name, f]));
  const blueprint = /** @type {HTMLTemplateElement | null} */ (el.querySelector(':scope > template'));
  blueprint?.remove();

  cards.forEach((card, i) => {
    /** @type {HTMLElement} */
    let node;
    if (blueprint) {
      const clone = /** @type {DocumentFragment} */ (blueprint.content.cloneNode(true));
      node = /** @type {HTMLElement} */ (clone.firstElementChild ?? doc.createElement('div'));
    } else {
      node = doc.createElement('div');
      for (const f of fields.values()) {
        const child = doc.createElement(f.type === 'image' ? 'img' : f.type === 'text' ? 'p' : 'div');
        child.dataset.field = f.name;
        node.append(child);
      }
    }
    node.classList.add('slipr-card');
    node.dataset.cardIndex = String(i);
    for (const target of node.querySelectorAll('[data-field]')) {
      const name = /** @type {HTMLElement} */ (target).dataset.field ?? '';
      if (name === '#') {
        target.textContent = String(i + 1);
        continue;
      }
      const field = fields.get(name);
      const value = card?.[name];
      if (!field || isEmpty(value)) {
        target.setAttribute('data-empty', '');
        continue;
      }
      fillSlot(/** @type {HTMLElement} */ (target), field.type, value, ctx, md, doc, options);
    }
    el.append(node);
  });
}

/**
 * Rewrite relative src/href attributes in a template fragment to absolute URLs,
 * so logos and illustrations resolve against the layout file, not the page.
 * Also inside nested <template> elements (card blueprints).
 * @param {DocumentFragment} fragment @param {URL} base
 */
function resolveRelativeUrls(fragment, base) {
  for (const el of fragment.querySelectorAll('[src], [href]')) {
    for (const attr of ['src', 'href']) {
      const value = el.getAttribute(attr);
      if (value && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)) {
        el.setAttribute(attr, new URL(value, base).href);
      }
    }
  }
  for (const nested of fragment.querySelectorAll('template')) {
    resolveRelativeUrls(/** @type {HTMLTemplateElement} */ (nested).content, base);
  }
}

/** @param {any} value */
function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
