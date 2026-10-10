// @ts-check
/**
 * Text-quote anchoring for annotations, after the W3C Web Annotation
 * "TextQuoteSelector": an annotation remembers the exact text plus a little
 * context before and after it. Re-anchoring finds the best matching
 * occurrence, so highlights survive small edits to the show.
 * Pure string functions; the DOM mapping lives in annotations.js.
 */

const CONTEXT = 32;

/**
 * @param {string} text   Full text of the anchoring element.
 * @param {number} start
 * @param {number} end
 * @returns {{ exact: string, prefix: string, suffix: string }}
 */
export function describeQuote(text, start, end) {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

/**
 * Find the quote in `text`. With several occurrences, the one whose
 * surroundings best match prefix/suffix wins.
 * @param {string} text
 * @param {{ exact: string, prefix: string, suffix: string }} quote
 * @returns {{ start: number, end: number } | null}
 */
export function locateQuote(text, quote) {
  if (!quote.exact) return null;
  let best = null;
  let bestScore = -1;
  for (let i = text.indexOf(quote.exact); i !== -1; i = text.indexOf(quote.exact, i + 1)) {
    const before = text.slice(Math.max(0, i - quote.prefix.length), i);
    const after = text.slice(i + quote.exact.length, i + quote.exact.length + quote.suffix.length);
    const score = commonSuffix(before, quote.prefix) + commonPrefix(after, quote.suffix);
    if (score > bestScore) {
      best = { start: i, end: i + quote.exact.length };
      bestScore = score;
    }
  }
  return best;
}

/** @param {string} a @param {string} b */
function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** @param {string} a @param {string} b */
function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
