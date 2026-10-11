// @ts-check
/**
 * Value shapes for the tabs, embed and slide-ref block editors (I-036).
 * DOM-free. Never produces a shape the format rejects: tabs keep at least one
 * tab with a non-empty label; an embed height is an integer of at least 100.
 */

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
