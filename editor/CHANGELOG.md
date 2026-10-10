# Changelog: Editor

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-10: New slides use a layout the template has (E-011)
- **Fixed** "+ Add" and `Ctrl+Enter` always creating a `bullets` slide, which is invalid in templates without that layout (Conclusion). New `layoutForNewSlide()` in `actions.js`: after a content slide the same layout; after a title or section slide (only text slots) the template's first plain content layout (text plus list or rich text, no image), so `bullets` for Default and `text` for Conclusion. `addSlide` takes `templateLayouts` for this.

### 2026-10-10: Open, save and new-from-template (E-002)
- **Added** Open… (pick a show folder), New… (title and template, then an empty folder: `show.json` with `"ref": "/templates/<id>"`, and `images/`), and Save / `Ctrl+S` (writes `show.json` through the File System Access API). Folder shows reopen as `editor/?folder=<key>` (D-012); after a reload the browser may ask for access again with one click.
- **Added** a start screen (open, new, recent shows, demo link) when the editor opens without a show, and banners for notices, errors and "Saved".
- **Added** `io/serialize.js` (schema key order, 2-space indent, like the converter), `io/new-show.js`, `io/fs-access.js`, `files.js`, `ui/dialogs.js`, `store.markSaved()` / `store.setFolderHandle()`, and tests (`editor/test/io.test.js`, store).
- **Added** saving a show that was opened by URL: the editor asks for its folder and checks the show id first.
- **Added** a warning before closing the tab with unsaved changes.
- **Fixed** the editor never loading the template's `reader.css` and ignoring `template.theme` (it read a non-existent `template.styles`). Its slide-list chips are now `slipr-item-badge`, because `slipr-badge` belongs to reader blocks and is styled by templates.

### 2026-10-10: Slide form writes valid slot values (E-010)
- **Fixed** the slide form corrupting non-text slots. An `image` slot has a path and an alt-text input and always writes `{ src, alt, … }` (keeping `fit` and `focus`); an empty path removes the slot. `quote`, `code`, `cards` and unknown slot types are read-only with a short summary instead of a text input showing `[object Object]`. A `list` stored as an array stays an array. Emptying a text field removes the slot instead of writing `""`.
- **Added** `editor/js/slot-values.js`: the DOM-free rules for which editor a slot gets and which value shape it writes, with tests (`editor/test/slot-values.test.js`).
- **Fixed** the store calling `validateShow(show, template)` instead of `validateShow(show, { template })`, so template checks (slot types, required slots, `maxLength`) never ran in the editor.
- **Fixed** the preview diagnostics: issue paths name slides by index (`slides[3]…`) but were matched by slide id, so slide warnings never showed, and errors were never shown at all. New `issuesForSlide()` in `store.js`; errors show in red.
- **Fixed** the editor not loading at all: `ui/preview.js` and `ui/slide-list.js` imported `shared/` and `viewer/` one directory level too shallow (404).

### 2026-10-10: Phase 5, Editor MVP Foundation (E-001)
- **Added** the pure actions module (`editor/js/actions.js`) with structural sharing and references cleanup (paths, related, block targets) for slides, reader blocks and show settings.
- **Added** the central store (`editor/js/store.js`) with one-way data flow, subscriptions, undo/redo history stacks, validation diagnostics, and typing coalescing.
- **Added** the 3-column editor shell (`editor/index.html`, `editor/css/editor.css`): slide list with thumbnails & reordering, inspector with tabs (Slide, Reader, Settings), and live preview with container-query responsive scaling.
- **Added** global keyboard shortcuts (`editor/js/shortcuts.js`): `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Enter`, `Ctrl+D`, `Alt+↑/↓`, `F5`.
- **Added** 24 unit tests in `editor/test/actions.test.js` and `editor/test/store.test.js` (164 tests total across the project).

### 2026-10-10: Reader layer
- **Changed** the planned design: a Reader tab with block editors (profile/depth per block), show settings (chapters, glossary, profiles, paths), and a preview in both modes with profile/depth simulation.

### 2026-10-10
- **Added** outline documentation: README (intended features), ARCHITECTURE (planned structure), CLAUDE.md.
