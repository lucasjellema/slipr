# Changelog: Slipr (project level)

This file records cross-cutting changes: show and template format versions, the shared core, repository structure, and shared tooling. Component-specific changes go in the component's own `CHANGELOG.md`.

Format: newest first. Each entry has a date and a short description, grouped as **Added / Changed / Fixed / Removed** where useful.

## [Unreleased]

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
