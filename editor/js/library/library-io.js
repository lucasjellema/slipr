// @ts-check
/**
 * Slide library (I-029): moving slides between the open show and the library.
 * Reads the files a slide uses from wherever the show lives (its folder, a
 * zip, files added in this session, or its URL), and writes the files of
 * inserted slides into the show the same way the editor adds images.
 */
import { contentHash } from './library-store.js';
import { entryFromSlide, pathWithHash, prepareInsert, slideFiles, updatedEntry } from './library-model.js';
import { writeImage } from '../io/fs-access.js';
import { mimeType } from '../../../shared/zip.js';

/** @typedef {import('./library-model.js').LibraryEntry} LibraryEntry */
/** @typedef {import('./library-store.js').SlideLibrary} SlideLibrary */
/** @typedef {import('../store.js').EditorStore} EditorStore */

/**
 * A file in a folder, by a `/`-separated path, or null.
 * @param {FileSystemDirectoryHandle} handle @param {string} path
 * @returns {Promise<Blob | null>}
 */
async function readFolderFile(handle, path) {
  const parts = path.split('/').filter((p) => p && p !== '.');
  if (!parts.length || parts.includes('..')) return null;
  try {
    let dir = handle;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await (await dir.getFileHandle(/** @type {string} */ (parts.at(-1)))).getFile();
  } catch {
    return null;
  }
}

/**
 * A file of the open show (a path relative to show.json), or null when it is missing.
 * @param {EditorStore['state']} state
 * @param {string} path
 * @returns {Promise<Blob | null>}
 */
export async function readShowFile(state, path) {
  const own = state.inMemoryAssets?.get(path);
  if (own) return own;
  if (state.folderHandle) return readFolderFile(state.folderHandle, path);
  if (state.zipSource) {
    const blob = await state.zipSource.readFile(path).catch(() => null);
    if (blob) return blob;
  }
  try {
    const res = await fetch(state.resolveAsset?.(path) ?? path);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/**
 * Library entries for slides of the open show, with their files.
 * @param {EditorStore} store
 * @param {string[]} slideIds
 * @param {{ tags?: string[], note?: string, collection?: string | null, title?: string }} meta  `title` only for a single slide.
 * @returns {Promise<{ entries: LibraryEntry[], files: Map<string, Blob>, missing: string[] }>}
 */
export async function entriesFromSlides(store, slideIds, meta = {}) {
  const { show, template } = store.state;
  const slides = (show?.slides ?? []).filter((/** @type {any} */ s) => slideIds.includes(s.id));
  /** @type {Map<string, Blob>} */
  const files = new Map();
  /** @type {string[]} */
  const missing = [];
  const base = Date.now();
  const entries = [];
  for (const [i, slide] of slides.entries()) {
    const refs = [];
    for (const path of slideFiles(slide)) {
      const blob = await readShowFile(store.state, path);
      if (!blob) {
        missing.push(path);
        continue;
      }
      const bytes = await blob.arrayBuffer();
      const hash = await contentHash(bytes);
      const type = blob.type || mimeType(path);
      files.set(hash, blob.type ? blob : new Blob([bytes], { type }));
      refs.push({ path, hash, type, size: bytes.byteLength });
    }
    entries.push(entryFromSlide(slide, {
      show, template, files: refs,
      title: slides.length === 1 ? meta.title : undefined,
      tags: meta.tags, note: meta.note, collection: meta.collection ?? null,
      now: base + i, order: base + i,
    }));
  }
  return { entries, files, missing };
}

/**
 * Copy slides of the open show into the library.
 * @param {EditorStore} store @param {SlideLibrary} library @param {string[]} slideIds
 * @param {{ tags?: string[], note?: string, collection?: string | null, title?: string }} [meta]
 * @returns {Promise<{ count: number, missing: string[] }>}
 */
export async function copyToLibrary(store, library, slideIds, meta = {}) {
  const { entries, files, missing } = await entriesFromSlides(store, slideIds, meta);
  await library.add(entries, files);
  return { count: entries.length, missing };
}

/**
 * Replace a library entry with the current version of a slide of the open show.
 * @param {EditorStore} store @param {SlideLibrary} library @param {LibraryEntry} entry @param {string} slideId
 * @returns {Promise<{ entry: LibraryEntry, missing: string[] }>}
 */
export async function updateFromSlide(store, library, entry, slideId) {
  const { entries, files, missing } = await entriesFromSlides(store, [slideId]);
  if (!entries.length) throw new Error('That slide is not in the open show.');
  const next = updatedEntry(entry, entries[0]);
  await library.update(next, files);
  return { entry: next, missing };
}

/**
 * Insert library entries after `afterSlideId`: write their files into the
 * show (renaming a file when the show has a different one at that path),
 * then insert the slides in one undo step.
 * @param {EditorStore} store @param {SlideLibrary} library @param {LibraryEntry[]} entries
 * @param {string | null} afterSlideId
 * @returns {Promise<{ slideIds: string[], notices: string[], missing: number }>}
 */
export async function insertFromLibrary(store, library, entries, afterSlideId) {
  const state = store.state;
  /** @type {Map<string, string>} path → hash of what the show has (or will have) there */
  const planned = new Map();
  /** @type {Map<string, Map<string, string>>} */
  const renames = new Map();
  let missing = 0;

  for (const entry of entries) {
    /** @type {Map<string, string>} */
    const own = new Map();
    for (const ref of entry.files) {
      const blob = await library.file(ref.hash);
      if (!blob) {
        missing += 1;
        continue;
      }
      let path = ref.path;
      for (let tries = 0; tries < 2; tries++) {
        const there = planned.get(path) ?? (await hashOf(await readShowFile(state, path)));
        if (there === ref.hash) break;                // the same file is there already
        if (there === null) {                         // free: write it
          await writeShowFile(store, path, blob);
          break;
        }
        path = pathWithHash(ref.path, ref.hash);      // a different file: use a name with the hash
      }
      planned.set(path, ref.hash);
      if (path !== ref.path) own.set(ref.path, path);
    }
    if (own.size) renames.set(entry.id, own);
  }

  const { slides, glossary, notices } = prepareInsert(entries, { show: state.show, template: state.template, afterSlideId, renames });
  store.dispatch('insertSlides', { slides, afterSlideId, glossary });
  if (slides[0]) store.selectSlide(slides[0].id);
  if (missing) notices.push(`${missing} file${missing === 1 ? ' was' : 's were'} missing from the library.`);
  return { slideIds: slides.map((s) => s.id), notices, missing };
}

/** @param {Blob | null} blob */
async function hashOf(blob) {
  return blob ? contentHash(await blob.arrayBuffer()) : null;
}

/**
 * Put a file into the open show: its folder, or (shows without one) this session's files.
 * @param {EditorStore} store @param {string} path @param {Blob} blob
 */
async function writeShowFile(store, path, blob) {
  const state = store.state;
  if (state.folderHandle) await writeImage(state.folderHandle, path, blob);
  else {
    if (!state.inMemoryAssets) state.inMemoryAssets = new Map();
    state.inMemoryAssets.set(path, blob);
  }
  state.registerAsset?.(path, blob);
}
