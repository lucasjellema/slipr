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
import { findTerms, foldText } from '../../shared/glossary.js';
import { formatTime, isVideo, videoChapters } from '../../shared/embeds/video.js';

/**
 * @typedef {object} SearchDoc
 * @property {'slide' | 'block' | 'notes' | 'glossary'} kind
 * @property {string | null} slideId
 * @property {string | null} blockId
 * @property {string} title      Shown as the result heading.
 * @property {number} order      Position in the show (for stable sorting).
 * @property {{ name: string, text: string, weight: number }[]} fields
 * @property {number} [page]   A PDF page (I-072): the result opens the PDF at it.
 * @property {number} [time]   A video chapter (I-110): the result plays the video from it.
 */

/**
 * @typedef {object} SearchResult
 * @property {SearchDoc} doc
 * @property {number} score
 * @property {string} snippetHtml  Escaped text with <mark> around matches.
 */

/**
 * The searchable text of a graph (I-074): node labels and their Markdown as plain text.
 * @param {any} value
 */
function graphText(value) {
  if (!Array.isArray(value?.nodes)) return '';
  return value.nodes.map((/** @type {any} */ n) => [n?.label ?? n?.id, n?.md ? markdownToText(n.md) : ''].filter(Boolean).join(' ')).join('\n');
}

/**
 * The searchable text of a map (I-075): place titles and their Markdown as plain text.
 * @param {any} value
 */
function mapText(value) {
  if (!Array.isArray(value?.markers)) return '';
  return value.markers.map((/** @type {any} */ m) => [m?.title ?? m?.id, m?.md ? markdownToText(m.md) : ''].filter(Boolean).join(' ')).join('\n');
}

/**
 * The searchable text of a table (I-104): headers and inline cells. Rows in a
 * CSV file are not indexed: the index is built before files are read.
 * @param {any} value
 * @param {Record<string, any>} [glossary]  Term names for [[id]] in Markdown cells.
 */
function tableText(value, glossary) {
  if (!Array.isArray(value?.columns) && !Array.isArray(value?.rows)) return '';
  const columns = Array.isArray(value.columns) ? value.columns : [];
  const head = columns.map((/** @type {any} */ c) => c?.label ?? c?.key).filter(Boolean).join(' ');
  const rows = (Array.isArray(value.rows) ? value.rows : []).map((/** @type {any} */ r) => (Array.isArray(r)
    ? r.map((cell, i) => (typeof cell === 'string' && columns[i]?.format === 'markdown' ? markdownToText(cell, { glossary }) : cell ?? '')).join(' ')
    : '')).join('\n');
  return [head, rows].filter(Boolean).join('\n');
}

/**
 * The searchable text of a tag cloud (I-105): its inline terms. Terms in a
 * CSV file are not indexed (like table rows).
 * @param {any} value
 */
function tagCloudText(value) {
  if (!Array.isArray(value?.terms)) return '';
  return value.terms.map((/** @type {any} */ t) => (typeof t?.text === 'string' ? t.text : '')).filter(Boolean).join(' · ');
}

/**
 * The searchable text of a video (I-110): chapter titles and the transcript.
 * @param {any} value
 * @param {Record<string, any>} [glossary]
 */
function videoText(value, glossary) {
  if (!isVideo(value)) return '';
  const chapters = videoChapters(value).map((c) => c.title).join(' · ');
  const transcript = typeof value.transcript === 'string' ? markdownToText(value.transcript, { glossary }) : '';
  return [chapters, transcript].filter(Boolean).join('\n');
}

/**
 * One search document per video chapter (I-110), so a result plays the video
 * from that chapter. `blockId` is the block's id, or `slot:<name>` for a slot.
 * @param {any} value @param {string} slideId @param {string} blockId
 * @param {string} title  The slide title.
 * @param {() => number} next  The next order number.
 * @returns {SearchDoc[]}
 */
