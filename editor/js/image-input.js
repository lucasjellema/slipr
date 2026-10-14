// @ts-check
/**
 * Adding images to image slots (E-006): from a file chooser, drag and drop,
 * or the clipboard. The file is copied into the show folder's images/ (named
 * by content hash, so the same image is stored once), the slot gets
 * `{ src, alt }`, and the alt-text dialog opens. Undo restores the previous
 * image; the copied file stays (images are never deleted automatically).
 */
import { contentSuffix, imagePath, imageType, IMAGE_TYPES, isPdfFile, LARGE_IMAGE_BYTES, pdfPath, shortHash } from './io/images.js';
import { canOpenFolders, ensurePermission, findImageBySuffix, writeImage } from './io/fs-access.js';
import { slugify } from './io/new-show.js';
import { imageValue } from './slot-values.js';
import { cardsValue, withCardField } from './card-values.js';
import { withFallback } from './block-values.js';
import { newOverlayBox } from './actions.js';
import { askForShowFolder } from './files.js';
import { openAltTextDialog, showBanner } from './ui/dialogs.js';

/**
 * The first image file in a drop or paste, or null.
 * @param {DataTransfer | null} data
 * @returns {File | null}
 */
export function imageFileFrom(data) {
  if (!data) return null;
  for (const file of data.files ?? []) {
    if (imageType(file)) return file;
  }
  for (const item of data.items ?? []) {
    if (item.kind === 'file' && IMAGE_TYPES[item.type]) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/**
 * Read an image from the clipboard (the "Paste" button). The browser may ask
 * for permission first.
 * @returns {Promise<File | null>}
 */
export async function readClipboardImage() {
  if (!navigator.clipboard?.read) {
    throw new Error('This browser cannot read images from the clipboard with a button. Click the image field and press Ctrl+V.');
  }
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => IMAGE_TYPES[t]);
    if (type) return new File([await item.getType(type)], `image.${IMAGE_TYPES[type]}`, { type });
  }
  return null;
}

/**
 * The image slots of a slide's layout.
 * @param {any} template
 * @param {any} slide
 * @returns {any[]}
 */
export function imageSlots(template, slide) {
  const layout = template?.layouts?.find((/** @type {any} */ l) => l.id === slide?.layout);
  return (layout?.slots ?? []).filter((/** @type {any} */ s) => s.type === 'image');
}

/**
 * Where a paste outside an image field goes: the first empty image slot, else the first image slot.
 * @param {any} template
 * @param {any} slide
 * @returns {string | null}
 */
export function pasteTargetSlot(template, slide) {
  const slots = imageSlots(template, slide);
  const empty = slots.find((s) => !slide?.content?.[s.name]?.src);
  return (empty ?? slots[0])?.name ?? null;
}

/**
 * Copy an image into the show folder, store it with `write`, then ask for alt text.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, file: File, fallbackName: string,
 *   read: (slide: any) => any, write: (image: any) => void }} target
 *   `read` returns the current image value of the target, `write` stores a new one.
 */
async function addImage(store, { slideId, file, fallbackName, read, write, defaultAlt }) {
  const handle = store.state.folderHandle;
  if (!handle && !store.state.zipSource && canOpenFolders()) {
    showBanner('To add images, Slipr needs to write to the show folder. Choose it, then add the image again.', 'info', { timeout: 6000 });
    askForShowFolder(store);
    return;
  }
  const type = imageType(file);
  if (!type) throw new Error(`"${file.name || 'This file'}" is not a supported image (PNG, JPEG, GIF, WebP, AVIF or SVG).`);
  if (handle && !(await ensurePermission(handle))) throw new Error(`No permission to write to the folder "${handle.name}".`);

  const slideOf = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  if (!slideOf()) return;
  const bytes = await file.arrayBuffer();
  const blob = file.type === type ? file : new Blob([bytes], { type });
  const newPath = await imagePath({ name: file.name, type, bytes }, fallbackName);

  let path = newPath;
  if (handle) {
    // The same image may already be in the folder under another name: reuse it.
    const suffix = contentSuffix(newPath);
    path = (suffix && (await findImageBySuffix(handle, suffix))) || newPath;
    if (path === newPath) await writeImage(handle, path, blob);
  } else {
    // In-memory show (e.g. from zip archive or browser without File System Access)
    if (!store.state.inMemoryAssets) store.state.inMemoryAssets = new Map();
    store.state.inMemoryAssets.set(path, blob);
  }
  store.state.registerAsset?.(path, blob);

  const previous = read(slideOf());
  const keepAlt = previous?.src === path;
  write(imageValue(keepAlt ? previous : { ...previous, alt: defaultAlt || undefined }, { src: path }));

  if (file.size > LARGE_IMAGE_BYTES) {
    showBanner(`This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Large images make shows slow to open; consider a smaller or compressed version.`, 'info', { timeout: 8000 });
  }

  const previewUrl = URL.createObjectURL(blob);
  openAltTextDialog({
    path,
    previewUrl,
    alt: keepAlt ? previous?.alt ?? '' : defaultAlt ?? '',
    onClose: () => URL.revokeObjectURL(previewUrl),
    onSave: (alt) => {
      const current = read(slideOf());
      if (current?.src !== path) return; // changed meanwhile
      write(imageValue(current, { alt }));
    },
  });
}

