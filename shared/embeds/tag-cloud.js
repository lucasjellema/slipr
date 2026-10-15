// @ts-check
/**
 * Embed kind `tag-cloud`: a cloud of terms sized by weight, from inline
 * `terms` or a CSV file (I-105), as a `tag-cloud` slot and a `tag-cloud`
 * reader block. Follows the embed kind contract of ./index.js, without a
 * library: plain DOM.
 *
 * Layout: the terms flow in centred lines (a list, so screen readers read
 * them in order), each sized and coloured by its weight; with the default
 * order `cloud` the heaviest terms sit in the middle.
 * The static content is the cloud itself (for a CSV file: a note), so print,
 * thumbnails and failures show the terms. Hydration reads the CSV file.
 * Reader mode: every term is a button; viewer/reader/interactions.js opens a
 * popover with its glossary definition (a term whose name matches a glossary
 * term or alias, D-015) and the slides that mention it.
 * Audience mode: `steps` (reveal the heaviest n terms, highlight terms) follow
 * hidden Reveal fragments after the slot, like table steps.
 *
 * Colours and sizes come from the template (`--slipr-tag-cloud-*`); the show
 * holds none. The model and markup functions are DOM-free (tested); markup is
 * built with escape() only, so it is safe for innerHTML.
 */
import { escape } from '../markdown.js';
import { detectDelimiter, parseCsv } from '../csv.js';
import { foldText, glossaryPhrases } from '../glossary.js';
import { cellNumber, isCsvPath } from './table.js';

/** No library to load. */
export const library = null;
/** Editor thumbnails show the cloud (cheap: no canvas). */
export const thumbnail = true;
/** Label of the error box when rendering fails. */
export const errorLabel = 'Tag cloud could not be shown';

export const TAG_CLOUD_ORDERS = ['cloud', 'weight', 'alphabetical', 'none'];
/** Colour tiers, light to strong (`--slipr-tag-cloud-1` … `-4`). */
const TIERS = 4;

/**
 * @typedef {object} Tag
 * @property {string} text
 * @property {number} weight
 * @property {string} [glossary]  Glossary id (given, or found by name).
 * @property {number} rank  1 is the heaviest (ties: first written first).
 * @property {number} level  0 (lightest) … 1 (heaviest).
 * @property {number} tier  1 … TIERS.
 * @typedef {{ tags: Tag[] }} TagCloudModel  Tags in display order.
 */

/** Fields only a tag cloud has (a CSV file alone could also be a table's). */
const OWN_FIELDS = ['termColumn', 'weightColumn', 'order', 'maxTerms', 'weightLabel'];

/**
 * Is this a tag cloud value (slot value or block)? By shape: inline `terms`,
 * or a CSV file with a tag cloud's own fields or steps. A bare `{ data }` is
 * taken for a table (both are checked the same way).
 * @param {any} value
 * @returns {boolean}
 */
export function isTagCloud(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Array.isArray(value.terms)) return true;
  if (!isCsvPath(value.data) || Array.isArray(value.rows) || Array.isArray(value.columns)) return false;
  return OWN_FIELDS.some((k) => k in value)
    || (Array.isArray(value.steps) && value.steps.some((/** @type {any} */ s) => s && ('terms' in s || typeof s.highlight === 'string' || Array.isArray(s.highlight))));
}

/** A name as compared: folded (case, accents, white space). @param {string} text */
export function tagKey(text) {
  return foldText(String(text).trim()).folded;
}

/**
 * Terms from a CSV file's rows (header first): the `termColumn` (default the
 * first column) and the `weightColumn` (default the second column when it
 * holds numbers). Without a weight each row counts 1, so repeated answers add up.
 * @param {string[][]} fileRows @param {any} value
 * @param {{ decimalComma?: boolean }} [options]
 * @returns {{ text: string, weight?: number }[]}
 */
export function termsFromRows(fileRows, value, options = {}) {
  const [header = [], ...body] = fileRows;
  const termAt = typeof value?.termColumn === 'string' && header.includes(value.termColumn) ? header.indexOf(value.termColumn) : 0;
  let weightAt = -1;
  if (typeof value?.weightColumn === 'string') weightAt = header.indexOf(value.weightColumn);
  else if (header.length > 1) {
    const second = termAt === 1 ? 0 : 1;
    const filled = body.map((r) => r[second]).filter((c) => c !== undefined && String(c).trim() !== '');
    if (filled.length && filled.every((c) => cellNumber(c, options) !== null)) weightAt = second;
  }
  return body
    .map((r) => ({ text: String(r[termAt] ?? '').trim(), weight: weightAt >= 0 ? cellNumber(r[weightAt], options) ?? 0 : undefined }))
    .filter((t) => t.text);
}

