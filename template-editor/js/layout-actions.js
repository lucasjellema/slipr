// @ts-check
/**
 * Every change the layout composer makes (I-111, D-019), as pure functions
 * like `actions.js`: slot settings on any layout; for composed layouts their
 * boxes, written to the layout file, its block in theme.css and template.json.
 * DOM-free.
 */
import { sheetTexts, relativePath, uniquePath } from './actions.js';
import { sheetPaths } from './template-files.js';
import {
  readComposed, writeComposedHtml, writeComposedCss, removeComposedCss, harvestLooks, looksFor, slotMarkup,
  renameSlotMarkup, rootClasses, copyLayout, arrange, isComposedHtml, isSlotName, pictureMarkup, nextPictureId,
  moveInOrder, SLOT_TYPES,
} from './composer/layout-model.js';
import { clampArea } from './composer/composer-css.js';

/**
 * @typedef {import('./actions.js').TemplateState} TemplateState
 * @typedef {import('./actions.js').FileContent} FileContent
 * @typedef {import('./composer/layout-model.js').ComposedLayout} ComposedLayout
 * @typedef {import('./composer/layout-model.js').ComposedBox} ComposedBox
 * @typedef {import('./composer/layout-model.js').Look} Look
 * @typedef {import('./composer/composer-css.js').Area} Area
 */

/** The slot settings the composer edits on every layout. */
export const SLOT_PROPS = /** @type {const} */ (['label', 'help', 'required', 'maxLength', 'maxItems']);

/** @type {WeakMap<Map<string, FileContent>, { layouts: any, looks: Look[] }>} */
const looksCache = new WeakMap();

/**
 * The looks of the template's slots (cached per files map and layout list).
 * @param {TemplateState} state
 * @returns {Look[]}
 */
export function looksOf(state) {
  const cached = looksCache.get(state.files);
  if (cached && cached.layouts === state.template.layouts) return cached.looks;
  const looks = harvestLooks(state.template, (path) => textFile(state, path));
  looksCache.set(state.files, { layouts: state.template.layouts, looks });
  return looks;
}

/**
 * A text file of the template, or null.
 * @param {Pick<TemplateState, 'files'>} state @param {string} path
 */
export function textFile(state, path) {
  const v = state.files.get(path);
  return typeof v === 'string' ? v : null;
}

/**
 * A layout's entry in template.json, or null.
 * @param {TemplateState} state @param {string} id
 */
export function layoutDef(state, id) {
  return (state.template.layouts ?? []).find((/** @type {any} */ l) => l.id === id) ?? null;
}

/**
 * A composed layout's model, or null for a hand-written (or missing) one.
 * @param {TemplateState} state @param {string} id
 * @returns {ComposedLayout | null}
 */
export function composedOf(state, id) {
  const def = layoutDef(state, id);
  const html = def ? textFile(state, def.file) : null;
  if (!html) return null;
  return readComposed(id, html, sheetTexts(state).theme);
}

/**
 * @param {TemplateState} state @param {string} id @param {(def: any) => any} change
 * @returns {TemplateState}
 */
function withLayoutDef(state, id, change) {
  const layouts = state.template.layouts ?? [];
  const i = layouts.findIndex((/** @type {any} */ l) => l.id === id);
  if (i < 0) throw new Error(`Unknown layout ${id}.`);
  const next = change(layouts[i]);
  if (next === layouts[i]) return state;
  return { ...state, template: { ...state.template, layouts: layouts.map((/** @type {any} */ l, /** @type {number} */ j) => (j === i ? next : l)) } };
}

/**
 * Set a layout's name or description (an empty description is removed).
 * @param {TemplateState} state @param {string} id @param {'name' | 'description'} field @param {string} value
 * @returns {TemplateState}
 */
export function setLayoutMeta(state, id, field, value) {
  if (field !== 'name' && field !== 'description') throw new Error(`${field} cannot be edited here.`);
  return withLayoutDef(state, id, (def) => {
    if ((def[field] ?? '') === value) return def;
    const next = { ...def, [field]: value };
    if (field === 'description' && !value) delete next.description;
    return next;
  });
}

/**
 * Set (or with null, '' or false: remove) a slot setting: label, help,
 * required, maxLength or maxItems. Names and types stay: shows depend on them.
 * @param {TemplateState} state @param {string} id @param {string} slotName
 * @param {typeof SLOT_PROPS[number]} prop @param {string | number | boolean | null} value
 * @returns {TemplateState}
 */
