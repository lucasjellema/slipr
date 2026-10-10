// @ts-check
/**
 * URLs for switching between audience and reader mode at the same slide.
 * Identity is always the slide id (never an index), and other parameters
 * (show, profile, depth, path) are preserved.
 *
 *   audience: ?show=…#/s-architecture
 *   reader:   ?show=…&mode=reader#s-architecture
 */

/**
 * @param {string | null | undefined} slideId
 * @param {string} [from]  Current URL (default: location.href).
 */
export function audienceUrl(slideId, from = location.href) {
  const url = new URL(from);
  url.searchParams.delete('mode');
  url.hash = slideId ? `#/${slideId}` : '';
  return url.href;
}

/**
 * @param {string | null | undefined} slideId
 * @param {string} [from]
 */
export function readerUrl(slideId, from = location.href) {
  const url = new URL(from);
  url.searchParams.set('mode', 'reader');
  url.hash = slideId ? `#${slideId}` : '';
  return url.href;
}

/**
 * Parse a reader-mode hash: "#s-05" or "#s-05/b3".
 * @param {string} hash
 * @returns {{ slideId: string | null, blockId: string | null }}
 */
export function parseReaderHash(hash) {
  const raw = decodeURIComponent(hash.replace(/^#\/?/, ''));
  if (!raw) return { slideId: null, blockId: null };
  const [slideId, blockId] = raw.split('/');
  return { slideId: slideId || null, blockId: blockId || null };
}
