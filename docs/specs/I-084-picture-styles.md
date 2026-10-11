# I-084: Picture styles

Status: **done** · 2026-10-11 · Phase 6 · Decision D-014. Verified in Claude's browser pane: audience mode (shadow and opacity on an extra image that appears on a click), reader mode (a framed image block), the editor's style picker and opacity slider with undo

## Goal

Give a picture a drop shadow, soft edges, rounded corners or a frame, and make it partly transparent, without letting every show drift from its house style.

## Decisions (Lucas)

- **D-014** (option c): the **template** defines named picture styles (a CSS class each, listed in `template.json` with a label); a picture may name one. On top of that a picture may have a free **opacity**. The opacity is the only free value, an accepted exception to "slides contain no styling" alongside D-013.
- **Version** (2026-10-11): `style` and `opacity` belong to **show format 0.2**, together with the extra images of I-083. A 0.1 show that uses them is an error, as for overlays. The editor and the converter write 0.2 when a show needs it.
- **Styles** (2026-10-11): both templates offer **shadow**, **soft**, **rounded** and **frame**. The Conclusion versions use its brand colours and stay subject to the brand review (I-043d).

## Template format 0.3

```json
"pictureStyles": [
  { "id": "shadow",  "label": "Shadow",        "description": "A soft drop shadow", "pptxEffect": "shadow" },
  { "id": "soft",    "label": "Soft edges",    "pptxEffect": "softEdges" },
  { "id": "rounded", "label": "Rounded corners", "pptxEffect": "roundedCorners" },
  { "id": "frame",   "label": "Frame",         "pptxEffect": "border" }
]
```

| Field | Meaning |
|---|---|
| `id` | kebab-case, unique. The renderer adds the class `slipr-picture-<id>` to the `<img>`; `theme.css` defines it. |
| `label`, `description` | Shown by the editor. |
| `pptxEffect` | Optional: the PowerPoint effect this style stands for (`shadow`, `softEdges`, `roundedCorners`, `border`), so the converter can map pictures. |

- `pictureStyles` needs template format **0.3** (an error in 0.1 / 0.2 templates). Both shipped templates move to 0.3. Template versions: default 1.0.0 → **1.1.0**; Conclusion 0.1.0 → **0.1.1** (a patch bump, so shows made for `^0.1` stay in range).
- The classes are **not scoped** under `.slipr-slide`: the same class styles a slide image, a reader image block and the editor's style preview. Templates write them as `.slipr-picture-<id>` and should keep them to effects on the picture itself (shadow, mask, radius, border), never layout.

## Show format 0.2: the image value

```json
{ "src": "images/team.jpg", "alt": "The team", "style": "shadow", "opacity": 0.6 }
```

| Field | Type | Meaning |
|---|---|---|
| `style` | string | Id of one of the template's picture styles. |
| `opacity` | number 0–1 | Opacity of the picture; absent = 1. The editor shows it as 0–100 %. |

Valid wherever an image value is: image slots, card image fields, reader image blocks, extra images (I-083).

**Validation:** `style` or `opacity` in a 0.1 show: error. A `style` the template does not define: warning, and the picture is rendered unstyled.

## Rendering

- `shared/picture.js` (DOM-free): the class `slipr-picture-<id>` for any well-formed style id (a style the template lacks has no CSS, so the picture is unstyled, as required) and the opacity. `shared/render.js` (slots, card images, extra images) and `shared/blocks.js` (reader image blocks) use it.
- An extra image (I-083) is a positioned box with the `<img>` inside: the box carries Reveal's `fragment` class, the image the style and opacity. On one element the inline opacity would beat the fragment rule and show the image before its click.
- The class goes on the `<img>`; with `fit: contain` a shadow uses `filter: drop-shadow`, so it follows the picture.

## Editor

Every image field gets, once it has an image: a **style picker** (None plus one button per template style, each showing this picture in that style) and an **opacity slider** (0–100 %, 5 % steps). Choosing a style or moving the slider writes `style` / `opacity` (100 % removes it), and sets the show to 0.2 if needed.

## Converter

`reader.py` reads a picture's effects (outer shadow, soft edges, rounded-rectangle geometry, a visible outline) and its transparency (`a:alphaModFix`). The converter picks the first template style whose `pptxEffect` matches and keeps the transparency as `opacity`. A show gets 0.2 when it uses either.

## Out of scope

Free shadow values (offset, blur, colour); several styles on one picture; styles for anything other than pictures.
