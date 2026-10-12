# Template format: version 0.2 (draft)

A **template** is the reusable look and feel for shows. It combines a **style guide** (colors, fonts, illustrations, logos) and a set of **layouts**, the base slide formats a show can use.

```
templates/default/
├── template.json        manifest (this spec)
├── theme.css            style guide as CSS custom properties + shared styles
├── reader.css           styling of reader blocks, popovers and reader typography
├── layouts/
│   ├── title.html       one HTML fragment per layout
│   ├── section.html
│   ├── bullets.html
│   ├── two-column.html
│   └── image-full.html
├── assets/
│   ├── fonts/
│   ├── logos/
│   └── illustrations/
└── preview/             thumbnails per layout (used by the editor's layout picker)
```

Every template folder is listed in **`templates/index.json`** (`{ "templates": ["default", "conclusion"] }`). The editor offers these templates for a new show, because a static server can't list folders. A test fails if the list and the folders differ.

## `template.json`: example

```json
{
  "slipr": "0.3",
  "id": "default",
  "name": "Slipr Default",
  "version": "1.1.0",
  "description": "Clean, neutral template used for samples and tests.",
  "theme": "theme.css",
  "reader": "reader.css",
  "styleguide": {
    "colors": {
      "primary": "#1F3A5F",
      "accent": "#F2A900",
      "text": "#222222",
      "background": "#FFFFFF"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Source Serif 4",
      "code": "JetBrains Mono"
    }
  },
  "layouts": [
    {
      "id": "title",
      "name": "Title slide",
      "file": "layouts/title.html",
      "preview": "preview/title.png",
      "slots": [
        { "name": "title", "type": "text", "required": true, "maxLength": 80 },
        { "name": "subtitle", "type": "text" },
        { "name": "image", "type": "image" }
      ]
    },
    {
      "id": "bullets",
      "name": "Title and bullets",
      "file": "layouts/bullets.html",
      "slots": [
        { "name": "title", "type": "text", "required": true },
        { "name": "body", "type": "list", "maxItems": 7 }
      ]
    }
  ],
  "pptxMapping": {
    "Title Slide": "title",
    "Title and Content": "bullets",
    "Section Header": "section",
    "Two Content": "two-column",
    "Picture with Caption": "image-full"
  },
  "pictureStyles": [
    { "id": "shadow", "label": "Shadow", "pptxEffect": "shadow" }
  ]
}
```

## Layout fragments

A layout is a small HTML fragment. Elements with a `data-slot` attribute are filled by the shared renderer. The template engine stays deliberately simple, so it needs no logic or loops.

```html
<!-- layouts/bullets.html -->
<div class="slipr-layout slipr-layout--bullets">
  <h2 class="slipr-title" data-slot="title"></h2>
  <ul class="slipr-body" data-slot="body"></ul>
  <img class="slipr-logo" src="../assets/logos/logo.svg" alt="">
</div>
```

The renderer wraps each fragment in a fixed structure:

```html
<div class="slipr-slide slipr-mode-audience" data-layout="bullets" data-aspect="16:9">  <!-- CSS inline-size container -->
  <div class="slipr-canvas">                                                          <!-- the 16:9 (or 4:3) box -->
    …layout fragment…
    <div class="slipr-overlays">…</div>   <!-- only when the slide has extra images (show format 0.2) -->
  </div>
</div>
```

**Extra images** (`slide.overlays`, D-013, I-083) are drawn by the renderer in a layer appended to `.slipr-canvas`: `.slipr-overlays` > `div.slipr-overlay[data-overlay="i"] > img`, positioned **inline** (absolute, in percentages of the canvas, `z-index: 10`, in front of the layout). Templates need no CSS for them and must not position them; they may style `.slipr-overlay` otherwise (for example in print). Keep `.slipr-canvas` `position: relative` (it is the containing block).

Templates size everything inside the slide in **container query units** (`cqw` = 1 % of the slide width). The same CSS then works on the 1920×1080 Reveal.js canvas, in reader mode's slide frame, and in editor thumbnails. Reader mode can reflow a layout on narrow screens with `@container (max-width: …)` rules on `.slipr-mode-reader` descendants (see `templates/default/theme.css`).

Slot definitions in `template.json` can also carry `label` and `help` (shown by the editor), `required`, `maxLength` and `maxItems` (validation warnings).

**Restore text semantics.** Host pages may reset typography. Reveal.js's `reset.css` sets `font: inherit` on every element, which removes bold from `<strong>` and headings. A template's `theme.css` should restore `font-weight`/`font-style` inside `.slipr-slide`. The viewer also resets `margin` on images inside slides, so spacing around an image belongs on the neighbouring element (or in padding).

