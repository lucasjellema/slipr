// @ts-check
/**
 * Glossary terms in slide text (I-086): find the terms of a show's glossary
 * (and their `aliases`) in plain text, and turn their first occurrence on a
 * slide into the same `.slipr-term` button that `[[term]]` Markdown produces.
 *
 * Matching (DOM-free, tested in Node): whole words, case- and
 * accent-insensitive, any white space for any white space, the longest phrase
 * first at a position, each term once per slide. Linking walks a rendered
 * slide's text nodes (browser); shared/render.js calls it in reader mode.
 */

/**
 * @typedef {{ id: string, phrase: string }} Phrase   A term or alias, folded.
 * @typedef {{ start: number, end: number, id: string }} Match  Indexes into the original text.
 */

/** @param {string} ch */
const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch);

/**
 * Fold text for matching: lower case, accents removed, white space runs as
 * one space. Also returns, for each folded character, the index of the
 * original character it came from (plus one past the end), so matches can be
 * mapped back.
 * @param {string} text
 * @returns {{ folded: string, map: number[] }}
 */
export function foldText(text) {
  let folded = '';
  /** @type {number[]} */
  const map = [];
  let i = 0;
  for (const ch of text) {
    const len = ch.length;   // a surrogate pair is one character
    if (/\s/u.test(ch)) {
      if (!folded.endsWith(' ')) {
        folded += ' ';
        map.push(i);
      }
    } else {
      const f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      for (const c of f) {
        folded += c;
        map.push(i);
      }
    }
    i += len;
  }
  map.push(i);
  return { folded, map };
}

/**
 * The phrases to look for: each term and alias, folded, longest first.
 * @param {Record<string, { term?: string, aliases?: string[] }> | undefined} glossary
 * @returns {Phrase[]}
 */
export function glossaryPhrases(glossary) {
  /** @type {Phrase[]} */
  const phrases = [];
  const taken = new Set();
  for (const [id, entry] of Object.entries(glossary ?? {})) {
    const names = [entry?.term, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])];
    for (const name of names) {
      if (typeof name !== 'string') continue;
      const phrase = foldText(name.trim()).folded;
      // Needs a letter or digit; punctuation at an edge ("A.I.") is allowed.
      if (![...phrase].some(isWordChar)) continue;
      if (taken.has(phrase)) continue;   // the same name on two terms: the first one wins
      taken.add(phrase);
      phrases.push({ id, phrase });
    }
  }
  return phrases.sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * Find the first occurrence of each not-yet-seen term in a text.
 * @param {string} text
 * @param {Phrase[]} phrases  From glossaryPhrases().
 * @param {Set<string>} seen  Term ids already linked on this slide; found ids are added.
 * @returns {Match[]}  In text order, not overlapping.
 */
export function findTerms(text, phrases, seen) {
  if (!phrases.length || !text) return [];
  const { folded, map } = foldText(text);
  /** @type {Match[]} */
  const matches = [];
  let pos = 0;
  while (pos < folded.length) {
    let advanced = false;
    for (const { id, phrase } of phrases) {
      if (!folded.startsWith(phrase, pos)) continue;
      const end = pos + phrase.length;
      // Whole words: where the phrase has a letter or digit at an edge, the
      // text must not continue with one there.
      if (isWordChar(phrase[0]) && pos > 0 && isWordChar(folded[pos - 1])) continue;
      if (isWordChar(phrase.at(-1) ?? '') && end < folded.length && isWordChar(folded[end])) continue;
      // The longest phrase here consumes its text, linked or not.
      if (!seen.has(id)) {
        seen.add(id);
        matches.push({ start: map[pos], end: map[end], id });
      }
      pos = end;
      advanced = true;
      break;
    }
    if (!advanced) pos += 1;
  }
  return matches;
}

/** Elements whose text is never linked. */
const SKIP = 'a, button, .slipr-term, code, pre, script, style, svg, .slipr-diagram, .slipr-overlays, [data-no-glossary]';

/**
 * Link the first occurrence of each glossary term in an element's text, in
 * place: the text becomes `<button type="button" class="slipr-term"
 * data-term="id">`. Terms the element already references (`[[id]]`) count
 * as linked. Browser only.
 * @param {HTMLElement} root
 * @param {Record<string, { term?: string, aliases?: string[] }> | undefined} glossary
 */
export function linkGlossaryTerms(root, glossary) {
  const phrases = glossaryPhrases(glossary);
  if (!phrases.length) return;
  const doc = root.ownerDocument;
  const seen = new Set(
    [...root.querySelectorAll('.slipr-term[data-term]')].map((el) => /** @type {HTMLElement} */ (el).dataset.term ?? ''),
  );
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) || !node.nodeValue?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  /** @type {Text[]} */
  const nodes = [];
  while (walker.nextNode()) nodes.push(/** @type {Text} */ (walker.currentNode));

  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const matches = findTerms(text, phrases, seen);
    if (!matches.length) continue;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const m of matches) {
      if (m.start > at) frag.append(text.slice(at, m.start));
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'slipr-term';
      button.dataset.term = m.id;
      button.textContent = text.slice(m.start, m.end);
      frag.append(button);
      at = m.end;
    }
    if (at < text.length) frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}
