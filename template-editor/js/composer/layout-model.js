// @ts-check
/**
 * Composed layouts (I-111, D-019): read from their layout file and their
 * block in theme.css, written back; the template's own slot looks; new
 * layouts, copies and a first arrangement. DOM-free.
 */
import { parseElements, allElements, withAttributes, classesOf, escapeAttr } from './html-elements.js';
import { setBlock, findBlock, baseBlock, layoutBlock, readLayoutBlock, clampArea } from './composer-css.js';

/**
 * @typedef {import('./composer-css.js').Area} Area
 *
 * @typedef {object} ComposedBox
 * @property {string} id              `data-box`: the slot name, or `picture-<n>`.
 * @property {string | null} slot     The slot name; null for a picture.
 * @property {string} markup          The element, without `data-box`.
 * @property {Area} area
 * @property {string | null} fit      object-fit (pictures): contain, cover or fill; null = the default.
 *
 * @typedef {object} ComposedLayout
 * @property {string} id
 * @property {string[]} classes       Root classes besides slipr-layout, slipr-composed, slipr-composed--<id>.
 * @property {string | null} background  A colour token, or null.
 * @property {ComposedBox[]} boxes    In order: later boxes are drawn on top; also the reading order.
 *
 * @typedef {object} Look  How the template draws a kind of slot.
 * @property {string} key             Unique: type + opening tag.
 * @property {string} type            Slot type.
 * @property {string} markup          The element, without `data-slot`.
 * @property {string} label           e.g. `cnc-title · Text (title)`
 * @property {string[]} names         Slot names it is used for.
 * @property {number} count
 * @property {any[] | undefined} fields  Card fields (cards looks).
 */

/** Every slot type the composer offers, in menu order, with a label. */
export const SLOT_TYPES = /** @type {const} */ ([
  ['text', 'Text'], ['richtext', 'Rich text'], ['list', 'List'], ['image', 'Image'], ['quote', 'Quote'], ['code', 'Code'],
  ['cards', 'Cards'], ['diagram', 'Diagram'], ['web', 'Web page'], ['pdf', 'PDF'], ['video', 'Video'],
  ['graph', 'Graph'], ['map', 'Map'], ['table', 'Table'], ['tag-cloud', 'Tag cloud'],
]);

/** Slot types whose renderer may put a caption next to the element: wrapped in a figure. */
const FIGURE_TYPES = new Set(['diagram', 'web', 'pdf', 'video', 'graph', 'map', 'table', 'tag-cloud']);

/** Text slot types: they take a maximum length. */
export const LENGTH_TYPES = new Set(['text', 'richtext']);
/** Slot types that take a maximum number of items. */
export const ITEM_TYPES = new Set(['list', 'cards']);

const ROOT = 'slipr-composed';

/** @param {string} type */
export function typeLabel(type) {
  return SLOT_TYPES.find(([t]) => t === type)?.[1] ?? type;
}

/**
 * Is this layout file made by the composer?
 * @param {unknown} html
 */
export function isComposedHtml(html) {
  if (typeof html !== 'string') return false;
  const root = parseElements(html)[0];
  return Boolean(root && classesOf(root).includes(ROOT));
}

/**
 * A composed layout read from its file and its block.
 * @param {string} id  The layout id.
 * @param {string} html @param {string} css  The theme stylesheet.
 * @returns {ComposedLayout | null}  Null when the file is not a composed layout.
 */
export function readComposed(id, html, css) {
  const root = parseElements(html)[0];
  if (!root || !classesOf(root).includes(ROOT)) return null;
  const block = readLayoutBlock(css, id);
  const own = new Set(['slipr-layout', ROOT, `${ROOT}--${id}`]);
  let pictures = 0;
  const boxes = root.children.map((el, i) => {
    const markup = withAttributes(html.slice(el.start, el.end), { 'data-box': null });
    const slotEl = allElements([el]).find((e) => e.attrs.has('data-slot'));
    const slot = slotEl ? /** @type {string} */ (slotEl.attrs.get('data-slot')) : null;
    if (!slot) pictures += 1;
    const boxId = el.attrs.get('data-box') ?? slot ?? `picture-${pictures}`;
    const placed = block?.boxes.get(boxId);
    return { id: boxId, slot, markup, area: placed?.area ?? clampArea({ x: 10, y: 10 + (i % 8) * 10, w: 80, h: 10 }), fit: placed?.fit ?? null };
  });
  return { id, classes: classesOf(root).filter((c) => !own.has(c)), background: block?.background ?? null, boxes };
}

/**
 * The layout file of a composed layout.
 * @param {ComposedLayout} layout
 * @returns {string}
 */
