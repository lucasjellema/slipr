# I-083: Extra images on a slide

Status: **done** · 2026-10-11 · Phase 6 · Decision D-013. Verified in Claude's browser pane: audience mode (position, fragment), reader mode at 375 px (stays a picture), the editor (add by paste into an origin-private show folder, keyboard and pointer move / resize, delete, undo, save as 0.2), single-file export. A real mouse drag in a normal browser is still for Lucas to try

## Goal

Besides the layout's own image slots, an author can put **extra images** on a slide and place them freely: a logo, an arrow, a screenshot next to a bullet list. The PPTX converter uses them for pictures that fit no placeholder, so a converted slide looks like the original instead of moving those pictures to the reader layer.

## Decisions (Lucas)

- **D-013** (accepted exception to "slides contain no styling", only for these images): free placement on any slide; position and size are fractions of the slide canvas, like hotspots; the images sit **in front of** the layout's content; they **scale with the slide**; they can **appear one by one**; the converter **uses them**.
- **Narrow screens in reader mode** (2026-10-11): a slide with extra images **keeps its picture layout** (a scaled 16:9 or 4:3 canvas with the images in place) and does not reflow into flowing text, even on a phone.
- **Format version** (2026-10-11): show format **0.2**, and **0.1 stays valid**. A show becomes 0.2 when it gets its first extra image (the editor and the converter set it). A 0.1 show that uses extra images is an error. Existing shows and files are untouched; no migration.

## Format

A new optional slide field `overlays` (show format 0.2):

```json
{
  "id": "s-why",
  "layout": "bullets",
  "content": { "title": "Why Slipr", "body": "- One source\n- Two experiences" },
  "overlays": [
    {
      "image": { "src": "images/logo.svg", "alt": "Slipr logo" },
      "x": 0.78, "y": 0.06, "w": 0.16, "h": 0.12
    },
    {
      "image": { "src": "images/arrow.png", "alt": "Arrow pointing at the second bullet" },
      "x": 0.52, "y": 0.48, "w": 0.1, "h": 0.08,
      "fragment": "fade-left"
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `image` | image value | The same `{ src, alt, fit?, focus? }` as an image slot. `fit` defaults to `contain`, so the picture is never distorted; `cover` fills the box and may crop. |
| `x`, `y` | number 0–1 | Top-left corner, as a fraction of the canvas width (`x`) and height (`y`). |
| `w`, `h` | number 0–1 | Width as a fraction of the canvas width, height as a fraction of the canvas height. |
| `fragment` | `true` or effect | Appear one by one in audience mode, optionally with a Reveal effect (the same values as `audience.fragments`). |

- **Stacking:** later overlays are in front of earlier ones; all are in front of the layout.
- **Order of appearance:** overlays with `fragment` appear after the slide's own fragments (bullets, cards), in array order.
- **Validation:** error when a 0.1 show has overlays (schema). Warnings: an overlay that extends outside the canvas (beyond a 0.5 % tolerance), missing `alt`, and image file not found (like any image).

## Rendering (`shared/render.js`)

After the layout is filled, the renderer appends one layer to the canvas:

```html
<div class="slipr-overlays" style="position:absolute; inset:0; z-index:10; pointer-events:none">
  <div class="slipr-overlay" data-overlay="0" style="position:absolute; left:78%; top:6%; width:16%; height:12%">
    <img src="…" alt="…" style="display:block; width:100%; height:100%; object-fit:contain">
  </div>
</div>
```

The box carries the position and, in audience mode, Reveal's `fragment` class; the `<img>` inside carries the picture style and opacity (I-084). One element for both would break fragments: a picture's inline `opacity` beats Reveal's fragment rule, so it would show before its click.

Positioning is inline (the values come from the show and are clamped to numbers), so every template supports overlays without any CSS of its own. Templates may still style `.slipr-overlay` (for example a print rule), but never position it.

**Reader mode, narrow screens:** templates reflow a slide below 640 px with `@container` rules on `.slipr-mode-reader`. A slide with overlays gets the mode class `slipr-mode-reader-fixed` instead, so no reflow rule applies and it stays a picture; everything else about reader mode (glossary popups in slide text, lazy images) is unchanged. This needs no template change. It is documented in `docs/template-format.md`.

## Viewer

- Audience mode (`viewer/audience/audience.js`): overlays with `fragment` get Reveal's `fragment` class (and the effect).
- Reader mode: nothing special beyond the renderer; the slide visual shows all overlays.
- Single-file export: `collectImagePaths()` includes overlay images, so they are packed.

## Editor

- **Actions** (pure, tested): `addOverlay`, `updateOverlay` (position, size, image, fragment; clamped to the canvas, rounded to 4 decimals), `deleteOverlay`, `moveOverlay` (stacking order). Adding the first overlay sets `slipr` to `"0.2"`.
- **Slide tab, "Extra images"**: one row per overlay (thumbnail, alt text, appear one by one, bring forward / send backward, delete) and **+ Add image** (choose, drop or paste, with the alt-text dialog, E-006). A new image is placed in the middle at 30 % of the canvas width, with its own aspect ratio.
- **Preview (audience mode)**: click an extra image to select it; drag to move; drag a corner handle to resize, keeping the aspect ratio unless Shift is held. Keyboard: arrow keys move (Shift: larger steps), Alt+arrows resize, Delete removes. A drag is one undo step (the box moves locally and is stored on release, like hotspots).

## Converter

Pictures that fit no image slot become overlays at their PowerPoint position and size (fractions of the slide size), in reading order, with their alt text. The report lists them as "placed as an extra image" instead of "moved to the reader layer". A converted show is 0.2 only when it has overlays.

## Out of scope

- Picture styles (shadow, soft edges, opacity): I-084.
- Rotation, cropping, and overlays of other kinds (text boxes, shapes).
- Overlays in the show grid's thumbnails beyond what the renderer draws (they are drawn, not editable there).
