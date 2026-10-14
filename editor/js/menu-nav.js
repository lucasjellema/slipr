// @ts-check
/**
 * Keyboard movement inside a menu (I-102), following the WAI-ARIA menu-button
 * pattern. DOM-free, so it can be tested in Node.
 */

/**
 * The item a key moves to, among the menu's enabled, visible items.
 * Arrow keys wrap around; Home and End go to the first and last item.
 * @param {string} key  `KeyboardEvent.key`
 * @param {number} current  Index of the focused item, or -1 when none has focus.
 * @param {number} count  Number of items.
 * @returns {number | null}  The new index, or null when the key does not move.
 */
export function menuTargetIndex(key, current, count) {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The next item whose label starts with a typed character (type-ahead),
 * searching from the item after the current one and wrapping around.
 * @param {string} char
 * @param {number} current
 * @param {string[]} labels
 * @returns {number | null}
 */
export function menuTypeAheadIndex(char, current, labels) {
  const wanted = char.toLowerCase();
  if (!/^\S$/u.test(wanted)) return null;
  for (let step = 1; step <= labels.length; step++) {
    const i = (current + step + labels.length) % labels.length;
    // Skip leading symbols such as "☀ " so "l" finds "☀ Light".
    const text = labels[i].replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
    if (text.startsWith(wanted)) return i;
  }
  return null;
}
