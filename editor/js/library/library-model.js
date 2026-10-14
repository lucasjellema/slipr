// @ts-check
/**
 * Slide library (I-029): the DOM-free part. A library entry is a frozen,
 * self-contained copy of one slide: the slide, the definition of its layout
 * (slot types, to choose a layout in another template), the glossary terms it
 * references, the files it uses (by content hash; the bytes live in the
 * library store) and where it came from.
 *
 * Inserting entries into a show (decisions in docs/specs/I-029-slide-library.md):
 * - the layout is kept when the show's template has it, otherwise the layout
 *   whose slots fit best is used (content the new layout lacks goes to `_orphaned`);
 * - slides get new ids; links between slides inserted together follow them;
 *   links to slides the show lacks, unknown profiles in `for` and the chapter
 *   are cleaned from structured fields (Markdown `#links` stay: the validator warns);
 *   the slides join the chapter of the slide they follow;
 * - glossary terms the show lacks are added; the show's own terms win;
 * - files keep their path unless the show has a different file there.
 */
import { setLayout } from '../actions.js';
import { showFiles } from '../../../shared/export/single-file.js';
import { slideTitle } from '../../../shared/render.js';
import { markdownToText } from '../../../shared/markdown.js';

/** Format of library.json in an exported library zip. */
export const LIBRARY_FORMAT = 'slipr-library';
export const LIBRARY_VERSION = 1;

/**
 * @typedef {object} LibraryFileRef
 * @property {string} path  As the slide names it (relative to show.json).
 * @property {string} hash  Content hash: the key of the bytes in the library store.
 * @property {string} type  MIME type.
 * @property {number} size  Bytes.
 */

/**
 * @typedef {object} LibraryEntry
 * @property {string} id
 * @property {string} title
 * @property {string[]} tags
 * @property {string} note
 * @property {string | null} collection  Collection id, or null.
 * @property {number} order  Position within its collection (manual order).
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {{ showId: string | null, showTitle: string | null, slideId: string | null, template: { id: string | null, name: string | null, version: string | null } }} source
 * @property {any} slide  The slide, as it was copied.
 * @property {any} layoutDef  Its layout definition in the source template (or null).
 * @property {Record<string, any>} glossary  Glossary terms its Markdown references, by id.
 * @property {LibraryFileRef[]} files
 */

/** @typedef {{ id: string, name: string, order: number }} LibraryCollection */

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function newLibraryId(prefix = 'lib-') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** @param {any} value */
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/**
 * Every Markdown or plain string in a value, for reference scans. DOM-free.
 * @param {any} value
 * @param {(text: string) => void} fn
 */
function eachString(value, fn) {
  if (typeof value === 'string') fn(value);
  else if (Array.isArray(value)) for (const v of value) eachString(v, fn);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) eachString(v, fn);
}

/**
 * Glossary ids referenced as `[[id]]` or `[[id|label]]` anywhere in a slide.
 * @param {any} slide
 * @returns {string[]}
 */
export function glossaryIdsIn(slide) {
  const ids = new Set();
  eachString(slide, (text) => {
    for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) ids.add(m[1].trim());
  });
  return [...ids];
}

/**
 * Files a slide uses that live in the show folder (images, PDFs, data files,
 * backgrounds, local pages), as written in the slide.
 * @param {any} slide
 * @returns {string[]}
 */
export function slideFiles(slide) {
  return showFiles({ slides: [slide] });
}

/**
 * A library entry for a slide, without its file bytes (the caller hashes and
 * stores them, and passes the references in `files`).
 * @param {any} slide
 * @param {{ show: any, template?: any, files?: LibraryFileRef[], title?: string, tags?: string[], note?: string, collection?: string | null, order?: number, now?: number, id?: string }} context
 * @returns {LibraryEntry}
 */
