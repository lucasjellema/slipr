// @ts-check
/**
 * Glossary model (I-088): pure, DOM-free logic for the dedicated Glossary Editor.
 *
 * Responsibilities:
 * - Extracting text from across the show (slides, slots, cards, notes, reader blocks).
 * - Deck-aware scanning: extracting acronyms, technical names, capitalized phrases,
 *   and frequent words appearing in the deck that lack glossary definitions.
 * - Auto-completion suggestions when typing new glossary terms.
 * - Detailed usage analysis per glossary term: explicit [[id]] references
 *   with slide numbers/ids and text mentions of aliases.
 * - Searching, filtering (all, in-use, orphaned, missing definition), and sorting.
 *
 * Tested with Node: test/glossary.test.js.
 */

import { uniqueId, glossaryReferences } from './show-entities.js';
import { glossaryPhrases, findTerms } from '../../shared/glossary.js';
import { slideTitle } from '../../shared/render.js';

/**
 * Common English stop words and structural slide labels to exclude
 * from candidate glossary suggestions.
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'across', 'after', 'again', 'against', 'all', 'almost',
  'alone', 'along', 'already', 'also', 'although', 'always', 'among', 'an', 'and',
  'another', 'any', 'anybody', 'anyone', 'anything', 'anywhere', 'are', 'area',
  'around', 'as', 'ask', 'at', 'back', 'be', 'became', 'because', 'become',
  'becomes', 'becoming', 'been', 'before', 'began', 'behind', 'being', 'below',
  'best', 'better', 'between', 'both', 'but', 'by', 'came', 'can', 'cannot',
  'case', 'certain', 'clear', 'clearly', 'come', 'could', 'did', 'differ',
  'different', 'do', 'does', 'done', 'down', 'during', 'each', 'early', 'either',
  'end', 'enough', 'even', 'every', 'everybody', 'everyone', 'everything', 'example',
  'few', 'find', 'first', 'for', 'four', 'from', 'full', 'further', 'general',
  'get', 'give', 'given', 'go', 'good', 'great', 'group', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'herself', 'high', 'him', 'himself', 'his',
  'how', 'however', 'if', 'important', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'keep', 'kind', 'knew', 'know', 'known', 'large', 'last', 'later',
  'least', 'less', 'let', 'like', 'likely', 'little', 'look', 'made', 'main',
  'make', 'making', 'man', 'many', 'may', 'me', 'mean', 'might', 'more', 'most',
  'mostly', 'much', 'must', 'my', 'myself', 'name', 'near', 'need', 'never',
  'new', 'next', 'no', 'nobody', 'none', 'noone', 'nor', 'not', 'note', 'nothing',
  'now', 'number', 'of', 'off', 'often', 'old', 'on', 'once', 'one', 'only',
  'open', 'or', 'order', 'other', 'others', 'our', 'out', 'over', 'own', 'part',
  'per', 'perhaps', 'place', 'point', 'possible', 'present', 'problem', 'quite',
  'rather', 'really', 'right', 'room', 'said', 'same', 'saw', 'say', 'says',
  'see', 'seem', 'seemed', 'seeming', 'seems', 'several', 'shall', 'she', 'should',
  'show', 'side', 'since', 'small', 'so', 'some', 'somebody', 'someone', 'something',
  'somewhere', 'state', 'still', 'such', 'sure', 'take', 'taken', 'tell', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'therefore', 'these', 'they',
  'thing', 'things', 'think', 'this', 'those', 'though', 'thought', 'three',
  'through', 'thus', 'time', 'to', 'together', 'too', 'took', 'toward', 'turn',
  'two', 'under', 'until', 'up', 'upon', 'us', 'use', 'used', 'uses', 'using',
  'very', 'want', 'wanted', 'was', 'way', 'ways', 'we', 'well', 'went', 'were',
  'what', 'when', 'where', 'whether', 'which', 'while', 'who', 'whole', 'whom',
  'whose', 'why', 'will', 'with', 'within', 'without', 'work', 'would', 'year',
  'yet', 'you', 'young', 'your', 'yours',
  // Slipr structural words
  'slide', 'slides', 'chapter', 'chapters', 'reader', 'audience', 'overview',
  'summary', 'agenda', 'conclusion', 'introduction', 'welcome', 'thank', 'thanks',
]);

/**
 * @typedef {{
 *   text: string,
 *   slideId?: string,
 *   slideNumber?: number,
 *   slideTitle?: string,
 *   location: string,
 * }} TextSegment
 */

