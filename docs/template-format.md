# Template format: version 0.1 (draft)

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

## `template.json`: example

```json
{
  "slipr": "0.1",
  "id": "default",
  "name": "Slipr Default",
  "version": "1.0.0",
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
  }
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
  </div>
</div>
```

Templates size everything inside the slide in **container query units** (`cqw` = 1 % of the slide width). The same CSS then works on the 1920×1080 Reveal.js canvas, in reader mode's slide frame, and in editor thumbnails. Reader mode can reflow a layout on narrow screens with `@container (max-width: …)` rules on `.slipr-mode-reader` descendants (see `templates/default/theme.css`).

Slot definitions in `template.json` can also carry `label` and `help` (shown by the editor), `required`, `maxLength` and `maxItems` (validation warnings).

**Restore text semantics.** Host pages may reset typography. Reveal.js's `reset.css` sets `font: inherit` on every element, which removes bold from `<strong>` and headings. A template's `theme.css` should restore `font-weight`/`font-style` inside `.slipr-slide`.

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

- An element whose optional slot is **empty** gets the attribute `data-empty` so CSS can hide it or reflow around it.
- Relative URLs inside a fragment (logos, illustrations) are resolved against the layout file.
- The renderer adds the mode class `slipr-mode-audience` or `slipr-mode-reader` to the root, so layouts can adapt. For example, a two-column layout stacks into one column in reader mode on narrow screens.

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
- popovers: `.slipr-popover` (glossary, footnotes, hotspots), and glossary term markers `.slipr-term`
- reader typography: article width, headings, chapter headers

The reader app's own `reader.css` handles only the structure (columns, TOC, margin, toolbar) and uses the template's `--slipr-*` variables, so a template restyles both modes consistently.

Layouts can adapt to reader mode with `.slipr-mode-reader` selectors. In particular they define how the layout reflows on narrow screens instead of being scaled down.

## `pptxMapping`

This maps PowerPoint slide-layout names to Slipr layout IDs and is used by the converter. Unmapped PowerPoint layouts fall back to the converter's heuristics (see `converter/ARCHITECTURE.md`).
