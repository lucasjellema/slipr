// @ts-check
/**
 * Ergonomics & Gestures for mobile remote (I-002: Phone as Remote Control).
 *
 * Provides:
 *   1. Haptic vibration feedback on button taps.
 *   2. Screen Wake Lock to prevent the phone display from sleeping.
 *   3. Touch swipe gesture detection (swipe left = next, swipe right = prev).
 */

/**
 * Trigger subtle haptic vibration on tactile actions.
 * @param {number} [ms]
 */
export function vibrate(ms = 35) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  } catch {}
}

/** @type {WakeLockSentinel | null} */
let wakeLockSentinel = null;

/**
 * Request Screen Wake Lock to keep phone screen awake during presentations.
 * @returns {Promise<boolean>}
 */
export async function requestWakeLock() {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      // @ts-ignore
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel?.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    }
  } catch {}
  return false;
}

/**
 * Keep wake lock active when returning to the tab from lock screen or multitasking.
 */
export function setupWakeLockAutoRenew() {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', async () => {
    if (wakeLockSentinel === null && document.visibilityState === 'visible') {
      await requestWakeLock();
    }
  });
}

/**
 * Calculate horizontal swipe direction.
 * @param {number} deltaX
 * @param {number} deltaY
 * @param {{ minDistance?: number, maxOffAxis?: number }} [options]
 * @returns {'left' | 'right' | null}
 */
export function detectSwipeDirection(deltaX, deltaY, options = {}) {
  const minDistance = options.minDistance ?? 50;
  const maxOffAxis = options.maxOffAxis ?? 80;

  if (Math.abs(deltaY) > maxOffAxis) return null;
  if (deltaX < -minDistance) return 'left';
  if (deltaX > minDistance) return 'right';
  return null;
}

/**
 * Attach swipe gesture listeners to an element.
 * @param {HTMLElement} element
 * @param {() => void} onSwipeLeft  (usually Next slide)
 * @param {() => void} onSwipeRight (usually Prev slide)
 * @param {{ minDistance?: number, maxOffAxis?: number }} [options]
 */
export function attachSwipeHandler(element, onSwipeLeft, onSwipeRight, options = {}) {
  let startX = 0;
  let startY = 0;

  element.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  element.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return;
    const deltaX = e.changedTouches[0].clientX - startX;
    const deltaY = e.changedTouches[0].clientY - startY;

    const direction = detectSwipeDirection(deltaX, deltaY, options);
    if (direction === 'left') {
      onSwipeLeft();
    } else if (direction === 'right') {
      onSwipeRight();
    }
  }, { passive: true });
}