export function writeComposedHtml(layout) {
  const classes = ['slipr-layout', ROOT, `${ROOT}--${layout.id}`, ...layout.classes].join(' ');
  const boxes = layout.boxes.map((b) => `  ${withAttributes(b.markup, { 'data-box': b.id }).replace(/\n/g, '\n  ')}`);
  return `<!-- Made with the template editor's layout composer (I-111). The boxes are placed by the
     slipr-composer block "${layout.id}" in theme.css; later boxes are drawn on top. -->
<div class="${escapeAttr(classes)}">
${boxes.join('\n')}
</div>
`;
}

/**
 * The theme stylesheet with the base block (once) and this layout's block.
 * @param {string} css @param {ComposedLayout} layout
 * @returns {string}
 */
export function writeComposedCss(css, layout) {
  const withBase = findBlock(css, 'base') ? css : setBlock(css, 'base', baseBlock());
  return setBlock(withBase, layout.id, layoutBlock(layout.id, layout));
}

/**
 * The theme stylesheet without a layout's block (and without the base block
 * when no composed layout is left).
 * @param {string} css @param {string} id @param {boolean} lastOne
 */
export function removeComposedCss(css, id, lastOne) {
  const out = setBlock(css, id, null);
  return lastOne ? setBlock(out, 'base', null) : out;
}

// ---------------------------------------------------------------------------
// Looks

/**
 * The looks of the template's slots, from every layout file.
 * @param {any} template
 * @param {(path: string) => string | null} readText
 * @returns {Look[]}
 */
export function harvestLooks(template, readText) {
  /** @type {Map<string, Look>} */
  const looks = new Map();
  for (const def of template?.layouts ?? []) {
    const html = typeof def?.file === 'string' ? readText(def.file) : null;
    if (!html) continue;
    const slots = new Map((def.slots ?? []).map((/** @type {any} */ s) => [s.name, s]));
    for (const el of allElements(parseElements(html))) {
      const name = el.attrs.get('data-slot');
      const slot = name ? slots.get(name) : null;
      if (!slot || !SLOT_TYPES.some(([t]) => t === slot.type)) continue;
      const markup = withAttributes(html.slice(el.start, slot.type === 'cards' ? el.end : el.openEnd), { 'data-slot': null, 'data-box': null });
      const element = slot.type === 'cards' ? markup : `${markup}</${el.tag}>`;
      const open = withAttributes(html.slice(el.start, el.openEnd), { 'data-slot': null, 'data-box': null, alt: null });
      const key = `${slot.type}|${open}|${slot.type === 'cards' ? JSON.stringify(slot.fields ?? []) : ''}`;
      const look = looks.get(key);
      if (look) {
        look.count += 1;
        if (!look.names.includes(name)) look.names.push(/** @type {string} */ (name));
        continue;
      }
      const cls = classesOf(el)[0] ?? el.tag;
      looks.set(key, {
        key, type: slot.type, markup: VOID_TAGS.has(el.tag) ? markup : element, count: 1, names: [/** @type {string} */ (name)],
        label: `${cls} · ${def.name ?? def.id} (${name})`,
        fields: slot.type === 'cards' ? structuredClone(slot.fields ?? []) : undefined,
      });
    }
  }
  return [...looks.values()];
}

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'source']);

/**
 * The looks for a slot type, the best first: used for a slot of this name,
 * then the most used.
 * @param {Look[]} looks @param {string} type @param {string} [name]
 * @returns {Look[]}
 */
export function looksFor(looks, type, name = '') {
  const own = looks.filter((l) => l.type === type);
  const list = own.length ? own : [fallbackLook(type)];
  return [...list].sort((a, b) => Number(b.names.includes(name)) - Number(a.names.includes(name)) || b.count - a.count);
}

/**
 * A plain look for a type no layout of the template uses.
 * @param {string} type
 * @returns {Look}
 */
export function fallbackLook(type) {
  /** @type {Record<string, string>} */
  const markup = {
    text: '<p class="slipr-body"></p>',
    richtext: '<div class="slipr-body"></div>',
    list: '<div class="slipr-body"></div>',
    image: '<img class="slipr-image" alt="">',
    quote: '<blockquote class="slipr-quote"></blockquote>',
    code: '<pre class="slipr-code"></pre>',
    cards: '<div class="slipr-composed-cards"></div>',
  };
  return {
    key: `${type}|fallback`, type, count: 0, names: [],
    markup: markup[type] ?? `<div class="slipr-${type}"></div>`,
    label: `Plain ${typeLabel(type).toLowerCase()}`,
    fields: type === 'cards' ? [{ name: 'title', type: 'text', label: 'Title', maxLength: 40 }, { name: 'text', type: 'richtext', label: 'Text' }] : undefined,
  };
}