export function entryFromSlide(slide, context) {
  const { show, template } = context;
  const now = context.now ?? Date.now();
  const glossary = /** @type {Record<string, any>} */ ({});
  for (const id of glossaryIdsIn(slide)) {
    if (show?.glossary?.[id]) glossary[id] = clone(show.glossary[id]);
  }
  const layoutDef = (template?.layouts ?? []).find((/** @type {any} */ l) => l.id === slide?.layout) ?? null;
  const copy = clone(slide);
  delete copy.chapter; // chapters belong to the show; an inserted slide joins the chapter where it lands
  return {
    id: context.id ?? newLibraryId(),
    title: (context.title ?? '').trim() || slideTitle(slide) || 'Slide',
    tags: cleanTags(context.tags ?? []),
    note: context.note ?? '',
    collection: context.collection ?? null,
    order: context.order ?? now,
    createdAt: now,
    updatedAt: now,
    source: {
      showId: show?.id ?? null,
      showTitle: show?.meta?.title ?? null,
      slideId: slide?.id ?? null,
      template: { id: template?.id ?? null, name: template?.name ?? null, version: template?.version ?? null },
    },
    slide: copy,
    layoutDef: clone(layoutDef),
    glossary,
    files: context.files ?? [],
  };
}

/**
 * The entry with a new version of its slide (I-029 "update from slide"):
 * title, tags, note, collection and order stay.
 * @param {LibraryEntry} entry
 * @param {LibraryEntry} fresh  entryFromSlide() of the new slide.
 * @returns {LibraryEntry}
 */
export function updatedEntry(entry, fresh) {
  return { ...fresh, id: entry.id, title: entry.title, tags: entry.tags, note: entry.note, collection: entry.collection, order: entry.order, createdAt: entry.createdAt };
}

/**
 * Tags: trimmed, lower case, unique, non-empty.
 * @param {string[] | string} tags  An array, or text separated by commas.
 * @returns {string[]}
 */
export function cleanTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Browsing

/**
 * The searchable text of an entry: title, tags, note, source, slide text.
 * @param {LibraryEntry} entry
 */
