# Changelog: Slipr (project level)

This file records cross-cutting changes: show and template format versions, the shared core, repository structure, and shared tooling. Component-specific changes go in the component's own `CHANGELOG.md`.

Format: newest first. Each entry has a date and a short description, grouped as **Added / Changed / Fixed / Removed** where useful.

## [Unreleased]

### 2026-10-15: Videos (I-110)
- **Added** to show format 0.2: the `video` slot and block types: `video` (a file in the show folder, a YouTube or Vimeo link, or an https video file), `title`, `start` / `end`, `muted`, `loop`, `controls`, `captions` (`{ src, label?, lang? }`, a WebVTT file), `chapters` (`[{ time, title }]`), `transcript` (Markdown), `caption`, `load`, `fallback` (the poster); slots also `play` (`click`, `slide`, `step`), `chapterSteps` and `present`. Schema definitions `video`, `videoCaptions`, `videoChapters`, `blockVideo`; template slot type `video`. Validation: unsafe or non-http(s) addresses, captions that are not a `.vtt` in the show folder and chapters without time or title are errors; missing files, an https page that is no video, `end` before `start`, chapters out of order, captions on YouTube / Vimeo, `static` without a poster and `chapterSteps` without chapters are warnings.
- **Added** `shared/embeds/video.js` (no library, D-011 refined): the browser's own player for files (captions as a track), YouTube via youtube-nocookie.com and Vimeo with `dnt=1`, driven by their postMessage commands; click-to-load in reader mode; audience slots pause when the slide is left, play on arrival or on a step, and can step through chapters; reader blocks list chapters and a transcript, reader slots get a chapter menu and a Transcript dialog. Video files and captions join `collectImagePaths()` (file checks, folders, zips, exports); the single-file export embeds video files up to 25 MB and warns about larger ones. Reader search indexes chapter titles and transcripts, one result per chapter.
- **Changed** the templates: a `video` layout in default 1.8.0, forest 0.2.0 and Conclusion 0.1.9. The demo has a video slide ("A video, chapter by chapter": a 9-second clip in `media/` with captions, chapters as steps, a transcript and a poster) and a YouTube block; the Conclusion demo a YouTube slide. The AI prompt kit leaves videos out. Spec `docs/specs/I-110-video.md`.

### 2026-10-15: Forest template (T-005)
- **Added** `templates/forest/` (0.1.0), based on Slipr Default 1.7.0 (same 12 layouts and slots, so shows can switch): deep forest greens on parchment, ochre accents, a moonlit pine forest on the title slide and a tree line on section slides (`assets/illustrations/forest.svg`, `ridge.svg`, drawn for it), the Slipr logo in forest colours, and classic serif type (Palatino headings, Georgia body; installed fonts, no font files). All 25 contrast checks of the template editor pass. Listed in `templates/index.json`; prompt kit `docs/ai/prompts/forest-*.md`.

### 2026-10-15: Template editor, phase 1 (I-106)
- **Added** a fourth app, `template-editor/` (D-017): make a template from one in `templates/index.json` or open a template folder, edit the values of its `:root` tokens (colours with WCAG AA checks, fonts with `.woff2` upload, sizes) with a live audience and reader preview, and save the folder or a `.zip`. Token values are rewritten in place and `template.json` keeps its formatting; no format change. Spec `docs/specs/I-106-template-editor.md`; the rest of I-106 is I-111 … I-115. Component docs in `template-editor/`.
- **Added** chore C-009: the contrast checks found pairs below AA in both shipped templates (left for Lucas to decide).
- **Changed** `.claude/launch.json`: a `slipr-alt` entry on port 8085 for when another session's server holds 8080.