/**
 * A slot box's markup: the look with `data-slot`, in a figure for types that add captions.
 * @param {Look} look @param {string} name
 * @returns {string}
 */
export function slotMarkup(look, name) {
  const el = withAttributes(look.markup, { 'data-slot': name });
  return FIGURE_TYPES.has(look.type) ? `<figure class="slipr-composed-figure slipr-composed-figure--${look.type}">${el}</figure>` : el;
}

/**
 * The look a slot box uses now (its key), among the looks offered for its type.
 * @param {Look[]} looks @param {string} markup @param {string} type
 */
export function lookKeyOf(looks, markup, type) {
  const slotEl = allElements(parseElements(markup)).find((e) => e.attrs.has('data-slot'));
  if (!slotEl) return null;
  const open = withAttributes(markup.slice(slotEl.start, slotEl.openEnd), { 'data-slot': null, 'data-box': null, alt: null });
  return looksFor(looks, type).find((l) => {
    const [el] = parseElements(l.markup);
    return el && withAttributes(l.markup.slice(el.start, el.openEnd), { alt: null }) === open;
  })?.key ?? null;
}

/**
 * A box's markup with its slot renamed.
 * @param {string} markup @param {string} name
 */
export function renameSlotMarkup(markup, name) {
  const slotEl = allElements(parseElements(markup)).find((e) => e.attrs.has('data-slot'));
  if (!slotEl) return markup;
  return markup.slice(0, slotEl.start) + withAttributes(markup.slice(slotEl.start), { 'data-slot': name });
}

/**
 * The root classes every layout of the template shares (Conclusion: `cnc`),
 * and the other plain root classes some layouts use (variants such as
 * `cnc-dark`). BEM modifiers (`--`) belong to one layout and are left out.
 * @param {any} template @param {(path: string) => string | null} readText
 * `usual` is what a new layout starts with: the shared classes and the
 * variants more than half of the layouts use.
 * @returns {{ shared: string[], variants: string[], usual: string[] }}
 */
export function rootClasses(template, readText) {
  /** @type {string[][]} */
  const lists = [];
  for (const def of template?.layouts ?? []) {
    const html = typeof def?.file === 'string' ? readText(def.file) : null;
    const root = html ? parseElements(html)[0] : null;
    if (!root || classesOf(root).includes(ROOT)) continue;
    lists.push(classesOf(root).filter((c) => !c.includes('--') && c !== 'slipr-layout'));
  }
  const shared = lists.length ? lists[0].filter((c) => lists.every((l) => l.includes(c))) : [];
  const variants = [...new Set(lists.flat())].filter((c) => !shared.includes(c));
  const usual = [...shared, ...variants.filter((c) => lists.filter((l) => l.includes(c)).length * 2 > lists.length)];
  return { shared, variants, usual };
}

/**
 * The pictures of a template (for picture boxes): image files under assets/.
 * @param {Iterable<string>} paths
 * @returns {string[]}
 */
export function templateImages(paths) {
  return [...paths].filter((p) => /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(p)).sort();
}

/**
 * A picture box's markup.
 * @param {string} src  Relative to the layout file.
 */
export function pictureMarkup(src) {
  return `<img class="slipr-composed-picture" src="${escapeAttr(src)}" alt="">`;
}

/**
 * The next free picture box id.
 * @param {ComposedLayout} layout
 */
export function nextPictureId(layout) {
  for (let n = 1; ; n += 1) if (!layout.boxes.some((b) => b.id === `picture-${n}`)) return `picture-${n}`;
}

// ---------------------------------------------------------------------------
// New layouts

/**
 * Slots and boxes copied from a layout (its slot elements as they are written),
 * with its logo as a picture; arranged by `arrange()`.
 * @param {any} def  The source layout's entry.
 * @param {string} html  Its file.
 * @param {ComposedLayout | null} composed  The source when it is composed itself (areas kept).
 * @returns {{ slots: any[], boxes: ComposedBox[], classes: string[], background: string | null }}
 */
