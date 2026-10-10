// @ts-check
/**
 * Export and import of a reader's annotations (highlights + notes).
 *  - Markdown: readable, for keeping or sharing your notes.
 *  - JSON: lossless, for moving notes to another browser (import merges).
 * Pure; tested in Node.
 */
import { slideTitle } from '../../shared/render.js';
import { isAnnotation, annotationKind } from './state.js';

/**
 * @param {any} show
 * @param {import('./state.js').Annotation[]} annotations
 * @param {{ bookmarks?: string[], date?: string }} [extra]
 */
export function annotationsToMarkdown(show, annotations, extra = {}) {
  const order = new Map((show.slides ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => [s.id, i]));
  const sorted = [...annotations].sort((a, b) =>
    (order.get(a.slideId) ?? 1e9) - (order.get(b.slideId) ?? 1e9) || a.created.localeCompare(b.created));
  const lines = [`# My notes: ${show.meta?.title ?? show.id}`, ''];
  if (extra.date) lines.push(`_Exported ${extra.date}_`, '');

  const bookmarks = (extra.bookmarks ?? []).map((id) => show.slides?.find((/** @type {any} */ s) => s.id === id)).filter(Boolean);
  if (bookmarks.length) {
    lines.push('## Bookmarks', '', ...bookmarks.map((/** @type {any} */ s) => `- ${slideTitle(s)}`), '');
  }

  let current = null;
  for (const a of sorted) {
    if (a.slideId !== current) {
      current = a.slideId;
      const slide = show.slides?.find((/** @type {any} */ s) => s.id === a.slideId);
      lines.push(`## ${slide ? slideTitle(slide) : a.slideId}`, '');
    }
    const kind = annotationKind(a);
    if (kind === 'text' && a.quote) lines.push(...a.quote.exact.trim().split('\n').map((l) => `> ${l}`), '');
    else if (kind === 'slide') lines.push('_Note on the slide_', '');
    else if (kind === 'pin' && a.pin) lines.push(`_📍 Pin on ${a.pin.label}_`, '');
    if (a.note.trim()) lines.push(a.note.trim(), '');
  }
  if (!sorted.length && !bookmarks.length) lines.push('_No highlights or notes yet._', '');
  return lines.join('\n');
}

/**
 * @param {any} show
 * @param {import('./state.js').Annotation[]} annotations
 */
export function annotationsToJson(show, annotations) {
  return JSON.stringify({ slipr: 'notes', version: 1, show: show.id, annotations }, null, 2);
}

/**
 * Merge imported annotations into existing ones: same id → the most recently
 * updated wins. Returns null if the text is not a Slipr notes file for this show.
 * @param {string} text
 * @param {any} show
 * @param {import('./state.js').Annotation[]} existing
 * @returns {{ annotations: import('./state.js').Annotation[], added: number, updated: number } | null}
 */
export function mergeImportedAnnotations(text, show, existing) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data?.slipr !== 'notes' || data.show !== show.id || !Array.isArray(data.annotations)) return null;
  const byId = new Map(existing.map((a) => [a.id, a]));
  let added = 0;
  let updated = 0;
  for (const a of data.annotations.filter(isAnnotation)) {
    const mine = byId.get(a.id);
    if (!mine) {
      byId.set(a.id, a);
      added++;
    } else if ((a.updated ?? a.created) > (mine.updated ?? mine.created)) {
      byId.set(a.id, a);
      updated++;
    }
  }
  return { annotations: [...byId.values()], added, updated };
}