/**
 * Copy an image into the show folder and put it in an image slot, then ask for alt text.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, slot: string, file: File }} target
 */
export async function addImageToSlot(store, { slideId, slot, file }) {
  const slide = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  await addImage(store, {
    slideId,
    file,
    fallbackName: `${slugify(slide?.content?.title ?? '') || slideId}-${slot}`,
    read: (s) => s?.content?.[slot],
    write: (value) => store.dispatch('setSlot', { slideId, slot, value }),
  });
}

/**
 * Copy an image into the show folder and make it the fallback image of a
 * `web` (I-071), `pdf` (I-072), `graph` (I-074, E-020) or `map` (I-075, E-021) slot, then ask for alt text.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, slot: string, file: File, alt?: string }} target  alt: suggested alt text (a map snapshot).
 */
export async function addFallbackToSlot(store, { slideId, slot, file, alt }) {
  const slide = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  await addImage(store, {
    slideId,
    file,
    fallbackName: `${slugify(slide?.content?.title ?? '') || slideId}-${slot}-fallback`,
    defaultAlt: alt,
    read: (s) => s?.content?.[slot]?.fallback,
    write: (image) => {
      const current = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId)?.content?.[slot];
      store.dispatch('setSlot', { slideId, slot, value: withFallback(current, image) });
    },
  });
}

/**
 * Copy an image into the show folder and put it in a reader block's image
 * field (`image`, or an embed's `fallback`, I-070), then ask for alt text.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, blockId: string, file: File, field?: 'image' | 'fallback', alt?: string }} target  alt: suggested alt text.
 */
export async function addImageToBlock(store, { slideId, blockId, file, field = 'image', alt }) {
  const slide = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  await addImage(store, {
    slideId,
    file,
    fallbackName: `${slugify(slide?.content?.title ?? '') || slideId}-${field === 'image' ? 'reader' : field}`,
    defaultAlt: alt,
    read: (s) => s?.reader?.blocks?.find((/** @type {any} */ b) => b.id === blockId)?.[field],
    write: (image) => store.dispatch('updateBlock', { slideId, blockId, patch: { [field]: image } }),
  });
}

/**
 * Copy an image into the show folder and put it in an image field of one card
 * of a cards slot, then ask for alt text (I-035).
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, slot: string, index: number, field: string, file: File }} target
 */
export async function addImageToCard(store, { slideId, slot, index, field, file }) {
  const slide = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  const cardsOf = (/** @type {any} */ s) => s?.content?.[slot];
  await addImage(store, {
    slideId,
    file,
    fallbackName: `${slugify(slide?.content?.title ?? '') || slideId}-card-${index + 1}-${field}`,
    read: (s) => cardsOf(s)?.[index]?.[field],
    write: (image) => {
      const current = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
      store.dispatch('setSlot', { slideId, slot, value: cardsValue(withCardField(cardsOf(current), index, field, image)) });
    },
  });
}

/**
 * Width / height of an image file, or 1 when it cannot be read (for example an
 * SVG without a size). Raster images via createImageBitmap (no rendering
 * needed); SVG from its viewBox or width/height. Never waits more than 2 s.
 * @param {Blob} file
 * @returns {Promise<number>}
 */
async function imageAspect(file) {
  const read = async () => {
    if (file.type === 'image/svg+xml') return svgAspect(await file.text());
    const bitmap = await createImageBitmap(file);
    const ratio = bitmap.width && bitmap.height ? bitmap.width / bitmap.height : 1;
    bitmap.close();
    return ratio;
  };
  try {
    return await Promise.race([read(), new Promise((resolve) => setTimeout(() => resolve(1), 2000))]);
  } catch {
    return 1;
  }
}

/**
 * Width / height of an SVG from its viewBox, else its width and height; 1 if unknown.
 * @param {string} text
 * @returns {number}
 */
