# I-111: Layout composer (template editor)

Status: **done** · 2026-10-15 · Decision D-019 (extends D-017). Verified in Claude's browser pane with both templates: a new layout and copies of hand-written ones (Two columns; Conclusion's Text and photo), a real mouse drag, arrow keys with Shift and Alt, undo, + Slot (tag cloud), + Picture, reader mode with the narrow reflow, Save as folder… / reopen / Save / Remove layout with the file deleted (origin-private file system), light theme and 375 px. Lucas checks the resize handles with a real mouse and the real folder picker.

## Goal

Make and arrange slide layouts in the template editor without writing HTML or CSS: draw boxes for slots and pictures on a slide-sized canvas (16:9 and 4:3), give each slot its type, look and limits, and watch a sample slide follow every move. Hand-written layouts stay hand-editable; the composer only rewrites what it made.

## Lucas's decisions (2026-10-15)

1. **Positions are grid areas in a marked block of `theme.css`.** A composed layout is a CSS grid over the whole slide (100 × 100 tracks, so a box is placed in whole percent). Its rules sit between `/* slipr-composer:begin <id> … */` and `/* slipr-composer:end <id> */` markers, which the composer owns and rewrites; everything outside the markers is never touched. One shared `base` block holds the grid itself and the reader-mode reflow: below 640 px in reader mode a composed layout becomes one column in box order, without its pictures. **No template-format change.**
2. **Existing layouts: slot settings only, plus duplicate.** For every layout the composer edits the name and description of the layout, and the label, help, required, maximum length and maximum items of its slots (not names or types: shows depend on them). Only composed layouts are arranged. **Duplicate as composed layout…** copies a hand-written layout's slots (and its logo) into a new composed layout to rearrange.
3. **Every shared slot type** is offered: text, rich text, list, image, quote, code, cards, diagram, web page, PDF, video, graph, map, table and tag cloud (not `chart`, which the renderer does not draw yet).
4. **Free decoration pictures**: any image of the template (logos, decor) or a new image file (copied into `assets/decor/`) can be placed as a box, with a fit (contain, cover, stretch). Plus an optional background colour token and the template's variant classes for the layout root.

## How a composed layout is stored

- **The layout file** (`layouts/<id>.html`) is one root element with the classes `slipr-layout slipr-composed slipr-composed--<id>`, the classes every layout root of the template shares (Conclusion: `cnc`), and the chosen variant classes (Conclusion: `cnc-dark`). Its children are the boxes, in order: later boxes are drawn on top, and the order is also the reading order. Every box has `data-box="<box id>"`: a slot's box id is its slot name; a picture is `picture-1`, `picture-2`, …
- **A slot box** is the template's own markup for that kind of slot (its *look*, see below) with `data-slot`. Slot types whose renderer adds a caption next to the element (diagram, web, PDF, video, graph, map, table, tag cloud) are wrapped in `<figure class="slipr-composed-figure">`, so the caption lands inside the box.
- **A picture box** is `<img class="slipr-composed-picture" src="../assets/…" alt="">`.
- **The block in `theme.css`**, generated:

  ```css
  /* slipr-composer:begin quote-photo · made with the layout composer (I-111); edit it there, or keep the format */
  .slipr-composed--quote-photo { background: var(--slipr-color-primary); }
  .slipr-composed--quote-photo > [data-box="title"] { grid-area: 8 / 8 / 18 / 70; }
  .slipr-composed--quote-photo > [data-box="picture-1"] { grid-area: 1 / 51 / 101 / 101; object-fit: cover; }
  /* slipr-composer:end quote-photo */
  ```

  `grid-area` is *row start / column start / row end / column end* on lines 1 … 101 (line *n* is at *n − 1* %). The composer reads a composed layout back from its file and its block, so a hand edit of a `grid-area`, `background` or `object-fit` value in the block is kept; anything else inside the markers is rewritten.
- **`template.json`** gets the layout entry as for any layout (`id`, `name`, `description`, `file`, `slots`). Changes are patched into the original text: an added or changed layout or slot is written in the style of its neighbours, and the rest of the file keeps its formatting.

## Looks: slots styled by the template

The composer adds no styling of its own beyond placement. A slot's **look** is copied from the template's own layouts: every element with `data-slot` in a layout file, grouped by slot type and opening tag (`<h2 class="cnc-title">`, `<div class="slipr-body">`), labelled with its class and where it comes from (*cnc-title · Text (title)*). A cards look carries its `<template>` blueprint and its card fields. The most common look of a slot's type, or the look of a slot with the same name, is the default; a type no layout of the template uses gets a plain fallback (`slipr-body`, `slipr-image`, `slipr-graph`, …).

Within a composed layout every box is reset to sit in its grid area (`position: relative; inset: auto; width / height auto; margin 0`), so looks from templates that place elements absolutely (Conclusion) work too.

## The composer in the editor

- **Layouts tab** (after Other): the template's layouts, each marked *composed* or *hand-written*, with its slot count; **New layout…** (name, id, start empty or as a copy of a layout).
- **A selected layout**: name and description; its slots with label, help, required, maximum length (text types) and maximum items (list, cards); for a composed layout also the background, variant classes, the box list (order with ↑ / ↓, remove), **+ Slot…** (type, name, look) and **+ Picture…** (a template image or a new file), and per box X, Y, W, H in %; **Remove layout** (its file is deleted when saved).
- **Preview**: while a layout is selected, the preview shows one slide of that layout at stage size with sample content (audience or reader, 16:9 or 4:3). For a composed layout the boxes are drawn over it: drag to move, drag a handle to resize (whole percent), click or Tab to select, arrow keys move by 1 % (Shift: 5 %), Alt + arrow keys resize. A move only changes the CSS, so the preview follows without re-rendering. Every drag is one undo step.
- **Save** writes the layout file, `theme.css` and `template.json`; a removed composed layout's file is deleted from the opened folder.

## Modules

| Module | Responsibility |
|---|---|
| `js/composer/html-elements.js` | DOM-free: a small tokenizer for layout fragments (elements with attributes and offsets), attribute edits on an opening tag |
| `js/composer/composer-css.js` | DOM-free: the marked blocks in a stylesheet (read, set, remove), the base block, box rules |
| `js/composer/layout-model.js` | DOM-free: a composed layout read from its file and block, written back; looks harvested from the template; new layouts, duplicates, auto-arrangement |
| `js/layout-actions.js` | DOM-free pure changes: add / update / remove a layout, slot settings, boxes, pictures |
| `js/actions.js` | `changedPaths()` and `deletedPaths()` include a removed layout's file |
| `js/json-text.js` | Patches structural changes into the original text, node by node |
| `js/ui/layouts-tab.js` | The Layouts tab |
| `js/ui/stage-overlay.js` | The boxes over the preview: drag, resize, keyboard |
| `js/preview/preview.js` | A `stage` render: one slide filling the frame, and its canvas rectangle |

## Not in this item

Changing the slot names or types of hand-written layouts; editing the card fields of a cards look; boxes that rotate; snapping to other boxes; a composed layout's own reader-mode arrangement; `pptxMapping` for composed layouts (the converter keeps using the template's mapping); thumbnails (`preview`) for layouts.
