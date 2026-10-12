// @ts-check
/**
 * Full-text search over a show: slides (title, summary, slot text), reader
 * blocks, glossary and (optionally) presenter notes. Pure and tested in Node.
 *
 * Matching: every query word must match the start of a word somewhere in the
 * document (so "temp" finds "template"). Case- and accent-insensitive.
 * Shows are small (hundreds of slides at most), so a linear scan is plenty.
 */
import { markdownToText, escape } from '../../shared/markdown.js';
import { slideTitle } from '../../shared/render.js';

/**
 * @typedef {object} SearchDoc
 * @property {'slide' | 'block' | 'notes' | 'glossary'} kind
 * @property {string | null} slideId
 * @property {string | null} blockId
 * @property {string} title      Shown as the result heading.
 * @property {number} order      Position in the show (for stable sorting).
 * @property {{ name: string, text: string, weight: number }[]} fields
 */

/**
 * @typedef {object} SearchResult
 * @property {SearchDoc} doc
 * @property {number} score
 * @property {string} snippetHtml  Escaped text with <mark> around matches.
 */

/**
 * @param {any} show
 * @returns {SearchDoc[]}
 */
export function buildSearchIndex(show) {
  const glossary = show.glossary ?? {};
  const text = (/** @type {string | undefined} */ md) => (md ? markdownToText(md, { glossary }) : '');
  /** @type {SearchDoc[]} */
  const docs = [];
  let order = 0;

  for (const slide of show.slides ?? []) {
    const title = slideTitle(slide);
    const content = Object.values(slide.content ?? {}).map((v) => {
      if (typeof v === 'string') return text(v);
      if (Array.isArray(v)) {
        // A list (strings) or cards (objects with text fields and images).
        return v.map((item) => (typeof item === 'string' ? text(item)
          : Object.values(item ?? {}).map((f) => (typeof f === 'string' ? text(f) : f?.alt ?? '')).join(' '))).join('\n');
      }
      if (v && typeof v === 'object') return [v.alt, v.text, v.source, v.code, v.mermaid].filter(Boolean).join(' ');
      return '';
    }).join('\n');
    docs.push({
      kind: 'slide', slideId: slide.id, blockId: null, title, order: order++,
      fields: [
        { name: 'title', text: title, weight: 5 },
        { name: 'summary', text: slide.reader?.summary ?? '', weight: 3 },
        { name: 'content', text: content, weight: 2 },
      ],
    });
    for (const block of slide.reader?.blocks ?? []) {
      const labels = [block.title, block.caption, block.label,
        ...(block.tabs ?? []).map((/** @type {any} */ t) => t.label),
        ...(block.hotspots ?? []).map((/** @type {any} */ h) => h.title),
        block.image?.alt].filter(Boolean).join(' · ');
      const body = [block.md, block.mermaid, ...(block.tabs ?? []).map((/** @type {any} */ t) => t.md), ...(block.hotspots ?? []).map((/** @type {any} */ h) => h.md)]
        .filter(Boolean).map(text).join('\n');
      docs.push({
        kind: 'block', slideId: slide.id, blockId: block.id,
        title: block.title ? `${title} › ${block.title}` : title, order: order++,
        fields: [{ name: 'label', text: labels, weight: 3 }, { name: 'body', text: body, weight: 1 }],
      });
    }
    if (slide.notes) {
      docs.push({
        kind: 'notes', slideId: slide.id, blockId: null, title: `${title} › presenter's notes`, order: order++,
        fields: [{ name: 'notes', text: text(slide.notes), weight: 1 }],
      });
    }
  }
  for (const [id, entry] of Object.entries(glossary)) {
    docs.push({
      kind: 'glossary', slideId: null, blockId: id, title: `Glossary: ${entry.term}`, order: order++,
      fields: [
        { name: 'term', text: entry.term, weight: 4 },
        // Other names (I-086) are found like the term itself.
        { name: 'aliases', text: (Array.isArray(entry.aliases) ? entry.aliases : []).join(', '), weight: 3 },
        { name: 'definition', text: text(entry.definition), weight: 1 },
      ],
    });
  }
  return docs;
}