export function svgAspect(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  if (box && Number(box[1]) > 0 && Number(box[2]) > 0) return Number(box[1]) / Number(box[2]);
  const w = /\swidth\s*=\s*["']\s*([\d.]+)/i.exec(tag);
  const h = /\sheight\s*=\s*["']\s*([\d.]+)/i.exec(tag);
  return w && h && Number(w[1]) > 0 && Number(h[1]) > 0 ? Number(w[1]) / Number(h[1]) : 1;
}

/**
 * Add an image to a slide as an extra image (I-083): copied into the show
 * folder like any image, placed in the middle with its own aspect ratio, in
 * front of the other extra images; then the alt-text dialog opens.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, file: File }} target
 * @returns {Promise<number>} The index of the new extra image.
 */
export async function addOverlayImage(store, { slideId, file }) {
  const slideOf = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  const index = slideOf()?.overlays?.length ?? 0;
  const aspect = await imageAspect(file);
  const canvasAspect = store.state.show?.settings?.aspectRatio === '4:3' ? 4 / 3 : 16 / 9;
  await addImage(store, {
    slideId,
    file,
    fallbackName: `${slugify(slideOf()?.content?.title ?? '') || slideId}-extra-${index + 1}`,
    read: (s) => s?.overlays?.[index]?.image,
    write: (image) => {
      if (slideOf()?.overlays?.[index]) store.dispatch('updateOverlay', { slideId, index, patch: { image } });
      else store.dispatch('addOverlay', { slideId, overlay: { image, ...newOverlayBox(aspect, canvasAspect) } });
    },
  });
  return index;
}

/**
 * Replace the image of an extra image; its place and size stay.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, index: number, file: File }} target
 */
export async function addImageToOverlay(store, { slideId, index, file }) {
  const slide = store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  await addImage(store, {
    slideId,
    file,
    fallbackName: `${slugify(slide?.content?.title ?? '') || slideId}-extra-${index + 1}`,
    read: (s) => s?.overlays?.[index]?.image,
    write: (image) => store.dispatch('updateOverlay', { slideId, index, patch: { image } }),
  });
}

/**
 * Copy a PDF into the show folder's docs/ (I-072) and hand its path to
 * `write`. The same file (same content hash) is written once.
 * @param {import('./store.js').EditorStore} store
 * @param {{ file: File, fallbackName: string, write: (path: string) => void }} target
 */
export async function addPdf(store, { file, fallbackName, write }) {
  const handle = store.state.folderHandle;
  if (!handle) {
    showBanner('To add a PDF, Slipr needs to write to the show folder. Choose it, then add the PDF again.', 'info', { timeout: 6000 });
    askForShowFolder(store);
    return;
  }
  if (!isPdfFile(file)) throw new Error(`"${file.name || 'This file'}" is not a PDF.`);
  if (!(await ensurePermission(handle))) throw new Error(`No permission to write to the folder "${handle.name}".`);
  const bytes = await file.arrayBuffer();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const path = await pdfPath({ name: file.name, type: 'application/pdf', bytes }, fallbackName);
  await writeImage(handle, path, blob); // writes any file; keeps an existing one
  store.state.registerAsset?.(path, blob);
  write(path);
}

/**
 * Copy a JSON data file into the show's data/ folder and hand its path and a
 * title (from the file name) to `write`. `check` says what is wrong with the
 * parsed JSON, or null. Shows without a folder keep it in memory for this
 * session, like added pictures. Used for map layers (E-021) and graph data (E-020).
 * @param {import('./store.js').EditorStore} store
 * @param {{ file: File, extensions: RegExp, kind: string, check: (json: any) => string | null, write: (path: string, title: string) => void }} target
 */
async function addDataFile(store, { file, extensions, kind, check, write }) {
  const name = file.name || 'data.json';
  if (!extensions.test(name)) throw new Error(`"${name}" is not a ${kind} file.`);
  const bytes = await file.arrayBuffer();
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`"${name}" is not valid JSON.`);
  }
  const problem = check(json);
  if (problem) throw new Error(`"${name}": ${problem}`);
  const ext = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase() ?? 'json';
  const base = name.replace(/\.[a-z]+$/i, '');
  const path = `data/${slugify(base).slice(0, 40).replace(/-+$/, '') || 'data'}-${await shortHash(bytes)}.${ext}`;
  const blob = new Blob([bytes], { type: ext === 'geojson' ? 'application/geo+json' : 'application/json' });
  const handle = store.state.folderHandle;
  if (handle) {
    if (!(await ensurePermission(handle))) throw new Error(`No permission to write to the folder "${handle.name}".`);
    await writeImage(handle, path, blob); // writes any file; keeps an existing one
  } else {
    if (!store.state.inMemoryAssets) store.state.inMemoryAssets = new Map();
    store.state.inMemoryAssets.set(path, blob);
  }
  store.state.registerAsset?.(path, blob);
  write(path, base.replace(/[-_]+/g, ' ').trim());
}

const GEOJSON_TYPES = ['FeatureCollection', 'Feature', 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];

/**
 * Copy a GeoJSON file into data/ (a map layer, E-021).
 * @param {import('./store.js').EditorStore} store
 * @param {{ file: File, write: (path: string, title: string) => void }} target
 */
export function addLayerFile(store, { file, write }) {
  return addDataFile(store, {
    file, write, extensions: /\.(geo)?json$/i, kind: 'GeoJSON (.geojson or .json)',
    check: (json) => (GEOJSON_TYPES.includes(json?.type) ? null : 'this is JSON, but not GeoJSON (no "type": "FeatureCollection" or a geometry).'),
  });
}

/**
 * Copy a graph data file into data/ (E-020): JSON with { "nodes": [...], "edges": [...] }.
 * @param {import('./store.js').EditorStore} store
 * @param {{ file: File, write: (path: string, title: string) => void }} target
 */
export function addGraphDataFile(store, { file, write }) {
  return addDataFile(store, {
    file, write, extensions: /\.json$/i, kind: 'JSON (.json)',
    check: (json) => (json && Array.isArray(json.nodes) ? null : 'this is JSON, but not graph data (no "nodes": [...]).'),
  });
}
