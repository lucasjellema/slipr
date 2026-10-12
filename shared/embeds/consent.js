// @ts-check
/**
 * Click-to-load consent for embeds that contact another server (I-070, D-011).
 *
 * External content waits behind a "Load" button until the reader agrees, so no
 * request leaves the browser without consent (D-010). Consent is remembered per
 * site (origin) in sessionStorage, so it lasts until the tab closes and nothing
 * persists. An author can mark one embed `load: "auto"` to skip the question.
 *
 * DOM-free: the storage is passed in (tests use a fake).
 */

const KEY = 'slipr-embed-consent';

/**
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} ConsentStorage
 */

/**
 * The origin an embed URL contacts, or null for anything that stays local
 * (a file next to show.json, a `blob:` URL, an unparsable value).
 * @param {string} url  Absolute or relative URL.
 * @returns {string | null}
 */
export function externalOrigin(url) {
  if (!/^\s*https?:/i.test(String(url ?? ''))) return null;
  try {
    return new URL(String(url).trim()).origin;
  } catch {
    return null;
  }
}

/**
 * The browser's sessionStorage, or null where it is missing or blocked.
 * @returns {ConsentStorage | null}
 */
export function sessionConsentStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {ConsentStorage | null} storage
 * @returns {string[]}
 */
function readList(storage) {
  try {
    const list = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Has the reader agreed to load content from this origin (in this tab)?
 * @param {string} origin
 * @param {ConsentStorage | null} [storage]
 */
export function hasConsent(origin, storage = sessionConsentStorage()) {
  return readList(storage).includes(origin);
}

/**
 * Remember that the reader agreed to load content from this origin.
 * Without storage the consent simply isn't remembered.
 * @param {string} origin
 * @param {ConsentStorage | null} [storage]
 */
export function grantConsent(origin, storage = sessionConsentStorage()) {
  const list = readList(storage);
  if (list.includes(origin)) return;
  try {
    storage?.setItem(KEY, JSON.stringify([...list, origin]));
  } catch {
    // storage full or blocked: this click still loads, the next one asks again
  }
}
