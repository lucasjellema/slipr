// @ts-check
/**
 * Render reader blocks (the reader layer of a slide) to HTML strings.
 * Used by reader mode and, later, the editor preview (D-005, D-009).
 *
 * Output is built only from escape(), shared/markdown.js and shared/embeds/, so
 * it is safe to assign to innerHTML. Embed blocks (diagram, embed) carry a static
 * fallback; their live content comes from hydrateEmbeds() (I-070). Interactive behaviour (popovers for glossary terms,
 * footnotes and hotspots; tab switching) is added by viewer/reader/interactions.js.
 *
 * Element ids: a block is `<slideId>--<blockId>`, so `#s-05/b3` deep links and
 * annotation anchors can find it.
 */
import { markdown, escape } from './markdown.js';
import { pictureAttributes } from './picture.js';
import { slideTitle } from './render.js';
import { embedHtml } from './embeds/index.js';
import { isBlockedUrl } from './embeds/web.js';

/**
 * @typedef {object} BlockContext
 * @property {any} show
 * @property {(src: string) => string} resolveAsset  Resolve a path relative to show.json.
 * @property {(slideId: string) => string} [slideHref]  Href for in-show links (default `#id`).
 */

const DEPTH_LABEL = { 1: 'Essential', 2: 'Standard', 3: 'Deep dive' };
const CALLOUT_ROLE_LABEL = { info: 'Info', tip: 'Tip', warning: 'Warning', quote: 'Quote' };

/**
 * @param {any[]} blocks
 * @param {string} slideId
 * @param {BlockContext} ctx
 * @returns {string}
 */
export function renderBlocks(blocks, slideId, ctx) {
  return (blocks ?? []).map((block) => renderBlock(block, slideId, ctx)).join('\n');
}

/**
 * @param {any} block
 * @param {string} slideId
 * @param {BlockContext} ctx
 * @returns {string}
 */