/**
 * The cloud's tags, from inline `terms` or a CSV file's rows: repeated names
 * merged (weights add up), the `maxTerms` heaviest kept, sized, linked to the
 * glossary by name, and put in the display order. DOM-free (tested).
 * @param {any} value
 * @param {string[][] | null} [fileRows]
 * @param {{ decimalComma?: boolean, glossary?: Record<string, any> }} [options]
 * @returns {TagCloudModel}
 */
export function tagCloudModel(value, fileRows = null, options = {}) {
  const raw = fileRows ? termsFromRows(fileRows, value, options)
    : (Array.isArray(value?.terms) ? value.terms : []).filter((/** @type {any} */ t) => t && typeof t.text === 'string' && t.text.trim());
  const byName = glossaryIds(options.glossary);
  /** @type {Map<string, { text: string, weight: number, glossary?: string, first: number }>} */
  const merged = new Map();
  raw.forEach((/** @type {any} */ t, /** @type {number} */ i) => {
    const text = String(t.text).trim();
    const key = tagKey(text);
    const weight = typeof t.weight === 'number' && Number.isFinite(t.weight) && t.weight >= 0 ? t.weight : 1;
    const known = merged.get(key);
    if (known) {
      known.weight += weight;
      if (!known.glossary && typeof t.glossary === 'string' && t.glossary) known.glossary = t.glossary;
      return;
    }
    const glossary = typeof t.glossary === 'string' && t.glossary ? t.glossary : byName.get(key);
    merged.set(key, { text, weight, first: i, ...(glossary ? { glossary } : {}) });
  });
  const ranked = [...merged.values()].sort((a, b) => b.weight - a.weight || a.first - b.first);
  const max = Number.isInteger(value?.maxTerms) && value.maxTerms > 0 ? value.maxTerms : Infinity;
  const kept = ranked.slice(0, max);
  const weights = kept.map((t) => t.weight);
  const hi = Math.max(...weights, 0);
  const lo = Math.min(...weights, hi);
  /** @type {Tag[]} */
  const tags = kept.map((t, i) => {
    const level = hi === lo ? (kept.length > 1 ? 0.5 : 1) : (t.weight - lo) / (hi - lo);
    /** @type {Tag} */
    const tag = { text: t.text, weight: t.weight, rank: i + 1, level, tier: Math.min(TIERS, 1 + Math.floor(level * TIERS)) };
    if (t.glossary) tag.glossary = t.glossary;
    return tag;
  });
  const order = TAG_CLOUD_ORDERS.includes(value?.order) ? value.order : 'cloud';
  return { tags: orderTags(tags, order, kept.map((t) => t.first)) };
}

/**
 * @param {Tag[]} tags  Heaviest first.
 * @param {string} order
 * @param {number[]} first  Where each tag was first written.
 * @returns {Tag[]}
 */
function orderTags(tags, order, first) {
  if (order === 'weight') return tags;
  if (order === 'alphabetical') {
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return [...tags].sort((a, b) => collator.compare(a.text, b.text));
  }
  if (order === 'none') return tags.map((t, i) => ({ t, at: first[i] })).sort((a, b) => a.at - b.at).map((x) => x.t);
  // cloud: the heaviest in the middle, lighter ones alternately before and after it.
  /** @type {Tag[]} */
  const before = [];
  /** @type {Tag[]} */
  const after = [];
  tags.forEach((t, i) => (i % 2 === 0 ? after : before).push(t));
  return [...before.reverse(), ...after];
}

/**
 * Glossary ids by folded name (terms and aliases).
 * @param {Record<string, any> | undefined} glossary
 * @returns {Map<string, string>}
 */
function glossaryIds(glossary) {
  return new Map(glossaryPhrases(glossary).map((p) => [p.phrase, p.id]));
}

/**
 * The state after `count` audience steps: how many of the heaviest terms are
 * revealed and which are highlighted. A `terms` step ends a highlight.
 * DOM-free (tested).
 * @param {any[]} steps @param {number} count
 * @returns {{ limit: number, highlight: Set<string> | null }}  Highlighted names, folded.
 */
