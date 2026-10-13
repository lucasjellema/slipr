# I-089: Text elements on a slide

Status: **done** · 2026-10-13 · Phase 6 · Decision D-016. Verified in Claude's browser pane (DOM checks; screenshots were unreliable): audience mode (demo badge, fragment), reader mode (the glossary term in a text element opens its popover, `slipr-mode-reader-fixed`), the editor (+ Add text, typing, style controls, free corner resize, Alt+arrows, double-click to the text, undo), and a converted sample deck. A real mouse drag and the look on a phone are still for Lucas to try

## Goal

Besides the layout's own text slots, an author can put **text elements** on a slide and place them freely: a badge ("New"), a label on a photo, a callout next to a chart, a pill with a date. The PPTX converter uses them for PowerPoint text boxes and shapes with text that fit no placeholder, so a converted slide keeps them where they were, instead of moving their text to the reader layer.

This is the extra-images model of I-083 (D-013), applied to text.

## Decisions (Lucas, 2026-10-13)

- **D-016** (accepted exception to "slides contain no styling", only for these text elements): free style values on the element (font, size, colors, border, outline, padding). The editor offers the **template's palette and fonts first**, and a free value second, so most elements stay on brand. The converter can keep a PowerPoint text box's look.
- **Format**: a text element is an entry in the same `slide.overlays` array as extra images, with `text` instead of `image`. It is part of show format **0.2** (still the current version, the field is optional): no version bump, no migration. Stacking and the order of appearance are shared with extra images.
- **Content**: inline Markdown (bold, italic, code, links, `[[glossary]]`, `^[popup]`) and line breaks. No lists, headings or paragraphs.
- **Scope**: format, renderer, viewer, editor and converter, in phases.

## Format

```json
"overlays": [
  {
    "text": "**New** in 2026",
    "style": {
      "font": "heading", "size": 1.6, "bold": true, "uppercase": true,
      "align": "center", "valign": "middle",
      "color": "#FFFFFF", "background": "#BC448C", "backgroundOpacity": 0.9,
      "radius": 2, "padding": 0.6
    },
    "x": 0.8, "y": 0.06, "w": 0.14, "h": 0.07,
    "fragment": "fade-in"
  }
]
```

An overlay has **either** `image` (an extra image, I-083) **or** `text` (a text element). `x`, `y`, `w`, `h` and `fragment` mean the same for both. A text element's box is the area of its background and border; text that does not fit is still shown (it is not cut off), and the editor shows the box so the author can make it larger.

