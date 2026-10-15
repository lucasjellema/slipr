# I-026: Shrink images to WebP, focal point

Status: **done** · 2026-10-15 · Phase 6 · Verified in Claude's browser pane (Chrome): Shrink on a 9.8 MB PNG in a folder show (file written, path changed, alt text and crop kept, undo and redo), the offer after pasting a 4.9 MB JPEG, and the focal point dialog (click, arrow keys, Apply, `focus` saved). Real mouse drags, Safari and Firefox are for Lucas to try. Builds on I-090 (cropping), which left re-encoding and resizing to this item.

## Goal

Photos straight from a phone or a stock site are often 4000+ px and several MB. They make a show slow to open and an exported HTML file heavy. The editor gets a way to **shrink** a picture (resize it, store it as WebP) without leaving Slipr. It also gets a way to set the picture's **focal point**: the part that stays visible when the picture fills a frame of another shape. No format change is needed. The image value's `focus` (CSS `object-position`) already exists.

## Decisions (Lucas, 2026-10-15)

1. **When: on demand, and offered on insert.** Every picture gets **Shrink…** next to Crop…. When a large picture is added, a notice offers to shrink it. Nothing changes without a click.
2. **Defaults: at most 2400 px on the longest side, WebP quality 85 %.** 2400 px stays sharp full-screen on a 4K projector and matches the crop fallback (I-090). Both can be changed in the dialog, which shows the result's size before you apply it.
3. **The original stays.** The shrunk picture is a new file, `images/<slug>-<hash8>.webp`, and the picture points to it. The original stays in `images/`, because images are never deleted automatically, and it shows up as unused. Undo points back to the original. The format does not record the original.
4. **Focal point: click on the picture.** A **Focal point…** dialog shows the picture, cropped if it has a crop. Click or drag to place the crosshair, and use the arrow keys to nudge it. It writes the existing `focus` as `"x% y%"`. **As the layout decides** removes it.

## Shrink

- **Which pictures**: PNG, JPEG, WebP and AVIF. SVG is already small and scales by itself, and GIF may be animated, so neither gets Shrink….
- **How**: `createImageBitmap()` reads the file and draws it at the new size on an `OffscreenCanvas`, or on a `<canvas>` where that is missing. `convertToBlob` / `toBlob` with `image/webp` and the quality encode it. Pictures are only ever made smaller, never larger. A browser that cannot encode WebP gets a PNG back, so the dialog says so and changes nothing. Transparency is kept, since WebP has an alpha channel.
- **The dialog** shows the picture's current size (pixels, KB, type), **Longest side** in px (default 2400, or the picture's own size if that is smaller) and **Quality** (50–100 %, default 85). It also shows the result, *1600 × 1067 WebP, 214 KB (−91 %)*, recomputed when either value changes. If the result is not smaller than the file, **Shrink** is disabled and the dialog says why.
- **Apply**: writes the new file named by its content hash, as for added pictures (E-006). An identical file already in `images/` is reused. Then it changes only `src`, so alt text, crop, focus, style, opacity and morph name stay. Crop and hotspots are fractions of the picture, so they still fit. This is one undo step. Shows without a folder keep the file in memory, like added pictures. A show opened by URL first asks for its folder, as when adding a picture.
- **The offer on insert**: after a PNG, JPEG, WebP or AVIF picture is added that is over 1 MB or larger than 2400 px on its longest side, a notice says so and has a **Shrink…** button. That button opens the same dialog for that picture. GIF and SVG keep the existing "this image is large" notice above 3 MB.
- **File name**: the slug of the original (`team-photo-1a2b3c4d.jpg` gives `team-photo-<new hash>.webp`).

## Focal point

- **Every picture that can fill a frame**: image slots, card images and extra images. Reader image blocks are always shown whole, so they don't get it.
- **The dialog** shows the picture (cropped as on the slide) with a crosshair, and two small frames, wide and tall, that fill with the picture so the effect is visible. Click or drag sets the point. Arrow keys move it by 1 % (Shift: 5 %). **X %** and **Y %** fields take exact values. **As the layout decides** removes `focus`, and **Apply** stores it as one undo step.
- **Meaning**: `focus: "30% 40%"` is CSS `object-position`, so the point 30 % across and 40 % down the picture (after the crop) lands 30 % across and 40 % down the frame. It stays visible whatever the frame's shape. Existing values such as `center` or `left top` are read as 50 %, 0 %, 100 % and so on.
- The dialog says that the focal point shows only when the picture **fills** its frame: *Fill the frame*, card photos, or a layout that fills.

## Rendering

No change. Image slots, card images and extra images already apply `focus` as `object-position` (`shared/render.js`). Reader image blocks don't, because they are always shown whole.

## Out of scope

- Shrinking all pictures of a show at once (a possible follow-up).
- Deleting the originals (images are never deleted automatically; unused files are reported).
- Recording the original in the format, and an automatic "revert to original". Undo, or choosing the original file again, does that.
- Using `focus` in the PowerPoint export (I-045).
