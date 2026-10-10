// @ts-check
/**
 * Geometry for pins on slide visuals. Pure (rectangles in, fractions out),
 * so it is tested in Node. The DOM side lives in annotations.js.
 *
 * A pin stores its position twice:
 *  - x / y: fractions within the object it was placed on (a slot or list
 *    item), so it moves with that object when the slide reflows
 *  - cx / cy: fractions within the whole slide canvas, as a fallback when the
 *    object can no longer be found
 */

/** @typedef {{ left: number, top: number, width: number, height: number }} Rect */

/** @param {number} v */
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
/** @param {number} v */
const round4 = (v) => Math.round(v * 10000) / 10000;

/**
 * @param {Rect} object   Box of the object clicked (or the canvas itself).
 * @param {Rect} canvas   Box of the slide canvas.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ x: number, y: number, cx: number, cy: number }}
 */
export function pinFromPoint(object, canvas, clientX, clientY) {
  return {
    x: round4(clamp01((clientX - object.left) / (object.width || 1))),
    y: round4(clamp01((clientY - object.top) / (object.height || 1))),
    cx: round4(clamp01((clientX - canvas.left) / (canvas.width || 1))),
    cy: round4(clamp01((clientY - canvas.top) / (canvas.height || 1))),
  };
}

/**
 * Where to draw a pin, as percentages of its container (the slide frame).
 * @param {{ x: number, y: number, cx: number, cy: number }} pin
 * @param {Rect | null} object  Current box of the pinned object, or null if it is gone.
 * @param {Rect} canvas
 * @param {Rect} frame          The positioned container the pin is drawn in.
 * @returns {{ left: number, top: number, approximate: boolean }}
 */
export function pinPosition(pin, object, canvas, frame) {
  const px = object ? object.left + pin.x * object.width : canvas.left + pin.cx * canvas.width;
  const py = object ? object.top + pin.y * object.height : canvas.top + pin.cy * canvas.height;
  return {
    left: Math.round(((px - frame.left) / (frame.width || 1)) * 10000) / 100,
    top: Math.round(((py - frame.top) / (frame.height || 1)) * 10000) / 100,
    approximate: !object,
  };
}

/**
 * A readable name for a pinned object.
 * @param {{ slot: string | null, item: number | null, text: string, isImage: boolean, kind?: 'bullet' | 'card' }} target
 */
export function describeTarget(target) {
  const short = (/** @type {string} */ t) => {
    const s = t.trim().replace(/\s+/g, ' ');
    return s.length > 48 ? `${s.slice(0, 47)}…` : s;
  };
  if (target.item !== null) {
    const noun = target.kind === 'card' ? 'Card' : 'Bullet';
    const text = short(target.text);
    return text ? `${noun} ${target.item + 1}: “${text}”` : `${noun} ${target.item + 1}`;
  }
  if (!target.slot) return 'Slide';
  const name = humanise(target.slot);
  if (target.isImage) return name.toLowerCase() === 'image' ? 'Image' : `${name} (image)`;
  const text = short(target.text);
  return text ? `${name}: “${text}”` : name;
}

/** "leftTitle" → "Left title", "image" → "Image". */
export function humanise(/** @type {string} */ name) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