export function entryText(entry) {
  const parts = [entry.title, entry.tags.join(' '), entry.note, entry.source?.showTitle ?? ''];
  eachString(entry.slide?.content, (text) => parts.push(/\n|\*|\[/.test(text) ? markdownToText(text) : text));
  eachString(entry.slide?.notes, (text) => parts.push(text));
  for (const block of entry.slide?.reader?.blocks ?? []) eachString(block?.md ?? block?.title ?? '', (text) => parts.push(text));
  return parts.join('\n').toLowerCase();
}

/**
 * @typedef {object} LibraryFilter
 * @property {string} [query]  Words that must all occur (title, tags, note, source, text).
 * @property {string[]} [tags]  Entries with every one of these tags.
 * @property {string | null} [collection]  A collection id, `''` for entries in none; absent for all.
 * @property {string | null} [template]  A template id; absent for all.
 * @property {string | null} [showId]  A source show id; absent for all.
 * @property {'manual' | 'newest' | 'title'} [sort]  Default manual: collection order, then position.
 */

/**
 * The entries that pass a filter, sorted. DOM-free.
 * @param {LibraryEntry[]} entries
 * @param {LibraryFilter} filter
 * @param {LibraryCollection[]} [collections]
 * @returns {LibraryEntry[]}
 */
export function filterEntries(entries, filter = {}, collections = []) {
  const words = String(filter.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const tags = filter.tags ?? [];
  const out = entries.filter((e) => {
    if (filter.collection !== undefined && filter.collection !== null && (e.collection ?? '') !== filter.collection) return false;
    if (filter.template && e.source?.template?.id !== filter.template) return false;
    if (filter.showId && e.source?.showId !== filter.showId) return false;
    if (tags.some((t) => !e.tags.includes(t))) return false;
    if (words.length) {
      const text = entryText(e);
      if (words.some((w) => !text.includes(w))) return false;
    }
    return true;
  });
  const collectionRank = new Map(collections.map((c) => [c.id, c.order]));
  const rank = (/** @type {LibraryEntry} */ e) => (e.collection ? collectionRank.get(e.collection) ?? Infinity : -Infinity);
  if (filter.sort === 'newest') out.sort((a, b) => b.createdAt - a.createdAt);
  else if (filter.sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.createdAt - b.createdAt);
  return out;
}

/**
 * All tags in use, most used first.
 * @param {LibraryEntry[]} entries
 * @returns {string[]}
 */
export function libraryTags(entries) {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const e of entries) for (const t of e.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/**
 * New `order` values that move `id` one place earlier (-1) or later (+1)
 * among the entries of its collection (in manual order).
 * @param {LibraryEntry[]} entries  All entries.
 * @param {string} id
 * @param {number} delta  -1 or +1, or the target index within the collection with `absolute`.
 * @param {{ absolute?: boolean }} [options]
 * @returns {{ id: string, order: number }[]}  The entries whose order changes.
 */
export function reorderEntries(entries, id, delta, options = {}) {
  const moving = entries.find((e) => e.id === id);
  if (!moving) return [];
  const group = entries.filter((e) => (e.collection ?? null) === (moving.collection ?? null))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const from = group.findIndex((e) => e.id === id);
  const to = Math.max(0, Math.min(group.length - 1, options.absolute ? delta : from + delta));
  if (from === to) return [];
  group.splice(to, 0, ...group.splice(from, 1));
  return group.map((e, i) => ({ id: e.id, order: i + 1 })).filter((c) => entries.find((e) => e.id === c.id)?.order !== c.order);
}

// ---------------------------------------------------------------------------
// Inserting into a show

/**
 * The best layout in `layouts` for a slide from another template: the one
 * whose slots take most of the slide's content (same name, and same type when
 * known), with the fewest required slots left empty. Ties keep template order.
 * @param {any} slide
 * @param {any} sourceDef  The slide's layout in its own template (for slot types), or null.
 * @param {any[]} layouts  The target template's layout definitions.
 * @returns {string | null}
 */
export function bestLayout(slide, sourceDef, layouts) {
  if (!Array.isArray(layouts) || !layouts.length) return null;
  if (layouts.some((l) => l.id === slide?.layout)) return slide.layout;
  const content = slide?.content ?? {};
  const filled = Object.keys(content).filter((k) => hasValue(content[k]));
  const typeOf = (/** @type {string} */ name) => sourceDef?.slots?.find((/** @type {any} */ s) => s.name === name)?.type ?? null;
  let best = null;
  let bestScore = -Infinity;
  for (const def of layouts) {
    const slots = Array.isArray(def.slots) ? def.slots : [];
    let score = 0;
    for (const name of filled) {
      const slot = slots.find((/** @type {any} */ s) => s.name === name);
      if (!slot) continue;
      const type = typeOf(name);
      score += !type || type === slot.type ? 2 : 0.5;
    }
    score -= slots.filter((/** @type {any} */ s) => s.required && !hasValue(content[s.name])).length;
    if (score > bestScore) {
      best = def.id;
      bestScore = score;
    }
  }
  return best;
}

/** @param {any} value */
const hasValue = (value) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

/**
 * A file path with the content hash before the extension (`images/a.png` →
 * `images/a-1a2b3c4d.png`), for a file whose path is taken by another file.
 * @param {string} path @param {string} hash
 */
export function pathWithHash(path, hash) {
  const short = hash.slice(0, 8);
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  if (dot > slash + 1) return `${path.slice(0, dot)}-${short}${path.slice(dot)}`;
  return `${path}-${short}`;
}

/**
 * A copy of a value with exact string matches replaced (file paths).
 * @param {any} value
 * @param {Map<string, string>} renames
 * @returns {any}
 */
export function renamePaths(value, renames) {
  if (!renames.size) return value;
  if (typeof value === 'string') return renames.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => renamePaths(v, renames));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renamePaths(v, renames)]));
  return value;
}

/**
 * @typedef {object} PreparedInsert
 * @property {any[]} slides  Ready to insert: new ids, layout chosen, references cleaned.
 * @property {Record<string, any>} glossary  Terms to add (the show lacks them).
 * @property {string[]} notices  What changed, for the person inserting.
 */