**Do not use `<section>` elements in layout fragments.** Reveal.js treats every nested `<section>` as a vertical slide. Use `<div>` (or `<article>`, `<aside>`) instead. `validateTemplate` cannot see fragment HTML, so this is enforced by a test on the shipped templates.

Renderer rules:

| Slot type | Target element | Filled with |
|---|---|---|
| `text` | any | `textContent` |
| `richtext` | any block element | Sanitised HTML from the Markdown subset |
| `list` | `<ul>` / `<ol>` | `<li>` elements, nested lists for indented items |
| `image` | `<img>` | `src`, `alt`, plus `object-fit` from `fit` |
| `code` | `<pre>` | `<code class="language-…">` |
| `quote` | `<blockquote>` | text plus `<cite>` |
| `cards` | any container | One clone of the slot's `<template>` blueprint per card (see below) |
| `diagram` | any container | Rendered SVG diagram from Mermaid source |

- An element whose optional slot is **empty** gets the attribute `data-empty` so CSS can hide it or reflow around it.
- Relative URLs inside a fragment (logos, illustrations) are resolved against the layout file.
- The renderer adds the mode class `slipr-mode-audience` or `slipr-mode-reader` to the root, so layouts can adapt. For example, a two-column layout stacks into one column in reader mode on narrow screens.
- A slide with extra images gets `slipr-mode-reader-fixed` instead of `slipr-mode-reader` in reader mode. It stays a scaled picture on narrow screens (Lucas, 2026-10-11), because freely placed images have no place in a reflowed layout. Templates need nothing for this: their `.slipr-mode-reader` reflow rules simply do not apply. Do not style `.slipr-mode-reader-fixed` to reflow.

### Cards slots (since 0.2)

A `cards` slot holds a small, repeated group of fields: columns with a heading and text, numbered boxes, key figures with an icon, photo cards, people. The slot definition lists the fields of one card:

```json
{ "name": "cards", "type": "cards", "maxItems": 4, "required": true,
  "fields": [
    { "name": "title", "type": "text", "required": true, "maxLength": 18 },
    { "name": "text", "type": "richtext" }
  ] }
```

Field types are `text`, `richtext`, `list` and `image`; a field takes `label`, `help`, `required` and `maxLength` like a slot. `maxItems` is the number of cards the layout has room for.

The layout fragment describes **one** card in a `<template>` element inside the slot element. Inside it, `data-field="name"` marks where a field goes, filled with the same rules as a slot of that type. `data-field="#"` receives the card number (1, 2, …).

```html
<div class="cnc-cards cnc-cards--boxes" data-slot="cards">
  <template>
    <div class="cnc-card">
      <span class="cnc-card-number" data-field="#"></span>
      <h3 class="cnc-card-title" data-field="title"></h3>
      <div class="cnc-card-text" data-field="text"></div>
    </div>
  </template>
</div>
```

The renderer removes the `<template>`, appends one clone of its first element per card, and adds the class `slipr-card` and `data-card-index` (0-based) to each clone. Empty fields get `data-empty`. Because the blueprint is a `<template>`, it is inert: its images do not load and it is never shown. In audience mode, cards are the fragments of a slide with `"audience": { "fragments": true }`, and in reader mode they are the objects you can pin a note to ("Card 2").

## `theme.css`

The style guide as CSS custom properties, plus the shared typography and layout styles:

```css
:root {
  --slipr-color-primary: #1F3A5F;
  --slipr-color-accent: #F2A900;
  --slipr-color-text: #222;
  --slipr-color-bg: #fff;
  --slipr-font-heading: "Inter", system-ui, sans-serif;
  --slipr-font-body: "Source Serif 4", Georgia, serif;
}
```

The `styleguide` block in `template.json` and the variables in `theme.css` describe the same values. The JSON copy exists so the editor can show swatches and the converter can match colors without parsing CSS. *(Backlog: generate one from the other.)*

## Reader styling (`reader.css`)

The template also owns the look of reader mode. A template may ship a `reader.css` (referenced as `"reader": "reader.css"` in `template.json`) that styles:
- the reader blocks: `.slipr-block--text`, `--details`, `--callout` (with `[data-variant]`), `--tabs`, `--image`, `--embed`, `--slide-ref`
- popovers: `.slipr-popover` with `.slipr-popover-title` (glossary, footnotes, hotspots), glossary term markers `.slipr-term`, footnote markers `.slipr-footnote-ref`
- hotspots: `.slipr-hotspot` buttons, positioned in percentages inside `.slipr-hotspot-frame` (which must be `position: relative`)
- glossary terms are also linked inside **slides** in reader mode (D-015): the same `.slipr-term` buttons, inside layout text, so keep `.slipr-term` unscoped with `font: inherit` and `color: inherit` (the shipped templates do)
- badges: `.slipr-block-badges` > `.slipr-badge[data-kind="profile"|"depth"]` ("For Developer", "Deep dive")
- reader typography: article width, headings, chapter headers