export function setSlotProp(state, id, slotName, prop, value) {
  if (!SLOT_PROPS.includes(prop)) throw new Error(`${prop} cannot be edited here.`);
  if ((prop === 'maxLength' || prop === 'maxItems') && value !== null && !(Number.isInteger(value) && Number(value) >= 1)) {
    throw new Error('A maximum is a whole number of at least 1.');
  }
  return withLayoutDef(state, id, (def) => {
    const slots = def.slots ?? [];
    const i = slots.findIndex((/** @type {any} */ s) => s.name === slotName);
    if (i < 0) throw new Error(`Layout ${id} has no slot ${slotName}.`);
    const slot = slots[i];
    const remove = value === null || value === '' || value === false;
    if (remove ? !(prop in slot) : slot[prop] === value) return def;
    const next = { ...slot };
    if (remove) delete next[prop];
    else next[prop] = value;
    return { ...def, slots: slots.map((/** @type {any} */ s, /** @type {number} */ j) => (j === i ? next : s)) };
  });
}

/**
 * Change a composed layout: its model and its slots, written to its file,
 * its block in the theme stylesheet and template.json.
 * @param {TemplateState} state @param {string} id
 * @param {(layout: ComposedLayout, slots: any[]) => { layout: ComposedLayout, slots?: any[] }} change
 * @returns {TemplateState}
 */
export function updateComposed(state, id, change) {
  const layout = composedOf(state, id);
  const def = layoutDef(state, id);
  if (!layout || !def) throw new Error(`Layout ${id} is not made with the composer.`);
  const result = change(layout, def.slots ?? []);
  if (result.layout === layout && (!result.slots || result.slots === def.slots)) return state;
  return writeComposed(state, def, result.layout, result.slots ?? def.slots ?? []);
}

/**
 * @param {TemplateState} state @param {any} def @param {ComposedLayout} layout @param {any[]} slots
 * @returns {TemplateState}
 */
function writeComposed(state, def, layout, slots) {
  const files = new Map(state.files);
  files.set(def.file, writeComposedHtml(layout));
  files.set(sheetPaths(state.template).theme, writeComposedCss(sheetTexts(state).theme, layout));
  return withLayoutDef({ ...state, files }, def.id, (d) => (JSON.stringify(d.slots ?? []) === JSON.stringify(slots) ? d : { ...d, slots }));
}

/**
 * What is wrong with an id for a new layout, or null.
 * @param {TemplateState} state @param {string} id
 * @returns {string | null}
 */
export function layoutIdProblem(state, id) {
  if (!isSlotName(id)) return 'An id has letters, digits, hyphens and underscores, and starts with a letter or digit.';
  if (id === 'base') return 'The id "base" is reserved for the composer\'s shared rules.';
  if (layoutDef(state, id)) return `The template already has a layout "${id}".`;
  return null;
}

/**
 * Add a composed layout: empty but for a title, or a copy of another
 * layout's slots (and logo), arranged.
 * @param {TemplateState} state
 * @param {{ id: string, name: string, description?: string, from?: string | null }} options
 * @returns {TemplateState}
 */
export function addLayout(state, options) {
  const problem = layoutIdProblem(state, options.id);
  if (problem) throw new Error(problem);
  let { usual: classes } = rootClasses(state.template, (p) => textFile(state, p));
  /** @type {string | null} */
  let background = null;
  /** @type {{ slots: any[], boxes: ComposedBox[] }} */
  let content;
  const source = options.from ? layoutDef(state, options.from) : null;
  if (source) {
    const copy = copyLayout(source, textFile(state, source.file) ?? '', composedOf(state, source.id));
    ({ classes, background } = copy);
    content = copy;
  } else {
    const look = looksFor(looksOf(state), 'text', 'title')[0];
    const slots = [{ name: 'title', type: 'text', label: 'Title', required: true, maxLength: 70 }];
    content = { slots, boxes: arrange([{ id: 'title', slot: 'title', markup: slotMarkup(look, 'title'), area: { x: 0, y: 0, w: 10, h: 10 }, fit: null }], slots) };
  }
  const file = uniquePath(state.files, `layouts/${options.id}.html`);
  /** @type {any} */
  const def = { id: options.id, name: options.name.trim() || options.id };
  if (options.description) def.description = options.description;
  def.file = file;
  def.slots = content.slots;
  const files = new Map(state.files);
  files.set(file, '');
  const next = { ...state, files, template: { ...state.template, layouts: [...(state.template.layouts ?? []), def] } };
  return writeComposed(next, def, { id: options.id, classes, background, boxes: content.boxes }, content.slots);
}

