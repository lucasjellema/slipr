# Changelog: Slipr (project level)

This file records cross-cutting changes: show and template format versions, the shared core, repository structure, and shared tooling. Component-specific changes go in the component's own `CHANGELOG.md`.

Format: newest first. Each entry has a date and a short description, grouped as **Added / Changed / Fixed / Removed** where useful.

## [Unreleased]

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
