// @ts-check
/**
 * The heart of tailored reading: (show, prefs) → the visible model.
 * Pure and DOM-free, so it is unit-tested in Node (viewer/test/).
 *
 * Order of application:
 *   1. path: which slides, in which order ("*" or no path = all, show order)
 *   2. reader.hidden slides are dropped
 *   3. blocks: `for` (profile) and `depth ≤ prefs.depth`
 *   4. consecutive slides are grouped by chapter
 */

/**
 * @typedef {object} ReaderPrefs
 * @property {string | null} profile  Profile id, or null = no profile chosen (show everything).
 * @property {1 | 2 | 3} depth        Show blocks with depth ≤ this (block default depth: 2).
 * @property {string | null} path     Path id, or null = all slides.
 */

/**
 * @typedef {object} VisibleSlide
 * @property {any} slide
 * @property {any[]} blocks   The slide's visible reader blocks.
 */

/**
 * @typedef {object} VisibleChapter
 * @property {any | null} chapter  Entry from show.chapters, or null for slides without a chapter.
 * @property {VisibleSlide[]} slides
 */

/**
 * @typedef {object} ReaderModel
 * @property {ReaderPrefs} prefs   The effective (validated) prefs.
 * @property {any | null} path     The active path entry, if any.
 * @property {VisibleSlide[]} slides
 * @property {VisibleChapter[]} chapters
 */

/** @type {ReaderPrefs} */
export const DEFAULT_PREFS = Object.freeze({ profile: null, depth: 2, path: null });

/**
 * @param {any} show
 * @param {Partial<ReaderPrefs>} [prefs]
 * @returns {ReaderModel}
 */
export function personalize(show, prefs = {}) {
  const effective = normalisePrefs(show, prefs);
  const all = Array.isArray(show.slides) ? show.slides : [];
  const path = effective.path ? show.paths?.find((/** @type {any} */ p) => p.id === effective.path) ?? null : null;

  let ordered = all;
  if (path && Array.isArray(path.slides)) {
    const byId = new Map(all.map((/** @type {any} */ s) => [s.id, s]));
    ordered = path.slides.map((/** @type {string} */ id) => byId.get(id)).filter(Boolean);
  }

  /** @type {VisibleSlide[]} */
  const slides = ordered
    .filter((/** @type {any} */ s) => !s.reader?.hidden)
    .map((/** @type {any} */ slide) => ({
      slide,
      blocks: (slide.reader?.blocks ?? []).filter((/** @type {any} */ b) => blockVisible(b, effective)),
    }));

  const chapterById = new Map((show.chapters ?? []).map((/** @type {any} */ c) => [c.id, c]));
  /** @type {VisibleChapter[]} */
  const chapters = [];
  for (const entry of slides) {
    const chapter = chapterById.get(entry.slide.chapter) ?? null;
    const last = chapters[chapters.length - 1];
    if (last && last.chapter === chapter) last.slides.push(entry);
    else chapters.push({ chapter, slides: [entry] });
  }

  return { prefs: effective, path, slides, chapters };
}

/**
 * @param {any} block
 * @param {ReaderPrefs} prefs
 */
export function blockVisible(block, prefs) {
  const forOk = !prefs.profile || !Array.isArray(block.for) || block.for.includes(prefs.profile);
  const depthOk = (block.depth ?? 2) <= prefs.depth;
  return forOk && depthOk;
}

/**
 * Validate prefs against the show: unknown profile/path ids become null,
 * depth is clamped to 1–3.
 * @param {any} show
 * @param {Partial<ReaderPrefs>} prefs
 * @returns {ReaderPrefs}
 */
export function normalisePrefs(show, prefs) {
  const profiles = new Set((show.profiles ?? []).map((/** @type {any} */ p) => p.id));
  const paths = new Set((show.paths ?? []).map((/** @type {any} */ p) => p.id));
  const depth = Number(prefs.depth);
  return {
    profile: prefs.profile && profiles.has(prefs.profile) ? prefs.profile : null,
    depth: /** @type {1|2|3} */ (depth >= 1 && depth <= 3 ? Math.round(depth) : DEFAULT_PREFS.depth),
    path: prefs.path && paths.has(prefs.path) ? prefs.path : null,
  };
}

/**
 * Read prefs from URL parameters (?profile=dev&depth=3&path=quick).
 * Missing parameters are left out, so stored prefs can fill them in.
 * @param {URLSearchParams} params
 * @returns {Partial<ReaderPrefs>}
 */
export function prefsFromParams(params) {
  /** @type {Partial<ReaderPrefs>} */
  const prefs = {};
  if (params.has('profile')) prefs.profile = params.get('profile') || null;
  if (params.has('depth')) prefs.depth = /** @type {1|2|3} */ (Number(params.get('depth')));
  if (params.has('path')) prefs.path = params.get('path') || null;
  return prefs;
}

/**
 * The visible slide to show for a requested slide id. If that slide is not
 * visible (reader-hidden, or not on the active path), use the nearest earlier
 * visible slide in show order, then the nearest later one, then the first.
 * @param {any} show
 * @param {ReaderModel} model
 * @param {string | null | undefined} slideId
 * @returns {string | null}
 */
export function nearestVisibleSlide(show, model, slideId) {
  const visible = new Set(model.slides.map((s) => s.slide.id));
  if (slideId && visible.has(slideId)) return slideId;
  const all = (show.slides ?? []).map((/** @type {any} */ s) => s.id);
  const index = slideId ? all.indexOf(slideId) : -1;
  if (index >= 0) {
    for (let i = index - 1; i >= 0; i--) if (visible.has(all[i])) return all[i];
    for (let i = index + 1; i < all.length; i++) if (visible.has(all[i])) return all[i];
  }
  return model.slides[0]?.slide.id ?? null;
}