/**
 * Prepare library entries for insertion into `show` after `afterSlideId`.
 * DOM-free and deterministic apart from `newId`.
 * @param {LibraryEntry[]} entries  In the order to insert.
 * @param {{ show: any, template: any, afterSlideId?: string | null, renames?: Map<string, Map<string, string>>, newId?: () => string }} target
 *   renames: per entry id, file path → new path (files the show has a different version of).
 * @returns {PreparedInsert}
 */
export function prepareInsert(entries, target) {
  const { show, template } = target;
  const layouts = Array.isArray(template?.layouts) ? template.layouts : [];
  const layoutsById = Object.fromEntries(layouts.map((/** @type {any} */ l) => [l.id, l]));
  const newId = target.newId ?? (() => `s-${Math.random().toString(36).slice(2, 8)}`);
  const renames = target.renames ?? new Map();
  const renamed = new Set([...renames.values()].flatMap((m) => [...m.values()]));
  /** @type {string[]} */
  const notices = [];

  const taken = new Set((show?.slides ?? []).map((/** @type {any} */ s) => s.id));
  /** @type {Map<string, string>} */
  const ids = new Map();
  for (const e of entries) {
    let id = newId();
    while (taken.has(id)) id = newId();
    taken.add(id);
    if (e.slide?.id) ids.set(e.slide.id, id);
  }
  // A slide id is fine if it is one of ours, or the show has it.
  const existing = new Set((show?.slides ?? []).map((/** @type {any} */ s) => s.id));
  const mapSlide = (/** @type {string} */ id) => ids.get(id) ?? (existing.has(id) ? id : null);
  const profiles = new Set((show?.profiles ?? []).map((/** @type {any} */ p) => p.id));
  const after = (show?.slides ?? []).find((/** @type {any} */ s) => s.id === target.afterSlideId) ?? null;
  const chapter = after?.chapter ?? null;

  let droppedLinks = 0;
  let droppedProfiles = 0;
  const slides = entries.map((e) => {
    let slide = renamePaths(clone(e.slide), renames.get(e.id) ?? new Map());
    const oldId = slide.id;
    slide.id = ids.get(oldId) ?? newId();
    delete slide.chapter;
    if (chapter) slide.chapter = chapter;

    // Layout: keep it, or the best fit in this template.
    const layout = bestLayout(slide, e.layoutDef, layouts);
    if (layout) {
      const before = new Set(Object.keys(slide._orphaned ?? {}));
      const switched = layout !== slide.layout;
      slide = setLayout({ slides: [slide] }, { slideId: slide.id, layout, templateLayouts: layoutsById }).slides[0];
      const aside = Object.keys(slide._orphaned ?? {}).filter((k) => !before.has(k))
        .map((k) => e.layoutDef?.slots?.find((/** @type {any} */ s) => s.name === k)?.label ?? k);
      if (switched || aside.length) {
        notices.push(`“${e.title}”${switched ? ` uses the layout “${layoutsById[layout]?.name ?? layout}” here (its own, “${e.layoutDef?.name ?? e.slide.layout}”, is not in this template)` : ''}`
          + `${aside.length ? `${switched ? ';' : ':'} ${aside.join(', ')} ${aside.length === 1 ? 'has' : 'have'} no place in it and ${aside.length === 1 ? 'is' : 'are'} kept aside (back when you pick a layout that has ${aside.length === 1 ? 'it' : 'them'})` : ''}.`);
      }
    }

    // Related slides (reader.related).
    if (Array.isArray(slide.reader?.related)) {
      const kept = slide.reader.related.map(mapSlide).filter(Boolean);
      droppedLinks += slide.reader.related.length - kept.length;
      slide.reader = { ...slide.reader };
      if (kept.length) slide.reader.related = kept;
      else delete slide.reader.related;
    }
    // Reader blocks: slide-ref links, profiles.
    if (Array.isArray(slide.reader?.blocks)) {
      slide.reader.blocks = slide.reader.blocks.flatMap((/** @type {any} */ block) => {
        let b = block;
        if (Array.isArray(b.for)) {
          const kept = b.for.filter((/** @type {string} */ p) => profiles.has(p));
          droppedProfiles += b.for.length - kept.length;
          b = { ...b };
          if (kept.length) b.for = kept;
          else delete b.for;
        }
        if (b.type === 'slide-ref') {
          const to = mapSlide(b.slide);
          if (to) return [{ ...b, slide: to }];
          droppedLinks += 1;
          if (!b.label) return [];
          const { slide: _gone, label, ...rest } = b;
          return [{ ...rest, type: 'text', md: label }];
        }
        return [relinkNodes(b)];
      });
    }
    // Graph nodes and map markers that link to a slide.
    if (slide.content && typeof slide.content === 'object') {
      slide.content = Object.fromEntries(Object.entries(slide.content).map(([k, v]) => [k, relinkNodes(v)]));
    }
    // Markdown links to slides we renamed.
    slide = relinkMarkdown(slide, ids);
    return slide;

    /** Graph / map values: `slide` on nodes and markers. @param {any} value */
    function relinkNodes(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      /** @type {any} */
      let out = value;
      for (const list of ['nodes', 'markers']) {
        if (!Array.isArray(value[list])) continue;
        out = { ...out, [list]: value[list].map((/** @type {any} */ n) => {
          if (!n || typeof n.slide !== 'string') return n;
          const to = mapSlide(n.slide);
          if (to) return { ...n, slide: to };
          droppedLinks += 1;
          const { slide: _gone, ...rest } = n;
          return rest;
        }) };
      }
      return out;
    }
  });

  if (droppedLinks) notices.push(`${droppedLinks} link${droppedLinks === 1 ? '' : 's'} to slides that are not in this show ${droppedLinks === 1 ? 'was' : 'were'} removed.`);
  if (droppedProfiles) notices.push(`${droppedProfiles} reader profile${droppedProfiles === 1 ? '' : 's'} this show does not have ${droppedProfiles === 1 ? 'was' : 'were'} removed from blocks (blocks left without one show to everyone).`);

  // Glossary: add what the show lacks; the show's own terms win.
  /** @type {Record<string, any>} */
  const glossary = {};
  const skipped = [];
  for (const e of entries) {
    for (const [id, term] of Object.entries(e.glossary ?? {})) {
      const own = show?.glossary?.[id];
      if (!own) glossary[id] = clone(term);
      else if (JSON.stringify(own) !== JSON.stringify(term) && !skipped.includes(id)) skipped.push(id);
    }
  }
  if (skipped.length) notices.push(`This show already defines ${skipped.map((id) => `“${show.glossary[id]?.term ?? id}”`).join(', ')}; its own definition is kept.`);
  if (renamed.size) notices.push(`${renamed.size} file${renamed.size === 1 ? '' : 's'} got a new name, because this show has a different file with the same name.`);

  return { slides, glossary, notices };
}

