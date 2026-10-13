# I-090: Image cropping

Status: **done** · 2026-10-13 · Phase 6 · Prepares I-091 (morph transitions). Verified in Claude's browser pane (Chrome): the demo photo cropped on a slide, the canvas fallback (forced), the crop dialog (keyboard, shapes, numbers, Apply, "Show the whole picture", undo), and hotspots on a cropped reader image (mapping, a hotspot outside the crop hidden and flagged). Safari and Firefox (the fallback without forcing) and real mouse drags are for Lucas to try

## Goal

Show only part of a picture, without editing the file: a detail of a photo, a tighter frame, the same photo cropped differently on two slides. The crop can be changed or removed at any time, and PowerPoint's picture crop survives a conversion.

## Decisions (Lucas, 2026-10-13)

1. **A crop rectangle only**: `crop: { x, y, w, h }`, fractions of the original picture. With the existing `fit` and `focus` it also covers zooming in (a smaller crop). No separate zoom.
2. **Hotspots follow the picture.** Hotspot positions are stored on the whole picture, and drawn relative to the crop, so changing the crop never moves a hotspot off its spot. A hotspot outside the crop is not shown (kept, with a validation warning).
3. **Rendering: CSS with a canvas fallback.** `object-view-box: inset(…)` where the browser has it (Chrome, Edge): sharp, also for SVG, and animatable for I-091. Elsewhere (Safari, Firefox) Slipr draws the cropped part on a canvas once the picture has loaded and shows that instead. The look is the same.
4. **Scope**: format, viewer, editor (a crop dialog on every picture), converter.

## Format (show format 0.2)

An optional field of every image value (image slots, card images, reader image blocks, extra images, embed fallbacks):

```json
"image": { "src": "images/team.jpg", "alt": "The team on the stairs", "crop": { "x": 0.1, "y": 0.2, "w": 0.6, "h": 0.5 } }
```

| Field | Meaning |
|---|---|
| `crop.x`, `crop.y` | Top-left corner of the shown part, as fractions of the picture's width and height (0–1) |
| `crop.w`, `crop.h` | Width and height of the shown part, as fractions (more than 0, at most 1) |

- The cropped part takes the picture's place: its proportions become the picture's proportions, and `fit` / `focus` then apply to it as before (crop first, then fit).
- Hotspots (`x`, `y` in an image block) are positions on the **whole** picture, as without a crop.
- Validation: a crop in a 0.1 show is an error (schema: numbers 0–1, all four required). Warnings: a crop that sticks out of the picture (beyond 0.5 %), and a hotspot outside the crop.

## Rendering (`shared/crop.js`, `shared/picture.js`)

- `shared/crop.js` (DOM-free part, tested): `normalCrop()` (clamped, or null for a full or invalid crop), `cropInset()` (the CSS `inset(t% r% b% l%)`), and `toShown()` / `toPicture()` to map points between the picture and the shown part.
- `pictureStyle()` / `applyPictureStyle()` / `pictureAttributes()` (I-084) also emit the crop: `object-view-box` inline, plus `data-crop` with the four numbers. Every renderer already goes through them, so every kind of picture can be cropped.
- **Fallback** (`applyCropFallback(root)`, browser): when `CSS.supports('object-view-box', 'inset(0%)')` is false, each `img[data-crop]` is drawn cropped onto a canvas after it loads (at up to 2400 px on the longest side) and shown as that bitmap; the original address stays in `data-crop-src`. A picture from another server that the browser may not read back (CORS) is shown uncropped, with a console note. `renderSlide()` and `hydrateEmbeds()` call it, which covers audience mode, reader mode, the editor preview and thumbnails.
- Hotspots: `shared/blocks.js` places a hotspot at `toShown(spot, crop)` and leaves out the ones outside.

## Editor

- **Crop…** next to the picture style and opacity of every picture (image slot, card image, reader image block, extra image): a dialog with the whole picture, the crop as a rectangle (drag to move, corner handles to resize), **Shape**: free, the original's, 1:1, 4:3, 3:2, 16:9 (and 4:3 / 16:9 portrait), numeric **Left / Top / Width / Height** in %, **Reset** (whole picture) and **Apply**. Keyboard: arrows move the rectangle, Alt+arrows resize it (Shift: larger steps), as for extra images on the preview. One undo step. **Show the whole picture** next to Crop… removes the crop.
- The hotspot editor shows the cropped picture and maps clicks and drags back to picture positions; hotspots outside the crop are listed as such.
- Picture style previews and image thumbnails show the crop.

## Converter

PowerPoint's picture crop (`crop_left`, `crop_top`, `crop_right`, `crop_bottom` in python-pptx; `a:srcRect`) becomes `crop` (`x = left`, `w = 1 − left − right`, …). Negative values (a picture "cropped outwards") count as 0. A converted show is 0.2 when a picture is cropped.

## Notes

- The dialog's number fields accept any decimal (`step="any"`): a step would make the browser refuse the form for values such as 13.4 %.
- Claude's browser pane never fires a dialog's `close` event while it is hidden, so closed dialogs stay in the page there; scripts in tests should look inside `dialog[open]`, not up by id.
- The fallback draws bitmaps at their own resolution (at most 2400 px) and SVGs at about 1600 px, as PNG (JPEG for JPEG files).

## Out of scope

- Rotation and non-rectangular crops (circles: a picture style can do that).
- Re-encoding or resizing the file (I-026).
- The morph transition between slides (I-091), which builds on this.