function videoChapterDocs(value, slideId, blockId, title, next) {
  if (!isVideo(value)) return [];
  return videoChapters(value).map((c) => ({
    kind: /** @type {'block'} */ ('block'), slideId, blockId,
    title: `${title} › ${value.title} › ${formatTime(c.time)} ${c.title}`, order: next(), time: c.time,
    fields: [{ name: 'chapter', text: c.title, weight: 3 }],
  }));
}

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
      if (v && typeof v === 'object') return [v.alt, v.text, v.source, v.code, v.mermaid, v.title, graphText(v), mapText(v), tableText(v, glossary), tagCloudText(v), videoText(v, glossary)].filter(Boolean).join(' ');
      return '';
    }).join('\n');
    // Text elements on the slide (I-089) are slide content too.
    const overlayText = (slide.overlays ?? []).map((/** @type {any} */ o) => (typeof o?.text === 'string' ? text(o.text) : '')).filter(Boolean).join('\n');
    docs.push({
      kind: 'slide', slideId: slide.id, blockId: null, title, order: order++,
      fields: [
        { name: 'title', text: title, weight: 5 },
        { name: 'summary', text: slide.reader?.summary ?? '', weight: 3 },
        { name: 'content', text: overlayText ? `${content}\n${overlayText}` : content, weight: 2 },
      ],
    });
    for (const [name, value] of Object.entries(slide.content ?? {})) docs.push(...videoChapterDocs(value, slide.id, `slot:${name}`, title, () => order++));
    for (const block of slide.reader?.blocks ?? []) {
      const labels = [block.title, block.caption, block.label,
        ...(block.tabs ?? []).map((/** @type {any} */ t) => t.label),
        ...(block.hotspots ?? []).map((/** @type {any} */ h) => h.title),
        block.image?.alt, ...(block.nodes ?? []).map((/** @type {any} */ n) => n?.label ?? n?.id),
        ...(block.markers ?? []).map((/** @type {any} */ m) => m?.title ?? m?.id)].filter(Boolean).join(' · ');
      const body = [block.md, block.mermaid, ...(block.nodes ?? []).map((/** @type {any} */ n) => n?.md), ...(block.markers ?? []).map((/** @type {any} */ m) => m?.md), ...(block.tabs ?? []).map((/** @type {any} */ t) => t.md), ...(block.hotspots ?? []).map((/** @type {any} */ h) => h.md)]
        .filter(Boolean).map(text).join('\n') + (block.type === 'table' ? `\n${tableText(block, glossary)}` : '')
        + (block.type === 'tag-cloud' ? `\n${tagCloudText(block)}` : '')
        + (block.type === 'video' ? `\n${videoText(block, glossary)}` : '');
      docs.push({
        kind: 'block', slideId: slide.id, blockId: block.id,
        title: block.title ? `${title} › ${block.title}` : title, order: order++,
        fields: [{ name: 'label', text: labels, weight: 3 }, { name: 'body', text: body, weight: 1 }],
      });
      if (block.type === 'video') docs.push(...videoChapterDocs(block, slide.id, block.id, title, () => order++));
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
 * Search documents for the text of PDF pages (I-072), one per page, placed
 * right after the other documents of their slide. The text is extracted by
 * the caller (shared/embeds/pdf.js), so this stays pure.
 * @param {any} show
 * @param {SearchDoc[]} docs  The existing index (for the order).
 * @param {{ slideId: string, blockId: string, title: string, page: number, text: string }[]} pages
 *   `blockId`: the PDF block's id, or `slot:<name>` for a PDF slot.
 * @returns {SearchDoc[]}
 */
export function pdfSearchDocs(show, docs, pages) {
  return pages.map((p, i) => {
    const slide = (show.slides ?? []).find((/** @type {any} */ s) => s.id === p.slideId);
    const orders = docs.filter((d) => d.slideId === p.slideId).map((d) => d.order);
    return {
      kind: 'block',
      slideId: p.slideId,
      blockId: p.blockId,
      title: `${slide ? slideTitle(slide) : p.slideId} › ${p.title}, page ${p.page}`,
      order: (orders.length ? Math.max(...orders) : 0) + (i + 1) / (pages.length + 1),
      fields: [{ name: 'pdf', text: p.text, weight: 1 }],
      page: p.page,
    };
  });
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

/**
 * The slides that mention any of `names` (a tag cloud's term and its glossary
 * names, I-105): whole words, case- and accent-insensitive, in slide text and
 * reader blocks (not notes or the glossary), in show order.
 * @param {SearchDoc[]} docs  From buildSearchIndex().
 * @param {string[]} names
 * @param {string | null} [except]  A slide to leave out (the tag cloud's own).
 * @returns {string[]}  Slide ids.
 */
export function slidesMentioning(docs, names, except = null) {
  const phrases = [...new Set(names.filter((n) => typeof n === 'string' && n.trim()).map((n) => foldText(n.trim()).folded))]
    .sort((a, b) => b.length - a.length)
    .map((phrase) => ({ id: 'tag', phrase }));
  if (!phrases.length) return [];
  /** @type {string[]} */
  const found = [];
  for (const doc of docs) {
    if ((doc.kind !== 'slide' && doc.kind !== 'block') || !doc.slideId || doc.slideId === except || found.includes(doc.slideId)) continue;
    if (doc.fields.some((f) => findTerms(f.text, phrases, new Set()).length)) found.push(doc.slideId);
  }
  return found;
}