The reader app's own `reader.css` handles only the structure (columns, TOC, margin, toolbar) and uses the template's `--slipr-*` variables, so a template restyles both modes consistently.

Layouts can adapt to reader mode with `.slipr-mode-reader` selectors. In particular they define how the layout reflows on narrow screens instead of being scaled down. Slides with extra images are rendered with `slipr-mode-reader-fixed` and keep their picture layout (see above).

## Picture styles (`pictureStyles`, since 0.3)

Named looks for pictures that a show may choose per picture (D-014): a shadow, soft edges, rounded corners, a frame. The template decides what they look like; a show only names one.

```json
"pictureStyles": [
  { "id": "shadow",  "label": "Shadow", "description": "A soft drop shadow", "pptxEffect": "shadow" },
  { "id": "soft",    "label": "Soft edges", "pptxEffect": "softEdges" },
  { "id": "rounded", "label": "Rounded corners", "pptxEffect": "roundedCorners" },
  { "id": "frame",   "label": "Frame", "pptxEffect": "border" }
]
```

| Field | Meaning |
|---|---|
| `id` | kebab-case, unique. The renderer adds the class **`slipr-picture-<id>`** to the picture's `<img>` |
| `label`, `description` | Shown in the editor's style picker |
| `pptxEffect` | Optional: the PowerPoint picture effect this style stands for (`shadow`, `softEdges`, `roundedCorners`, `border`), so the converter can map pictures to it |

Each style is a class in `theme.css`:

```css
.slipr-picture-shadow { filter: drop-shadow(0 0.35em 0.6em rgb(0 0 0 / 0.28)); }
```

- Write the classes **unscoped** (not under `.slipr-slide`): the same class styles a slide image, a reader image block and the editor's style preview, which is outside any slide.
- Use `em` for sizes, so the effect scales with the slide's type. Keep to effects on the picture itself (filter, mask, radius, border, shadow); never change its size or position.
- `filter: drop-shadow()` follows the visible picture, also with `fit: contain`; `box-shadow`, `border-radius` and borders follow the image box.
- A border (a frame) sits inside the image box, so hotspots on a framed reader image can be a few pixels off.
- A show that names a style the template lacks gets a validation warning; the class has no CSS, so the picture is simply unstyled.

## `pptxMapping`

This maps PowerPoint slide-layout names to Slipr layout IDs and is used by the converter. Unmapped PowerPoint layouts fall back to the converter's heuristics (see `converter/ARCHITECTURE.md`).

A value is either a layout id (`"Title and Content": "bullets"`), or, **since format 0.2**, an object with **placeholder roles**:

```json
"pptxMapping": {
  "Title slide (wave) magenta": {
    "layout": "title-wave",
    "placeholders": { "36": "title", "35": "byline", "0": null }
  }
},
"pptxIgnore": [15, 16, 34, 84, 85, 86, 87, 91, 92]
```

- `placeholders` maps a PowerPoint placeholder **idx** (as a string) to a slot of the Slipr layout. Content in that placeholder goes straight into that slot: plain text for `text` slots, Markdown for `list` / `richtext`, the picture for `image`. `null` means *ignore this placeholder*: it is decoration or instructions, not content.
- For a `cards` slot, a role names a card or a card field: `"cards[2].title"` fills one field of the third card, and `"cards[2]"` fills the whole card. A whole-card role for a picture fills the card's first free image field. For text, the placeholder's paragraphs are spread over the card's free non-image fields in order, and the last field takes the rest. So a placeholder with a heading, a role line and a paragraph fills `name`, `role` and `text`.
- `pptxIgnore` (template-wide) lists placeholder idx values that are never content in this template, such as the footer, slide number, theme bar, gradient overlays and logo. It also applies to slides whose PowerPoint layout has no mapping entry.
- Content in placeholders without a role is placed by the converter's normal best-fit rules.

Roles matter for corporate templates, where structural elements are often "body" placeholders and the visible title can even be a body placeholder. Without roles, these would be converted as content. `validateTemplate` warns about roles that name a slot the layout doesn't have, a card index on a slot that is not a cards slot, an unknown card field, or a card index beyond `maxItems`.

## Versions

| Version | Change |
|---|---|
| 0.1 | Initial format |
| 0.2 | `pptxMapping` values may be objects with placeholder roles; new `pptxIgnore`. New slot type `cards` with `fields`, and card roles (`cards[i]`, `cards[i].field`). 0.1 templates remain valid unchanged |
| 0.3 | `pictureStyles` (D-014, I-084). 0.1 and 0.2 templates remain valid unchanged; `pictureStyles` in a 0.1 or 0.2 template is an error. Both shipped templates are 0.3 |