/**
 * Collect all readable text segments from across the presentation.
 * @param {any} show
 * @returns {TextSegment[]}
 */
export function extractShowTexts(show) {
  /** @type {TextSegment[]} */
  const segments = [];

  const add = (/** @type {any} */ val, /** @type {string} */ loc, /** @type {any} */ s = null, /** @type {number | undefined} */ idx = undefined) => {
    if (!val) return;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) {
        segments.push({
          text: trimmed,
          slideId: s?.id,
          slideNumber: idx !== undefined ? idx + 1 : undefined,
          slideTitle: s ? (slideTitle(s) || s.id) : undefined,
          location: loc,
        });
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => add(item, `${loc}[${i}]`, s, idx));
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        if (k !== 'src' && k !== 'id' && k !== 'layout' && k !== 'type') {
          add(v, `${loc}.${k}`, s, idx);
        }
      }
    }
  };

  // 1. Show metadata
  if (show?.meta) {
    add(show.meta.title, 'meta.title');
    add(show.meta.subtitle, 'meta.subtitle');
    add(show.meta.description, 'meta.description');
  }

  // 2. Chapters
  if (Array.isArray(show?.chapters)) {
    show.chapters.forEach((c, i) => {
      add(c.title, `chapters[${i}].title`);
      add(c.summary, `chapters[${i}].summary`);
    });
  }

  // 3. Slides
  if (Array.isArray(show?.slides)) {
    show.slides.forEach((slide, i) => {
      // Content slots
      if (slide.content && typeof slide.content === 'object') {
        for (const [slotName, slotVal] of Object.entries(slide.content)) {
          add(slotVal, `slide.content.${slotName}`, slide, i);
        }
      }
      // Speaker notes
      if (slide.notes) {
        add(slide.notes, 'slide.notes', slide, i);
      }
      // Reader layer
      if (slide.reader) {
        if (slide.reader.summary) {
          add(slide.reader.summary, 'slide.reader.summary', slide, i);
        }
        if (Array.isArray(slide.reader.blocks)) {
          slide.reader.blocks.forEach((b, bIdx) => {
            add(b.title, `slide.reader.blocks[${bIdx}].title`, slide, i);
            add(b.caption, `slide.reader.blocks[${bIdx}].caption`, slide, i);
            add(b.md, `slide.reader.blocks[${bIdx}].md`, slide, i);
            if (Array.isArray(b.tabs)) {
              b.tabs.forEach((tab, tIdx) => {
                add(tab.label, `slide.reader.blocks[${bIdx}].tabs[${tIdx}].label`, slide, i);
                add(tab.md, `slide.reader.blocks[${bIdx}].tabs[${tIdx}].md`, slide, i);
              });
            }
            if (Array.isArray(b.hotspots)) {
              b.hotspots.forEach((hs, hIdx) => {
                add(hs.title, `slide.reader.blocks[${bIdx}].hotspots[${hIdx}].title`, slide, i);
                add(hs.md, `slide.reader.blocks[${bIdx}].hotspots[${hIdx}].md`, slide, i);
              });
            }
          });
        }
      }
    });
  }

  return segments;
}

/**
 * @typedef {{
 *   term: string,
 *   count: number,
 *   slideCount: number,
 *   slides: Array<{ slideId: string, slideNumber: number, slideTitle: string, count: number }>,
 *   kind: 'acronym' | 'phrase' | 'capitalized' | 'technical' | 'frequent',
 * }} CandidateTerm
 */

