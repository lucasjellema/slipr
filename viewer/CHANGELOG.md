# Changelog: Viewer

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-10: Audience mode (Phase 1)
- **Added** `index.html`, `js/main.js` (URL parameters, load, validate, dynamic mode import) and `js/dom.js` (`h()` element builder, `addStylesheet()`).
- **Added** `js/error-view.js`: a help page (no `show` parameter), a load-error page (not found, invalid JSON, server unreachable), and a validation-error page listing every issue with its path.
- **Added** `audience/audience.js`: audience mode on Reveal.js 6. Slides come from `shared/render.js`, with `#/slide-id` deep links, fragments (with styles), auto-animate via `data-id` on slots, transitions, backgrounds, speaker notes, and backup slides moved to the end as uncounted. Uses the Notes, Zoom and Search plugins.
- **Added** `audience/agenda.js`: agenda slides generated from chapters (`settings.agenda`) and a segmented chapter progress bar.
- **Added** `audience/audience.css` for Reveal integration (full-bleed slides, slide number bottom-left, backup outline in the overview).
- `?mode=reader` shows a placeholder until Phase 2.

### 2026-10-10: Redesign
- **Changed** the viewer to two separate mode apps: a thin Reveal.js audience mode, and an interactive reader app (popovers, panels, tabs, hotspots, profiles, depth, paths, progress, search, annotations).

### 2026-10-10
- **Added** outline documentation: README (intended features), ARCHITECTURE (planned structure), CLAUDE.md.
