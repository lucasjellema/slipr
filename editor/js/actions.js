// @ts-check
/**
 * Editor actions: pure functions that transform a show.
 *
 * Every action takes `(show, payload)` and returns a new `show` object.
 * Objects are never mutated in place (structural sharing), which enables
 * trivial undo/redo, dirty tracking and history snapshots.
 *
 * This module has NO DOM or browser dependencies and can be tested with Node.
 */

import { renameGlossaryRef, unlinkGlossary } from './show-entities.js';
import { cleanTextStyle } from '../../shared/text-style.js';
import { isMap } from '../../shared/embeds/map.js';
import { isGraph } from '../../shared/embeds/graph.js';
import { isTable } from '../../shared/embeds/table.js';

/**
 * Generate a random short identifier.
 * @param {string} [prefix]
 * @returns {string}
 */
export function generateId(prefix = 's-') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${rand}`;
}

/**
 * Deep clone an object or array via structuredClone or JSON fallback.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function clone(obj) {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Slide actions
// ---------------------------------------------------------------------------

/**
 * The layout for a new slide (E-011). After a content slide: the same layout.
 * After a title or section slide (only text slots), or without an anchor: the
 * template's first plain content layout (text plus list or rich text, no
 * image), else its first layout with a list or rich text, else its first layout.
 * @param {any} show
 * @param {any[]} templateLayouts  `template.layouts`
 * @param {string | null} [afterSlideId]
 * @returns {string | undefined}
 */
export function layoutForNewSlide(show, templateLayouts, afterSlideId = null) {
  const layouts = Array.isArray(templateLayouts) ? templateLayouts : [];
  const types = (/** @type {any} */ l) => new Set((l?.slots ?? []).map((/** @type {any} */ s) => s.type));
  const slides = Array.isArray(show?.slides) ? show.slides : [];
  const anchor = slides.find((/** @type {any} */ s) => s.id === afterSlideId) ?? slides.at(-1);
  const anchorLayout = layouts.find((l) => l.id === anchor?.layout);
  if (anchorLayout && [...types(anchorLayout)].some((t) => t !== 'text')) return anchorLayout.id;

  const hasBody = (/** @type {Set<string>} */ t) => t.has('list') || t.has('richtext');
  const plain = layouts.find((l) => {
    const t = types(l);
    return hasBody(t) && [...t].every((x) => x === 'text' || x === 'list' || x === 'richtext');
  });
  return (plain ?? layouts.find((l) => hasBody(types(l))) ?? layouts[0])?.id;
}

/**
 * Add a new slide to the show. Without `layout`, the layout is chosen from
 * `templateLayouts` by `layoutForNewSlide()`.
 * @param {any} show
 * @param {{ layout?: string, templateLayouts?: any[], afterSlideId?: string | null, initialContent?: Record<string, any> }} payload
 * @returns {any}
 */
export function addSlide(show, { layout, templateLayouts = [], afterSlideId = null, initialContent = {} } = {}) {
  const chosen = layout ?? layoutForNewSlide(show, templateLayouts, afterSlideId);
  if (!chosen) return show;
  const slides = Array.isArray(show.slides) ? [...show.slides] : [];
  const newSlide = {
    id: generateId('s-'),
    layout: chosen,
    content: { ...initialContent },
  };

  if (afterSlideId) {
    const idx = slides.findIndex((s) => s.id === afterSlideId);
    if (idx !== -1) {
      slides.splice(idx + 1, 0, newSlide);
      return { ...show, slides };
    }
  }

  slides.push(newSlide);
  return { ...show, slides };
}

/**
 * Duplicate a slide, placing the copy immediately after the original.
 * @param {any} show
 * @param {{ slideId: string }} payload
 * @returns {any}
 */
export function duplicateSlide(show, { slideId }) {
  const slides = Array.isArray(show.slides) ? [...show.slides] : [];
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx === -1) return show;

  const copied = clone(slides[idx]);
  copied.id = generateId('s-');

  // Regenerate block ids if reader layer is present
  if (Array.isArray(copied.reader?.blocks)) {
    copied.reader.blocks = copied.reader.blocks.map((b) => ({
      ...b,
      id: generateId('b-'),
    }));
  }

  slides.splice(idx + 1, 0, copied);
  return { ...show, slides };
}

/**
 * Delete a slide from the show. Also cleans up references in paths,
 * related slides, and reader slide-refs.
 * @param {any} show
 * @param {{ slideId: string }} payload
 * @returns {any}
 */
export function deleteSlide(show, { slideId }) {
  if (!Array.isArray(show.slides)) return show;

  const slides = show.slides
    .filter((s) => s.id !== slideId)
    .map((s) => {
      let slide = s;
      // Clean up reader.related
      if (Array.isArray(slide.reader?.related) && slide.reader.related.includes(slideId)) {
        slide = {
          ...slide,
          reader: {
            ...slide.reader,
            related: slide.reader.related.filter((id) => id !== slideId),
          },
        };
      }
      return slide;
    });

  // Clean up paths
  let paths = show.paths;
  if (Array.isArray(paths)) {
    paths = paths.map((p) => {
      if (Array.isArray(p.slides) && p.slides.includes(slideId)) {
        return {
          ...p,
          slides: p.slides.filter((id) => id !== slideId),
        };
      }
      return p;
    });
  }

  return { ...show, slides, paths };
}

/**
 * Move a slide to a new index in the slides array.
 * @param {any} show
 * @param {{ slideId: string, toIndex: number }} payload
 * @returns {any}
 */
export function moveSlide(show, { slideId, toIndex }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = [...show.slides];
  const fromIndex = slides.findIndex((s) => s.id === slideId);
  if (fromIndex === -1) return show;

  const targetIndex = Math.max(0, Math.min(slides.length - 1, toIndex));
  if (fromIndex === targetIndex) return show;

  const [slide] = slides.splice(fromIndex, 1);
  slides.splice(targetIndex, 0, slide);
  return { ...show, slides };
}

/**
 * Change a slide's layout. If templateLayouts is supplied, preserves matching slots,
 * stores non-matching slots in _orphaned, and restores previously orphaned slots.
 * @param {any} show
 * @param {{ slideId: string, layout: string, templateLayouts?: Map<string, any> | Record<string, any> }} payload
 * @returns {any}
 */
export function setLayout(show, { slideId, layout, templateLayouts }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;

    let content = { ...(s.content ?? {}) };
    let orphaned = { ...(s._orphaned ?? {}) };

    if (templateLayouts) {
      const getDef = (id) =>
        templateLayouts instanceof Map ? templateLayouts.get(id)?.def ?? templateLayouts.get(id) : templateLayouts[id];

      const newDef = getDef(layout);
      if (newDef && Array.isArray(newDef.slots)) {
        const allowedSlots = new Set(newDef.slots.map((slot) => slot.name));
        const newContent = {};

        // Move slots not in allowedSlots to orphaned
        for (const [key, value] of Object.entries(content)) {
          if (allowedSlots.has(key)) {
            newContent[key] = value;
          } else {
            orphaned[key] = value;
          }
        }

        // Restore slots from orphaned that new layout accepts
        for (const [key, value] of Object.entries(orphaned)) {
          if (allowedSlots.has(key)) {
            newContent[key] = value;
            delete orphaned[key];
          }
        }

        content = newContent;
      }
    }

    const updated = { ...s, layout, content };
    if (Object.keys(orphaned).length > 0) {
      updated._orphaned = orphaned;
    } else {
      delete updated._orphaned;
    }
    return updated;
  });

  return { ...show, slides };
}

/**
 * Update a slot value in a slide's content.
 * @param {any} show
 * @param {{ slideId: string, slot: string, value: any }} payload
 * @returns {any}
 */
export function setSlot(show, { slideId, slot, value }) {
  if (!Array.isArray(show.slides)) return show;
  show = withPictureFormat(show, value);
  // A web page (I-071), PDF (I-072), graph (I-074), map (I-075) or table (I-104) slot, or an embed fallback (I-070), needs format 0.2.
  const embed02 = value && typeof value === 'object' && !Array.isArray(value)
    && (typeof value.url === 'string' || typeof value.pdf === 'string' || value.fallback !== undefined || isMap(value) || isGraph(value) || isTable(value));
  if (embed02 && (show.slipr === '0.1' || !show.slipr)) show = { ...show, slipr: '0.2' };
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const content = { ...(s.content ?? {}) };
    if (value === undefined) {
      delete content[slot];
    } else {
      content[slot] = value;
    }
    return { ...s, content };
  });
  return { ...show, slides };
}

/**
 * Does a value hold a picture with a style or opacity (D-014, I-084)? It
 * looks into arrays and objects, so a cards value counts too.
 * @param {unknown} value
 * @returns {boolean}
 */
export function usesPictureStyle(value) {
  if (Array.isArray(value)) return value.some(usesPictureStyle);
  if (value === null || typeof value !== 'object') return false;
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.src === 'string' && (v.style !== undefined || v.opacity !== undefined)) return true;
  return Object.values(v).some((x) => x !== null && typeof x === 'object' && usesPictureStyle(x));
}

/**
 * A picture style or opacity needs show format 0.2: raise a 0.1 show when a
 * value brings one in. A show stays 0.2 once it is.
 * @param {any} show @param {unknown} value
 * @returns {any}
 */
function withPictureFormat(show, value) {
  return (show.slipr === '0.1' || !show.slipr) && usesPictureStyle(value) ? { ...show, slipr: '0.2' } : show;
}

/**
 * Embed settings (I-070, I-071) need show format 0.2: raise a 0.1 show when a
 * block patch sets one (web slots: see setSlot).
 * @param {any} show @param {any} patch
 * @returns {any}
 */
function withEmbedFormat(show, patch) {
  const uses = patch && ['fallback', 'load', 'allow', 'aspect'].some((k) => patch[k] !== undefined);
  return uses && (show.slipr === '0.1' || !show.slipr) ? { ...show, slipr: '0.2' } : show;
}

/**
 * Set speaker notes on a slide.
 * @param {any} show
 * @param {{ slideId: string, notes: string | null }} payload
 * @returns {any}
 */
export function setNotes(show, { slideId, notes }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const updated = { ...s };
    if (!notes || notes.trim() === '') {
      delete updated.notes;
    } else {
      updated.notes = notes;
    }
    return updated;
  });
  return { ...show, slides };
}

/**
 * Set audience and/or reader visibility for a slide.
 * @param {any} show
 * @param {{ slideId: string, audienceHidden?: boolean, readerHidden?: boolean }} payload
 * @returns {any}
 */
export function setHidden(show, { slideId, audienceHidden, readerHidden }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const updated = { ...s };

    if (audienceHidden !== undefined) {
      const audience = { ...(updated.audience ?? {}) };
      if (audienceHidden) {
        audience.hidden = true;
      } else {
        delete audience.hidden;
      }
      if (Object.keys(audience).length > 0) {
        updated.audience = audience;
      } else {
        delete updated.audience;
      }
    }

    if (readerHidden !== undefined) {
      const reader = { ...(updated.reader ?? {}) };
      if (readerHidden) {
        reader.hidden = true;
      } else {
        delete reader.hidden;
      }
      if (Object.keys(reader).length > 0) {
        updated.reader = reader;
      } else {
        delete updated.reader;
      }
    }

    return updated;
  });
  return { ...show, slides };
}

/**
 * Assign a chapter to a slide.
 * @param {any} show
 * @param {{ slideId: string, chapter: string | null }} payload
 * @returns {any}
 */
export function setChapter(show, { slideId, chapter }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const updated = { ...s };
    if (!chapter || chapter.trim() === '') {
      delete updated.chapter;
    } else {
      updated.chapter = chapter;
    }
    return updated;
  });
  return { ...show, slides };
}

/**
 * Assign tags to a slide.
 * @param {any} show
 * @param {{ slideId: string, tags: string[] | null }} payload
 * @returns {any}
 */
export function setTags(show, { slideId, tags }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const updated = { ...s };
    if (!tags || tags.length === 0) {
      delete updated.tags;
    } else {
      updated.tags = [...tags];
    }
    return updated;
  });
  return { ...show, slides };
}

/**
 * Set audience-mode options of a slide (E-015): `fragments`, `autoAnimate`,
 * `transition`, `background`. A key patched to undefined or false is removed,
 * and an empty `audience` object too. `hidden` has its own action (setHidden).
 * @param {any} show
 * @param {{ slideId: string, patch: Record<string, any> }} payload
 * @returns {any}
 */
export function setSlideAudience(show, { slideId, patch }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const audience = { ...(s.audience ?? {}), ...patch };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === false || value === '') delete audience[key];
    }
    const updated = { ...s, audience };
    if (Object.keys(audience).length === 0) delete updated.audience;
    return updated;
  });
  return { ...show, slides };
}

// ---------------------------------------------------------------------------
// Reader layer actions
// ---------------------------------------------------------------------------

/**
 * Set the reader summary on a slide.
 * @param {any} show
 * @param {{ slideId: string, summary: string | null }} payload
 * @returns {any}
 */
export function setSummary(show, { slideId, summary }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const reader = { ...(s.reader ?? {}) };
    if (!summary || summary.trim() === '') {
      delete reader.summary;
    } else {
      reader.summary = summary;
    }
    return { ...s, reader };
  });
  return { ...show, slides };
}

/**
 * Add a block to a slide's reader layer.
 * @param {any} show
 * @param {{ slideId: string, block: any, afterBlockId?: string | null }} payload
 * @returns {any}
 */
export function addBlock(show, { slideId, block, afterBlockId = null }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const reader = { ...(s.reader ?? {}) };
    const blocks = Array.isArray(reader.blocks) ? [...reader.blocks] : [];

    const newBlock = {
      id: generateId('b-'),
      ...block,
    };

    if (afterBlockId) {
      const idx = blocks.findIndex((b) => b.id === afterBlockId);
      if (idx !== -1) {
        blocks.splice(idx + 1, 0, newBlock);
        return { ...s, reader: { ...reader, blocks } };
      }
    }

    blocks.push(newBlock);
    return { ...s, reader: { ...reader, blocks } };
  });
  return { ...show, slides };
}

/**
 * Update an existing block in a slide's reader layer. Keys patched to
 * `undefined` are removed.
 * @param {any} show
 * @param {{ slideId: string, blockId: string, patch: Record<string, any> }} payload
 * @returns {any}
 */
export function updateBlock(show, { slideId, blockId, patch }) {
  if (!Array.isArray(show.slides)) return show;
  show = withPictureFormat(show, patch?.image);
  show = withEmbedFormat(show, patch);
  const slides = show.slides.map((s) => {
    if (s.id !== slideId || !Array.isArray(s.reader?.blocks)) return s;
    const blocks = s.reader.blocks.map((b) => {
      if (b.id !== blockId) return b;
      const next = { ...b, ...patch };
      // A field patched to undefined is removed (an emptied optional field).
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      return next;
    });
    return { ...s, reader: { ...s.reader, blocks } };
  });
  return { ...show, slides };
}

/**
 * Delete a block from a slide's reader layer.
 * @param {any} show
 * @param {{ slideId: string, blockId: string }} payload
 * @returns {any}
 */
export function deleteBlock(show, { slideId, blockId }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId || !Array.isArray(s.reader?.blocks)) return s;
    const blocks = s.reader.blocks.filter((b) => b.id !== blockId);
    return { ...s, reader: { ...s.reader, blocks } };
  });
  return { ...show, slides };
}

/**
 * Move a reader block to a new position.
 * @param {any} show
 * @param {{ slideId: string, blockId: string, toIndex: number }} payload
 * @returns {any}
 */
export function moveBlock(show, { slideId, blockId, toIndex }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId || !Array.isArray(s.reader?.blocks)) return s;
    const blocks = [...s.reader.blocks];
    const fromIndex = blocks.findIndex((b) => b.id === blockId);
    if (fromIndex === -1) return s;

    const targetIndex = Math.max(0, Math.min(blocks.length - 1, toIndex));
    if (fromIndex === targetIndex) return s;

    const [item] = blocks.splice(fromIndex, 1);
    blocks.splice(targetIndex, 0, item);
    return { ...s, reader: { ...s.reader, blocks } };
  });
  return { ...show, slides };
}

/** Block types and the order of the type picker. */
export const BLOCK_TYPES = ['text', 'details', 'callout', 'tabs', 'image', 'embed', 'slide-ref', 'pdf', 'graph', 'map', 'table'];

/**
 * A block converted to another type, in a valid shape for that type (see the
 * block definitions in shared/schema/show.schema.json). Keeps id, `for` and
 * `depth`, and carries text over where the new type has a place for it.
 * Fields the new type has no place for are dropped (undo brings them back).
 * @param {any} block
 * @param {string} type
 * @param {{ slideId?: string }} [defaults]  `slideId`: target for a new slide-ref.
 * @returns {any}
 */
export function convertBlock(block, type, defaults = {}) {
  const base = {
    id: block.id,
    type,
    ...(block.for !== undefined ? { for: block.for } : {}),
    ...(block.depth !== undefined ? { depth: block.depth } : {}),
  };
  const md = typeof block.md === 'string'
    ? block.md
    : Array.isArray(block.tabs) ? block.tabs.map((/** @type {any} */ t) => t.md ?? '').filter(Boolean).join('\n\n') : '';
  const title = typeof block.title === 'string' && block.title ? block.title : undefined;
  switch (type) {
    case 'text':
      return { ...base, md };
    case 'details':
      return { ...base, title: title ?? 'More details', md, ...(block.open ? { open: true } : {}) };
    case 'callout':
      return { ...base, variant: block.variant ?? 'info', ...(title ? { title } : {}), md };
    case 'tabs':
      return { ...base, tabs: Array.isArray(block.tabs) ? block.tabs : [{ label: title ?? 'Tab 1', md }] };
    case 'image':
      return {
        ...base,
        ...(block.image ? { image: block.image } : {}),
        ...(block.caption ? { caption: block.caption } : {}),
        ...(Array.isArray(block.hotspots) ? { hotspots: block.hotspots } : {}),
      };
    case 'embed':
      return {
        ...base, url: block.url ?? '', title: title ?? 'Embedded page',
        ...(block.height ? { height: block.height } : {}),
        ...(block.aspect ? { aspect: block.aspect } : {}),
        ...(block.allow ? { allow: block.allow } : {}),
        ...(block.load ? { load: block.load } : {}),
        ...(block.fallback ? { fallback: block.fallback } : {}),
      };
    case 'slide-ref':
      return { ...base, slide: block.slide ?? defaults.slideId ?? '', ...(block.label ? { label: block.label } : {}) };
    case 'pdf':
      return {
        ...base, pdf: block.pdf ?? '', title: title ?? 'PDF document',
        ...(block.page ? { page: block.page } : {}),
        ...(block.pages ? { pages: block.pages } : {}),
        ...(block.load ? { load: block.load } : {}),
        ...(block.fallback ? { fallback: block.fallback } : {}),
      };
    case 'graph':
      // A new graph (I-074, E-020) starts with one node; the graph editor adds the rest.
      return {
        ...base, ...(title ? { title } : {}),
        ...(Array.isArray(block.nodes) || typeof block.data === 'string' ? {} : { nodes: [{ id: 'node-1', label: 'Node 1' }] }),
        ...(Array.isArray(block.nodes) ? { nodes: block.nodes } : {}),
        ...(Array.isArray(block.edges) ? { edges: block.edges } : {}),
        ...(typeof block.data === 'string' ? { data: block.data } : {}),
        ...(block.layout ? { layout: block.layout } : {}),
        ...(block.caption ? { caption: block.caption } : {}),
        ...(block.fallback ? { fallback: block.fallback } : {}),
      };
    case 'map':
      // A new map (I-075, E-021) starts on the whole world; places come from the map editor.
      return {
        ...base, ...(title ? { title } : {}),
        ...(block.center ? { center: block.center } : { center: { lat: 20, lng: 0 } }),
        zoom: typeof block.zoom === 'number' ? block.zoom : 2,
        ...(Array.isArray(block.markers) ? { markers: block.markers } : {}),
        ...(Array.isArray(block.layers) ? { layers: block.layers } : {}),
        ...(block.tiles ? { tiles: block.tiles } : {}),
        ...(block.load ? { load: block.load } : {}),
        ...(block.caption ? { caption: block.caption } : {}),
        ...(block.fallback ? { fallback: block.fallback } : {}),
      };
    case 'table':
      // A new table (I-104) starts with two columns and two empty rows; the table editor does the rest.
      return {
        ...base, ...(title ? { title } : {}),
        ...(typeof block.data === 'string' && /\.(csv|tsv|txt)$/i.test(block.data) ? { data: block.data } : {}),
        ...(Array.isArray(block.columns) ? { columns: block.columns } : { columns: [{ key: 'column-1', label: 'Column 1' }, { key: 'column-2', label: 'Column 2' }] }),
        ...(Array.isArray(block.rows) ? { rows: block.rows } : typeof block.data === 'string' && /\.(csv|tsv|txt)$/i.test(block.data) ? {} : { rows: [[null, null], [null, null]] }),
        ...(block.caption ? { caption: block.caption } : {}),
        ...(block.fallback ? { fallback: block.fallback } : {}),
      };
    default:
      return { ...block, type };
  }
}

/**
 * Change a block's type, converting it to a valid shape (see convertBlock).
 * A new slide-ref points at the next slide (or the previous one for the last).
 * @param {any} show
 * @param {{ slideId: string, blockId: string, type: string }} payload
 * @returns {any}
 */
export function setBlockType(show, { slideId, blockId, type }) {
  if (!Array.isArray(show.slides)) return show;
  const index = show.slides.findIndex((/** @type {any} */ s) => s.id === slideId);
  const neighbour = show.slides[index + 1] ?? show.slides[index - 1];
  // A PDF (I-072), graph (I-074), map (I-075) or table (I-104) block needs show format 0.2.
  if ((type === 'pdf' || type === 'graph' || type === 'map' || type === 'table') && (show.slipr === '0.1' || !show.slipr)) show = { ...show, slipr: '0.2' };
  return mapBlock(show, slideId, blockId, (b) => (b.type === type ? b : convertBlock(b, type, { slideId: neighbour?.id })));
}

/**
 * @param {any} show @param {string} slideId @param {string} blockId
 * @param {(block: any) => any} fn
 * @returns {any}
 */
function mapBlock(show, slideId, blockId, fn) {
  if (!Array.isArray(show.slides)) return show;
  let changed = false;
  const slides = show.slides.map((/** @type {any} */ s) => {
    if (s.id !== slideId || !Array.isArray(s.reader?.blocks)) return s;
    const blocks = s.reader.blocks.map((/** @type {any} */ b) => {
      if (b.id !== blockId) return b;
      const next = fn(b);
      if (next !== b) changed = true;
      return next;
    });
    return changed ? { ...s, reader: { ...s.reader, blocks } } : s;
  });
  return changed ? { ...show, slides } : show;
}

/**
 * A hotspot coordinate: a fraction 0–1 of the image size, rounded to 4 decimals.
 * @param {number} value
 * @returns {number}
 */
export function hotspotCoordinate(value) {
  const n = Number.isFinite(value) ? value : 0.5;
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
}

/**
 * Add a hotspot to an image block (E-006). x and y are fractions of the image.
 * @param {any} show
 * @param {{ slideId: string, blockId: string, x: number, y: number, title?: string, md?: string }} payload
 * @returns {any}
 */
export function addHotspot(show, { slideId, blockId, x, y, title, md = '' }) {
  return mapBlock(show, slideId, blockId, (b) => {
    if (b.type !== 'image') return b;
    const hotspots = Array.isArray(b.hotspots) ? b.hotspots : [];
    const spot = { x: hotspotCoordinate(x), y: hotspotCoordinate(y), title: title || `Hotspot ${hotspots.length + 1}`, md };
    return { ...b, hotspots: [...hotspots, spot] };
  });
}

/**
 * Change a hotspot: position (x, y), title or text.
 * @param {any} show
 * @param {{ slideId: string, blockId: string, index: number, patch: { x?: number, y?: number, title?: string, md?: string } }} payload
 * @returns {any}
 */
export function updateHotspot(show, { slideId, blockId, index, patch }) {
  return mapBlock(show, slideId, blockId, (b) => {
    if (!Array.isArray(b.hotspots) || !b.hotspots[index]) return b;
    const spot = { ...b.hotspots[index], ...patch };
    if (patch.x !== undefined) spot.x = hotspotCoordinate(patch.x);
    if (patch.y !== undefined) spot.y = hotspotCoordinate(patch.y);
    const hotspots = b.hotspots.map((/** @type {any} */ h, /** @type {number} */ i) => (i === index ? spot : h));
    return { ...b, hotspots };
  });
}

/**
 * Remove a hotspot. An image block without hotspots loses the `hotspots` key.
 * @param {any} show
 * @param {{ slideId: string, blockId: string, index: number }} payload
 * @returns {any}
 */
export function deleteHotspot(show, { slideId, blockId, index }) {
  return mapBlock(show, slideId, blockId, (b) => {
    if (!Array.isArray(b.hotspots) || !b.hotspots[index]) return b;
    const hotspots = b.hotspots.filter((/** @type {any} */ _, /** @type {number} */ i) => i !== index);
    const { hotspots: _old, ...rest } = b;
    return hotspots.length ? { ...rest, hotspots } : rest;
  });
}

/**
 * Set target profiles and depth level on a reader block.
 * @param {any} show
 * @param {{ slideId: string, blockId: string, forProfiles?: string[] | null, depth?: number | null }} payload
 * @returns {any}
 */
export function setBlockAudience(show, { slideId, blockId, forProfiles, depth }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId || !Array.isArray(s.reader?.blocks)) return s;
    const blocks = s.reader.blocks.map((b) => {
      if (b.id !== blockId) return b;
      const updated = { ...b };
      if (forProfiles !== undefined) {
        if (!forProfiles || forProfiles.length === 0) {
          delete updated.for;
        } else {
          updated.for = [...forProfiles];
        }
      }
      if (depth !== undefined) {
        if (depth === null || depth === 2) {
          delete updated.depth; // default depth is 2
        } else {
          updated.depth = depth;
        }
      }
      return updated;
    });
    return { ...s, reader: { ...s.reader, blocks } };
  });
  return { ...show, slides };
}

/**
 * Set related slide references on a slide.
 * @param {any} show
 * @param {{ slideId: string, related: string[] | null }} payload
 * @returns {any}
 */
export function setRelated(show, { slideId, related }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const reader = { ...(s.reader ?? {}) };
    if (!related || related.length === 0) {
      delete reader.related;
    } else {
      reader.related = [...related];
    }
    return { ...s, reader };
  });
  return { ...show, slides };
}

/**
 * Show or hide the slide visual above a slide's reader blocks in reader mode
 * (`reader.showSlide`, default true). Only `false` is stored.
 * @param {any} show
 * @param {{ slideId: string, showSlide: boolean }} payload
 * @returns {any}
 */
export function setShowSlide(show, { slideId, showSlide }) {
  if (!Array.isArray(show.slides)) return show;
  const slides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const reader = { ...(s.reader ?? {}) };
    if (showSlide) delete reader.showSlide;
    else reader.showSlide = false;
    const updated = { ...s, reader };
    if (Object.keys(reader).length === 0) delete updated.reader;
    return updated;
  });
  return { ...show, slides };
}

// ---------------------------------------------------------------------------
// Show-level settings actions
// ---------------------------------------------------------------------------

/**
 * Update show meta information.
 * @param {any} show
 * @param {Record<string, any>} patch
 * @returns {any}
 */
export function setMeta(show, patch) {
  // A key patched to undefined is removed (an emptied optional field).
  return { ...show, meta: mergeDefined(show.meta ?? {}, patch) };
}

/**
 * Update show settings.
 * @param {any} show
 * @param {Record<string, any>} patch
 * @returns {any}
 */
export function setSettings(show, patch) {
  // A key patched to undefined is removed (back to the default).
  return { ...show, settings: mergeDefined(show.settings ?? {}, patch) };
}

/**
 * Merge a patch into an item; keys patched to undefined are removed (an emptied optional field).
 * @param {Record<string, any>} item
 * @param {Record<string, any>} patch
 * @returns {Record<string, any>}
 */
function mergeDefined(item, patch) {
  const next = { ...item, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
  return next;
}

/**
 * Upsert a chapter in show.chapters.
 * @param {any} show
 * @param {{ id: string, title: string, summary?: string }} chapter
 * @returns {any}
 */
export function upsertChapter(show, chapter) {
  const chapters = Array.isArray(show.chapters) ? [...show.chapters] : [];
  const idx = chapters.findIndex((c) => c.id === chapter.id);
  if (idx !== -1) {
    chapters[idx] = mergeDefined(chapters[idx], chapter);
  } else {
    chapters.push({ ...chapter });
  }
  return { ...show, chapters };
}

/**
 * Delete a chapter from show.chapters and unassign it from slides.
 * @param {any} show
 * @param {{ chapterId: string }} payload
 * @returns {any}
 */
export function deleteChapter(show, { chapterId }) {
  const chapters = Array.isArray(show.chapters) ? show.chapters.filter((c) => c.id !== chapterId) : [];
  const slides = Array.isArray(show.slides)
    ? show.slides.map((s) => {
        if (s.chapter === chapterId) {
          const updated = { ...s };
          delete updated.chapter;
          return updated;
        }
        return s;
      })
    : [];
  return { ...show, chapters, slides };
}

/**
 * Upsert a glossary term in show.glossary.
 * @param {any} show
 * @param {{ id: string, term: string, definition: string, link?: string, aliases?: string[] | string }} payload
 * @returns {any}
 */
export function upsertGlossaryTerm(show, { id, term, definition, link, aliases }) {
  const glossary = { ...(show.glossary ?? {}) };
  /** @type {Record<string, any>} */
  const entry = { term };
  // Other names (I-086, show format 0.2): trimmed, no empties or repeats.
  const names = glossaryAliases(aliases);
  if (names.length) entry.aliases = names;
  entry.definition = definition;
  if (link && link.trim() !== '') {
    entry.link = link;
  }
  glossary[id] = entry;
  const slipr = names.length && (show.slipr === '0.1' || !show.slipr) ? '0.2' : show.slipr;
  return { ...show, slipr, glossary };
}

/**
 * A glossary term's other names from a list or a comma-separated text:
 * trimmed, without empties or repeats (case-insensitive).
 * @param {string[] | string | undefined} value
 * @returns {string[]}
 */
export function glossaryAliases(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  /** @type {string[]} */
  const out = [];
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/**
 * Delete a glossary term from show.glossary. With `unlink`, references to it
 * become plain text (`[[id]]` the term, `[[id|text]]` the text); without, they
 * stay and the validator reports them.
 * @param {any} show
 * @param {{ id: string, unlink?: boolean }} payload
 * @returns {any}
 */
export function deleteGlossaryTerm(show, { id, unlink = false }) {
  const term = show.glossary?.[id]?.term ?? id;
  const glossary = { ...(show.glossary ?? {}) };
  delete glossary[id];
  const next = { ...show, glossary };
  return unlink ? unlinkGlossary(next, id, term) : next;
}

/**
 * Rename a glossary term's identifier: moves show.glossary[oldId] to
 * show.glossary[newId] and rewrites all [[oldId]] or [[oldId|text]]
 * references across the show to use newId.
 * @param {any} show
 * @param {{ oldId: string, newId: string }} payload
 * @returns {any}
 */
export function renameGlossaryTerm(show, { oldId, newId }) {
  const from = typeof oldId === 'string' ? oldId.trim() : '';
  const to = typeof newId === 'string' ? newId.trim() : '';
  if (!from || !to || from === to) return show;
  const glossary = { ...(show.glossary ?? {}) };
  if (!glossary[from]) return show;
  const entry = glossary[from];
  delete glossary[from];
  glossary[to] = entry;
  const next = { ...show, glossary };
  return renameGlossaryRef(next, from, to);
}

/**
 * Move a chapter, profile or path to another position (their order is the
 * agenda order and the order readers see them in).
 * @param {any} show
 * @param {{ list: 'chapters' | 'profiles' | 'paths', id: string, toIndex: number }} payload
 * @returns {any}
 */
export function moveShowItem(show, { list, id, toIndex }) {
  const items = Array.isArray(show[list]) ? [...show[list]] : [];
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return show;
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (to === from) return show;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return { ...show, [list]: items };
}

/**
 * Upsert a profile in show.profiles.
 * @param {any} show
 * @param {{ id: string, label: string, description?: string }} profile
 * @returns {any}
 */
export function upsertProfile(show, profile) {
  const profiles = Array.isArray(show.profiles) ? [...show.profiles] : [];
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx !== -1) {
    profiles[idx] = mergeDefined(profiles[idx], profile);
  } else {
    profiles.push({ ...profile });
  }
  return { ...show, profiles };
}

/**
 * Delete a profile and clean up any block that targeted it.
 * @param {any} show
 * @param {{ profileId: string }} payload
 * @returns {any}
 */
export function deleteProfile(show, { profileId }) {
  const profiles = Array.isArray(show.profiles) ? show.profiles.filter((p) => p.id !== profileId) : [];
  const slides = Array.isArray(show.slides)
    ? show.slides.map((s) => {
        if (!Array.isArray(s.reader?.blocks)) return s;
        const blocks = s.reader.blocks.map((b) => {
          if (Array.isArray(b.for) && b.for.includes(profileId)) {
            const updated = { ...b, for: b.for.filter((id) => id !== profileId) };
            if (updated.for.length === 0) delete updated.for;
            return updated;
          }
          return b;
        });
        return { ...s, reader: { ...s.reader, blocks } };
      })
    : [];
  return { ...show, profiles, slides };
}

/**
 * Upsert a path in show.paths.
 * @param {any} show
 * @param {{ id: string, label: string, description?: string, slides: string[] | '*' }} path
 * @returns {any}
 */
export function upsertPath(show, path) {
  const paths = Array.isArray(show.paths) ? [...show.paths] : [];
  const idx = paths.findIndex((p) => p.id === path.id);
  if (idx !== -1) {
    paths[idx] = mergeDefined(paths[idx], path);
  } else {
    paths.push({ ...path });
  }
  return { ...show, paths };
}

/**
 * Delete a path from show.paths.
 * @param {any} show
 * @param {{ pathId: string }} payload
 * @returns {any}
 */
export function deletePath(show, { pathId }) {
  const paths = Array.isArray(show.paths) ? show.paths.filter((p) => p.id !== pathId) : [];
  return { ...show, paths };
}

// ---------------------------------------------------------------------------
// Global Search and Replace (I-025)
// ---------------------------------------------------------------------------

/**
 * Escape regular expression special characters.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regular expression for text search.
 * @param {string} query
 * @param {{ matchCase?: boolean, matchWholeWord?: boolean }} [options]
 * @returns {RegExp | null}
 */
export function buildSearchRegex(query, { matchCase = false, matchWholeWord = false } = {}) {
  if (!query || typeof query !== 'string') return null;
  let pattern = escapeRegExp(query);
  if (matchWholeWord) {
    pattern = `\\b${pattern}\\b`;
  }
  const flags = matchCase ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

/**
 * Extract a preview snippet around a match index.
 * @param {string} text
 * @param {number} index
 * @param {number} length
 * @returns {string}
 */
function extractSnippet(text, index, length) {
  const pad = 24;
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = text.slice(start, index);
  const match = text.slice(index, index + length);
  const after = text.slice(index + length, end);
  return `${prefix}${before}[${match}]${after}${suffix}`;
}

/**
 * Scan a text string for matches and push to results array.
 * @param {string} text
 * @param {RegExp} regex
 * @param {Omit<MatchOccurrence, 'snippet'>} info
 * @param {MatchOccurrence[]} matches
 */
function scanString(text, regex, info, matches) {
  if (typeof text !== 'string') return 0;
  regex.lastIndex = 0;
  let m;
  let count = 0;
  while ((m = regex.exec(text)) !== null) {
    count++;
    matches.push({
      ...info,
      snippet: extractSnippet(text, m.index, m[0].length),
    });
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return count;
}

/**
 * @typedef {object} MatchOccurrence
 * @property {string | null} slideId
 * @property {number | null} slideIndex
 * @property {string} slideTitle
 * @property {string} location
 * @property {string} field
 * @property {string} snippet
 */

/**
 * @typedef {object} SearchResults
 * @property {number} totalMatches
 * @property {MatchOccurrence[]} matches
 */

/**
 * Find all occurrences of query across the entire show without modifying it.
 * @param {any} show
 * @param {{ query: string, matchCase?: boolean, matchWholeWord?: boolean }} options
 * @returns {SearchResults}
 */
export function findMatches(show, { query, matchCase = false, matchWholeWord = false }) {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return { totalMatches: 0, matches: [] };
  }
  const regex = buildSearchRegex(query, { matchCase, matchWholeWord });
  if (!regex) return { totalMatches: 0, matches: [] };

  /** @type {MatchOccurrence[]} */
  const matches = [];
  let total = 0;

  // 1. Show metadata
  if (show.meta && typeof show.meta === 'object') {
    for (const field of ['title', 'subtitle', 'author', 'description']) {
      if (typeof show.meta[field] === 'string') {
        total += scanString(show.meta[field], regex, {
          slideId: null,
          slideIndex: null,
          slideTitle: 'Show metadata',
          location: `Metadata: ${field}`,
          field: `meta.${field}`,
        }, matches);
      }
    }
  }

  // 2. Chapters
  if (Array.isArray(show.chapters)) {
    for (const chap of show.chapters) {
      const cTitle = chap.title || chap.id;
      if (typeof chap.title === 'string') {
        total += scanString(chap.title, regex, {
          slideId: null,
          slideIndex: null,
          slideTitle: `Chapter: ${cTitle}`,
          location: 'Chapter title',
          field: `chapters[${chap.id}].title`,
        }, matches);
      }
      if (typeof chap.summary === 'string') {
        total += scanString(chap.summary, regex, {
          slideId: null,
          slideIndex: null,
          slideTitle: `Chapter: ${cTitle}`,
          location: 'Chapter summary',
          field: `chapters[${chap.id}].summary`,
        }, matches);
      }
    }
  }

  // 3. Glossary
  if (show.glossary && typeof show.glossary === 'object') {
    for (const [id, term] of Object.entries(show.glossary)) {
      if (!term || typeof term !== 'object') continue;
      const tName = term.term || id;
      if (typeof term.term === 'string') {
        total += scanString(term.term, regex, {
          slideId: null,
          slideIndex: null,
          slideTitle: `Glossary: ${tName}`,
          location: 'Glossary term',
          field: `glossary[${id}].term`,
        }, matches);
      }
      if (typeof term.definition === 'string') {
        total += scanString(term.definition, regex, {
          slideId: null,
          slideIndex: null,
          slideTitle: `Glossary: ${tName}`,
          location: 'Glossary definition',
          field: `glossary[${id}].definition`,
        }, matches);
      }
    }
  }

  // 4. Slides
  if (Array.isArray(show.slides)) {
    show.slides.forEach((slide, idx) => {
      const sNum = idx + 1;
      const sTitle = (slide.content?.title || slide.content?.heading || slide.layout || `Slide ${sNum}`).trim();

      // Content slots
      if (slide.content && typeof slide.content === 'object') {
        for (const [slot, val] of Object.entries(slide.content)) {
          if (typeof val === 'string') {
            total += scanString(val, regex, {
              slideId: slide.id,
              slideIndex: sNum,
              slideTitle: sTitle,
              location: `Content: ${slot}`,
              field: `content.${slot}`,
            }, matches);
          } else if (Array.isArray(val)) {
            val.forEach((item, itemIdx) => {
              if (typeof item === 'string') {
                total += scanString(item, regex, {
                  slideId: slide.id,
                  slideIndex: sNum,
                  slideTitle: sTitle,
                  location: `Content: ${slot} item ${itemIdx + 1}`,
                  field: `content.${slot}[${itemIdx}]`,
                }, matches);
              } else if (item && typeof item === 'object') {
                // Card item
                for (const [cardKey, cardVal] of Object.entries(item)) {
                  if (typeof cardVal === 'string') {
                    total += scanString(cardVal, regex, {
                      slideId: slide.id,
                      slideIndex: sNum,
                      slideTitle: sTitle,
                      location: `Card ${itemIdx + 1}: ${cardKey}`,
                      field: `content.${slot}[${itemIdx}].${cardKey}`,
                    }, matches);
                  }
                }
              }
            });
          } else if (val && typeof val === 'object') {
            for (const [k, v] of Object.entries(val)) {
              if (typeof v === 'string') {
                total += scanString(v, regex, {
                  slideId: slide.id,
                  slideIndex: sNum,
                  slideTitle: sTitle,
                  location: `Slot: ${slot} (${k})`,
                  field: `content.${slot}.${k}`,
                }, matches);
              }
            }
          }
        }
      }

      // Text elements (I-089)
      (Array.isArray(slide.overlays) ? slide.overlays : []).forEach((/** @type {any} */ o, /** @type {number} */ j) => {
        if (typeof o?.text !== 'string') return;
        total += scanString(o.text, regex, {
          slideId: slide.id,
          slideIndex: sNum,
          slideTitle: sTitle,
          location: `Text element ${j + 1}`,
          field: `overlays.${j}.text`,
        }, matches);
      });

      // Speaker notes
      if (typeof slide.notes === 'string') {
        total += scanString(slide.notes, regex, {
          slideId: slide.id,
          slideIndex: sNum,
          slideTitle: sTitle,
          location: 'Speaker notes',
          field: 'notes',
        }, matches);
      }

      // Reader layer
      if (slide.reader && typeof slide.reader === 'object') {
        if (typeof slide.reader.summary === 'string') {
          total += scanString(slide.reader.summary, regex, {
            slideId: slide.id,
            slideIndex: sNum,
            slideTitle: sTitle,
            location: 'Reader summary',
            field: 'reader.summary',
          }, matches);
        }

        if (Array.isArray(slide.reader.blocks)) {
          slide.reader.blocks.forEach((block, bIdx) => {
            const bType = block.type || 'block';
            for (const f of ['md', 'title', 'caption', 'label', 'mermaid']) {
              if (typeof block[f] === 'string') {
                total += scanString(block[f], regex, {
                  slideId: slide.id,
                  slideIndex: sNum,
                  slideTitle: sTitle,
                  location: `Reader: ${bType} (${f})`,
                  field: `reader.blocks[${block.id ?? bIdx}].${f}`,
                }, matches);
              }
            }
            if (Array.isArray(block.items)) {
              block.items.forEach((it, itIdx) => {
                if (typeof it === 'string') {
                  total += scanString(it, regex, {
                    slideId: slide.id,
                    slideIndex: sNum,
                    slideTitle: sTitle,
                    location: `Reader: ${bType} item ${itIdx + 1}`,
                    field: `reader.blocks[${block.id ?? bIdx}].items[${itIdx}]`,
                  }, matches);
                } else if (it && typeof it === 'object') {
                  for (const f of ['title', 'md']) {
                    if (typeof it[f] === 'string') {
                      total += scanString(it[f], regex, {
                        slideId: slide.id,
                        slideIndex: sNum,
                        slideTitle: sTitle,
                        location: `Reader: ${bType} tab ${itIdx + 1} (${f})`,
                        field: `reader.blocks[${block.id ?? bIdx}].items[${itIdx}].${f}`,
                      }, matches);
                    }
                  }
                }
              });
            }
            if (Array.isArray(block.hotspots)) {
              block.hotspots.forEach((h, hIdx) => {
                for (const f of ['title', 'md']) {
                  if (typeof h[f] === 'string') {
                    total += scanString(h[f], regex, {
                      slideId: slide.id,
                      slideIndex: sNum,
                      slideTitle: sTitle,
                      location: `Reader hotspot ${hIdx + 1} (${f})`,
                      field: `reader.blocks[${block.id ?? bIdx}].hotspots[${hIdx}].${f}`,
                    }, matches);
                  }
                }
              });
            }
          });
        }
      }
    });
  }

  return { totalMatches: total, matches };
}

/**
 * Replace all occurrences of string in target text.
 * @param {string} text
 * @param {RegExp} regex
 * @param {string} replacement
 * @returns {{ text: string, replaced: number }}
 */
function replaceInString(text, regex, replacement) {
  if (typeof text !== 'string') return { text, replaced: 0 };
  regex.lastIndex = 0;
  let count = 0;
  const replaced = text.replace(regex, () => {
    count++;
    return replacement;
  });
  return { text: replaced, replaced: count };
}

/**
 * Apply search and replace to a single slide.
 * @param {any} slide
 * @param {RegExp} regex
 * @param {string} replacement
 * @returns {{ slide: any, replaced: number }}
 */
function replaceInSlide(slide, regex, replacement) {
  let count = 0;
  let updatedSlide = slide;

  // Content
  if (slide.content && typeof slide.content === 'object') {
    let contentChanged = false;
    const nextContent = { ...slide.content };
    for (const [slot, val] of Object.entries(slide.content)) {
      if (typeof val === 'string') {
        const res = replaceInString(val, regex, replacement);
        if (res.replaced > 0) {
          count += res.replaced;
          contentChanged = true;
          nextContent[slot] = res.text;
        }
      } else if (Array.isArray(val)) {
        let arrChanged = false;
        const nextArr = val.map((item) => {
          if (typeof item === 'string') {
            const res = replaceInString(item, regex, replacement);
            if (res.replaced > 0) {
              count += res.replaced;
              arrChanged = true;
              return res.text;
            }
            return item;
          }
          if (item && typeof item === 'object') {
            let itemChanged = false;
            const nextItem = { ...item };
            for (const [k, v] of Object.entries(item)) {
              if (typeof v === 'string') {
                const res = replaceInString(v, regex, replacement);
                if (res.replaced > 0) {
                  count += res.replaced;
                  itemChanged = true;
                  nextItem[k] = res.text;
                }
              }
            }
            if (itemChanged) arrChanged = true;
            return nextItem;
          }
          return item;
        });
        if (arrChanged) {
          contentChanged = true;
          nextContent[slot] = nextArr;
        }
      } else if (val && typeof val === 'object') {
        let objChanged = false;
        const nextObj = { ...val };
        for (const [k, v] of Object.entries(val)) {
          if (typeof v === 'string') {
            const res = replaceInString(v, regex, replacement);
            if (res.replaced > 0) {
              count += res.replaced;
              objChanged = true;
              nextObj[k] = res.text;
            }
          }
        }
        if (objChanged) {
          contentChanged = true;
          nextContent[slot] = nextObj;
        }
      }
    }
    if (contentChanged) {
      updatedSlide = { ...updatedSlide, content: nextContent };
    }
  }

  // Text elements (I-089)
  if (Array.isArray(updatedSlide.overlays)) {
    let overlaysChanged = false;
    const nextOverlays = updatedSlide.overlays.map((/** @type {any} */ o) => {
      if (typeof o?.text !== 'string') return o;
      const res = replaceInString(o.text, regex, replacement);
      if (res.replaced === 0) return o;
      count += res.replaced;
      overlaysChanged = true;
      return { ...o, text: res.text };
    });
    if (overlaysChanged) updatedSlide = { ...updatedSlide, overlays: nextOverlays };
  }

  // Speaker notes
  if (typeof updatedSlide.notes === 'string') {
    const res = replaceInString(updatedSlide.notes, regex, replacement);
    if (res.replaced > 0) {
      count += res.replaced;
      updatedSlide = { ...updatedSlide, notes: res.text };
    }
  }

  // Reader layer
  if (updatedSlide.reader && typeof updatedSlide.reader === 'object') {
    let readerChanged = false;
    let nextReader = { ...updatedSlide.reader };

    if (typeof nextReader.summary === 'string') {
      const res = replaceInString(nextReader.summary, regex, replacement);
      if (res.replaced > 0) {
        count += res.replaced;
        readerChanged = true;
        nextReader.summary = res.text;
      }
    }

    if (Array.isArray(nextReader.blocks)) {
      let blocksChanged = false;
      const nextBlocks = nextReader.blocks.map((block) => {
        let blockChanged = false;
        let nextBlock = { ...block };

        for (const f of ['md', 'title', 'caption', 'label', 'mermaid']) {
          if (typeof nextBlock[f] === 'string') {
            const res = replaceInString(nextBlock[f], regex, replacement);
            if (res.replaced > 0) {
              count += res.replaced;
              blockChanged = true;
              nextBlock[f] = res.text;
            }
          }
        }

        if (Array.isArray(nextBlock.items)) {
          let itemsChanged = false;
          const nextItems = nextBlock.items.map((it) => {
            if (typeof it === 'string') {
              const res = replaceInString(it, regex, replacement);
              if (res.replaced > 0) {
                count += res.replaced;
                itemsChanged = true;
                return res.text;
              }
              return it;
            }
            if (it && typeof it === 'object') {
              let itChanged = false;
              const nextIt = { ...it };
              for (const f of ['title', 'md']) {
                if (typeof nextIt[f] === 'string') {
                  const res = replaceInString(nextIt[f], regex, replacement);
                  if (res.replaced > 0) {
                    count += res.replaced;
                    itChanged = true;
                    nextIt[f] = res.text;
                  }
                }
              }
              if (itChanged) itemsChanged = true;
              return nextIt;
            }
            return it;
          });
          if (itemsChanged) {
            blockChanged = true;
            nextBlock.items = nextItems;
          }
        }

        if (Array.isArray(nextBlock.hotspots)) {
          let hotspotsChanged = false;
          const nextHotspots = nextBlock.hotspots.map((h) => {
            let hChanged = false;
            const nextH = { ...h };
            for (const f of ['title', 'md']) {
              if (typeof nextH[f] === 'string') {
                const res = replaceInString(nextH[f], regex, replacement);
                if (res.replaced > 0) {
                  count += res.replaced;
                  hChanged = true;
                  nextH[f] = res.text;
                }
              }
            }
            if (hChanged) hotspotsChanged = true;
            return nextH;
          });
          if (hotspotsChanged) {
            blockChanged = true;
            nextBlock.hotspots = nextHotspots;
          }
        }

        if (blockChanged) blocksChanged = true;
        return nextBlock;
      });

      if (blocksChanged) {
        readerChanged = true;
        nextReader.blocks = nextBlocks;
      }
    }

    if (readerChanged) {
      updatedSlide = { ...updatedSlide, reader: nextReader };
    }
  }

  return { slide: updatedSlide, replaced: count };
}

/**
 * Replace all occurrences across all slides, reader blocks, notes, and show settings.
 * @param {any} show
 * @param {{ find: string, replaceWith?: string, matchCase?: boolean, matchWholeWord?: boolean }} payload
 * @returns {any}
 */
export function replaceAllText(show, { find, replaceWith = '', matchCase = false, matchWholeWord = false }) {
  if (!find || typeof find !== 'string') return show;
  const regex = buildSearchRegex(find, { matchCase, matchWholeWord });
  if (!regex) return show;

  let totalReplaced = 0;
  let newShow = { ...show };

  // 1. Meta
  if (newShow.meta && typeof newShow.meta === 'object') {
    let metaChanged = false;
    const nextMeta = { ...newShow.meta };
    for (const f of ['title', 'subtitle', 'author', 'description']) {
      if (typeof nextMeta[f] === 'string') {
        const res = replaceInString(nextMeta[f], regex, replaceWith);
        if (res.replaced > 0) {
          totalReplaced += res.replaced;
          metaChanged = true;
          nextMeta[f] = res.text;
        }
      }
    }
    if (metaChanged) newShow.meta = nextMeta;
  }

  // 2. Chapters
  if (Array.isArray(newShow.chapters)) {
    let chaptersChanged = false;
    const nextChapters = newShow.chapters.map((chap) => {
      let cChanged = false;
      let nextChap = { ...chap };
      for (const f of ['title', 'summary']) {
        if (typeof nextChap[f] === 'string') {
          const res = replaceInString(nextChap[f], regex, replaceWith);
          if (res.replaced > 0) {
            totalReplaced += res.replaced;
            cChanged = true;
            nextChap[f] = res.text;
          }
        }
      }
      if (cChanged) chaptersChanged = true;
      return nextChap;
    });
    if (chaptersChanged) newShow.chapters = nextChapters;
  }

  // 3. Glossary
  if (newShow.glossary && typeof newShow.glossary === 'object') {
    let glossaryChanged = false;
    const nextGlossary = { ...newShow.glossary };
    for (const [id, term] of Object.entries(newShow.glossary)) {
      if (!term || typeof term !== 'object') continue;
      let tChanged = false;
      const nextTerm = { ...term };
      for (const f of ['term', 'definition']) {
        if (typeof nextTerm[f] === 'string') {
          const res = replaceInString(nextTerm[f], regex, replaceWith);
          if (res.replaced > 0) {
            totalReplaced += res.replaced;
            tChanged = true;
            nextTerm[f] = res.text;
          }
        }
      }
      if (tChanged) {
        glossaryChanged = true;
        nextGlossary[id] = nextTerm;
      }
    }
    if (glossaryChanged) newShow.glossary = nextGlossary;
  }

  // 4. Slides
  if (Array.isArray(newShow.slides)) {
    let slidesChanged = false;
    const nextSlides = newShow.slides.map((s) => {
      const res = replaceInSlide(s, regex, replaceWith);
      if (res.replaced > 0) {
        totalReplaced += res.replaced;
        slidesChanged = true;
        return res.slide;
      }
      return s;
    });
    if (slidesChanged) newShow.slides = nextSlides;
  }

  if (totalReplaced === 0) return show;
  return newShow;
}

/**
 * Replace occurrences within a single chosen slide.
 * @param {any} show
 * @param {{ slideId: string, find: string, replaceWith?: string, matchCase?: boolean, matchWholeWord?: boolean }} payload
 * @returns {any}
 */
export function replaceSlideText(show, { slideId, find, replaceWith = '', matchCase = false, matchWholeWord = false }) {
  if (!slideId || !find || typeof find !== 'string' || !Array.isArray(show.slides)) return show;
  const regex = buildSearchRegex(find, { matchCase, matchWholeWord });
  if (!regex) return show;

  let totalReplaced = 0;
  const nextSlides = show.slides.map((s) => {
    if (s.id !== slideId) return s;
    const res = replaceInSlide(s, regex, replaceWith);
    totalReplaced += res.replaced;
    return res.slide;
  });

  if (totalReplaced === 0) return show;
  return { ...show, slides: nextSlides };
}

/** Action registry lookup */
// ---------------------------------------------------------------------------
// Show grid (I-081): operations on several slides or a whole chapter at once.
// Each is one action, so it is one undo step.
// ---------------------------------------------------------------------------

/**
 * Put `show.chapters` in the order in which their slides first appear. Chapters
 * without slides keep their places; the others are re-sorted among the places
 * they occupy. The agenda lists chapters in this order, so it follows the slides.
 * @param {any} show
 * @returns {any}
 */
export function syncChapterOrder(show) {
  if (!Array.isArray(show.chapters) || !Array.isArray(show.slides)) return show;
  const first = new Map();
  show.slides.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (s.chapter && !first.has(s.chapter)) first.set(s.chapter, i);
  });
  const used = show.chapters.filter((/** @type {any} */ c) => first.has(c.id));
  const sorted = [...used].sort((a, b) => first.get(a.id) - first.get(b.id));
  let k = 0;
  const chapters = show.chapters.map((/** @type {any} */ c) => (first.has(c.id) ? sorted[k++] : c));
  return chapters.every((c, i) => c === show.chapters[i]) ? show : { ...show, chapters };
}

/**
 * Move slides as one block, in their current order, to just before another
 * slide (or to the end). Optionally give the moved slides a chapter
 * (`null` removes it; `undefined` leaves it).
 * @param {any} show
 * @param {{ slideIds: string[], beforeSlideId?: string | null, chapter?: string | null }} payload
 * @returns {any}
 */
export function moveSlides(show, { slideIds, beforeSlideId = null, chapter }) {
  if (!Array.isArray(show.slides)) return show;
  const ids = new Set(slideIds);
  let moving = show.slides.filter((/** @type {any} */ s) => ids.has(s.id));
  if (!moving.length) return show;
  const rest = show.slides.filter((/** @type {any} */ s) => !ids.has(s.id));
  // Dropping onto one of the moved slides: insert before the next slide that stays.
  let target = beforeSlideId;
  if (target && ids.has(target)) {
    const after = show.slides.slice(show.slides.findIndex((/** @type {any} */ s) => s.id === target));
    target = after.find((/** @type {any} */ s) => !ids.has(s.id))?.id ?? null;
  }
  const at = target ? rest.findIndex((/** @type {any} */ s) => s.id === target) : -1;
  const insert = at === -1 ? rest.length : at;
  if (chapter !== undefined) {
    moving = moving.map((/** @type {any} */ s) => {
      const next = { ...s };
      if (chapter) next.chapter = chapter;
      else delete next.chapter;
      return next;
    });
  }
  const slides = [...rest.slice(0, insert), ...moving, ...rest.slice(insert)];
  const unchanged = slides.every((s, i) => s === show.slides[i]);
  return unchanged ? show : syncChapterOrder({ ...show, slides });
}

/**
 * Duplicate slides; each copy goes right after its original.
 * @param {any} show
 * @param {{ slideIds: string[] }} payload
 * @returns {any}
 */
export function duplicateSlides(show, { slideIds }) {
  return slideIds.reduce((acc, slideId) => duplicateSlide(acc, { slideId }), show);
}

/**
 * Insert slides from the slide library (I-029), prepared by
 * library/library-model.js prepareInsert(): after `afterSlideId` (or at the
 * end), adding the glossary terms the show lacks. One undo step.
 * @param {any} show
 * @param {{ slides: any[], afterSlideId?: string | null, glossary?: Record<string, any> }} payload
 * @returns {any}
 */
export function insertSlides(show, { slides, afterSlideId = null, glossary = {} }) {
  if (!Array.isArray(slides) || !slides.length) return show;
  const list = Array.isArray(show.slides) ? [...show.slides] : [];
  const at = list.findIndex((s) => s.id === afterSlideId);
  list.splice(at === -1 ? list.length : at + 1, 0, ...clone(slides));
  const next = { ...show, slides: list };
  const add = Object.entries(glossary).filter(([id]) => !show.glossary?.[id]);
  if (add.length) next.glossary = { ...(show.glossary ?? {}), ...Object.fromEntries(clone(add)) };
  return syncChapterOrder(next);
}

/**
 * Delete slides (with the same reference clean-up as deleteSlide). A show
 * keeps at least one slide: deleting them all does nothing.
 * @param {any} show
 * @param {{ slideIds: string[] }} payload
 * @returns {any}
 */
export function deleteSlides(show, { slideIds }) {
  const ids = new Set(slideIds);
  if (!Array.isArray(show.slides) || show.slides.every((/** @type {any} */ s) => ids.has(s.id))) return show;
  return syncChapterOrder(slideIds.reduce((acc, slideId) => deleteSlide(acc, { slideId }), show));
}

/**
 * Hide slides from audience mode, or show them again.
 * @param {any} show
 * @param {{ slideIds: string[], audienceHidden: boolean }} payload
 * @returns {any}
 */
export function setSlidesHidden(show, { slideIds, audienceHidden }) {
  return slideIds.reduce((acc, slideId) => setHidden(acc, { slideId, audienceHidden }), show);
}

/**
 * Give slides a chapter (`null`: none), without moving them.
 * @param {any} show
 * @param {{ slideIds: string[], chapter: string | null }} payload
 * @returns {any}
 */
export function setSlidesChapter(show, { slideIds, chapter }) {
  return syncChapterOrder(slideIds.reduce((acc, slideId) => setChapter(acc, { slideId, chapter }), show));
}

/**
 * Move all slides of a chapter, as one block, to just before another slide
 * (or to the end); the chapter order follows.
 * @param {any} show
 * @param {{ chapterId: string, beforeSlideId?: string | null }} payload
 * @returns {any}
 */
export function moveChapter(show, { chapterId, beforeSlideId = null }) {
  const slideIds = (show.slides ?? []).filter((/** @type {any} */ s) => s.chapter === chapterId).map((/** @type {any} */ s) => s.id);
  return slideIds.length ? moveSlides(show, { slideIds, beforeSlideId }) : show;
}

/**
 * Make a new chapter of some slides: they get the chapter and are gathered
 * where the first of them is.
 * @param {any} show
 * @param {{ chapterId: string, title: string, slideIds: string[] }} payload
 * @returns {any}
 */
export function createChapterFromSlides(show, { chapterId, title, slideIds }) {
  const ids = new Set(slideIds);
  const slides = Array.isArray(show.slides) ? show.slides : [];
  const firstIndex = slides.findIndex((/** @type {any} */ s) => ids.has(s.id));
  if (firstIndex === -1) return show;
  const beforeSlide = slides.slice(firstIndex).find((/** @type {any} */ s) => !ids.has(s.id)) ?? null;
  // Insert the chapter entry before the chapter that follows it in the slides (else at the end).
  const chapters = (Array.isArray(show.chapters) ? show.chapters : []).filter((/** @type {any} */ c) => c.id !== chapterId);
  const nextChapterIndex = beforeSlide?.chapter ? chapters.findIndex((/** @type {any} */ c) => c.id === beforeSlide.chapter) : -1;
  const entry = { id: chapterId, title };
  const placed = nextChapterIndex === -1 ? [...chapters, entry] : [...chapters.slice(0, nextChapterIndex), entry, ...chapters.slice(nextChapterIndex)];
  return moveSlides({ ...show, chapters: placed }, { slideIds, beforeSlideId: beforeSlide?.id ?? null, chapter: chapterId });
}

// ---------------------------------------------------------------------------
// Extra images on a slide (I-083, D-013): `slide.overlays`, show format 0.2.

/** Smallest size of an extra image, as a fraction of the canvas. */
export const OVERLAY_MIN_SIZE = 0.02;

/** @param {number} n */
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * An overlay's box kept inside the canvas: size between OVERLAY_MIN_SIZE and 1,
 * position so the box fits, all rounded to 4 decimals.
 * @param {{ x?: number, y?: number, w?: number, h?: number }} box
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function overlayBox({ x, y, w, h }) {
  const num = (/** @type {unknown} */ v, /** @type {number} */ d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const W = round4(Math.min(1, Math.max(OVERLAY_MIN_SIZE, num(w, 0.3))));
  const H = round4(Math.min(1, Math.max(OVERLAY_MIN_SIZE, num(h, 0.3))));
  return {
    x: round4(Math.min(1 - W, Math.max(0, num(x, (1 - W) / 2)))),
    y: round4(Math.min(1 - H, Math.max(0, num(y, (1 - H) / 2)))),
    w: W,
    h: H,
  };
}

/**
 * Where a new extra image goes: centred, 30 % of the canvas wide (less if it
 * would be taller than 80 %), with the image's own aspect ratio.
 * @param {number} imageAspect  Image width / height.
 * @param {number} canvasAspect Canvas width / height (16/9 or 4/3).
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function newOverlayBox(imageAspect, canvasAspect) {
  const ia = imageAspect > 0 && Number.isFinite(imageAspect) ? imageAspect : 1;
  let w = 0.3;
  let h = (w * canvasAspect) / ia;
  if (h > 0.8) {
    h = 0.8;
    w = (h * ia) / canvasAspect;
  }
  return overlayBox({ w, h });
}

/**
 * A box resized by dragging one corner; the opposite corner stays put.
 * @param {{ x: number, y: number, w: number, h: number }} start
 * @param {string} corner  'nw' | 'ne' | 'sw' | 'se'
 * @param {number} dx @param {number} dy  Pointer movement, fractions of the canvas.
 * @param {boolean} keepAspect
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function resizedOverlayBox(start, corner, dx, dy, keepAspect) {
  const west = corner.includes('w');
  const north = corner.includes('n');
  let w = Math.max(OVERLAY_MIN_SIZE, start.w + (west ? -dx : dx));
  let h = Math.max(OVERLAY_MIN_SIZE, start.h + (north ? -dy : dy));
  if (keepAspect) {
    const ratio = start.h / start.w;
    // Follow the larger relative change, so the box tracks the pointer.
    if (w / start.w >= h / start.h) h = w * ratio;
    else w = h / ratio;
    // Keep it inside the canvas, still with the same ratio.
    const maxW = west ? start.x + start.w : 1 - start.x;
    const maxH = north ? start.y + start.h : 1 - start.y;
    const scale = Math.min(1, maxW / w, maxH / h);
    w *= scale;
    h *= scale;
  }
  const x = west ? start.x + start.w - w : start.x;
  const y = north ? start.y + start.h - h : start.y;
  return overlayBox({ x, y, w, h });
}

/**
 * @param {any} show @param {string} slideId
 * @param {(overlays: any[]) => any[]} fn
 * @returns {any}
 */
function mapOverlays(show, slideId, fn) {
  if (!Array.isArray(show.slides)) return show;
  let changed = false;
  const slides = show.slides.map((/** @type {any} */ s) => {
    if (s.id !== slideId) return s;
    const current = Array.isArray(s.overlays) ? s.overlays : [];
    const next = fn(current);
    if (next === current) return s;
    changed = true;
    const { overlays: _old, ...rest } = s;
    if (!next.length) return rest;
    // Keep the schema's key order: overlays right after content.
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(rest)) {
      out[k] = v;
      if (k === 'content') out.overlays = next;
    }
    if (!('overlays' in out)) out.overlays = next;
    return out;
  });
  if (!changed) return show;
  // Extra images need show format 0.2; a show stays 0.2 once it is.
  return { ...show, slipr: show.slipr === '0.1' || !show.slipr ? '0.2' : show.slipr, slides };
}

/** Where a new text element goes (I-089): centred, 40 % × 12 % of the canvas. */
export const NEW_TEXT_BOX = Object.freeze({ x: 0.3, y: 0.44, w: 0.4, h: 0.12 });

/**
 * An overlay in its stored shape: an extra image (`image`) or a text element
 * (`text` and a cleaned `style`, D-016), its box, and `fragment`.
 * @param {any} o
 * @returns {any}
 */
function overlayValue(o) {
  /** @type {Record<string, any>} */
  const out = {};
  if (typeof o.text === 'string') {
    out.text = o.text;
    const style = cleanTextStyle(o.style);
    if (style) out.style = style;
  } else {
    out.image = o.image;
  }
  Object.assign(out, overlayBox(o));
  if (o.fragment) out.fragment = o.fragment;
  return out;
}

/**
 * Add an extra image or a text element to a slide, in front of the others.
 * @param {any} show
 * @param {{ slideId: string, overlay: { image?: any, text?: string, style?: any, x?: number, y?: number, w?: number, h?: number, fragment?: any } }} payload
 * @returns {any}
 */
export function addOverlay(show, { slideId, overlay }) {
  if (!overlay?.image?.src && typeof overlay?.text !== 'string') return show;
  return mapOverlays(show, slideId, (list) => [...list, overlayValue(overlay)]);
}

/**
 * Change an extra image or a text element: its box (kept inside the canvas),
 * image, text, style (replaced as a whole, then cleaned) or `fragment`
 * (undefined or false removes it).
 * @param {any} show
 * @param {{ slideId: string, index: number, patch: { image?: any, text?: string, style?: any, x?: number, y?: number, w?: number, h?: number, fragment?: any } }} payload
 * @returns {any}
 */
export function updateOverlay(show, { slideId, index, patch }) {
  return mapOverlays(show, slideId, (list) => {
    const current = list[index];
    if (!current) return list;
    const next = overlayValue({ ...current, ...patch });
    if (JSON.stringify(next) === JSON.stringify(current)) return list;
    return list.map((o, i) => (i === index ? next : o));
  });
}

/**
 * Remove an extra image (the file stays in images/).
 * @param {any} show
 * @param {{ slideId: string, index: number }} payload
 * @returns {any}
 */
export function deleteOverlay(show, { slideId, index }) {
  return mapOverlays(show, slideId, (list) => (list[index] ? list.filter((_, i) => i !== index) : list));
}

/**
 * Change the stacking order: a higher index is further in front.
 * @param {any} show
 * @param {{ slideId: string, index: number, toIndex: number }} payload
 * @returns {any}
 */
export function moveOverlay(show, { slideId, index, toIndex }) {
  return mapOverlays(show, slideId, (list) => {
    if (!list[index] || toIndex < 0 || toIndex >= list.length || toIndex === index) return list;
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(toIndex, 0, item);
    return next;
  });
}

/**
 * Replace the entire show with a recovered draft (I-020).
 * @param {any} _currentShow
 * @param {any} draftShow
 * @returns {any}
 */
export function restoreDraft(_currentShow, draftShow) {
  return clone(draftShow);
}

export const actions = {
  restoreDraft,
  addOverlay,
  updateOverlay,
  deleteOverlay,
  moveOverlay,
  setBlockType,
  addHotspot,
  updateHotspot,
  deleteHotspot,
  addSlide,
  duplicateSlide,
  moveSlides,
  duplicateSlides,
  insertSlides,
  deleteSlides,
  setSlidesHidden,
  setSlidesChapter,
  moveChapter,
  createChapterFromSlides,
  deleteSlide,
  moveSlide,
  setLayout,
  setSlot,
  setNotes,
  setHidden,
  setChapter,
  setTags,
  setSlideAudience,
  setSummary,
  addBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  setBlockAudience,
  setRelated,
  setShowSlide,
  setMeta,
  setSettings,
  upsertChapter,
  deleteChapter,
  upsertGlossaryTerm,
  deleteGlossaryTerm,
  renameGlossaryTerm,
  moveShowItem,
  upsertProfile,
  deleteProfile,
  upsertPath,
  deletePath,
  replaceAllText,
  replaceSlideText,
};
