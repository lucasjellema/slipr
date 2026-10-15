# Slipr: system architecture

This document describes how the Slipr components relate to each other and to the shared formats. Each component's internals are covered in its own `ARCHITECTURE.md`.

## Big picture

```
                    ┌──────────────┐
   deck.pptx ─────► │  converter   │ ─────┐
                    └──────────────┘      │ writes
                                          ▼
                              ┌─────────────────────────┐
                              │  show folder            │
                              │   show.json             │──── links to ────┐
                              │   images/               │                  │
                              └─────────────────────────┘                  ▼
                                  ▲               │              ┌───────────────────┐
                    reads/writes  │               │ reads        │ template folder   │
                                  │               ▼              │  template.json    │
                            ┌──────────┐    ┌──────────┐         │  theme.css        │
                            │  editor  │    │  viewer  │         │  layouts/*.html   │
                            └──────────┘    └──────────┘         │  assets/          │
                                  │               │              └───────────────────┘
                                  └──────┬────────┘
                                         ▼
                              ┌─────────────────────────┐
                              │ shared/ core            │
                              │  load · validate ·      │
                              │  render slide → HTML    │
                              └─────────────────────────┘
```

## Design principles

0. **One source, two depths.** A show serves two very different experiences: a linear, high-level *audience* presentation and a deep, interactive, personalised *reader* experience. Each slide carries a concise audience layer (`content`) and an optional detailed reader layer (`reader.blocks`). The two modes are separate applications that share data and rendering, not UI.
1. **Data first.** The show is plain JSON plus image files. Every component reads or writes that format, and it is specified in [docs/show-format.md](docs/show-format.md) and enforced with a JSON Schema.
2. **One renderer per content kind.** `shared/render.js` turns *(slide, template)* into the slide visual, and `shared/blocks.js` turns reader blocks into HTML. The viewer and the editor's live preview both use them, so what you edit is what is shown.
3. **The template owns the looks, the show owns the content.** Slides never contain styling. They name a layout and fill its slots, so swapping the template restyles the whole show.
4. **No build step.** Plain ES modules, served as static files. Open the page and it runs. Third-party code is checked into `vendor/`.
5. **Works offline.** Presenting must not depend on venue Wi-Fi. There are no runtime CDN calls, and fonts and libraries are local.
6. **Personal software.** Optimised for one author on a modern Chromium browser (Edge or Chrome). We accept that constraint where it keeps things simple, for example by using the File System Access API in the editor. Readers may use any modern browser.
7. **Reader data is private.** Prefs, progress, bookmarks and annotations live in the reader's own browser. There is no backend and no tracking (D-010).

## Shared core (`shared/`)

