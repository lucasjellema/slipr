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
| `load.js` | Fetch and parse a show and its template, and resolve relative paths (images, template ref) |
| `validate.js` | Validate a show against the schema and against its template (unknown layout? missing required slot?). Returns errors and warnings, never throws |
| `render.js` | Render one slide visual to an HTML element: clone the layout fragment, fill `data-slot` elements, apply mode-specific classes |
| `blocks.js` | Render reader blocks (`text`, `details`, `callout`, `tabs`, `image` + hotspots, `embed`, `slide-ref`) to HTML. Used by reader mode and the editor preview |
| `markdown.js` | Markdown subset with Slipr extensions: `[[glossary]]` references, `^[inline popups]`, `#slide` links. Takes a `mode` option: audience mode renders the extensions as plain text |
| `migrate.js` | Upgrade older show-format versions to the current one *(once a version 2 exists)* |

The core is environment-agnostic where possible. `validate.js`, `markdown.js` (string in, string out) and `migrate.js` have no DOM or `fetch` dependency, so the Node-based converter and the tests can import them.

## Formats and versioning

- `show.json` carries `"slipr": "<format version>"`. `template.json` carries its own `"version"` and a `"slipr"` format version.
- A format change bumps the version in the spec document, the JSON Schema, and the root [CHANGELOG.md](CHANGELOG.md). Where needed it adds a migration step in `migrate.js`.

## Runtime and hosting

- Development: any static file server from the repo root, for example `npx http-server .` or `python -m http.server`. Pages use `fetch()`, so `file://` will not work.
- Presenting: the same static server on the laptop. Later this could be a packaged offline single-file export (see backlog).
- Publishing for readers: copy `viewer/`, `shared/`, `vendor/`, the template and the show folder to any static host.

## Testing strategy

- `shared/` and `converter/`: unit tests with the Node built-in test runner (`node --test`), with fixture shows and fixture `.pptx` files.
- `viewer/` and `editor/`: a manual smoke-test checklist in each component's `CLAUDE.md` at first. Playwright end-to-end tests can come later (backlog).
