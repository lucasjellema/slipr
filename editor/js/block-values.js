// @ts-check
/**
 * Value shapes for the tabs, embed and slide-ref block editors (I-036).
 * DOM-free. Never produces a shape the format rejects: tabs keep at least one
 * tab with a non-empty label; an embed height is an integer of at least 100.
 * Web pages (I-071): `webValue()` always keeps `url` and a title.
 */
import { ALLOW_OPTIONS } from '../../shared/embeds/web.js';
import { isMap } from '../../shared/embeds/map.js';
import { isGraph } from '../../shared/embeds/graph.js';
import { isTable } from '../../shared/embeds/table.js';
import { isTagCloud } from '../../shared/embeds/tag-cloud.js';
import { tagCloudValue } from './tag-cloud-values.js';
import { tableValue } from './table-values.js';
import { mapValue } from './map-values.js';
import { graphValue } from './graph-values.js';
import { isVideo } from '../../shared/embeds/video.js';
import { videoValue } from './video-values.js';

/**
 * @param {any} tabs
 * @returns {{ label: string, md: string }[]}
 */
export function tabsArray(tabs) {
  return Array.isArray(tabs) ? tabs.map((t) => ({ label: String(t?.label ?? ''), md: String(t?.md ?? '') })) : [];
}

/**
 * Append a tab named "Tab n".
 * @param {any} tabs
 * @returns {{ label: string, md: string }[]}
 */
export function addTab(tabs) {
  const list = tabsArray(tabs);
  return [...list, { label: `Tab ${list.length + 1}`, md: '' }];
}

/**
 * Remove a tab; the last remaining tab is kept (a tabs block needs one).
 * @param {any} tabs @param {number} index
 */
export function removeTab(tabs, index) {
  const list = tabsArray(tabs);
  return list.length <= 1 ? list : list.filter((_, i) => i !== index);
}

/**
 * @param {any} tabs @param {number} from @param {number} to
 */
export function moveTab(tabs, from, to) {
  const list = tabsArray(tabs);
  if (from < 0 || from >= list.length) return list;
  const [tab] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, tab);
  return list;
}

/**
 * Change one tab. An empty label is ignored (the format needs a label).
 * @param {any} tabs @param {number} index @param {{ label?: string, md?: string }} patch
 */
export function setTab(tabs, index, patch) {
  return tabsArray(tabs).map((tab, i) => {
    if (i !== index) return tab;
    const next = { ...tab };
    if (patch.label !== undefined && patch.label.trim() !== '') next.label = patch.label;
    if (patch.md !== undefined) next.md = patch.md;
    return next;
  });
}

/**
 * What is wrong with an embed URL, as a message for the author, or null.
 * Relative paths are fine (a page inside the show folder).
 * @param {string} url
 * @returns {{ level: 'error' | 'warning', message: string } | null}
 */
export function embedUrlProblem(url) {
  const value = (url ?? '').trim();
  if (!value) return { level: 'error', message: 'Enter the address of the page to embed.' };
  if (/^(javascript|data|vbscript):/i.test(value)) return { level: 'error', message: 'This kind of address is not allowed; reader mode will not show it.' };
  if (/^http:/i.test(value)) return { level: 'warning', message: 'An http: page may be blocked on a site served over https. Use https: if the page has it.' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https:/i.test(value)) return { level: 'warning', message: 'Only https: pages (or files in the show folder) can be embedded.' };
  return null;
}

/**
 * The `height` of an embed from what was typed: an integer of at least 100,
 * or undefined for the default (empty or not a number).
 * @param {string} text
 * @returns {number | undefined}
 */
export function embedHeight(text) {
  const n = Number.parseInt(String(text ?? '').trim(), 10);
  return Number.isFinite(n) ? Math.max(100, n) : undefined;
}

/** Extra sandbox permissions an embedded page may get (I-071), in display order. */
export const WEB_ALLOW_OPTIONS = ALLOW_OPTIONS;

/** Aspect ratios offered for an embedded page (I-071). */
export const WEB_ASPECTS = ['16:9', '4:3', '1:1', '9:16'];

/**
 * Turn one `allow` permission on or off. The list keeps the display order;
 * an empty list becomes undefined (the field is removed).
 * @param {any} allow @param {string} option @param {boolean} on
 * @returns {string[] | undefined}
 */
export function toggleAllow(allow, option, on) {
  const set = new Set(Array.isArray(allow) ? allow : []);
  if (on) set.add(option);
  else set.delete(option);
  const list = WEB_ALLOW_OPTIONS.filter((o) => set.has(o));
  return list.length ? list : undefined;
}

/**
 * A `web` slot value (I-071) from the previous value and a patch. Always has
 * `url` and a non-empty `title` (the format needs both); an empty title in the
 * patch is ignored; fields patched to undefined (or "") are removed.
 * @param {any} previous
 * @param {Record<string, any>} patch
 * @returns {Record<string, any>}
 */
export function webValue(previous, patch) {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  /** @type {Record<string, any>} */
  const next = { url: '', title: 'Web page', ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'title' && !String(value ?? '').trim()) continue;
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
  }
  if (next.url === undefined) next.url = '';
  return next;
}

/**
 * A PDF value (I-072), slot or block, from the previous value and a patch.
 * Always has `pdf` and a non-empty `title`; an empty title in the patch is
 * ignored; fields patched to undefined (or "") are removed.
 * @param {any} previous
 * @param {Record<string, any>} patch
 * @returns {Record<string, any>}
 */
export function pdfValue(previous, patch) {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  /** @type {Record<string, any>} */
  const next = { pdf: '', title: 'PDF document', ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'title' && !String(value ?? '').trim()) continue;
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
  }
  if (next.pdf === undefined) next.pdf = '';
  return next;
}

/**
 * The `page` / `pages` patch for what was typed in "first page" and "last
 * page": nothing → the whole document; one page (or both the same) → `page`;
 * two → `pages` in order.
 * @param {string} firstText @param {string} lastText
 * @returns {{ page: number | undefined, pages: [number, number] | undefined }}
 */
export function pdfPagesPatch(firstText, lastText) {
  const n = (/** @type {string} */ t) => {
    const v = Number.parseInt(String(t ?? '').trim(), 10);
    return Number.isFinite(v) && v >= 1 ? v : null;
  };
  const a = n(firstText);
  const b = n(lastText);
  if (a === null && b === null) return { page: undefined, pages: undefined };
  if (a === null || b === null || a === b) return { page: /** @type {number} */ (a ?? b), pages: undefined };
  return { page: undefined, pages: [Math.min(a, b), Math.max(a, b)] };
}

/**
 * An embed slot value with a new fallback image (I-070), keeping the value's
 * own shape: a map (I-075), a tag cloud (I-105), a table (I-104), a graph (I-074), a PDF (I-072), a video (I-110) or a web page (I-071).
 * @param {any} current @param {any} image  The fallback image value, or undefined to remove it.
 * @returns {any}
 */
export function withFallback(current, image) {
  if (isMap(current)) return mapValue(current, { fallback: image });
  if (isTagCloud(current)) return tagCloudValue(current, { fallback: image });
  if (isTable(current)) return tableValue(current, { fallback: image });
  if (isGraph(current)) return graphValue(current, { fallback: image });
  if (current && typeof current.pdf === 'string') return pdfValue(current, { fallback: image });
  if (isVideo(current)) return videoValue(current, { fallback: image });
  return webValue(current, { fallback: image });
}