### 2026-10-15: AI prompt kit (I-080)
- **Added** `shared/prompt-kit.js`: `buildPrompt(template, { variant })` writes an instruction that lets any AI chatbot write a valid `show.json` for a template (what Slipr is, output rules, the show structure, the template's layouts with their slots and limits, Markdown, image placeholders, writing guidelines, a worked example, a self-check list and a *Your content* section); `fillBrief()` fills that section; `fixUpPrompt()` turns validation errors into a follow-up message; `exampleShow()` builds the example. Layouts, slots and limits come from `template.json`, enums from `show.schema.json`. It teaches the core of format 0.2; layouts that need web pages, PDFs, graphs or maps are listed under *Do not use*.
- **Added** `tools/prompt-kit.js` (`npm run prompt`, `-- --template <folder>`, `-- --check`): writes `docs/ai/prompts/<template>-full.md` and `-compact.md` (committed; the compact one stays under 12 000 characters). `shared/test/prompt-kit.test.js` checks that every layout appears, that the example validates without warnings and that the committed files are up to date.
- **Added** `docs/ai/prompt-kit-results.md`: three content briefs and the results per chatbot. Spec `docs/specs/I-080-prompt-kit.md`.

### 2026-10-15: Tag clouds (I-105)
- **Added** to show format 0.2: the `tag-cloud` slot and block types (inline `terms` of `{ text, weight?, glossary? }`, or a CSV `data` file with `termColumn` / `weightColumn`; `order` (cloud, weight, alphabetical, none), `maxTerms`, `weightLabel`, `steps` for slots (`{ terms: n }`, `{ highlight: name | [names] | null }`), `caption`, `fallback`; blocks also `title`). Schema definitions `tagCloud`, `tagCloudTerm`, `tagCloudStep`, `blockTagCloud`; template slot type `tag-cloud`. Validation: a 0.1 show, neither terms nor data, a term without text, a negative weight, an unknown order or step, a non-CSV data address and steps on a block are errors; a highlight naming an unknown term, an unknown glossary id and a missing data file are warnings. CSV files are listed by `collectImagePaths()` (exports, folders, zips).
- **Added** `shared/embeds/tag-cloud.js` (no library): repeated terms merged, sizes and four colour tiers by weight, the heaviest in the middle, glossary links by term or alias (D-015); audience steps reveal the heaviest terms in place or highlight terms, only in a running presentation; in reader mode each term is a button whose popup (`viewer/reader/interactions.js`) shows the glossary definition, the weight and the other slides that mention the term (`slidesMentioning()` in `viewer/reader/search-index.js`). Reader search indexes inline terms.
- **Changed** both templates: a `tag-cloud` layout, the `--slipr-tag-cloud-*` tokens and popup styles for the slide list (default 1.7.0, Conclusion 0.1.8). The demo has a tag cloud slide ("What a show is made of", glossary-linked terms, three steps) and a block from `data/keywords.csv` (one survey answer per row, counted); the Conclusion demo a tag cloud slide. Spec `docs/specs/I-105-tag-cloud.md`; show and template format docs.

### 2026-10-14: Data tables (I-104)
- **Added** to show format 0.2: the `table` slot and block types (inline `columns` + `rows`, or a CSV `data` file; `sortable`, `sort`, `filter`, `maxRows`, `pinFirst`, `locale`, `steps` for slots, `caption`, `fallback`; blocks also `title`). Column settings: `key`, `label`, `format` (text, number, integer, percent, currency, date, markdown), `decimals`, `currency`, `align`, `hidden`, `total` (sum, avg, min, max, count), `visual` (scale, bar, sign). Schema definitions `table`, `tableColumn`, `tableStep`, `tableCell`, `blockTable`; template slot type `table`. Validation: a 0.1 show, neither rows, columns nor data, a bad `data` address and unknown formats are errors; duplicate columns, extra cells, unknown columns in sort and steps, totals or visuals on columns without numbers and a missing data file are warnings; Markdown cells are checked. Table data files join `collectImagePaths()`, so folder and zip shows, both exports and the file check include them.
- **Added** `shared/csv.js` (RFC 4180 reader with comma / semicolon / tab detection, and a writer) and `shared/embeds/table.js` (no library): the table itself as static content, then sorting, filter, totals, colour scales, data bars, red / green numbers, pinned first column, sticky header and footer; audience steps (show rows, highlight a row, column or cell) on hidden Reveal fragments, only in a running presentation (print, thumbnails and the editor show every row); reader Columns menu, Copy and Download CSV. Reader search indexes headers and inline cells.
- **Changed** `isGraph()` no longer takes a value with a CSV `data` file (or `rows` / `columns`); `staticHtml()` of embed kinds receives the embed options.
- **Changed** both templates: a `table` layout and the `--slipr-table-*` tokens (default 1.6.0, Conclusion 0.1.7). The demo has a table slide ("A table that tells a story": Markdown cells with slide links and a glossary term, bar, scale and sign columns, totals, four steps) and a table block from `data/sales.csv` (semicolons and decimal commas, filter, hidden columns); the Conclusion demo a table slide. Spec `docs/specs/I-104-table.md`; show and template format docs.

### 2026-10-14: Local map tiles everywhere (I-099)
- **Added** `readAsset(path)` on the show context of folder and zip shows (`shared/load.js`), and a `readAsset` option for `hydrateEmbeds()` that embed kinds receive in `hydrate(el, live, options)`. Maps with tiles in the show folder read each tile through it, so they work in shows opened from a folder or a zip (viewer and editor preview).
- **Added** an optional `listFiles(dir)` to `packShow()`: the single-file export packs every tile a local tile template names (`localTileTemplates()`, `tileFolder()`, `tilePattern()` in `shared/embeds/map.js`). `npm run export` and the editor's Export… (folder shows) provide it.
- **Added** fixture `shows/fixtures/local-tiles/` (21 plain tiles) and `shared/test/local-tiles.test.js`. Spec: `docs/specs/I-075-map.md`, section *Local tiles everywhere*.

### 2026-10-14: Map background layers (I-075 follow-up)
- **Added** a map layer without a `tag` is background: filled with the template's page color, outlined in its muted color, and left out of the fitted first view (unless the map has nothing else). Schema description and format docs.
- **Changed** the demo's offline map block: an outline of the Netherlands as background (`shows/demo/data/netherlands.geojson`, the European part of Natural Earth 1:50m admin-0 countries v5.1.2, public domain, rounded to 4 decimals) under the route, with `zoom: 8` so some coast stays in view.
- **Fixed** the map's **Place…** list offered places hidden by the tag filter, and picking one opened the panel of a pin that was not on the map.

### 2026-10-13: Maps (I-075, D-011 refined)
- **Added** `vendor/leaflet-1.9.4/` (Leaflet, BSD-2-Clause, from npm `leaflet@1.9.4`, integrity checked; `dist/leaflet-src.esm.js`, `dist/leaflet.css` and its images, see its `VENDORED.md`).
- **Added** to show format 0.2: the `map` slot and block types (`center`, `zoom`, `markers`, GeoJSON `layers`, `tiles`, `load`, `caption`, `fallback`; slots also `steps` and `present`; blocks also `title`). Schema `$defs/map`, `latLng`, `mapMarker`, `mapLayer`, `mapTiles`, `mapStep`, `blockMap`. Validation: a 0.1 show, no center / markers / layers, positions or zoom out of range, a tile address that is not `https:` or relative with `{z}`, a bad layer address and `steps` / `present` on a block are errors; duplicate marker ids, unknown markers in steps, unknown marker slides, missing layer files and a tile server without attribution are warnings; marker Markdown is checked. Layer files join `collectImagePaths()`. Template slot type `map`.
- **Added** `shared/embeds/map.js`: the static place list, lazy Leaflet drawing with Slipr's own pins in the template's graph palette, tiles from OpenStreetMap (click-to-load in reader mode, live in audience mode), a server, the show folder or none; audience steps fly from place to place on hidden Reveal fragments; reader Fit / place list / tag filter / place panel. Reader search indexes place titles and text.
- **Changed** the single-file export also leaves out the stylesheets of unused embed libraries, and knows `.geojson`.
- **Changed** both templates: a `map` layout (default 1.5.0, Conclusion 0.1.6). The demo has a map slide ("A map on a slide", three steps) and an offline map block with a GeoJSON route (`data/route.geojson`); the Conclusion demo a map slide. Spec `docs/specs/I-075-map.md`; show and template format docs.

### 2026-10-13: Pictures morph between slides (I-091)
- **Added** to show format 0.2: `morphId` on image values (a name that pairs two pictures between auto-animate slides). Validation: an error in a 0.1 show; the same name twice on one slide is a warning. `shared/picture.js` writes `data-morph-id`.
- **Changed** the demo: "AI help, kept in its cage" and a new detail slide (`s-ai-detail`) have auto-animate on, so the photo zooms into the robot. Spec `docs/specs/I-091-image-morph.md` (with the Reveal.js spike).

### 2026-10-13: Import local presentation archives in viewer
- **Added** `shared/archive-handles.js`: client-side presentation archive storage in IndexedDB (`slipr-archives`) with in-memory fallback for private and test modes.
- **Added** `shared/zip.js` shared `pickZipFile()` function for picking `.zip` and `.slipr` files across editor and viewer.
- **Added** Viewer local zip import: **Open zip archive…** and drag-and-drop support on the start screen; client-side decompression, multi-show selection, and persistence under `?archive=<key>` for seamless mode switching (<kbd>A</kbd> / <kbd>R</kbd>).

### 2026-10-13: Export to zip and import from zip in editor (I-092)

- **Added** `writeZip()` and `crc32()` in `shared/zip.js`: in-memory zip archive writer using Web Streams `CompressionStream('deflate-raw')` with pure JS IEEE 802.3 CRC-32 and UTF-8 filenames, zero npm runtime dependencies (D-001, D-002).
- **Added** `editor/js/export-zip.js`: **Export Zip…** packages `show.json`, referenced images, data files, and local documents into `.zip` or `.slipr` archives directly client-side.
- **Added** `openZipFile()` in `editor/js/files.js`: **Open zip archive…** on start screen and **Open Zip…** in toolbar. Decompresses archives in memory without server upload; handles root shows, single-directory wrappers, and prompts for multi-presentation archives.
- **Added** cross-browser authoring and in-memory asset editing for browsers without File System Access (Firefox, Safari).

### 2026-10-13: Present from a zip URL (I-087)
- **Added** `shared/zip.js`: client-side decompressor using Web Streams `DecompressionStream('deflate-raw')` without build steps or runtime npm packages (D-001, D-002). `readZip()` extracts STORE and DEFLATE archives in memory; `downloadZip()` streams downloads with live progress callbacks; `createZipSource()` adapts files into an in-memory `FolderSource` with `blob:` object URLs, with auto-detection for GitHub single-wrapper directory archives (e.g. `repo-main/show.json`) and optional `&path=` resolution for repositories with multiple presentations.
- **Added** `loadShowFromZip()` in `shared/load.js`.
- **Added** viewer support for `viewer/?zip=<url>`: downloads and decompresses client-side, showing progress bar, and presents in audience or reader mode with clear diagnostics for CORS restrictions, missing files, or 404s.

### 2026-10-13: Image cropping (I-090)
- **Added** to show format 0.2: `crop` (`{ x, y, w, h }`, fractions of the picture) on every image value; schema `$defs/imageCrop`. Validation: a 0.1 show with a crop is an error; a crop outside the picture or without size, and a hotspot outside its picture's crop, are warnings.
- **Added** `shared/crop.js`: crop helpers (tested) and `applyCropFallback()`, which draws cropped pictures on a canvas in browsers without `object-view-box` (called by `renderSlide()` and `hydrateEmbeds()`). `shared/picture.js` adds `object-view-box` and `data-crop` to every picture; reader image blocks place hotspots relative to the crop.
- **Changed** the demo photo on "AI help, kept in its cage" is cropped. Spec `docs/specs/I-090-image-cropping.md`; show and template format docs.

### 2026-10-13: Graphs (I-074, D-011 refined)
- **Added** `vendor/cytoscape-3.34.3/` (Cytoscape.js, MIT, from npm `cytoscape@3.34.3`, integrity checked; only `dist/cytoscape.esm.min.mjs`, see its `VENDORED.md`).
- **Added** to show format 0.2: the `graph` slot and block types (`nodes`, `edges`, `data` file, `layout`, `steps` for slots, `caption`, `fallback`; blocks also `title`). Validation: a 0.1 show, no nodes or data, a bad `data` address and `steps` on a block are errors; duplicate nodes, unknown nodes in edges or steps, unknown node slides and a missing data file are warnings; node Markdown is checked. Data files join `collectImagePaths()`. Template slot type `graph`.
- **Added** `shared/embeds/graph.js`: the static node list, lazy Cytoscape drawing with template tokens and tag colors, audience steps on hidden Reveal fragments, reader pan / zoom / node panel / tag filter. Reader search indexes node labels and text.
- **Changed** both templates: a `graph` layout and the `--slipr-graph-1` … `6` palette (default 1.4.0, Conclusion 0.1.5). The demo has a graph slide ("How the pieces connect", three steps) and a graph block from `data/show-format.json`. The Conclusion demo has a graph slide (`s-graph`). Spec `docs/specs/I-074-graph.md`; show and template format docs.

### 2026-10-13: Text elements on slides (I-089, D-016)
- **Added** to show format 0.2: text elements, overlays with `text` (inline Markdown) and an optional `style` (font, size, bold / italic / underline / uppercase, alignment, colors, fill opacity, border, radius, text outline, padding; lengths in percentages of the slide width). An overlay has either `image` or `text`. Schema `$defs/textStyle` and `$defs/hexColor`; validation: a 0.1 show with one is an error, an empty text or one outside the canvas is a warning, glossary ids in the text are checked.
- **Added** `shared/text-style.js` (DOM-free, tested): turns a style into checked CSS declarations and cleans a style for storage. `shared/render.js` draws text elements in the overlay layer; links and glossary terms in them stay clickable.
- **Changed** the Conclusion template (0.1.4) defines `--slipr-size-*` from its own type sizes, for text elements in a named size. The demo slide "A show is just data" has a text element. Spec `docs/specs/I-089-text-elements.md`; D-016; show and template format docs.

### 2026-10-12: PDF documents (I-072)
- **Added** `vendor/pdfjs-4.10.38/` (PDF.js, Apache-2.0, from npm `pdfjs-dist@4.10.38`, integrity checked; only `build/pdf.min.mjs`, the worker, `cmaps/`, `standard_fonts/`, see its `VENDORED.md`). `.gitattributes` marks `.pfb` and `.bcmap` as binary.
- **Added** to show format 0.2: the `pdf` slot type and `pdf` block (`pdf`, `title`, `page?`, `pages?: [first, last]`, `load?`, `fallback?`). Validation: unsafe addresses are an error; a missing local file, `page` with `pages`, and a reversed range are warnings. Template slot type `pdf`, and a `pdf` layout in both templates (default 1.3.0, Conclusion 0.1.3).
- **Added** `shared/embeds/pdf.js`: audience slots fit the page and step through a range with hidden Reveal fragments; reader blocks have page navigation, zoom, "Open PDF" and screen-reader text; PDFs on other servers are click-to-load in reader mode. Local PDFs join `collectImagePaths()` (file checks, folder sources, single-file export, where the PDF.js worker runs on the page).
- **Changed** audience mode no longer waits for embeds before showing the show (a large PDF or slow page would hold it up). PDF pages render with PDF.js's print intent, so they also render in hidden or background tabs.
- **Changed** the demo (`s-pdf`, `docs/slipr-in-four-pages.pdf`) and the Conclusion demo (`s-pdf`). Spec `docs/specs/I-072-pdf-document.md`; D-011 refined; show and template format docs.

### 2026-10-12: Web pages on slides and in the reader (I-071)
- **Added** to show format 0.2: slot type `web` (`url`, `title`, `allow?`, `present?`, `load?`, `fallback?`), and `allow` / `aspect` on the `embed` block. `allow` loosens the frame sandbox from an allow-list (`same-origin`, `fullscreen`, `modals`, `downloads`, `presentation`); `same-origin` applies to pages on other servers only. Validation: unsafe addresses are an error; `present: "static"` without a fallback and `same-origin` on a show file are warnings.
- **Added** template slot type `web`, and a `web` layout in both templates (default 1.2.0, Conclusion 0.1.2).
- **Changed** `shared/embeds/web.js`: audience mode shows a web slot live without a Load button, or the screenshot (`present: "static"`); reader frames take an aspect ratio or height; a loaded frame keeps an "Open in new tab" link. **Fixed** `hydrateEmbeds()` now adds `embeds.css` when a page has only static embeds.
- **Changed** the demo (`s-live-page`) and the Conclusion demo (`s-web`, now format 0.2). The single-file export embeds local pages of web slots. Spec `docs/specs/I-071-website-embed.md`; D-011 refined; show and template format docs.

### 2026-10-12: Shared foundation for rich embeds (I-070, D-011)
- **Added** `shared/embeds/`: a registry (`index.js`) with one module per embed kind (`diagram.js`, `web.js`), click-to-load consent (`consent.js`) and shared styling (`embeds.css`, from `--slipr-*` tokens). `render.js` and `blocks.js` write an embed element with a static fallback inside; `hydrateEmbeds(root)` renders the live content and lazy-loads a kind's library only when it is used.
- **Added** to show format 0.2: `fallback` (an image value) on diagram slot values, diagram blocks and embed blocks, and `load` (`"click"` default, or `"auto"`) on embed blocks. Validation: either in a 0.1 show is an error; fallback images get the usual alt-text and file checks and are included by `collectImagePaths()` (so the single-file export embeds them).
- **Changed** the reader `embed` block: a page on another server is click-to-load by default (a link card with title, site, *Open in new tab* and a **Load** button), so nothing is requested before the reader agrees (D-010); consent is remembered per site until the tab closes. Files in the show folder still load directly.
- **Changed** `shared/diagram.js` moved to `shared/embeds/diagram.js`; `renderDiagrams()` is now the generic `hydrateEmbeds()`. The diagram error box is `.slipr-embed-error` (in `embeds.css`, so audience mode and the editor style it too). The single-file export leaves out the libraries of embed kinds a show does not use (was: a Mermaid-only check).
- **Changed** the demo show: the pipeline diagram has a fallback image, and "Tailored to every reader" has a deep-dive embed of a Wikipedia page (click-to-load). Spec `docs/specs/I-070-embed-foundation.md`; `docs/show-format.md`; D-011 (approves Mermaid, Cytoscape.js, Leaflet and PDF.js).

### 2026-10-12: Glossary terms clickable in slides (I-086, D-015)
- **Added** `shared/glossary.js`: finds glossary terms and their aliases in text (whole words, case- and accent-insensitive, longest first, once per slide; tested in Node) and links them as `.slipr-term` buttons. `shared/render.js` uses it in reader mode, so terms on slides open their definition like `[[term]]`; audience mode is unchanged.
- **Added** to show format 0.2: `aliases` on glossary terms. Validation: aliases in a 0.1 show are an error; a name used by two terms is a warning. Reader search finds terms by their aliases.
- **Changed** the demo show: aliases on Reveal.js, template and layout. Spec `docs/specs/I-086-glossary-in-slides.md`; show and template format docs; D-015.

### 2026-10-11: Picture styles and opacity (I-084, D-014)
- **Added** template format **0.3**: `pictureStyles` (id, label, description, `pptxEffect`), each a class `slipr-picture-<id>` in `theme.css`. Both templates are 0.3 and offer `shadow`, `soft`, `rounded` and `frame` (default 1.0.0 → 1.1.0, Conclusion 0.1.0 → 0.1.1 so `^0.1` shows stay in range; the Conclusion styles are on-brand and subject to I-043d).
- **Added** to show format 0.2: `style` and `opacity` (0–1) on every image value (image slots, card images, reader image blocks, extra images). Validation: either in a 0.1 show is an error; a style the template lacks is a warning and renders unstyled.
- **Added** `shared/picture.js`, used by `render.js` and `blocks.js`. **Changed** an extra image is now a positioned box with the image inside, so its opacity does not defeat Reveal's fragment (it showed before its click).
- **Changed** the demo show: the JSON badge has a shadow at 90 %, the reader's architecture image a frame. Spec: `docs/specs/I-084-picture-styles.md`; template and show format docs; D-014 refined.

### 2026-10-11: Show format 0.2: extra images on a slide (I-083, D-013)
- **Added** `slide.overlays` (show format **0.2**): extra images placed freely on a slide, `{ image, x, y, w, h, fragment? }` with position and size as fractions of the canvas, in front of the layout. 0.1 stays valid (enum in the schema); a 0.1 show with overlays is an error; an overlay outside the canvas is a warning, and overlay images get the usual alt-text and file checks. Spec: `docs/specs/I-083-extra-images.md`; `docs/show-format.md` and `docs/template-format.md` updated; D-013 refined.
- **Added** to `shared/render.js`: the `.slipr-overlays` layer (inline positioning, so every template supports it), and the mode class `slipr-mode-reader-fixed` for reader-mode slides with extra images, so they stay a picture on narrow screens. `collectImagePaths()` includes overlay images (file checks, single-file export).
- **Changed** the demo show to format 0.2: "A show is just data" has an extra image (`images/json-badge.svg`) that appears with `fade-left`.
- Editor, viewer and converter: see their changelogs.

### 2026-10-11: Documentation pass (handover)
- **Changed** the root README status (Phases 0–5 done; the show grid, Export… and the editor theme), the editor README status, and the backlog's *Now* section (Phase 6, with handover notes: open questions for Lucas, what still needs checking in a real browser, and working habits).

### 2026-10-11: Single-file HTML export (I-054)
- **Added** `shared/export/single-file.js` and `npm run export -- <show folder> [out.html]` (`tools/export-show.js`): one HTML file with the show, its template and the viewer, which presents offline in both modes (no server, no network requests). ES modules travel as `data:` URLs in an import map, with relative imports and `import.meta.url` rewritten to virtual addresses; show and template files are embedded and served by a small runtime; CSS `url()`s and layout URLs are inlined. Mermaid is included only for shows with diagrams. Exports go to `exports/` (git-ignored). Spec: `docs/specs/I-054-single-file-export.md`.
- **Changed** the viewer slightly for it: `main.js` loads a bundled show, `addStylesheet` maps virtual URLs, and `audience.js` names Reveal's stylesheets directly.

### 2026-10-11: Documentation pass (editor E-003 to E-009, I-025, I-036)
- **Changed** the docs to match the code after E-003, E-004, E-005, E-008, E-009, I-025, I-035 and I-036: root README status (the editor saves to disk now), ROADMAP Phase 5 steps, the editor's README status, `ARCHITECTURE.md` (module tree with `ui/find-replace.js`, all test files, the real store state, the full action list, a find & replace section; drafts marked planned, no slide thumbnails), and `CLAUDE.md` (where block editors live, a find & replace smoke step, the two search/replace walkers).
- **Fixed** E-014, found in this pass: `Ctrl+F` / `Ctrl+H` in the editor threw, because the shortcut handler was not passed on (see the editor changelog).

### 2026-10-10: `registerAsset()` in the show context (E-006)
- **Added** `ctx.registerAsset(src, blob)` to `shared/load.js`: for a show loaded from a folder it makes a newly added file resolvable (a `blob:` URL); for URL shows it does nothing, because the server serves the new file.

### 2026-10-10: The viewer opens show folders (E-007)
- **Added** `viewer/?folder=<key>`, using the shared folder loader (D-012), so the editor's Present and Read work for shows anywhere on disk. See the viewer and editor changelogs.

### 2026-10-10: Show folders opened from anywhere (D-012, E-002)
- **Added** `shared/folder-source.js` (read a show folder through a File System Access handle) and `shared/folder-handles.js` (remember folder handles in IndexedDB under a key).
- **Added** `loadShowFromFolder()` and `resolveFolderTemplate()` in `shared/load.js`. `loadShow()` is unchanged apart from a new `notices` field (always empty for URLs).
- **Added** `templates/index.json`, the list of templates the editor offers for a new show. A test keeps it in sync with the template folders.
- **Changed** the template-ref convention, with no format change: new shows reference their template root-relative (`/templates/<id>`). Documented in `docs/show-format.md`.
- **Decided** D-012: shows outside the server root are shared with the viewer as a folder handle, and their template is resolved by name.

### 2026-10-10: Documentation pass (handover)
- **Changed** README, ROADMAP, ARCHITECTURE (new *Templates* section), OVERVIEW (specs and template READMEs), CLAUDE.md (company material, parallel sessions), and the component docs, to match the current state: Phases 0–4 done, the Conclusion template with 17 layouts, and the editor's first version (E-001) with its known limits.
- **Added** backlog items E-010 (the editor's slide form overwrites image/quote/code/cards values with text), I-035 (cards editor) and I-058 (Facts icons).

### 2026-10-10: Cards slots and the card layouts (I-043b)
- **Added** slot type **`cards`** (template format 0.2, additive; show format stays 0.1): a slot definition lists the `fields` of one card (`text`, `richtext`, `list`, `image`), and the show value is an array of objects. Layouts describe one card in a `<template>` blueprint with `data-field` elements (`data-field="#"` gets the card number). Updated both schemas, both specs, `validate.js` (field types, unknown and empty required fields, `maxLength`, `maxItems`, card images) and `render.js` (`fillCards`; clones get `slipr-card` and `data-card-index`).
- **Added** card roles in `pptxMapping`: `"cards[i]"` (whole card) and `"cards[i].field"`. `validateTemplate` checks the slot, the field and the index.
- **Added** five Conclusion layouts: `columns-4` (Textbox 4x), `boxes-9` (Textbox 9x, numbered), `facts` (Facts & figures, mirrored right column), `image-cards-8` (Onze markten) and `people-2` (Introduction), with reader reflow. The template now has 17 layouts. Five demo slides in `shows/conclusion-demo/` (neutral placeholder photos and icon).
- **Added** viewer support (fragments, search, pins per card) and converter support (card roles). See the component changelogs.
- **Verified** against PowerPoint's export of the example slides: the 5 card slides convert with no reader leftovers, and photo, grid and text positions match within about 0.5 % of the slide.
- **Added** tests: cards validation and roles, Conclusion template and demo validate without warnings, card search (JS); card roles and empty cards (Python).

### 2026-10-10: Conclusion template, first version (I-043)
- **Added** `templates/conclusion/` (template format 0.2): 12 layouts on the exact grid of the official Conclusion PowerPoint template; `theme.css` (tokens, fonts, square corners, magenta bullets, text styles, gradient overlays, reflow for phones); `reader.css` (house style for reader mode); original assets (logo, stripe mark, footer band, waves; the title wave converted losslessly from the original geometry); Source Serif 4 (OFL); `pptxMapping` with placeholder roles for all 20 PowerPoint layouts; README.
- **Added** `shows/conclusion-demo/`: one slide per layout, with neutral placeholder images instead of brand photos, and generated agendas in the template's agenda layout.
- **Verified** visually against PowerPoint's own export of the template's example slides, and by converting those 20 slides with the converter (output kept local, not committed, because of the brand photos).

### 2026-10-10: Groundwork for the Conclusion template (I-043)
- **Added** template format **0.2**: `pptxMapping` values can be objects with placeholder roles (`{ "layout", "placeholders": { "<idx>": "<slot>" | null } }`), plus a template-wide `pptxIgnore`. 0.1 templates stay valid. Updated the schema, `validateTemplate` (checks that role slots exist), the spec and tests.
- **Added** Markdown: letter lists (`A.` / `a.`, rendered as `<ol type="A">`) and subheadings (an entirely bold paragraph → `p.slipr-md-subheading`). Documented in the show-format spec.
- **Added** viewer support: generated agenda slides use the template's own `agenda` layout when it has one. The slide-number position/colour and chapter-bar visibility are now template tokens.
- **Added** converter support: placeholder roles and `pptxIgnore`, and Office's automatic alt text counts as missing.
- **Added** `docs/specs/I-043-conclusion-template.md` (analysis, proposal, Lucas's decisions).

### 2026-10-10: Phase 4, PPTX converter
- **Added** the Python converter `slipr-convert` (see `converter/CHANGELOG.md`). It converts PowerPoint decks into Slipr shows, with a per-run conversion report. Content that doesn't fit a layout goes to the reader layer.
- **Added** a cross-language contract test: the converter's output must pass both the JSON Schema (Python `jsonschema`) and `shared/validate.js` (Node).
- **Changed** the backlog: I-043 (derive a Slipr template from the company PowerPoint template) moves to *Now*.

### 2026-10-10: Annotating slides and slide objects
- **Added** to reader mode: notes on whole slides, pins on objects within slide visuals, and highlights in slide text (see `viewer/CHANGELOG.md`). 5 new tests (133 total).

### 2026-10-10: Phase 3, reader personalisation
- **Added** to reader mode: persistent per-reader state, a welcome chooser and Tailor panel, progress tracking with a resume message, bookmarks, full-text search, and highlights with notes (export/import). See `viewer/CHANGELOG.md`.
- **Added** 19 tests for the pure Phase 3 modules (state store, text-quote anchoring, search, notes export). The total is now 128.
- All reader data stays in the reader's browser (D-010): IndexedDB database `slipr-reader`, one record per `show.id`.

### 2026-10-10: Phase 2, reader core
- **Added** `shared/blocks.js`: renders every reader block type (text, details, callout, tabs, image with hotspots, embed, slide-ref) to safe HTML strings, with "For …" / "Deep dive" badges. 14 tests.
- **Added** reader mode in the viewer (see `viewer/CHANGELOG.md`), including `viewer/reader/personalize.js` with 16 tests in `viewer/test/`. The total is now 109 tests.
- **Changed** `shared/render.js`: images load lazily in reader mode.
- **Changed** the default template's `reader.css`: styles for badges, the hotspot frame and popover content.
- **Changed** the demo show: a new slide "AI help, kept in its cage" (`images/caged-agent.jpg`), hotspot markers moved to the box corners so they don't cover labels, and a rephrased footnote that no longer cites unverified "studies".

### 2026-10-10: Phase 1, shared core and audience mode
- **Added** `shared/markdown.js`: a safe Markdown subset (paragraphs, nested lists, code fences, inline formatting, links) with Slipr extensions (`[[glossary]]`, `^[popup]`, `#slide` links) and an audience/reader mode.
- **Added** `shared/load.js`: loads a show with its template and layouts, HEAD-checks images, validates, and gives readable `LoadError`s.
- **Added** `shared/render.js`: the single slide renderer (layout fragment + slot filling, relative-URL rewriting, `data-empty`).
- **Added** tests for markdown (29) and load (7). The total is now 79.
- **Added** audience mode in the viewer (see `viewer/CHANGELOG.md`).
- **Added** `.claude/launch.json` (dev server entry for Claude's browser pane).
- **Fixed** the default template: the two-column layout used `<section>`, which Reveal treats as vertical slides. It now uses `<div>`, and a test forbids `<section>` in layouts.
- **Fixed** the default template: bold, italic and heading weights are restored under Reveal's `reset.css`.
- **Changed** the default template: larger body text (2.2cqw), and two-column cards size to their content.
- **Changed** the template spec: documents the reset and no-`<section>` rules.

### 2026-10-10: Phase 0 foundations
- **Added** `.gitattributes` (LF line endings in repo and working copy, binary assets marked).
- **Added** `vendor/reveal.js-6.0.2/`: the unmodified `dist/` of the npm package, with `VENDORED.md` (source, checksum, upgrade procedure). Reveal 6 ships native ES modules, which fits the no-build setup.
- **Added** `shared/schema/show.schema.json` and `template.schema.json` (JSON Schema draft 2020-12), cross-checked with the Python `jsonschema` reference validator.
- **Added** `shared/schema-check.js` (a minimal JSON Schema checker for the keywords Slipr uses) and `shared/validate.js` (structural + semantic validation of shows and templates), with 43 tests in `shared/test/`.
- **Added** `templates/default/`: the template manifest, 5 layouts (`title`, `section`, `bullets`, `two-column`, `image-full`), `theme.css` (container-query sizing with reader reflow), `reader.css` (blocks, popovers, terms), logo and illustration. It uses system fonts.
- **Added** `shows/demo/`: a 13-slide show exercising chapters, glossary, profiles, paths, fragments, auto-animate, backup slides, reader-only and reader-hidden slides, and every reader block type, plus two SVG images and an embedded demo page.
- **Added** `shows/fixtures/broken/`: a deliberately invalid show for tests and the viewer's error page.
- **Added** `.vscode/settings.json`, which associates the schemas with `show.json` / `template.json` for autocomplete.
- **Changed** the show format 0.1 spec: `$schema` and `settings.agenda` fields, `richtext` may contain paragraphs and lists, and validation is documented.
- **Changed** the template format 0.1 spec: the documented slide wrapper (`.slipr-slide` > `.slipr-canvas`), `cqw` sizing, and slot `label`/`help`.
- **Changed** the Node requirement to ≥ 22 (JSON module imports).
- **Fixed** `.gitignore`: the Python `build/`/`dist/` rules are now scoped to `converter/`, because they also ignored `vendor/*/dist/`.

### 2026-10-10: Converter in Python
- **Changed** decision D-006: the converter is written in Python with `python-pptx` instead of Node.js. It is now *Accepted*.
- **Changed** the docs to match: two toolchains (npm for the web side, venv/pip/pytest for the converter). The shared JSON Schema is the contract between them.
- **Added** Python entries to `.gitignore`.

### 2026-10-10: Repository setup
- **Added** git repository, `.gitignore`, and root `package.json` with `npm run serve` (static dev server on port 8080) and `npm test` (Node built-in test runner).
- **Changed** decisions D-001 to D-005 and D-007 to D-010 to *Accepted*. D-006 (converter language) is still *Proposed*.

### 2026-10-10: Two experiences, two layers
- **Changed** the design so that audience mode and reader mode are two very different experiences. Reader mode becomes an interactive, personalised app.
- **Changed** show format 0.1 (draft): added a reader layer per slide (`reader.summary`, `reader.blocks[]`, `reader.related`), show-level `chapters`, `glossary`, `profiles` and `paths`, slide `chapter`/`tags`, and audience options (`fragments`, `autoAnimate`) grouped under `slide.audience`. Added Markdown extensions `[[glossary]]`, `^[popup]` and `#slide` links.
- **Changed** template format 0.1: templates can ship `reader.css` for reader blocks and popovers.
- **Added** decisions D-009 (two-layer content model) and D-010 (reader data stays in the browser). D-008 is now: reader mode is its own app.
- **Changed** the roadmap: reader core and reader personalisation are separate phases, before the converter and editor.
- **Added** to the README that the name Slipr is short for *SlidePresenter*.

### 2026-10-10: Project outline
- **Added** the documentation skeleton: `README.md`, `OVERVIEW.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `ROADMAP.md`, `BACKLOG.md`, and the `docs/` specs and decision log.
- **Added** outline documentation for the three components: `viewer/`, `editor/`, `converter/`.
- **Added** draft show format `0.1` and template format `0.1` (specification only, not yet implemented).
