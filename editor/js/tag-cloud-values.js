// @ts-check
/**
 * Value helpers for the tag cloud editor (I-105): pure functions that return a
 * new tag cloud value (slot value or block fields), never changing the old
 * one, so undo keeps working. DOM-free (tested in Node).
 *
 * A tag cloud holds either inline `terms` ({ text, weight?, glossary? }) or a
 * CSV `data` file with a term column and an optional weight column.
 */
import { tagCloudModel, termsFromRows } from '../../shared/embeds/tag-cloud.js';

/** Block fields of a tag cloud (the slot value has these and `steps`). */
export const TAG_CLOUD_FIELDS = ['data', 'terms', 'termColumn', 'weightColumn', 'order', 'maxTerms', 'weightLabel', 'caption', 'fallback'];

/** A new tag cloud: three terms to type over. */
export function newTagCloud() {
  return { terms: [{ text: 'First term', weight: 3 }, { text: 'Second term', weight: 2 }, { text: 'Third term', weight: 1 }] };
}

/**
 * The value with `patch` applied; `undefined`, empty strings and empty step
 * lists remove a field.
 * @param {any} value @param {Record<string, any>} patch
 * @returns {any}
 */
export function tagCloudValue(value, patch) {
  const next = { ...(value ?? {}), ...patch };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length && k !== 'terms')) delete next[k];
  }
  return next;
}

/** @param {any} value @returns {any[]} */
const termsOf = (value) => (Array.isArray(value?.terms) ? value.terms : []);

/**
 * A weight from typed text: empty → none (counts 1), else a number ≥ 0.
 * @param {string} text
 * @returns {number | undefined}
 */
export function weightFromText(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Change a term; `undefined` or an empty string removes a field (not `text`).
 * @param {any} value @param {number} index @param {Record<string, any>} patch
 */
export function setTerm(value, index, patch) {
  const terms = termsOf(value).map((t, i) => {
    if (i !== index) return t;
    const next = { ...t, ...patch };
    for (const [k, v] of Object.entries(next)) if (k !== 'text' && (v === undefined || v === '')) delete next[k];
    if (typeof next.text !== 'string') next.text = '';
    return next;
  });
  return tagCloudValue(value, { terms });
}

/**
 * Add an empty term after `at` (default: at the end).
 * @param {any} value @param {number} [at]
 */
export function addTerm(value, at) {
  const terms = [...termsOf(value)];
  terms.splice(at === undefined ? terms.length : at + 1, 0, { text: '' });
  return tagCloudValue(value, { terms });
}

/** @param {any} value @param {number} index */
export function removeTerm(value, index) {
  return tagCloudValue(value, { terms: termsOf(value).filter((_, i) => i !== index) });
}

/** @param {any} value @param {number} from @param {number} to */
export function moveTerm(value, from, to) {
  const terms = [...termsOf(value)];
  if (from === to || !terms[from] || to < 0 || to >= terms.length) return value;
  const [t] = terms.splice(from, 1);
  terms.splice(to, 0, t);
  return tagCloudValue(value, { terms });
}

/**
 * Terms from pasted text: one per line, optionally followed by a weight after a
 * tab, a semicolon or a comma ("Onboarding⇥12", "Onboarding, 12"). A line
 * without a number is a term on its own (repeated lines add up when shown).
 * @param {string} text
 * @returns {{ text: string, weight?: number }[]}
 */
export function pastedTerms(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => {
    const m = /^(.*?)[\t;,]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(line.trim());
    const term = (m ? m[1] : line).trim().replace(/^"(.*)"$/, '$1');
    const weight = m ? weightFromText(m[2]) : undefined;
    return weight === undefined ? { text: term } : { text: term, weight };
  }).filter((t) => t.text);
}

/**
 * Replace the terms with pasted ones (the file, if any, is no longer used).
 * @param {any} value @param {string} text
 */
export function tagCloudFromPaste(value, text) {
  const terms = pastedTerms(text);
  if (!terms.length) return value;
  const { data, termColumn, weightColumn, ...rest } = value ?? {};
  return tagCloudValue(rest, { terms });
}

/**
 * Turn a CSV file's terms into typed-in terms ("Move into the slide"): repeated
 * terms merged with their weights added up, heaviest first.
 * @param {any} value @param {string[][]} fileRows  Header first.
 * @param {{ decimalComma?: boolean }} [options]
 */
export function inlineFromFile(value, fileRows, options = {}) {
  const raw = termsFromRows(fileRows, value, options);
  const { tags } = tagCloudModel({ terms: raw, order: 'weight' });
  const terms = tags.map((t) => ({ text: t.text, weight: t.weight }));
  const { data, termColumn, weightColumn, ...rest } = value ?? {};
  return tagCloudValue(rest, { terms });
}

/**
 * Use a CSV file instead of typed-in terms (they are kept in the history, not the value).
 * @param {any} value @param {string} path
 */
export function useDataFile(value, path) {
  const { terms, termColumn, weightColumn, ...rest } = value ?? {};
  return tagCloudValue(rest, { data: path });
}

/**
 * One line about a tag cloud, for summaries and the block list.
 * @param {any} value
 */
export function tagCloudSummary(value) {
  if (typeof value?.data === 'string') return `Tag cloud from ${value.data}`;
  const n = termsOf(value).filter((t) => typeof t?.text === 'string' && t.text.trim()).length;
  return `Tag cloud: ${n} term${n === 1 ? '' : 's'}`;
}

// --------------------------------------------------------------- steps

/** @param {any} value @param {any} step */
export function addStep(value, step) {
  return tagCloudValue(value, { steps: [...(Array.isArray(value?.steps) ? value.steps : []), step] });
}

/** @param {any} value @param {number} index @param {any} step */
export function setStep(value, index, step) {
  return tagCloudValue(value, { steps: (value?.steps ?? []).map((/** @type {any} */ s, /** @type {number} */ i) => (i === index ? step : s)) });
}

/** @param {any} value @param {number} index */
export function removeStep(value, index) {
  return tagCloudValue(value, { steps: (value?.steps ?? []).filter((/** @type {any} */ _, /** @type {number} */ i) => i !== index) });
}

/** @param {any} value @param {number} from @param {number} to */
export function moveStep(value, from, to) {
  const steps = [...(value?.steps ?? [])];
  if (from === to || !steps[from] || to < 0 || to >= steps.length) return value;
  const [s] = steps.splice(from, 1);
  steps.splice(to, 0, s);
  return tagCloudValue(value, { steps });
}

/**
 * Highlight names from typed text: comma separated; one name stays a string.
 * @param {string} text
 * @returns {string | string[] | null}
 */
export function highlightFromText(text) {
  const names = String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!names.length) return null;
  return names.length === 1 ? names[0] : names;
}

/** A highlight as typed text. @param {unknown} highlight */
export function highlightText(highlight) {
  if (Array.isArray(highlight)) return highlight.join(', ');
  return typeof highlight === 'string' ? highlight : '';
}