export function renderBlock(block, slideId, ctx) {
  const md = (/** @type {string} */ text) => markdown(text ?? '', {
    mode: 'reader',
    glossary: ctx.show.glossary ?? {},
    slideHref: ctx.slideHref,
  });
  const domId = blockDomId(slideId, block.id);
  const attrs = [
    `class="slipr-block slipr-block--${escape(block.type)}"`,
    `id="${escape(domId)}"`,
    `data-block-id="${escape(block.id)}"`,
    block.depth ? `data-depth="${Number(block.depth)}"` : '',
    Array.isArray(block.for) ? `data-for="${escape(block.for.join(' '))}"` : '',
  ].filter(Boolean).join(' ');
  const badges = badgeHtml(block, ctx.show);

  switch (block.type) {
    case 'text':
      return `<div ${attrs}>${badges}<div class="slipr-block-body">${md(block.md)}</div></div>`;

    case 'details':
      return `<details ${attrs}${block.open ? ' open' : ''}><summary>${escape(block.title)}${badges ? ` ${badges}` : ''}</summary>`
        + `<div class="slipr-block-body">${md(block.md)}</div></details>`;

    case 'callout': {
      const variant = escape(block.variant ?? 'info');
      const label = CALLOUT_ROLE_LABEL[/** @type {keyof CALLOUT_ROLE_LABEL} */ (block.variant)] ?? 'Note';
      const title = block.title ? `<p class="slipr-block-title">${escape(block.title)}</p>` : '';
      return `<aside ${attrs} data-variant="${variant}" aria-label="${escape(block.title || label)}">${badges}${title}`
        + `<div class="slipr-block-body">${md(block.md)}</div></aside>`;
    }

    case 'tabs': {
      const tabs = Array.isArray(block.tabs) ? block.tabs : [];
      const buttons = tabs.map((/** @type {any} */ tab, /** @type {number} */ i) =>
        `<button type="button" role="tab" id="${escape(domId)}--tab-${i}" aria-controls="${escape(domId)}--panel-${i}"`
        + ` aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${escape(tab.label)}</button>`).join('');
      const panels = tabs.map((/** @type {any} */ tab, /** @type {number} */ i) =>
        `<div role="tabpanel" id="${escape(domId)}--panel-${i}" aria-labelledby="${escape(domId)}--tab-${i}" tabindex="0"${i === 0 ? '' : ' hidden'}>`
        + `${md(tab.md)}</div>`).join('');
      return `<div ${attrs}>${badges}<div role="tablist">${buttons}</div>${panels}</div>`;
    }

    case 'image': {
      const image = block.image ?? {};
      const spots = (Array.isArray(block.hotspots) ? block.hotspots : []).map((/** @type {any} */ spot, /** @type {number} */ i) => {
        const left = pct(spot.x);
        const top = pct(spot.y);
        return `<button type="button" class="slipr-hotspot" style="left:${left}%;top:${top}%" data-hotspot="${i}"`
          + ` aria-label="${escape(spot.title)}">${i + 1}</button>`
          + `<span class="slipr-hotspot-content" data-hotspot="${i}" hidden><span class="slipr-popover-title">${escape(spot.title)}</span>${md(spot.md)}</span>`;
      }).join('');
      const caption = block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : '';
      return `<div ${attrs}>${badges}<figure><div class="slipr-hotspot-frame">`
        + `<img src="${escape(ctx.resolveAsset(image.src ?? ''))}" alt="${escape(image.alt ?? '')}"${pictureAttributes(image)} loading="lazy" decoding="async">`
        + `${spots}</div>${caption}</figure></div>`;
    }

    case 'embed': {
      if (isBlockedUrl(block.url)) {
        return `<div ${attrs}><p class="slipr-block-body">[embed blocked: unsupported URL]</p></div>`;
      }
      return `<div ${attrs}>${badges}${embedHtml('web', block, ctx)}</div>`;
    }

    case 'slide-ref': {
      const target = (ctx.show.slides ?? []).find((/** @type {any} */ s) => s.id === block.slide);
      const label = block.label || (target ? slideTitle(target) : block.slide);
      const href = ctx.slideHref ? ctx.slideHref(block.slide) : `#${block.slide}`;
      return `<div ${attrs}>${badges}<a href="${escape(href)}" data-slide-link="${escape(block.slide)}">${escape(label)}</a></div>`;
    }

    case 'diagram': {
      const caption = block.caption ? `<figcaption class="slipr-caption">${escape(block.caption)}</figcaption>` : '';
      return `<div ${attrs}>${badges}<figure class="slipr-figure slipr-figure--diagram">`
        + `${embedHtml('diagram', block, ctx)}${caption}</figure></div>`;
    }

    default:
      return ''; // unknown block types are reported by validation, not rendered
  }
}

/**
 * The DOM id of a block element.
 * @param {string} slideId @param {string} blockId
 */
export function blockDomId(slideId, blockId) {
  return `${slideId}--${blockId}`;
}

/** Small labels showing who a block is for and how deep it goes. */
function badgeHtml(/** @type {any} */ block, /** @type {any} */ show) {
  const badges = [];
  if (Array.isArray(block.for) && block.for.length) {
    const labels = block.for.map((/** @type {string} */ id) => show.profiles?.find((/** @type {any} */ p) => p.id === id)?.label ?? id);
    badges.push(`<span class="slipr-badge" data-kind="profile">For ${escape(labels.join(', '))}</span>`);
  }
  if (block.depth === 3) {
    badges.push(`<span class="slipr-badge" data-kind="depth" data-depth="${block.depth}">${DEPTH_LABEL[3]}</span>`);
  }
  return badges.length ? `<span class="slipr-block-badges">${badges.join('')}</span>` : '';
}

/** Fraction 0–1 → percentage with at most 2 decimals, clamped. */
function pct(/** @type {any} */ value) {
  const n = Math.min(1, Math.max(0, Number(value) || 0));
  return Math.round(n * 10000) / 100;
}
