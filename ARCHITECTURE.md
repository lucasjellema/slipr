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
| `load.js` ✅ | `loadShow(url)` fetches show.json, template.json and every layout fragment, HEAD-checks images, and validates. Returns a `ShowContext` (`show`, `template`, `layouts`, `validation`, `resolveAsset()`, `resolveTemplateAsset()`). Fetch or JSON problems throw a readable `LoadError`; validation problems are returned. `fetch` is injectable for tests |
| `schema-check.js` ✅ | Minimal JSON Schema checker for exactly the keywords Slipr's schemas use, so the browser can validate against the shared schema files without a library. A test guards that the schemas use no unsupported keyword |
| `validate.js` ✅ | Validate a show: structure via the schema, then semantics (unique ids, references between slides/glossary/profiles/chapters, slot types and limits from the template, alt text, template version range). Returns `{ ok, errors, warnings }`, never throws |
| `render.js` ✅ | `renderSlide(slide, ctx, { mode })` returns `.slipr-slide > .slipr-canvas > layout`: clones the layout fragment, rewrites its relative URLs against the layout file, fills `[data-slot]` elements by slot type (a `cards` slot clones its `<template>` blueprint once per card and fills its `[data-field]` elements), and marks empty optional slots `data-empty`. Also `slideTitle()`. Needs a DOM (browser), so it has no Node tests yet |
| `blocks.js` ✅ | `renderBlocks()` / `renderBlock()` return **HTML strings** (from `escape()` + `markdown()` only, so they are safe for `innerHTML` and testable in Node). Renders reader blocks (`text`, `details`, `callout`, `tabs`, `image` + hotspots, `embed`, `slide-ref`) to HTML. Used by reader mode and the editor preview |
| `markdown.js` ✅ | `markdown()`, `markdownListItems()`, `markdownInline()`, `markdownToText()`, `escape()`. Markdown subset with Slipr extensions: `[[glossary]]` references, `^[inline popups]`, `#slide` links, letter lists (`A.`) and subheadings (an entirely bold paragraph). Takes a `mode` option: audience mode renders the extensions as plain text. Escapes all source text and allows only safe link schemes. It is the only sanctioned producer of HTML from show content |
| `migrate.js` | Upgrade older show-format versions to the current one *(once a version 2 exists)* |

The core is environment-agnostic where possible. `validate.js`, `markdown.js` (string in, string out) and `migrate.js` have no DOM or `fetch` dependency, so they can be unit-tested in Node. `validate.js` imports the schemas as JSON modules (`import … with { type: 'json' }`), which works in Node ≥ 22 and all current browsers. Tests live in `shared/test/*.test.js`.

The converter is written in **Python** (D-006) and does not import the JS core. Its contract with the rest of Slipr is the **JSON Schema** in `shared/schema/`, which it loads directly from the repository to validate its output.

## Templates

A template is a folder (`template.json`, `theme.css`, optional `reader.css`, `layouts/*.html`, `assets/`). Two ship with Slipr:

| Template | Format | Layouts | Notes |
|---|---|---|---|
| `templates/default/` | 0.1 | 5 | Neutral; the reference for the demo show and the tests |
| `templates/conclusion/` | 0.2 | 17 | Company house style (magenta), derived from the PowerPoint template; placeholder roles in `pptxMapping`; five card layouts. See its [README](templates/conclusion/README.md) |

The viewer and the editor never know which template is in use: everything goes through the layout fragments and `render.js`. The converter uses a template's `pptxMapping` and slot types.

## Formats and versioning

- `show.json` carries `"slipr": "<format version>"` (currently 0.1). `template.json` carries its own `"version"` and a `"slipr"` format version (0.1 or 0.2).
- A format change bumps the version in the spec document, the JSON Schema, and the root [CHANGELOG.md](CHANGELOG.md). Where needed it adds a migration step in `migrate.js`.

## Runtime and hosting

- Development: any static file server from the repo root, for example `npx http-server .` or `python -m http.server`. Pages use `fetch()`, so `file://` will not work.
- Presenting: the same static server on the laptop. Later this could be a packaged offline single-file export (see backlog).
- Publishing for readers: copy `viewer/`, `shared/`, `vendor/`, the template and the show folder to any static host.

## Testing strategy

- `shared/` (and pure viewer/editor modules): unit tests with the Node built-in test runner (`npm test`), with fixture shows.
- `converter/`: `pytest`, with fixture decks mostly generated in code by python-pptx.
- `viewer/` and `editor/`: a manual smoke-test checklist in each component's `CLAUDE.md` at first. Playwright end-to-end tests can come later (backlog).
