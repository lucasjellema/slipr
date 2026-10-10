// @ts-check
/**
 * Render one slide visual: clone the template's layout fragment and fill its
 * [data-slot] elements from slide.content. The only slide renderer in Slipr
 * (D-005): used by audience mode, reader mode and the editor preview.
 *
 * Output structure (see docs/template-format.md):
 *   <div class="slipr-slide slipr-mode-…" data-layout data-aspect data-slide-id>
 *     <div class="slipr-canvas"> …filled layout fragment… </div>
 *   </div>
 *
 * Text goes in via textContent; Markdown via shared/markdown.js (escaped);
 * nothing else from the show reaches innerHTML.
 */
import { markdown, markdownInline, markdownListItems, escape } from './markdown.js';

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

  const root = doc.createElement('div');
  root.className = `slipr-slide slipr-mode-${mode}`;
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
    fillSlot(/** @type {HTMLElement} */ (el), def.type, value, ctx, mdOptions, doc);
  }
  return root;
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
 */
function fillSlot(el, type, value, ctx, md, doc) {
  switch (type) {
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
      if (value.fit) {
        img.dataset.fit = value.fit;
        img.style.objectFit = value.fit;
      }
      if (value.focus) img.style.objectPosition = value.focus;
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

    default: // chart, diagram: planned slot types
      el.innerHTML = `<p class="slipr-placeholder">[${escape(type)}: not supported yet]</p>`;
  }
}

/**
 * Rewrite relative src/href attributes in a template fragment to absolute URLs,
 * so logos and illustrations resolve against the layout file, not the page.
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
}

/** @param {any} value */
function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