`style` (all optional; absent = the template's look for slide text):

| Field | Type | Meaning |
|---|---|---|
| `font` | `heading` · `body` · `system` · `serif` · `mono` | `heading` and `body` are the template's fonts (`--slipr-font-heading`, `--slipr-font-body`), `mono` its code font; `system` and `serif` are the platform's. Default `body` |
| `size` | number, or `small` · `body` · `subtitle` · `title` · `hero` | A number is a percentage of the slide width (1 = 1 %, 19.2 px on a 1920 px slide), 0.5–20. A name is the template's size for that kind of text (`--slipr-size-*`). Default `body` |
| `bold`, `italic`, `underline`, `uppercase` | boolean | Default false |
| `align` | `left` · `center` · `right` | Horizontal alignment. Default `left` |
| `valign` | `top` · `middle` · `bottom` | Vertical alignment inside the box. Default `top` |
| `color` | `#rgb` or `#rrggbb` | Text color. Default: the template's text color |
| `background` | `#rgb` or `#rrggbb` | Fill. Default none |
| `backgroundOpacity` | number 0–1 | Opacity of the fill only (not the text). Default 1 |
| `borderWidth` | number 0–5 | Box border, percentage of the slide width. Default 0 (no border) |
| `borderStyle` | `solid` · `dashed` · `dotted` | Default `solid` |
| `borderColor` | `#rgb` or `#rrggbb` | Default: the text color |
| `radius` | number 0–50 | Corner radius, percentage of the slide width. Large values give pills |
| `outlineWidth` | number 0–2 | Text outline (halo) around the letters, percentage of the slide width. Default 0 |
| `outlineColor` | `#rgb` or `#rrggbb` | Default white |
| `padding` | number 0–10 | Space between the box edge and the text, percentage of the slide width. Default 0 |

Lengths are percentages of the slide width (CSS `cqw`), like the templates' own metrics, so a text element scales with the slide.

**Validation.** Errors (schema): an overlay with both or neither of `image` and `text`; `style` values of the wrong type or out of range; a text element in a 0.1 show. Warnings: an empty text, a text element that sticks out of the canvas (the same 0.5 % tolerance), an unknown glossary id in `[[...]]` (like any Markdown).

## Rendering (`shared/render.js`, `shared/text-style.js`)

A text element is rendered in the same `.slipr-overlays` layer as extra images, in array order:

```html
<div class="slipr-overlay slipr-overlay--text" data-overlay="1"
     style="position:absolute; left:80%; top:6%; width:14%; height:7%; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; …style…">
  <div class="slipr-overlay-text">…inline Markdown, lines joined with &lt;br&gt;…</div>
</div>
```

- `shared/text-style.js` (DOM-free, tested) turns `style` into CSS declarations. Only known keys, enum values, clamped numbers and hex colors are used, so no string from the show reaches CSS unchecked. The fill becomes an `rgba()` color, so `backgroundOpacity` does not fade the text (and does not fight Reveal's fragment opacity on the box).
- The text goes through `markdownInline` (escaped). In reader mode, glossary terms are linked (D-015) and links, terms and popups inside a text element get `pointer-events: auto`, while the rest of the layer lets clicks through.
- The outline is `-webkit-text-stroke` with `paint-order: stroke fill`, so it surrounds the letters without thinning them.
- Templates get `--slipr-size-*` variables for the size names; a template without them falls back to the default template's sizes. The Conclusion template maps them to its own type sizes.

## Viewer

- Audience mode: the existing fragment code applies (it works by `data-overlay` index).
- Reader mode: the text is part of the slide visual, so screen readers read it after the layout's text. Reader **search** indexes the text of text elements as slide content.
- A slide with text elements keeps its picture layout on narrow screens (`slipr-mode-reader-fixed`), like a slide with extra images.

## Editor

- **Actions** (pure, tested): `addOverlay` and `updateOverlay` accept text elements (`text`, `style`); `style` is cleaned (unknown keys, defaults and invalid values dropped). Adding one sets `slipr` to `"0.2"`.
- **Slide tab**, the section "Extra images and text": a row per text element with a text area, the style controls (font, size preset or number, bold / italic / underline / uppercase, alignment, palette swatches plus a color picker for text, fill and border, fill opacity, border width / style / radius, outline width and color, padding) and appear one by one, stacking order and delete, like an image row. **+ Add text** places "Text" in the middle at 40 % × 12 % of the canvas and selects it.
- **Preview (audience mode)**: the same selection, drag and corner handles as extra images, but a text box resizes **freely** (Shift keeps the aspect ratio). Keyboard: arrows move, Alt+Left / Right change the width, Alt+Up / Down the height, Delete removes. Double-click a text box to jump to its text area in the Slide tab.

## Converter

PowerPoint text boxes and shapes with text that are not placeholders (and not decoration the template ignores) become text elements at their position and size, with: font family (the template's heading or body font when it matches, else `system`, `serif` or `mono`), size (pt → percentage of the slide width), bold / italic / underline / all caps, alignment and vertical anchor, text color, solid fill (and its transparency), line (width, dash, color), rounded-rectangle corner radius, and insets as padding. Runs keep bold and italic as Markdown. The report lists them as "placed as a text element".

## Out of scope

- Rotation, per-run colors or fonts inside one element, autofit / shrink-on-overflow, shapes without text.
- Named text styles in the template (a later option: they could be added like picture styles).
