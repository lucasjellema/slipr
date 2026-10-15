# I-106: Template editor (phase 1: theme designer)

Status: **done** · 2026-10-15 · Decision D-017. Verified in Claude's browser pane: starting from both templates, typing, linking, sizes, a swatch drag, adding a font file, reader mode with the generated sample, the Template tab, Save as folder… / Save / reopening the folder (in the origin-private file system), Download .zip, dark theme and 375 px. The real folder picker and a real font file are for Lucas to try.

## Goal

Make a new Slipr template without writing CSS by hand: start from an existing template, change its colours, fonts and sizes while watching sample slides in audience and reader mode, check the contrast, and save the result as a template folder (or a `.zip`) that shows can use straight away.

## Lucas's decisions (2026-10-15)

1. **A new app, `template-editor/`**, next to the viewer, the editor and the converter. Its own `CLAUDE.md`, `CHANGELOG.md` and tests. It reuses `shared/render.js` and `shared/blocks.js` for the preview, and opens folders with the File System Access API like the editor (D-007).
2. **Phase 1 is the theme designer**: clone `default` or `conclusion` (or open any template folder), edit the template's tokens (colours with WCAG AA checks, fonts including `.woff2` uploads, sizes), a live audience and reader preview on sample slides, the metadata of `template.json` with its style guide kept in sync, and save to a folder or download a `.zip`. The other parts of I-106 become their own backlog items: layout composer (I-111), master branding and chrome (I-112), reader theme styler (I-113), test drive in the editor (I-114), import from PPTX (I-115).
3. **Save model: rewrite token values in place.** Only the values of custom-property declarations in the top-level `:root` rules of `theme.css` and `reader.css` change; comments, order and every other rule stay exactly as written. No template-format change: templates stay hand-editable and the diff of a saved template shows only the changed values.
4. **Only the tokens a template already declares.** The editor offers what the template's `:root` rules declare, including its own brand tokens (the Conclusion template's `--cnc-*`). New standard tokens come with the items that need them.

## What the editor shows

- **Start screen**: *Start from* each template in `templates/index.json` (asks for an id and a name), and *Open a template folder…* (edits a template in place, Chromium only).
- **Token panel**, in tabs: **Colours**, **Type** (font stacks), **Sizes** (lengths and numbers) and **Other** (keywords such as `hidden`). Within a tab, tokens are grouped by the comment that precedes them in `:root` (`/* Data tables (I-104) */` → *Data tables*), in file order: `theme.css` first, then `reader.css`.
  - A token whose value is just another token (`var(--cnc-magenta)`) is shown as **linked**: a select offers the other tokens of the same kind, or *Own value*. Changing the brand token changes everything linked to it.
  - A colour has a swatch (`<input type="color">`) and a text field (any CSS colour; the swatch only for colours it can show).
  - A font stack has a text field, a select of the template's own font families (`@font-face`) and common stacks, and **Add font file…** (`.woff2`): the file is copied into `assets/fonts/` and an `@font-face` rule is inserted above the first `:root` rule.
  - A size has a text field; a value that is one number with a unit also gets − / + buttons.
  - A value is checked before it is written: no `;`, braces, comment markers, or unbalanced quotes and brackets (so an edit can never break the stylesheet), and in the browser `CSS.supports()` for colours and lengths.
  - A token declared in both files (`reader.css` overriding `theme.css`) is shown once, with its winning (last) declaration, which is the one that is edited.
- **Contrast**: pairs of tokens that are text on a background are checked against WCAG AA (4.5 : 1 for text, 3 : 1 for large text, graph colours and other graphics). Each colour row shows a badge for the checks it is part of; the Colours tab starts with a summary (*All 18 checks pass* / *2 below AA*, each a link to its row). A pair is checked only when both tokens exist and resolve to opaque colours. The pairs live in `template-editor/js/contrast-pairs.js`.
- **Template tab**: `id`, `name`, `version`, `description`, and the style guide's font descriptions. Style guide colours are not edited here: they follow their token (see below).
- **Preview** (an `iframe`, so the template's CSS cannot touch the editor's own UI): **Audience** (every sample slide at slide size, in a grid) or **Reader** (an article with each slide in reader mode, its summary and its reader blocks); **16:9** or **4:3** (4:3 only when the theme has a `[data-aspect="4:3"]` rule); and the **sample**: a Slipr sample show whose layouts the template has (`shows/demo`, `shows/conclusion-demo`), or *Generated*, one slide per layout with placeholder content per slot type. A token change replaces the preview's stylesheet text only, so it is immediate; nothing is re-rendered.
- **Undo / redo** (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`): one step per change; typing in one field coalesces.
- **Save** (`Ctrl+S`) writes the changed files back to the opened folder. **Save as folder…** asks for a folder and writes the whole template into a new subfolder named after the id (pick Slipr's `templates/` folder to make it available to shows; then add the id to `templates/index.json`). **Download .zip** packs the template in a folder named after the id. Before saving, `validateTemplate()` runs; errors stop the save.

## Style guide sync

`template.json`'s `styleguide.colors` documents the palette. When the template is opened, each entry is linked to a token: by name (`--slipr-color-<name>`, `background` → `--slipr-color-bg`, or any `--<prefix>-<name>`), otherwise by value (the one token whose own value is that colour). When saved, each linked entry gets the token's current colour (as `#RRGGBB`). Entries without a token are left alone.

## Cloning

- Files of a template opened by URL are found from its references: `template.json`, its theme and reader stylesheets, the layout files, every relative `src` / `href` in the layouts, and every relative `url()` in the stylesheets. Also `README.md`, and a font licence next to a font file (`OFL.txt` or `<Family>-OFL.txt`). A template opened as a folder copies every file.
- A clone gets the new `id` and `name`, version `0.1.0`, and a description saying where it came from. Its `README.md` is a new one (name, origin, date, layouts), because the original describes the original.

## Modules

| Module | Responsibility |
|---|---|
| `js/css-tokens.js` | DOM-free: parse the custom properties in top-level `:root` rules (offsets, group comment, trailing note), set a value in place, resolve `var()` chains, check a value, list and add `@font-face` rules, rewrite relative `url()`s and HTML `src` / `href`s |
| `js/color.js` | DOM-free: parse CSS colours (hex, `rgb()`, `hsl()`, named basics), relative luminance, contrast ratio, `#RRGGBB` |
| `js/token-catalog.js` | DOM-free: the token list the panel shows (kind, tab, group, linked token), from both stylesheets |
| `js/contrast-pairs.js` | DOM-free: the pairs to check and `checkContrast(tokens)` |
| `js/template-files.js` | DOM-free: the files a template references; clone metadata and README; style guide sync |
| `js/sample-show.js` | DOM-free: the generated sample show, and fitting a sample show to a template's layouts |
| `js/store.js` | The open template (files in memory), undo and redo |
| `js/source.js` | Reading a template from a URL or a folder handle; writing to a folder; the `.zip` |
| `js/ui/*.js`, `js/main.js` | Start screen, token panel, template tab, preview frame |
| `preview.html`, `js/preview/preview.js` | Runs inside the iframe: renders the sample with the shared renderer and swaps stylesheet text |

## Not in phase 1

Editing CSS rules other than token values, new tokens, layouts, picture styles, header/footer and logos, reader rules beyond tokens, opening the editor with the new template, PPTX import (I-111 … I-115). Remembering recently opened template folders.