/**
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @param {{ visible?: (doc: SearchDoc) => boolean, includeNotes?: boolean, limit?: number }} [options]
 * @returns {{ results: SearchResult[], hidden: number }}
 *   `hidden`: matches in content that the current tailoring hides.
 */
export function search(docs, query, options = {}) {
  const terms = tokens(query);
  if (terms.length === 0) return { results: [], hidden: 0 };
  const phrase = fold(query.trim()).text;
  /** @type {SearchResult[]} */
  const results = [];
  let hidden = 0;

  for (const doc of docs) {
    if (doc.kind === 'notes' && !options.includeNotes) continue;
    const folded = doc.fields.map((f) => ({ field: f, ...fold(f.text) }));
    let score = 0;
    let all = true;
    for (const term of terms) {
      const weights = folded.filter((f) => wordStarts(f.text, term).length > 0).map((f) => f.field.weight);
      if (weights.length === 0) { all = false; break; }
      score += Math.max(...weights);
    }
    if (!all) continue;
    if (folded.some((f) => f.text.includes(phrase))) score += 2;
    if (options.visible && !options.visible(doc)) { hidden++; continue; }

    const best = folded
      .filter((f) => terms.some((t) => wordStarts(f.text, t).length > 0))
      .sort((a, b) => b.field.weight - a.field.weight)[0];
    results.push({ doc, score, snippetHtml: snippet(best.field.text, best, terms) });
  }
  results.sort((a, b) => b.score - a.score || a.doc.order - b.doc.order);
  return { results: results.slice(0, options.limit ?? 30), hidden };
}

/** Split a query into folded words. */
export function tokens(/** @type {string} */ query) {
  return fold(query).text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Lower-case and strip accents, keeping a map from each folded character
 * back to its index in the original string.
 * @param {string} s
 * @returns {{ text: string, map: number[] }}
 */
export function fold(s) {
  let text = '';
  /** @type {number[]} */
  const map = [];
  let i = 0;
  for (const ch of s) {
    const f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let k = 0; k < f.length; k++) map.push(i);
    text += f;
    i += ch.length;
  }
  map.push(i);
  return { text, map };
}

/** Indices in folded text where `term` starts a word. */
function wordStarts(/** @type {string} */ text, /** @type {string} */ term) {
  /** @type {number[]} */
  const hits = [];
  for (let i = text.indexOf(term); i !== -1; i = text.indexOf(term, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1])) hits.push(i);
  }
  return hits;
}

/**
 * ±70 characters around the first match, with all term matches marked.
 * @param {string} original
 * @param {{ text: string, map: number[] }} folded
 * @param {string[]} terms
 */
function snippet(original, folded, terms) {
  /** @type {[number, number][]} */
  const ranges = [];
  for (const term of terms) {
    for (const i of wordStarts(folded.text, term)) ranges.push([folded.map[i], folded.map[i + term.length]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const first = ranges[0]?.[0] ?? 0;
  let start = Math.max(0, first - 70);
  let end = Math.min(original.length, first + 70);
  if (start > 0) start = original.indexOf(' ', start) + 1 || start;
  if (end < original.length) end = original.lastIndexOf(' ', end) > first ? original.lastIndexOf(' ', end) : end;

  let html = start > 0 ? '…' : '';
  let pos = start;
  for (const [a, b] of ranges) {
    if (a < pos || a >= end) continue;
    html += escape(original.slice(pos, a)) + `<mark>${escape(original.slice(a, Math.min(b, end)))}</mark>`;
    pos = Math.min(b, end);
  }
  html += escape(original.slice(pos, end)) + (end < original.length ? '…' : '');
  return html.replace(/\s+/g, ' ');
}