/**
 * Scan the entire presentation for candidate glossary words, acronyms, and technical phrases
 * that are NOT yet defined in the show's glossary.
 * @param {any} show
 * @returns {CandidateTerm[]}
 */
export function scanDeckCandidates(show) {
  const existingGlossary = show?.glossary && typeof show.glossary === 'object' ? show.glossary : {};
  const existingNames = new Set();

  for (const [id, entry] of Object.entries(existingGlossary)) {
    existingNames.add(id.toLowerCase());
    const term = /** @type {any} */ (entry);
    if (term?.term) existingNames.add(String(term.term).trim().toLowerCase());
    if (Array.isArray(term?.aliases)) {
      term.aliases.forEach((a) => {
        if (typeof a === 'string') existingNames.add(a.trim().toLowerCase());
      });
    }
  }

  const segments = extractShowTexts(show);

  /** @type {Map<string, { term: string, count: number, kind: CandidateTerm['kind'], slides: Map<string, { slideId: string, slideNumber: number, slideTitle: string, count: number }> }>} */
  const candidates = new Map();

  /**
   * @param {string} raw
   * @param {CandidateTerm['kind']} kind
   * @param {TextSegment} seg
   */
  const recordCandidate = (raw, kind, seg) => {
    // Strip trailing punctuation like .,;:!?
    const term = raw.trim().replace(/^[\s("'«“]+|[\s)"'»”.,;:!?]+$/g, '');
    if (!term || term.length < 2) return;
    const lower = term.toLowerCase();

    // Check stop words and already-defined terms
    if (STOP_WORDS.has(lower) || existingNames.has(lower)) return;
    // Don't accept purely numbers
    if (/^\d+$/.test(term)) return;

    let cand = candidates.get(lower);
    if (!cand) {
      cand = {
        term,
        count: 0,
        kind,
        slides: new Map(),
      };
      candidates.set(lower, cand);
    } else {
      // Prefer capitalized or camelCase casing over all-lowercase
      if (term[0] === term[0].toUpperCase() && cand.term[0] !== cand.term[0].toUpperCase()) {
        cand.term = term;
      }
    }

    cand.count += 1;
    if (seg.slideId && seg.slideNumber) {
      let sl = cand.slides.get(seg.slideId);
      if (!sl) {
        sl = {
          slideId: seg.slideId,
          slideNumber: seg.slideNumber,
          slideTitle: seg.slideTitle || `Slide ${seg.slideNumber}`,
          count: 0,
        };
        cand.slides.set(seg.slideId, sl);
      }
      sl.count += 1;
    }
  };

  for (const seg of segments) {
    const text = seg.text;

    // 1. Acronyms: 2-6 uppercase letters/digits (e.g. API, CSS, SVG, HTML, REST, SDK)
    for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) {
      recordCandidate(m[0], 'acronym', seg);
    }

    // 2. Technical terms with dots/dashes: e.g. Node.js, Reveal.js, reveal.js
    for (const m of text.matchAll(/\b[A-Za-z0-9_]+(?:\.[a-z]{1,4})\b/g)) {
      recordCandidate(m[0], 'technical', seg);
    }

    // 3. CamelCase words: e.g. WebSocket, TypeScript, JavaScript, IndexedDB
    for (const m of text.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g)) {
      recordCandidate(m[0], 'technical', seg);
    }

    // 4. Code snippets enclosed in backticks: `someTerm`
    for (const m of text.matchAll(/`([^`\n]{2,30})`/g)) {
      const inside = m[1].trim();
      if (!inside.includes(' ') && !inside.includes('\n')) {
        recordCandidate(inside, 'technical', seg);
      }
    }

    // 5. Capitalized 2-3 word phrases: e.g. Progressive Disclosure, Reader Mode
    for (const m of text.matchAll(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b/g)) {
      recordCandidate(m[0], 'phrase', seg);
    }

    // 6. Single capitalized words (proper nouns, technical names)
    for (const m of text.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
      recordCandidate(m[0], 'capitalized', seg);
    }

    // 7. Frequent words (length >= 4)
    for (const m of text.matchAll(/\b[a-zA-Z]{4,}\b/g)) {
      recordCandidate(m[0], 'frequent', seg);
    }
  }

  // Filter candidates:
  // - Acronyms, technical terms, CamelCase, and multi-word phrases need count >= 1
  // - Capitalized words need count >= 1 if length >= 4
  // - General frequent words need count >= 2
  /** @type {CandidateTerm[]} */
  const result = [];
  for (const cand of candidates.values()) {
    if (cand.kind === 'frequent' && cand.count < 2) continue;
    if (cand.kind === 'capitalized' && cand.term.length < 4 && cand.count < 2) continue;

    result.push({
      term: cand.term,
      count: cand.count,
      slideCount: cand.slides.size,
      slides: [...cand.slides.values()].sort((a, b) => a.slideNumber - b.slideNumber),
      kind: cand.kind,
    });
  }

  // Sort by occurrence count descending, then alphabetically
  return result.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

/**
 * Suggest autocompletions for a prefix/query being typed by the user,
 * drawing from candidates scanned from the presentation deck.
 * @param {string} prefix
 * @param {CandidateTerm[]} candidates
 * @param {{ limit?: number }} [options]
 * @returns {CandidateTerm[]}
 */
export function suggestWordCompletions(prefix, candidates, { limit = 8 } = {}) {
  const query = prefix.trim().toLowerCase();
  if (!query) return candidates.slice(0, limit);

  // Score matches:
  // 100: starts with query
  // 50: word boundary match (contains ` query`)
  // 20: contains query
  /** @type {Array<{ cand: CandidateTerm, score: number }>} */
  const scored = [];

  for (const cand of candidates) {
    const termLower = cand.term.toLowerCase();
    if (termLower.startsWith(query)) {
      scored.push({ cand, score: 100 + cand.count });
    } else if (termLower.includes(` ${query}`) || termLower.includes(`-${query}`)) {
      scored.push({ cand, score: 50 + cand.count });
    } else if (termLower.includes(query)) {
      scored.push({ cand, score: 20 + cand.count });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.cand.term.localeCompare(b.cand.term))
    .slice(0, limit)
    .map((s) => s.cand);
}

/**
 * @typedef {{
 *   id: string,
 *   term: string,
 *   aliases: string[],
 *   definition: string,
 *   link?: string,
 *   explicitRefs: Array<{ where: string, count: number, slideId?: string, slideIndex?: number, termId?: string }>,
 *   explicitCount: number,
 *   textMentions: Array<{ slideId: string, slideNumber: number, slideTitle: string, count: number }>,
 *   mentionCount: number,
 *   totalUses: number,
 *   isOrphaned: boolean,
 *   hasDefinition: boolean,
 *   hasAliases: boolean,
 *   hasLink: boolean,
 * }} DetailedGlossaryEntry
 */

/**
 * Get detailed usage statistics and reference locations for a single glossary term.
 * @param {any} show
 * @param {string} id
 * @returns {DetailedGlossaryEntry | null}
 */
export function getDetailedGlossaryEntry(show, id) {
  const entry = show?.glossary?.[id];
  if (!entry) return null;

  const termName = entry.term || id;
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  const definition = typeof entry.definition === 'string' ? entry.definition : '';
  const link = typeof entry.link === 'string' && entry.link.trim() ? entry.link.trim() : undefined;

  // 1. Explicit [[id]] or [[id|text]] references
  const explicitRefs = glossaryReferences(show, id);
  const explicitCount = explicitRefs.reduce((sum, r) => sum + r.count, 0);

  // 2. Implicit text mentions: scan slide plain texts for term and aliases
  // (where not already linked via [[id]])
  /** @type {Map<string, { slideId: string, slideNumber: number, slideTitle: string, count: number }>} */
  const mentionsBySlide = new Map();
  const phrases = glossaryPhrases({ [id]: entry });

  if (phrases.length && Array.isArray(show.slides)) {
    show.slides.forEach((slide, idx) => {
      // Collect slide plain texts
      let slideText = '';
      if (slide.content && typeof slide.content === 'object') {
        for (const [k, v] of Object.entries(slide.content)) {
          if (typeof v === 'string') slideText += ` ${v}`;
          else if (Array.isArray(v)) slideText += ` ${v.join(' ')}`;
        }
      }
      if (slideText) {
        // Find how many times term/aliases appear
        const found = findTerms(slideText, phrases, new Set());
        if (found.length) {
          mentionsBySlide.set(slide.id, {
            slideId: slide.id,
            slideNumber: idx + 1,
            slideTitle: slideTitle(slide) || slide.id,
            count: found.length,
          });
        }
      }
    });
  }

  const textMentions = [...mentionsBySlide.values()].sort((a, b) => a.slideNumber - b.slideNumber);
  const mentionCount = textMentions.reduce((sum, m) => sum + m.count, 0);
  const totalUses = explicitCount + mentionCount;

  return {
    id,
    term: termName,
    aliases,
    definition,
    link,
    explicitRefs,
    explicitCount,
    textMentions,
    mentionCount,
    totalUses,
    isOrphaned: totalUses === 0,
    hasDefinition: Boolean(definition.trim()),
    hasAliases: aliases.length > 0,
    hasLink: Boolean(link),
  };
}

/**
 * Get detailed entries for all glossary terms in the show.
 * @param {any} show
 * @returns {DetailedGlossaryEntry[]}
 */
export function getAllGlossaryEntries(show) {
  const glossary = show?.glossary && typeof show.glossary === 'object' ? show.glossary : {};
  const entries = [];
  for (const id of Object.keys(glossary)) {
    const detail = getDetailedGlossaryEntry(show, id);
    if (detail) entries.push(detail);
  }
  return entries;
}

/**
 * Filter and sort glossary entries for presentation in the editor.
 * @param {DetailedGlossaryEntry[]} entries
 * @param {{
 *   search?: string,
 *   filter?: 'all' | 'in-use' | 'orphaned' | 'no-definition',
 *   sort?: 'name-asc' | 'name-desc' | 'uses-desc' | 'uses-asc' | 'id-asc',
 * }} options
 * @returns {DetailedGlossaryEntry[]}
 */
export function filterAndSortGlossary(entries, { search = '', filter = 'all', sort = 'name-asc' } = {}) {
  let list = entries;

  // Filter by category
  if (filter === 'in-use') {
    list = list.filter((e) => e.totalUses > 0);
  } else if (filter === 'orphaned') {
    list = list.filter((e) => e.isOrphaned);
  } else if (filter === 'no-definition') {
    list = list.filter((e) => !e.hasDefinition);
  }

  // Filter by search query
  const query = search.trim().toLowerCase();
  if (query) {
    list = list.filter((e) => (
      e.term.toLowerCase().includes(query) ||
      e.id.toLowerCase().includes(query) ||
      e.aliases.some((a) => a.toLowerCase().includes(query)) ||
      e.definition.toLowerCase().includes(query)
    ));
  }

  // Sort
  const sorted = [...list];
  switch (sort) {
    case 'name-desc':
      sorted.sort((a, b) => b.term.localeCompare(a.term));
      break;
    case 'uses-desc':
      sorted.sort((a, b) => b.totalUses - a.totalUses || a.term.localeCompare(b.term));
      break;
    case 'uses-asc':
      sorted.sort((a, b) => a.totalUses - b.totalUses || a.term.localeCompare(b.term));
      break;
    case 'id-asc':
      sorted.sort((a, b) => a.id.localeCompare(b.id));
      break;
    case 'name-asc':
    default:
      sorted.sort((a, b) => a.term.localeCompare(b.term));
      break;
  }

  return sorted;
}

/**
 * Suggest a stable unique ID for a new term.
 * @param {string} termName
 * @param {Iterable<string>} existingIds
 * @returns {string}
 */
export function suggestIdForTerm(termName, existingIds) {
  return uniqueId(termName, existingIds, 'term');
}
