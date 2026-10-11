// @ts-check
/**
 * Show-level entities for the Show Settings tab (E-009): new ids, where
 * glossary terms, profiles and chapters are used, and turning glossary
 * references into plain text when a term is deleted. DOM-free.
 *
 * Markdown is scanned in the same places as shared/validate.js checks
 * `[[glossary]]` references: glossary definitions, slide content, speaker
 * notes, and the Markdown of reader blocks, tabs and hotspots.
 */
import { slugify } from './io/new-show.js';

/** `[[id]]` or `[[id|text]]`. Group 1: id, group 2: text. */
const GLOSSARY_REF = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

/**
 * A new id from a label: kebab-case, unique among `taken` (`-2`, `-3`, … if needed).
 * @param {string} label
 * @param {Iterable<string>} taken
 * @param {string} [fallback]  Used when the label gives no usable id.
 * @returns {string}
 */
export function uniqueId(label, taken, fallback = 'item') {
  const used = new Set(taken);
  const base = slugify(label) || fallback;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/**
 * Apply `fn` to every Markdown string of the show (see the module comment).
 * Returns a new show; parts without Markdown changes keep their identity.
 * @param {any} show
 * @param {(text: string) => string} fn
 * @returns {any}
 */
function mapMarkdown(show, fn) {
  /** @param {any} value @returns {any} */
  const deep = (value) => {
    if (typeof value === 'string') return fn(value);
    if (Array.isArray(value)) {
      const next = value.map(deep);
      return next.some((v, i) => v !== value[i]) ? next : value;
    }
    if (value && typeof value === 'object' && !('src' in value)) {
      let changed = false;
      const next = {};
      for (const [k, v] of Object.entries(value)) {
        const nv = typeof v === 'string' ? fn(v) : v;
        if (nv !== v) changed = true;
        /** @type {any} */ (next)[k] = nv;
      }
      return changed ? next : value;
    }
    return value;
  };
  /** @param {any} obj @param {string} key @param {(v: any) => any} map */
  const field = (obj, key, map) => {
    if (!obj || obj[key] === undefined) return obj;
    const next = map(obj[key]);
    return next === obj[key] ? obj : { ...obj, [key]: next };
  };

  let result = show;
  if (show.glossary && typeof show.glossary === 'object') {
    let changed = false;
    const glossary = {};
    for (const [id, term] of Object.entries(show.glossary)) {
      const next = field(term, 'definition', (d) => (typeof d === 'string' ? fn(d) : d));
      if (next !== term) changed = true;
      /** @type {any} */ (glossary)[id] = next;
    }
    if (changed) result = { ...result, glossary };
  }
  if (Array.isArray(show.slides)) {
    const slides = show.slides.map((/** @type {any} */ slide) => {
      let s = slide;
      if (s.content && typeof s.content === 'object') {
        const content = {};
        let changed = false;
        for (const [name, value] of Object.entries(s.content)) {
          const next = deep(value);
          if (next !== value) changed = true;
          /** @type {any} */ (content)[name] = next;
        }
        if (changed) s = { ...s, content };
      }
      s = field(s, 'notes', (n) => (typeof n === 'string' ? fn(n) : n));
      if (Array.isArray(s.reader?.blocks)) {
        const blocks = s.reader.blocks.map((/** @type {any} */ b) => {
          let block = field(b, 'md', (m) => (typeof m === 'string' ? fn(m) : m));
          for (const key of ['tabs', 'hotspots']) {
            block = field(block, key, (list) => (Array.isArray(list)
              ? (() => {
                const next = list.map((/** @type {any} */ item) => field(item, 'md', (m) => (typeof m === 'string' ? fn(m) : m)));
                return next.some((v, i) => v !== list[i]) ? next : list;
              })()
              : list));
          }
          return block;
        });
        if (blocks.some((/** @type {any} */ b, /** @type {number} */ i) => b !== s.reader.blocks[i])) {
          s = { ...s, reader: { ...s.reader, blocks } };
        }
      }
      return s;
    });
    if (slides.some((/** @type {any} */ s, /** @type {number} */ i) => s !== show.slides[i])) result = { ...result, slides };
  }
  return result;
}

/**
 * Where a glossary term is referenced: one entry per slide (by number) or
 * other glossary definition, with the number of references there.
 * @param {any} show
 * @param {string} id
 * @returns {{ where: string, count: number }[]}
 */
export function glossaryReferences(show, id) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  let where = '';
  const count = (/** @type {string} */ text) => {
    for (const m of text.matchAll(GLOSSARY_REF)) {
      if (m[1].trim() === id) counts.set(where, (counts.get(where) ?? 0) + 1);
    }
    return text;
  };
  for (const [termId, term] of Object.entries(show.glossary ?? {})) {
    if (termId === id) continue;
    where = `Glossary: ${/** @type {any} */ (term)?.term ?? termId}`;
    mapMarkdown({ glossary: { [termId]: term } }, count);
  }
  (show.slides ?? []).forEach((/** @type {any} */ slide, /** @type {number} */ i) => {
    const title = typeof slide.content?.title === 'string' && slide.content.title ? slide.content.title : slide.id;
    where = `Slide ${i + 1}: ${title}`;
    mapMarkdown({ slides: [slide] }, count);
  });
  return [...counts].map(([w, c]) => ({ where: w, count: c }));
}

/**
 * Turn references to a glossary term into plain text: `[[id]]` becomes the
 * term, `[[id|text]]` becomes the text. Other references are left alone.
 * @param {any} show
 * @param {string} id
 * @param {string} term
 * @returns {any}
 */
export function unlinkGlossary(show, id, term) {
  return mapMarkdown(show, (text) => text.replace(GLOSSARY_REF, (whole, refId, label) => (
    refId.trim() === id ? (label ?? term) : whole
  )));
}

/**
 * How many reader blocks are shown only to this profile (among others).
 * @param {any} show
 * @param {string} profileId
 * @returns {number}
 */
export function profileUsage(show, profileId) {
  let n = 0;
  for (const slide of show.slides ?? []) {
    for (const block of slide.reader?.blocks ?? []) {
      if (Array.isArray(block.for) && block.for.includes(profileId)) n++;
    }
  }
  return n;
}

/**
 * How many slides belong to this chapter.
 * @param {any} show
 * @param {string} chapterId
 * @returns {number}
 */
export function chapterUsage(show, chapterId) {
  return (show.slides ?? []).filter((/** @type {any} */ s) => s.chapter === chapterId).length;
}

/**
 * Tags from what was typed: comma-separated, trimmed, empty and duplicate tags dropped (E-015).
 * @param {string} text
 * @returns {string[]}
 */
export function parseTags(text) {
  return [...new Set(String(text ?? '').split(',').map((t) => t.trim()).filter(Boolean))];
}

/**
 * A BCP-47 language tag as the format accepts it (`en`, `nl-NL`).
 * @param {string} text
 */
export function isLanguageTag(text) {
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(text);
}

/**
 * An ISO date `YYYY-MM-DD` as the format accepts it.
 * @param {string} text
 */
export function isIsoDate(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}
