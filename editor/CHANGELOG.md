# Changelog: Editor

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

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
