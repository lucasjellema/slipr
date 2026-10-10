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
 * Update an existing block in a slide's reader layer.
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
      return { ...b, ...patch };
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

/** Action registry lookup */
export const actions = {
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
};