| Module | Responsibility |
|---|---|
| `schema/show.schema.json` | JSON Schema for `show.json` |
| `schema/template.schema.json` | JSON Schema for `template.json` |
| `load.js` ✅ | `loadShow(url)` fetches show.json, template.json and every layout fragment, HEAD-checks images, and validates. Returns a `ShowContext` (`show`, `template`, `layouts`, `validation`, `resolveAsset()`, `resolveTemplateAsset()`). Fetch or JSON problems throw a readable `LoadError`; validation problems are returned. `fetch` is injectable for tests. `loadShowFromFolder(source)` does the same for a show folder opened with the File System Access API (D-012): images become `blob:` URLs, a template ref that leaves the folder resolves by name against Slipr's `templates/` (`resolveFolderTemplate()`), and `ctx.notices` says so. `loadShowFromZip(source)` loads a presentation from an in-memory zip source (I-087) |
| `zip.js` ✅ | Read and write zip archives in memory using Web Streams (`DecompressionStream('deflate-raw')` and `CompressionStream('deflate-raw')`, I-087, I-092). `readZip()` decompresses; `writeZip()` creates archives with pure JS CRC-32 and UTF-8 filenames; `downloadZip()` fetches with live progress callbacks; `createZipSource()` auto-detects `show.json` (root, nested, or GitHub archive single-directory wrappers), provides optional `&path=` resolution, and creates a `FolderSource`-compatible source turning assets into `blob:` URLs |
| `csv.js` ✅ | A small CSV reader and writer (I-104): RFC 4180 quoting, comma / semicolon / tab detected from the first line, a byte-order mark ignored. DOM-free; used by table embeds and the editor |
| `folder-source.js` ✅ | Read-only access to a show folder through a directory handle: `readFile()` / `readText()` relative to `show.json`, never outside the folder (`normalizePath()`). DOM-free; tested with a fake handle |
| `folder-handles.js` ✅ | IndexedDB registry of folder handles under short keys, for `editor/?folder=<key>` (and `viewer/?folder=<key>`, E-007) and the recent-shows list. Browser only |
| `schema-check.js` ✅ | Minimal JSON Schema checker for exactly the keywords Slipr's schemas use, so the browser can validate against the shared schema files without a library. A test guards that the schemas use no unsupported keyword |
| `validate.js` ✅ | Validate a show: structure via the schema, then semantics (unique ids, references between slides/glossary/profiles/chapters, slot types and limits from the template, alt text, template version range). Returns `{ ok, errors, warnings }`, never throws |
| `render.js` ✅ | `renderSlide(slide, ctx, { mode })` returns `.slipr-slide > .slipr-canvas > layout`: clones the layout fragment, rewrites its relative URLs against the layout file, fills `[data-slot]` elements by slot type (embed slots such as `diagram` through `embeds/`; a `cards` slot clones its `<template>` blueprint once per card and fills its `[data-field]` elements), and marks empty optional slots `data-empty`. Extra images (`slide.overlays`, D-013) go in a `.slipr-overlays` layer appended to the canvas, positioned inline; a reader-mode slide with them gets `slipr-mode-reader-fixed` so it does not reflow. Also `slideTitle()`. Needs a DOM (browser), so it has no Node tests yet |
| `blocks.js` ✅ | `renderBlocks()` / `renderBlock()` return **HTML strings** (from `escape()` + `markdown()` only, so they are safe for `innerHTML` and testable in Node). Renders reader blocks (`text`, `details`, `callout`, `tabs`, `image` + hotspots, `embed`, `slide-ref`, `diagram`, `pdf`, `graph`, `map`) to HTML; embed blocks go through `embeds/`. Used by reader mode and the editor preview |
| `embeds/` ✅ | Rich embeds (I-070, D-011). `index.js` is the registry: `embedHtml()` / `fillEmbedElement()` write an embed element with a **static fallback** (the value's `fallback` image, or the kind's own) for `blocks.js` and `render.js`; `hydrateEmbeds(root)` renders the live content afterwards, lazy-loading a kind's vendored library only when it is used, and adds `embeds.css` (link card, Load button, error box; `--slipr-*` tokens) once. Content from another server waits for a **Load** click unless the author set `load: "auto"`; consent per site per tab lives in `consent.js` (sessionStorage). One module per kind: `diagram.js` (Mermaid, I-073: strict security, neutral theme with the template's body font, SVG cache) and `web.js` (I-071: sandboxed iframe for the `web` slot and the `embed` block, with the author's `allow` extras, aspect ratio or height, an "Open in new tab" link, and in audience mode live or `present: "static"`; link-card fallback), `graph.js` (I-074: vendored Cytoscape.js; a node list as static content, the drawing with template tokens and tag colors, audience steps on hidden Reveal fragments, reader toolbar, node panel and tag filter; data files are listed by `collectImagePaths()`), `map.js` (I-075: vendored Leaflet and its stylesheet; a place list as static content, Slipr's own pins and GeoJSON layers in the template's graph palette, tiles from OpenStreetMap / another server / the show folder / none (show-folder tiles of folder and zip shows are read through the context's `readAsset`, passed by `hydrateEmbeds(root, { readAsset })`; the single-file export packs them with `listFiles`, I-099), click-to-load for server tiles in reader mode, audience steps that fly from place to place on hidden Reveal fragments, reader toolbar, place panel and tag filter; layer files are listed by `collectImagePaths()`) `tag-cloud.js` (I-105: no library; terms sized and coloured by weight from `--slipr-tag-cloud-*` tokens, in centred lines; glossary links by name; audience steps reveal the heaviest terms or highlight some; in reader mode each term is a button that `viewer/reader/interactions.js` opens a popup for, with the definition and the slides that mention it, found by `slidesMentioning()` in `search-index.js`), `table.js` (I-104: no library; the table itself as static content, then sorting, filter, totals, colour scales and bars from `--slipr-table-*` tokens, audience steps on hidden Reveal fragments in a running presentation only, reader Columns / Copy / Download CSV; CSV files are read with `shared/csv.js` and listed by `collectImagePaths()`), `video.js` (I-110: no library; the browser's `<video>` for files with a captions track, YouTube (youtube-nocookie.com) and Vimeo (`dnt=1`) frames driven by their postMessage commands; the poster or a card as static content; audience slots pause off their slide, play on arrival or on a hidden Reveal fragment and can step through chapters; reader blocks list chapters and a transcript, reader slots get a chapter menu and a Transcript dialog; `slipr:video-seek` plays from a time (reader search); video and captions files are listed by `collectImagePaths()`, and the single-file export embeds video files up to 25 MB) and `pdf.js` (I-072: vendored PDF.js, lazy-loaded with its worker, or on the page in a single-file export; a page fitted to a slot with one Reveal fragment per further page, or a reader view with page bar, zoom and screen-reader text; `extractPdfText()` for reader search). Local PDFs are listed by `collectImagePaths()`, so they are checked, embedded in exports and opened from folders like images. `usedEmbedKinds()` tells the single-file export which libraries to leave out. Markup functions are DOM-free and tested; hydration needs a browser and runs in audience mode, reader mode, the editor preview and (`thumbnail: true`) the show grid. Spec: `docs/specs/I-070-embed-foundation.md` |
| `glossary.js` ✅ | Glossary terms in slide text (I-086, D-015): `glossaryPhrases()` / `findTerms()` match terms and aliases (DOM-free, tested), `linkGlossaryTerms()` wraps the first occurrence per slide in a `.slipr-term` button. Called by `render.js` in reader mode |
| `picture.js` ✅ | Picture style class (`slipr-picture-<id>`), opacity (D-014), crop (I-090: `object-view-box` and `data-crop`) and morph name (I-091: `data-morph-id`, used by `viewer/audience/morph.js`) of an image value, as element changes (`applyPictureStyle`) or HTML attributes (`pictureAttributes`). DOM-free; used by `render.js` and `blocks.js` |
| `crop.js` ✅ | Image cropping (I-090): `normalCrop()`, `cropInset()`, `toShown()` / `toPicture()` (hotspots on cropped pictures), DOM-free and tested; `applyCropFallback(root)` draws cropped pictures on a canvas where the browser lacks `object-view-box` (called by `render.js` and `embeds/index.js`) |
| `text-style.js` ✅ | The look of a text element on a slide (D-016, I-089): `textStyleDeclarations()` turns its `style` into checked CSS declarations (fonts and sizes through the template's `--slipr-*` variables), `cleanTextStyle()` normalises a style for storage. DOM-free; used by `render.js` and the editor |
| `markdown.js` ✅ | `markdown()`, `markdownListItems()`, `markdownInline()`, `markdownToText()`, `escape()`. Markdown subset with Slipr extensions: `[[glossary]]` references, `^[inline popups]`, `#slide` links, letter lists (`A.`) and subheadings (an entirely bold paragraph). Takes a `mode` option: audience mode renders the extensions as plain text. Escapes all source text and allows only safe link schemes. It is the only sanctioned producer of HTML from show content |
| `export/single-file.js` ✅ | Single-file HTML export (I-054): packs a show, its template and the viewer into one HTML file that presents offline. ES modules go into an import map as `data:` URLs (relative imports and `import.meta.url` rewritten to virtual `https://slipr.invalid/…` addresses); other files go into an embedded table served by a small runtime (`SLIPR_BUNDLE.fetch` for `loadShow`, `SLIPR_BUNDLE.url` for images and stylesheets). DOM-free: file access through a `readFile` function, so the Node command `tools/export-show.js` (`npm run export`) and the editor's **Export…** (`editor/js/export.js`, I-085) share it. Spec: `docs/specs/I-054-single-file-export.md` |
| `prompt-kit.js` ✅ | AI prompt kit (I-080): `buildPrompt(template, { variant })` writes the instruction for an AI chatbot from `template.json` (layouts, slots, limits) and `show.schema.json` (enums), `fillBrief()` fills its *Your content* section, `fixUpPrompt()` turns validation issues into a follow-up message, `exampleShow()` builds the worked example. DOM-free and tested; `tools/prompt-kit.js` (`npm run prompt`) writes the results to `docs/ai/prompts/`, which `viewer/create-with-ai.html` fetches |
| `migrate.js` | Upgrade older show-format versions to the current one *(once a version 2 exists)* |

The core is environment-agnostic where possible. `validate.js`, `markdown.js` (string in, string out) and `migrate.js` have no DOM or `fetch` dependency, so they can be unit-tested in Node. `validate.js` imports the schemas as JSON modules (`import … with { type: 'json' }`), which works in Node ≥ 22 and all current browsers. Tests live in `shared/test/*.test.js`.

The converter is written in **Python** (D-006) and does not import the JS core. It also exports shows back to PowerPoint (`slipr-export`, D-018), reading the template's `pptxMapping` backwards. Its contract with the rest of Slipr is the **JSON Schema** in `shared/schema/`, which it loads directly from the repository to validate its output.

## Templates

A template is a folder (`template.json`, `theme.css`, optional `reader.css`, `layouts/*.html`, `assets/`). Two ship with Slipr:

| Template | Format | Layouts | Notes |
|---|---|---|---|
| `templates/default/` | 0.3 | 8 | Neutral; the reference for the demo show and the tests. Picture styles shadow, soft, rounded, frame |
| `templates/forest/` | 0.3 | 12 | Default's layouts with a forest atmosphere: greens on parchment, ochre accents, pine illustrations on title and section slides, Palatino and Georgia (installed fonts, no files). See its [README](templates/forest/README.md) |
| `templates/conclusion/` | 0.3 | 19 | Company house style (magenta), derived from the PowerPoint template; placeholder roles in `pptxMapping`; five card layouts; on-brand picture styles. See its [README](templates/conclusion/README.md) |

The **template editor** (`template-editor/`, I-106, D-017) makes new templates from existing ones: it changes only the values of the custom properties in a template's top-level `:root` rules (and adds `@font-face` rules for uploaded fonts), previews the result with the shared renderer in an iframe, and writes the folder or a `.zip`. See [template-editor/ARCHITECTURE.md](template-editor/ARCHITECTURE.md).

The viewer and the editor never know which template is in use: everything goes through the layout fragments and `render.js`. The converter uses a template's `pptxMapping` and slot types.

## Formats and versioning

- `show.json` carries `"slipr": "<format version>"` (currently 0.1). `template.json` carries its own `"version"` and a `"slipr"` format version (0.1 or 0.2).
- A format change bumps the version in the spec document, the JSON Schema, and the root [CHANGELOG.md](CHANGELOG.md). Where needed it adds a migration step in `migrate.js`.

## Runtime and hosting

- Development: any static file server from the repo root, for example `npx http-server .` or `python -m http.server`. Pages use `fetch()`, so `file://` will not work.
- Presenting: the same static server on the laptop. Later this could be a packaged offline single-file export (see backlog).
- Browser storage (no server, D-010): the editor keeps draft autosaves (`slipr-drafts`, I-020), remembered folders (`folder-handles.js`) and the **slide library** (`slipr-library`, I-029: entries, collections and content-addressed files; `editor/js/library/`) in IndexedDB; the viewer keeps reader data (`slipr-reader`, D-010).
- Publishing for readers: copy `viewer/`, `shared/`, `vendor/`, the template and the show folder to any static host. Or export the show as **one HTML file** (`npm run export`, or **Export…** in the editor; I-054) and share or host just that file: it presents offline.

## Testing strategy

- `shared/` (and pure viewer/editor modules): unit tests with the Node built-in test runner (`npm test`), with fixture shows.
- `converter/`: `pytest`, with fixture decks mostly generated in code by python-pptx.
- `viewer/` and `editor/`: a manual smoke-test checklist in each component's `CLAUDE.md` at first. Playwright end-to-end tests can come later (backlog).