/**
 * How an entry would land in a template: the layout it gets, and the slots
 * (labels) set aside because that layout has no place for them. DOM-free.
 * @param {LibraryEntry} entry
 * @param {any} template
 * @returns {{ layout: string | null, switched: boolean, aside: string[] }}
 */
export function landing(entry, template) {
  const layouts = Array.isArray(template?.layouts) ? template.layouts : [];
  const layout = bestLayout(entry.slide, entry.layoutDef, layouts);
  const def = layouts.find((/** @type {any} */ l) => l.id === layout);
  const names = new Set((def?.slots ?? []).map((/** @type {any} */ s) => s.name));
  const content = entry.slide?.content ?? {};
  const aside = def ? Object.keys(content).filter((k) => hasValue(content[k]) && !names.has(k))
    .map((k) => entry.layoutDef?.slots?.find((/** @type {any} */ s) => s.name === k)?.label ?? k) : [];
  return { layout, switched: Boolean(layout && layout !== entry.slide?.layout), aside };
}

/**
 * Markdown links `](#old-id)` to slides that were given new ids.
 * @param {any} slide @param {Map<string, string>} ids
 */
function relinkMarkdown(slide, ids) {
  if (!ids.size) return slide;
  const fix = (/** @type {any} */ value) => {
    if (typeof value === 'string') return value.replace(/\]\(#([^)\s]+)\)/g, (whole, id) => (ids.has(id) ? `](#${ids.get(id)})` : whole));
    if (Array.isArray(value)) return value.map(fix);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' ? v : fix(v)]));
    return value;
  };
  return fix(slide);
}

// ---------------------------------------------------------------------------
// Export and import (a zip with library.json and files/<hash>)

/**
 * library.json for an export of `entries` (and the collections they use).
 * @param {LibraryEntry[]} entries
 * @param {LibraryCollection[]} collections
 * @returns {{ format: string, version: number, exportedAt: string, collections: LibraryCollection[], entries: LibraryEntry[] }}
 */
export function libraryManifest(entries, collections, now = new Date()) {
  const used = new Set(entries.map((e) => e.collection).filter(Boolean));
  return {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    exportedAt: now.toISOString(),
    collections: collections.filter((c) => used.has(c.id)),
    entries,
  };
}

/** Zip path of a library file. @param {LibraryFileRef} file */
export function zipFilePath(file) {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.path)?.[1]?.toLowerCase() ?? 'bin';
  return `files/${file.hash}.${ext}`;
}