export function copyLayout(def, html, composed) {
  if (composed) return { slots: structuredClone(def.slots ?? []), boxes: structuredClone(composed.boxes), classes: [...composed.classes], background: composed.background };
  const roots = parseElements(html);
  // The root's plain classes (`cnc`, `cnc-dark`); its modifier (`cnc--text-image`) belongs to the original.
  const classes = roots[0] ? classesOf(roots[0]).filter((c) => !c.includes('--') && c !== 'slipr-layout') : [];
  const elements = allElements(roots);
  /** @type {ComposedBox[]} */
  const boxes = [];
  const slots = [];
  for (const slot of def.slots ?? []) {
    const el = elements.find((e) => e.attrs.get('data-slot') === slot.name);
    if (!el || !SLOT_TYPES.some(([t]) => t === slot.type)) continue;
    const element = html.slice(el.start, el.end);
    const look = { ...fallbackLook(slot.type), markup: withAttributes(element, { 'data-slot': null, 'data-box': null }) };
    boxes.push({ id: slot.name, slot: slot.name, markup: slotMarkup(look, slot.name), area: { x: 0, y: 0, w: 10, h: 10 }, fit: null });
    slots.push(structuredClone(slot));
  }
  const logo = elements.find((e) => e.tag === 'img' && !e.attrs.has('data-slot') && /logo/i.test(`${e.attrs.get('class') ?? ''} ${e.attrs.get('src') ?? ''}`));
  if (logo?.attrs.get('src')) {
    boxes.push({ id: 'picture-1', slot: null, markup: pictureMarkup(/** @type {string} */ (logo.attrs.get('src'))), area: { x: 80, y: 4, w: 13, h: 8 }, fit: 'contain' });
  }
  return { slots, boxes: arrange(boxes, slots), classes, background: null };
}

/**
 * A first arrangement: kicker, title and subtitle stacked at the top, a
 * caption at the bottom, the other slots side by side in between; pictures
 * keep their place.
 * @param {ComposedBox[]} boxes @param {any[]} slots
 * @returns {ComposedBox[]}
 */
export function arrange(boxes, slots) {
  const types = new Map(slots.map((s) => [s.name, s.type]));
  const heads = ['kicker', 'title', 'subtitle', 'byline'];
  const heights = /** @type {Record<string, number>} */ ({ kicker: 5, title: 11, subtitle: 6, byline: 5 });
  const head = boxes.filter((b) => b.slot && types.get(b.slot) === 'text' && heads.includes(b.slot))
    .sort((a, b) => heads.indexOf(/** @type {string} */ (a.slot)) - heads.indexOf(/** @type {string} */ (b.slot)));
  const caption = boxes.filter((b) => b.slot === 'caption');
  const rest = boxes.filter((b) => b.slot && !head.includes(b) && !caption.includes(b));
  /** @type {Map<string, Area>} */
  const areas = new Map();
  let y = 6;
  for (const b of head) {
    const h = heights[/** @type {string} */ (b.slot)] ?? 6;
    areas.set(b.id, { x: 7, y, w: 72, h });
    y += h + 1;
  }
  const top = Math.max(y + 2, 20);
  const bottom = caption.length ? 86 : 92;
  // Columns: a short text slot (a column title) goes on top of the slot after it.
  /** @type {ComposedBox[][]} */
  const columns = [];
  for (let i = 0; i < rest.length; i += 1) {
    const next = rest[i + 1];
    if (types.get(/** @type {string} */ (rest[i].slot)) === 'text' && next && types.get(/** @type {string} */ (next.slot)) !== 'text') {
      columns.push([rest[i], next]);
      i += 1;
    } else {
      columns.push([rest[i]]);
    }
  }
  const gutter = 3;
  const width = columns.length ? Math.floor((86 - gutter * (columns.length - 1)) / columns.length) : 0;
  columns.forEach((column, i) => {
    const x = 7 + i * (width + gutter);
    if (column.length === 2) {
      areas.set(column[0].id, { x, y: top, w: width, h: 7 });
      areas.set(column[1].id, { x, y: top + 8, w: width, h: bottom - top - 8 });
    } else {
      areas.set(column[0].id, { x, y: top, w: width, h: bottom - top });
    }
  });
  caption.forEach((b) => areas.set(b.id, { x: 7, y: 88, w: 86, h: 6 }));
  return boxes.map((b) => ({ ...b, area: clampArea(areas.get(b.id) ?? b.area) }));
}

/**
 * Move a box one place up or down the order (drawn later = on top).
 * @param {ComposedLayout} layout @param {string} boxId @param {-1 | 1} delta
 * @returns {ComposedLayout}
 */
export function moveInOrder(layout, boxId, delta) {
  const i = layout.boxes.findIndex((b) => b.id === boxId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= layout.boxes.length) return layout;
  const boxes = [...layout.boxes];
  [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
  return { ...layout, boxes };
}

/**
 * Is this a usable new layout or slot name (an id in the template schema's sense)?
 * @param {string} name
 */
export function isSlotName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name);
}

/**
 * A slot name not used in the layout yet: `body`, `body-2`, …
 * @param {string} base @param {Iterable<string>} taken
 */
export function freeName(base, taken) {
  const used = new Set(taken);
  const clean = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[-_]+|-+$/g, '') || 'slot';
  if (!used.has(clean)) return clean;
  for (let n = 2; ; n += 1) if (!used.has(`${clean}-${n}`)) return `${clean}-${n}`;
}