/**
 * Remove a composed layout: its entry, its block (and the base block when it
 * was the last) and its file (deleted from the folder when saved).
 * @param {TemplateState} state @param {string} id
 * @returns {TemplateState}
 */
export function removeLayout(state, id) {
  const def = layoutDef(state, id);
  if (!def || !composedOf(state, id)) throw new Error('Only layouts made with the composer can be removed here.');
  const layouts = state.template.layouts.filter((/** @type {any} */ l) => l.id !== id);
  const files = new Map(state.files);
  files.delete(def.file);
  const lastOne = !layouts.some((/** @type {any} */ l) => isComposedHtml(files.get(l.file)));
  files.set(sheetPaths(state.template).theme, removeComposedCss(sheetTexts(state).theme, id, lastOne));
  return { ...state, files, template: { ...state.template, layouts } };
}

/** @param {string} name */
const labelFromName = (name) => name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]+/g, ' ');

/**
 * Add a slot box (and its slot) to a composed layout.
 * @param {TemplateState} state @param {string} id
 * @param {{ type: string, name: string, lookKey?: string | null }} slot
 * @returns {TemplateState}
 */
export function addSlotBox(state, id, slot) {
  if (!SLOT_TYPES.some(([t]) => t === slot.type)) throw new Error(`Unknown slot type ${slot.type}.`);
  if (!isSlotName(slot.name)) throw new Error('A slot name has letters, digits, hyphens and underscores.');
  return updateComposed(state, id, (layout, slots) => {
    if (slots.some((s) => s.name === slot.name) || layout.boxes.some((b) => b.id === slot.name)) throw new Error(`The layout already has "${slot.name}".`);
    const looks = looksFor(looksOf(state), slot.type, slot.name);
    const look = looks.find((l) => l.key === slot.lookKey) ?? looks[0];
    /** @type {any} */
    const def = { name: slot.name, type: slot.type, label: labelFromName(slot.name) };
    if (slot.type === 'cards') def.fields = structuredClone(look.fields ?? []);
    const box = { id: slot.name, slot: slot.name, markup: slotMarkup(look, slot.name), area: { x: 20, y: 30, w: 60, h: 40 }, fit: null };
    return { layout: { ...layout, boxes: [...layout.boxes, box] }, slots: [...slots, def] };
  });
}

/**
 * Change the look of a slot box (a cards look brings its card fields).
 * @param {TemplateState} state @param {string} id @param {string} boxId @param {string} lookKey
 * @returns {TemplateState}
 */
export function setBoxLook(state, id, boxId, lookKey) {
  return updateComposed(state, id, (layout, slots) => {
    const box = layout.boxes.find((b) => b.id === boxId);
    const slot = slots.find((s) => s.name === box?.slot);
    const look = slot ? looksFor(looksOf(state), slot.type, slot.name).find((l) => l.key === lookKey) : null;
    if (!box || !slot || !look) return { layout };
    const nextSlots = slot.type === 'cards' ? slots.map((s) => (s === slot ? { ...s, fields: structuredClone(look.fields ?? []) } : s)) : slots;
    return { layout: { ...layout, boxes: layout.boxes.map((b) => (b === box ? { ...b, markup: slotMarkup(look, slot.name) } : b)) }, slots: nextSlots };
  });
}

/**
 * Rename a slot of a composed layout (its box follows).
 * @param {TemplateState} state @param {string} id @param {string} from @param {string} to
 * @returns {TemplateState}
 */
export function renameSlot(state, id, from, to) {
  if (from === to) return state;
  if (!isSlotName(to)) throw new Error('A slot name has letters, digits, hyphens and underscores.');
  return updateComposed(state, id, (layout, slots) => {
    if (slots.some((s) => s.name === to) || layout.boxes.some((b) => b.id === to)) throw new Error(`The layout already has "${to}".`);
    return {
      layout: { ...layout, boxes: layout.boxes.map((b) => (b.slot === from ? { ...b, id: to, slot: to, markup: renameSlotMarkup(b.markup, to) } : b)) },
      slots: slots.map((s) => (s.name === from ? { ...s, name: to } : s)),
    };
  });
}

