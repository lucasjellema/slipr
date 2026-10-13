// @ts-check
/**
 * Presenter tools in audience mode (I-003): a laser pointer (L), a spotlight
 * (K) and a pen to draw on the slide (D). One tool at a time; the same key or
 * Esc turns it off. With the pen, X erases the current slide's drawing.
 *
 * Drawings belong to their slide and stay while presenting (go back and they
 * are still there); nothing is stored, so a reload starts clean (D-010).
 * Strokes are kept in fractions of the slide, so they follow the slide when
 * the window is resized.
 *
 * The tools live in one layer on top of the deck, outside Reveal's element,
 * so drawing with touch never swipes to another slide. The pen and the strokes
 * use the template's accent color; the laser its own `--slipr-laser-color`.
 *
 * `strokePath` and `toolAfterKey` are DOM-free (tested in Node).
 */

/** @typedef {'laser' | 'spotlight' | 'pen'} Tool */
/** @typedef {{ x: number, y: number }[]} Stroke */

/** Keys (key codes) and their tools. */
export const TOOL_KEYS = /** @type {const} */ ({ 76: 'laser', 75: 'spotlight', 68: 'pen' });

/**
 * The tool after pressing a tool's key: that tool, or none when it was on.
 * @param {Tool | null} current @param {Tool} pressed
 * @returns {Tool | null}
 */
export function toolAfterKey(current, pressed) {
  return current === pressed ? null : pressed;
}

/**
 * A stroke in fractions of the slide as points in pixels of a box.
 * @param {Stroke} stroke @param {{ width: number, height: number }} box
 * @returns {{ x: number, y: number }[]}
 */
export function strokePath(stroke, box) {
  return stroke.map((p) => ({ x: p.x * box.width, y: p.y * box.height }));
}

/**
 * Add the tools to an initialised Reveal deck.
 * @param {any} deck
 * @returns {{ setTool: (tool: Tool | null) => void, tool: () => Tool | null }}
 */
export function mountPresenterTools(deck) {
  const doc = document;
  /** @type {Tool | null} */
  let tool = null;
  /** Strokes per slide (Reveal's h.v index). @type {Map<string, Stroke[]>} */
  const drawings = new Map();
  const slideKey = () => {
    const { h, v } = deck.getIndices();
    return `${h}.${v ?? 0}`;
  };

  const layer = doc.createElement('div');
  layer.className = 'slipr-tools';
  layer.setAttribute('aria-hidden', 'true');
  const laser = doc.createElement('div');
  laser.className = 'slipr-tools-laser';
  const spotlight = doc.createElement('div');
  spotlight.className = 'slipr-tools-spotlight';
  const canvas = doc.createElement('canvas');
  canvas.className = 'slipr-tools-canvas';
  layer.append(canvas, spotlight, laser);
  doc.body.append(layer);
  const status = doc.createElement('div');
  status.className = 'slipr-tools-status';
  status.setAttribute('role', 'status');
  doc.body.append(status);

  /** The slide area on screen (the scaled 1920 × 1080 box). */
  const slideBox = () => /** @type {HTMLElement} */ (deck.getSlidesElement()).getBoundingClientRect();
  const accent = () => getComputedStyle(doc.documentElement).getPropertyValue('--slipr-color-accent').trim() || '#F2A900';

  // ---- drawing
  const redraw = () => {
    const box = slideBox();
    const ratio = window.devicePixelRatio || 1;
    Object.assign(canvas.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.strokeStyle = accent();
    ctx.lineWidth = Math.max(2, box.width * 0.004);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of drawings.get(slideKey()) ?? []) {
      const points = strokePath(stroke, box);
      if (!points.length) continue;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      if (points.length === 1) ctx.lineTo(points[0].x + 0.1, points[0].y);
      ctx.stroke();
    }
  };
  /** @type {Stroke | null} */
  let current = null;
  /** @param {PointerEvent} e */
  const at = (e) => {
    const box = slideBox();
    return { x: Math.round(((e.clientX - box.left) / box.width) * 10000) / 10000, y: Math.round(((e.clientY - box.top) / box.height) * 10000) / 10000 };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (tool !== 'pen') return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer: drawing still works while over the canvas.
    }
    current = [at(e)];
    const key = slideKey();
    drawings.set(key, [...(drawings.get(key) ?? []), current]);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    current.push(at(e));
    redraw();
  });
  const endStroke = () => { current = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ---- laser and spotlight follow the pointer
  doc.addEventListener('pointermove', (e) => {
    if (tool === 'laser') {
      laser.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    } else if (tool === 'spotlight') {
      spotlight.style.setProperty('--x', `${e.clientX}px`);
      spotlight.style.setProperty('--y', `${e.clientY}px`);
    }
  });

  /** @param {Tool | null} next */
  function setTool(next) {
    tool = next;
    layer.dataset.tool = next ?? '';
    doc.body.dataset.sliprTool = next ?? '';
    status.textContent = next === 'laser' ? 'Laser pointer on' : next === 'spotlight' ? 'Spotlight on'
      : next === 'pen' ? 'Pen on: draw on the slide, X erases, Esc stops' : '';
    if (next) redraw();
  }

  for (const [code, name] of /** @type {[string, Tool][]} */ (Object.entries(TOOL_KEYS))) {
    const label = name === 'laser' ? 'Laser pointer' : name === 'spotlight' ? 'Spotlight' : 'Draw on the slide';
    deck.addKeyBinding({ keyCode: Number(code), key: name === 'laser' ? 'L' : name === 'spotlight' ? 'K' : 'D', description: label }, () => setTool(toolAfterKey(tool, name)));
  }
  // Esc and X only while a tool is on: before Reveal's own Esc (overview).
  window.addEventListener('keydown', (e) => {
    if (!tool || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      setTool(null);
    } else if ((e.key === 'x' || e.key === 'X') && tool === 'pen') {
      e.preventDefault();
      e.stopImmediatePropagation();
      drawings.delete(slideKey());
      redraw();
    }
  }, true);

  // Each slide shows its own drawing; the overview and a pause turn tools off.
  deck.on('slidechanged', redraw);
  deck.on('resize', redraw);
  window.addEventListener('resize', redraw);
  deck.on('overviewshown', () => setTool(null));
  deck.on('paused', () => setTool(null));
  redraw();

  return { setTool, tool: () => tool };
}