export function tagCloudStepState(steps, count) {
  const list = Array.isArray(steps) ? steps : [];
  let limit = list.some((s) => s && s.terms !== undefined) ? 0 : Infinity;
  /** @type {Set<string> | null} */
  let highlight = null;
  for (const step of list.slice(0, Math.max(0, count))) {
    if (!step || typeof step !== 'object') continue;
    if (step.terms !== undefined) {
      limit = step.terms === 'all' ? Infinity : Number.isFinite(Number(step.terms)) ? Math.max(0, Number(step.terms)) : limit;
      highlight = null;
    } else if ('highlight' in step) {
      const names = (Array.isArray(step.highlight) ? step.highlight : [step.highlight])
        .filter((/** @type {unknown} */ n) => typeof n === 'string' && n.trim());
      highlight = names.length ? new Set(names.map(tagKey)) : null;
    }
  }
  return { limit, highlight };
}

/**
 * @typedef {object} TagCloudHtmlOptions
 * @property {'audience' | 'reader'} [mode]  Reader mode: terms are buttons.
 * @property {number} [limit]  Show only the heaviest n (the rest keep their place).
 * @property {Set<string> | null} [highlight]  Folded names that stand out.
 * @property {string} [weightLabel]  "12 mentions" instead of "weight 12"; readers see it in the popover.
 * @property {string} [empty]  Text when there are no terms.
 */

/**
 * The cloud's markup. DOM-free (tested).
 * @param {TagCloudModel} model @param {TagCloudHtmlOptions} [options]
 * @returns {string}
 */
export function tagCloudHtml(model, options = {}) {
  const reader = options.mode === 'reader';
  const limit = options.limit ?? Infinity;
  const hl = options.highlight && options.highlight.size ? options.highlight : null;
  if (!model.tags.length) {
    return options.empty ? `<p class="slipr-tag-cloud-empty">${escape(options.empty)}</p>` : '';
  }
  const items = model.tags.map((t) => {
    const cls = ['slipr-tag-cloud-item'];
    if (t.rank > limit) cls.push('is-hidden');
    if (hl?.has(tagKey(t.text))) cls.push('is-highlight');
    const weight = weightText(t.weight, options.weightLabel);
    const style = ` style="--slipr-tag-level:${t.level.toFixed(3)}"`;
    const text = escape(t.text);
    const term = reader
      ? `<button type="button" class="slipr-tag-cloud-term" data-tag="${text}"${options.weightLabel ? ` data-tag-weight="${escape(weight)}"` : ''}`
        + `${t.glossary ? ` data-term="${escape(t.glossary)}"` : ''} aria-label="${text}, ${escape(weight)}">${text}</button>`
      : `<span class="slipr-tag-cloud-term">${text}<span class="slipr-tag-cloud-weight"> (${escape(weight)})</span></span>`;
    return `<li class="${cls.join(' ')}" data-rank="${t.rank}" data-tier="${t.tier}"${style}${t.rank > limit ? ' aria-hidden="true"' : ''}>${term}</li>`;
  }).join('');
  return `<ul class="slipr-tag-cloud-list${hl ? ' has-highlight' : ''}" role="list">${items}</ul>`;
}

/**
 * A weight as read out: "12 mentions", or "weight 12".
 * @param {number} weight @param {string} [label]
 */
export function weightText(weight, label) {
  const n = Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
  return label ? `${n} ${label}` : `weight ${n}`;
}

/** The value as stored on the element: without the fallback (not needed live). @param {any} value */
function liveValue(value) {
  const { fallback, ...rest } = value ?? {};
  return rest;
}

/**
 * Glossary names for terms found later (CSV file, reader mode): id and every
 * term and alias of the glossary, as `{ id: { term, aliases } }`.
 * @param {any} ctx
 */
function glossaryNames(ctx) {
  const glossary = ctx?.show?.glossary;
  if (!glossary || typeof glossary !== 'object') return undefined;
  /** @type {Record<string, { term: string, aliases?: string[] }>} */
  const names = {};
  for (const [id, entry] of Object.entries(glossary)) {
    if (typeof entry?.term !== 'string') continue;
    names[id] = Array.isArray(entry.aliases) ? { term: entry.term, aliases: entry.aliases } : { term: entry.term };
  }
  return Object.keys(names).length ? names : undefined;
}

/**
 * Attributes of the embed element: the value (without its fallback), the data
 * file's address, the mode and whether it is a slot.
 * @param {any} value
 * @param {{ resolveAsset: (src: string) => string }} ctx
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 * @returns {Record<string, string>}
 */
