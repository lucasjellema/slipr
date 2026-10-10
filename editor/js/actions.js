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
export const BLOCK_TYPES = ['text', 'details', 'callout', 'tabs', 'image', 'embed', 'slide-ref'];

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
      return { ...base, url: block.url ?? '', title: title ?? 'Embedded page', ...(block.height ? { height: block.height } : {}) };
    case 'slide-ref':
      return { ...base, slide: block.slide ?? defaults.slideId ?? '', ...(block.label ? { label: block.label } : {}) };
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
  return {
    ...show,
    meta: {
      ...(show.meta ?? {}),
      ...patch,
    },
  };
}

/**
 * Update show settings.
 * @param {any} show
 * @param {Record<string, any>} patch
 * @returns {any}
 */
export function setSettings(show, patch) {
  return {
    ...show,
    settings: {
      ...(show.settings ?? {}),
      ...patch,
    },
  };
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
    chapters[idx] = { ...chapters[idx], ...chapter };
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
 * @param {{ id: string, term: string, definition: string, link?: string }} payload
 * @returns {any}
 */
export function upsertGlossaryTerm(show, { id, term, definition, link }) {
  const glossary = { ...(show.glossary ?? {}) };
  const entry = { term, definition };
  if (link && link.trim() !== '') {
    entry.link = link;
  }
  glossary[id] = entry;
  return { ...show, glossary };
}

/**
 * Delete a glossary term from show.glossary.
 * @param {any} show
 * @param {{ id: string }} payload
 * @returns {any}
 */
export function deleteGlossaryTerm(show, { id }) {
  const glossary = { ...(show.glossary ?? {}) };
  delete glossary[id];
  return { ...show, glossary };
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
    profiles[idx] = { ...profiles[idx], ...profile };
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
    paths[idx] = { ...paths[idx], ...path };
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
          }
        }
      }

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
            for (const f of ['md', 'title', 'caption', 'label']) {
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
      }
    }
    if (contentChanged) {
      updatedSlide = { ...updatedSlide, content: nextContent };
    }
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

        for (const f of ['md', 'title', 'caption', 'label']) {
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
export const actions = {
  setBlockType,
  addHotspot,
  updateHotspot,
  deleteHotspot,
  addSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  setLayout,
  setSlot,
  setNotes,
  setHidden,
  setChapter,
  setTags,
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
  upsertProfile,
  deleteProfile,
  upsertPath,
  deletePath,
  replaceAllText,
  replaceSlideText,
};