/**
 * Copy an image into the template's `assets/decor/` (for a picture box).
 * @param {TemplateState} state @param {string} fileName @param {Blob | string} content
 * @returns {{ state: TemplateState, path: string }}
 */
export function addImageFile(state, fileName, content) {
  const name = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/\.(svg|png|jpe?g|webp|gif|avif)$/.test(name)) throw new Error('Choose an SVG, PNG, JPEG, WebP, GIF or AVIF image.');
  const path = uniquePath(state.files, `assets/decor/${name}`);
  const files = new Map(state.files);
  files.set(path, content);
  return { state: { ...state, files }, path };
}

/**
 * Add a picture box (an image of the template) to a composed layout.
 * @param {TemplateState} state @param {string} id @param {string} path  Relative to the template folder.
 * @returns {TemplateState}
 */
export function addPictureBox(state, id, path) {
  const def = layoutDef(state, id);
  if (!def) throw new Error(`Unknown layout ${id}.`);
  if (!state.files.has(path)) throw new Error(`The template has no file ${path}.`);
  return updateComposed(state, id, (layout) => ({
    layout: { ...layout, boxes: [...layout.boxes, { id: nextPictureId(layout), slot: null, markup: pictureMarkup(relativePath(def.file, path)), area: { x: 60, y: 10, w: 30, h: 30 }, fit: 'contain' }] },
  }));
}

/**
 * Change one box's area or fit.
 * @param {TemplateState} state @param {string} id @param {string} boxId
 * @param {{ area?: Area, fit?: 'contain' | 'cover' | 'fill' | null }} patch
 * @returns {TemplateState}
 */
export function setBox(state, id, boxId, patch) {
  if (patch.fit !== undefined && patch.fit !== null && !['contain', 'cover', 'fill'].includes(patch.fit)) throw new Error(`Unknown fit ${patch.fit}.`);
  return updateComposed(state, id, (layout) => {
    const box = layout.boxes.find((b) => b.id === boxId);
    if (!box) return { layout };
    const next = { ...box, ...patch, area: patch.area ? clampArea(patch.area) : box.area };
    if (JSON.stringify(next) === JSON.stringify(box)) return { layout };
    return { layout: { ...layout, boxes: layout.boxes.map((b) => (b === box ? next : b)) } };
  });
}

/**
 * Remove a box (a slot box takes its slot along).
 * @param {TemplateState} state @param {string} id @param {string} boxId
 * @returns {TemplateState}
 */
export function removeBox(state, id, boxId) {
  return updateComposed(state, id, (layout, slots) => {
    const box = layout.boxes.find((b) => b.id === boxId);
    if (!box) return { layout };
    return { layout: { ...layout, boxes: layout.boxes.filter((b) => b !== box) }, slots: slots.filter((s) => s.name !== box.slot) };
  });
}

/**
 * Move a box up (-1: drawn and read earlier) or down (1) the order. The
 * slots follow their boxes, so the show editor lists them in that order.
 * @param {TemplateState} state @param {string} id @param {string} boxId @param {-1 | 1} delta
 * @returns {TemplateState}
 */
export function moveBoxInOrder(state, id, boxId, delta) {
  return updateComposed(state, id, (layout, slots) => {
    const next = moveInOrder(layout, boxId, delta);
    if (next === layout) return { layout };
    const order = next.boxes.map((b) => b.slot);
    return { layout: next, slots: [...slots].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)) };
  });
}

/**
 * Set a composed layout's background colour token (null: none).
 * @param {TemplateState} state @param {string} id @param {string | null} token
 * @returns {TemplateState}
 */
export function setLayoutBackground(state, id, token) {
  if (token !== null && !/^--[\w-]+$/.test(token)) throw new Error('The background is a colour token.');
  return updateComposed(state, id, (layout) => (layout.background === token ? { layout } : { layout: { ...layout, background: token } }));
}

/**
 * Turn a root class (a variant such as `cnc-dark`) on or off.
 * @param {TemplateState} state @param {string} id @param {string} cls @param {boolean} on
 * @returns {TemplateState}
 */
export function setLayoutClass(state, id, cls, on) {
  if (!/^[A-Za-z_][\w-]*$/.test(cls)) throw new Error(`Not a class name: ${cls}`);
  return updateComposed(state, id, (layout) => {
    if (layout.classes.includes(cls) === on) return { layout };
    return { layout: { ...layout, classes: on ? [...layout.classes, cls] : layout.classes.filter((c) => c !== cls) } };
  });
}