/**
 * Read library.json from an import. Throws a clear error when it is not a library.
 * @param {any} json
 * @returns {{ entries: LibraryEntry[], collections: LibraryCollection[] }}
 */
export function parseManifest(json) {
  if (!json || json.format !== LIBRARY_FORMAT) throw new Error('This zip is not a Slipr slide library (no library.json).');
  if (json.version > LIBRARY_VERSION) throw new Error('This library was made by a newer Slipr.');
  const entries = (Array.isArray(json.entries) ? json.entries : []).filter((/** @type {any} */ e) => e && typeof e.id === 'string' && e.slide && typeof e.slide === 'object')
    .map((/** @type {any} */ e) => ({
      ...e,
      title: String(e.title ?? 'Slide'),
      tags: cleanTags(Array.isArray(e.tags) ? e.tags : []),
      note: String(e.note ?? ''),
      collection: typeof e.collection === 'string' ? e.collection : null,
      order: Number(e.order) || 0,
      createdAt: Number(e.createdAt) || 0,
      updatedAt: Number(e.updatedAt) || 0,
      glossary: e.glossary && typeof e.glossary === 'object' ? e.glossary : {},
      files: Array.isArray(e.files) ? e.files.filter((/** @type {any} */ f) => f && typeof f.path === 'string' && /^[0-9a-f]{16,64}$/.test(String(f.hash))) : [],
    }));
  const collections = (Array.isArray(json.collections) ? json.collections : [])
    .filter((/** @type {any} */ c) => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((/** @type {any} */ c) => ({ id: c.id, name: c.name, order: Number(c.order) || 0 }));
  return { entries, collections };
}

/**
 * What an import does with each entry: add it, replace an older copy, or skip
 * it (the library has the same entry, updated at the same time or later).
 * @param {LibraryEntry[]} incoming
 * @param {LibraryEntry[]} current
 * @returns {{ add: LibraryEntry[], replace: LibraryEntry[], skip: LibraryEntry[] }}
 */
export function planImport(incoming, current) {
  const byId = new Map(current.map((e) => [e.id, e]));
  /** @type {{ add: LibraryEntry[], replace: LibraryEntry[], skip: LibraryEntry[] }} */
  const plan = { add: [], replace: [], skip: [] };
  for (const e of incoming) {
    const mine = byId.get(e.id);
    if (!mine) plan.add.push(e);
    else if (e.updatedAt > mine.updatedAt) plan.replace.push(e);
    else plan.skip.push(e);
  }
  return plan;
}
