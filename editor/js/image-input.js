// @ts-check
/**
 * Adding images to image slots (E-006): from a file chooser, drag and drop,
 * or the clipboard. The file is copied into the show folder's images/ (named
 * by content hash, so the same image is stored once), the slot gets
 * `{ src, alt }`, and the alt-text dialog opens. Undo restores the previous
 * image; the copied file stays (images are never deleted automatically).
 */
import { contentSuffix, imagePath, imageType, IMAGE_TYPES, LARGE_IMAGE_BYTES } from './io/images.js';
import { ensurePermission, findImageBySuffix, writeImage } from './io/fs-access.js';
import { slugify } from './io/new-show.js';
import { imageValue } from './slot-values.js';
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
 * Copy an image into the show folder and put it in a slot, then ask for alt text.
 * @param {import('./store.js').EditorStore} store
 * @param {{ slideId: string, slot: string, file: File }} target
 */
export async function addImageToSlot(store, { slideId, slot, file }) {
  const handle = store.state.folderHandle;
  if (!handle) {
    showBanner('To add images, Slipr needs to write to the show folder. Choose it, then add the image again.', 'info', { timeout: 6000 });
    askForShowFolder(store);
    return;
  }
  const type = imageType(file);
  if (!type) throw new Error(`"${file.name || 'This file'}" is not a supported image (PNG, JPEG, GIF, WebP, AVIF or SVG).`);
  if (!(await ensurePermission(handle))) throw new Error(`No permission to write to the folder "${handle.name}".`);

  const slideOf = () => store.state.show?.slides?.find((/** @type {any} */ s) => s.id === slideId);
  const slide = slideOf();
  if (!slide) return;
  const bytes = await file.arrayBuffer();
  const blob = file.type === type ? file : new Blob([bytes], { type });
  const fallbackName = `${slugify(slide.content?.title ?? '') || slide.id}-${slot}`;
  const newPath = await imagePath({ name: file.name, type, bytes }, fallbackName);
  // The same image may already be in the folder under another name: reuse it.
  const suffix = contentSuffix(newPath);
  const path = (suffix && (await findImageBySuffix(handle, suffix))) || newPath;
  if (path === newPath) await writeImage(handle, path, blob);
  store.state.registerAsset?.(path, blob);

  const previous = slide.content?.[slot];
  const keepAlt = previous?.src === path;
  store.dispatch('setSlot', { slideId, slot, value: imageValue(keepAlt ? previous : { ...previous, alt: undefined }, { src: path }) });

  if (file.size > LARGE_IMAGE_BYTES) {
    showBanner(`This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Large images make shows slow to open; consider a smaller or compressed version.`, 'info', { timeout: 8000 });
  }

  const previewUrl = URL.createObjectURL(blob);
  openAltTextDialog({
    path,
    previewUrl,
    alt: keepAlt ? previous?.alt ?? '' : '',
    onClose: () => URL.revokeObjectURL(previewUrl),
    onSave: (alt) => {
      const current = slideOf()?.content?.[slot];
      if (current?.src !== path) return; // changed meanwhile
      store.dispatch('setSlot', { slideId, slot, value: imageValue(current, { alt }) });
    },
  });
}