export function attributes(value, ctx, options = {}) {
  /** @type {Record<string, string>} */
  const attrs = {
    class: 'slipr-tag-cloud',
    'data-tag-cloud': JSON.stringify(liveValue(value)),
    'data-tag-cloud-mode': options.mode === 'audience' ? 'audience' : 'reader',
  };
  if (options.slot) attrs['data-tag-cloud-slot'] = '';
  if (isCsvPath(value?.data) && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value.data)) {
    attrs['data-tag-cloud-src'] = ctx.resolveAsset(value.data);
  }
  const glossary = glossaryNames(ctx);
  if (glossary) attrs['data-tag-cloud-glossary'] = JSON.stringify(glossary);
  attrs['aria-label'] = typeof value?.title === 'string' && value.title ? value.title
    : typeof value?.caption === 'string' && value.caption ? value.caption : 'Tag cloud';
  attrs.role = 'group';
  return attrs;
}

/**
 * Static content without a fallback image: the cloud (inline terms), or for a
 * CSV file a note.
 * @param {any} value
 * @param {any} ctx
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 * @returns {{ html: string, fallback: 'tag-cloud' }}
 */
export function staticHtml(value, ctx, options = {}) {
  const fromFile = isCsvPath(value?.data);
  const model = fromFile ? { tags: [] } : tagCloudModel(value, null, { glossary: ctx?.show?.glossary });
  const html = tagCloudHtml(model, {
    mode: options.mode,
    weightLabel: typeof value?.weightLabel === 'string' ? value.weightLabel : undefined,
    empty: fromFile ? `The terms are in ${String(value.data).split('/').pop()}.` : '',
  });
  return { html, fallback: 'tag-cloud' };
}

/**
 * In an audience slot with steps: one hidden Reveal fragment per step, after the slot's own.
 * @param {any} value
 * @param {{ mode?: 'audience' | 'reader', slot?: boolean }} [options]
 */
export function afterHtml(value, options = {}) {
  if (!options.slot || (options.mode ?? 'reader') !== 'audience') return '';
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  return steps.map((_, i) => `<span class="fragment slipr-tag-cloud-step" data-tag-cloud-step="${i + 1}" aria-hidden="true"></span>`).join('');
}

// ---------------------------------------------------------------------------
// Live cloud (browser only)

/**
 * Read the data, then show the cloud; in a running presentation, follow the
 * steps. Throws when the CSV file cannot be read.
 * @param {HTMLElement} el  The embed element.
 * @param {HTMLElement} live  Where the rendered content goes.
 */
export async function hydrate(el, live) {
  const value = JSON.parse(el.dataset.tagCloud ?? '{}');
  const audience = el.dataset.tagCloudMode === 'audience';
  const slot = el.dataset.tagCloudSlot !== undefined;
  const glossary = el.dataset.tagCloudGlossary ? JSON.parse(el.dataset.tagCloudGlossary) : undefined;
  let decimalComma = false;
  /** @type {string[][] | null} */
  let fileRows = null;
  if (el.dataset.tagCloudSrc) {
    const src = el.dataset.tagCloudSrc;
    const url = /** @type {any} */ (globalThis).SLIPR_BUNDLE?.url(src) ?? src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The tag cloud's data file could not be read (${res.status}).`);
    const text = await res.text();
    decimalComma = detectDelimiter(text) === ';';
    fileRows = parseCsv(text);
    if (fileRows.length < 2) throw new Error('The tag cloud\'s data file has no terms.');
  }
  const model = tagCloudModel(value, fileRows, { decimalComma, glossary });
  const weightLabel = typeof value.weightLabel === 'string' ? value.weightLabel : undefined;
  // Steps follow Reveal's fragments, so only in a running presentation.
  const presenting = audience && slot && Boolean(el.closest('.reveal'));
  const stepEls = presenting ? /** @type {HTMLElement[]} */ ([...el.querySelectorAll(':scope > .slipr-tag-cloud-step')]) : [];

  const render = () => {
    const at = presenting ? tagCloudStepState(value.steps, stepEls.filter((s) => s.classList.contains('visible')).length) : { limit: Infinity, highlight: null };
    live.innerHTML = tagCloudHtml(model, {
      mode: audience ? 'audience' : 'reader', limit: at.limit, highlight: at.highlight, weightLabel, empty: 'No terms.',
    }); // built with escape() only
  };
  render();
  /** @type {any} */ (el).sliprTagCloud = { model }; // for debugging and browser checks
  if (stepEls.length) new MutationObserver(render).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
}
