# Changelog: Viewer

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-12: Glossary terms in slides (I-086)
- **Added** in reader mode, glossary terms (and their aliases) on a slide open their definition on hover, tap or Enter, like terms in reader text; the first occurrence per slide is linked (by `shared/render.js`). Pin mode keeps priority. Audience mode is unchanged.
- **Added** reader search finds a glossary term by its other names.

### 2026-10-11: Picture styles (I-084)
- **Changed** an extra image's fragment class now goes on its box (`div.slipr-overlay`), not the `<img>`: the picture carries its style and opacity, and an inline opacity would otherwise show the image before its click. Picture styles themselves are rendered by `shared/` and styled by the template.

### 2026-10-11: Extra images on a slide (I-083)
- **Added** in audience mode, extra images with `fragment` get Reveal's `fragment` class (and the effect), so they appear one by one after the slide's own fragments. Rendering itself is in `shared/render.js`.
- **Changed** in reader mode, a slide with extra images keeps its picture layout on narrow screens (mode class `slipr-mode-reader-fixed`): the templates' reflow rules do not apply to it.

### 2026-10-11: Runs from a single-file export (I-054)
- **Added** a bundle mode: when the page is a single-file export (`globalThis.SLIPR_BUNDLE`), `js/main.js` loads the bundled show through the bundle's `fetch`, and show and template assets resolve to object URLs.
- **Changed** `addStylesheet` (`js/dom.js`) to map a virtual bundle URL to its object URL, and `audience/audience.js` to name Reveal's `reset.css` and `reveal.css` directly (so the exporter finds them).

### 2026-10-11: Mermaid diagrams (I-073)
- **Added** `shared/diagram.js`: client-side Mermaid rendering with lazy-loaded vendored Mermaid 11.4.1 (D-002), `securityLevel: 'strict'`, template font/theme variables, and SVG caching per diagram source text.
- **Added** audience layout `diagram` (`templates/default/layouts/diagram.html`) and responsive styling for `.slipr-diagram`, `.slipr-figure--diagram`, and `.slipr-block--diagram` in default and conclusion themes.
- **Added** support for `diagram` slot type (`{ "mermaid": "...", "caption": "..." }`) and reader block type (`diagram`).
- **Added** diagram text indexing in `viewer/reader/search-index.js` and global search & replace support in `editor/js/actions.js`.
- **Added** demo slide `s-pipeline` in `shows/demo/show.json` demonstrating flowchart audience slide and sequence diagram reader block.

### 2026-10-10: Shows from a folder (E-007, D-012)
- **Added** `?folder=<key>`: the viewer opens a show folder remembered in this browser (by the editor, or by the new **Open a show folder…** on the help page). Images become `blob:` URLs; `R` / `A` keep the parameter. When the browser has dropped read access, an access page asks for it with one click; an unknown key explains that folder links work only in the browser where the folder was opened.

### 2026-10-10: Cards slots (I-043b)
- **Changed** `audience/audience.js`: on slides with fragments, each card is one fragment (bullets inside a card are not split further).
- **Changed** `reader/search-index.js`: the text fields and image alt text of cards are searchable.
- **Changed** `reader/annotations.js` and `reader/pin.js`: cards are pin targets ("Card 2: “…”"), like bullets in a list slot.

### 2026-10-10: Template-styled agenda and footer
- **Changed** `audience/agenda.js`: when the template has an `agenda` layout with a list slot, generated agenda slides are rendered with that layout. The chapter items get `slipr-agenda-item is-done|is-current|is-next`.
- **Changed** `audience/audience.css`: slide-number position, colour and size, and chapter-bar visibility, are now tokens a template can set (`--slipr-slide-number-*`, `--slipr-chapter-bar-visibility`, `--slipr-controls-color`).

### 2026-10-10: Annotate slides and objects on slides
- **Added** notes about a whole slide (✎ Note), shown as a "✎ n notes" chip on the slide.
- **Added** pins (📍 Pin): click anywhere on a slide visual, or choose an object from a keyboard-accessible list, to attach a numbered pin to that object (a bullet, the image, the title…). Pins follow their object when the slide reflows and fall back to their spot on the canvas if the object disappears. Pure geometry in `reader/pin.js`.
- **Added** text highlights inside the slide visual (title, bullets, columns), anchored to the slot.
- **Changed** the annotation model to three kinds (`text`, `slide`, `pin`). Existing highlights remain valid. Export, import and the My notes panel handle all kinds.

### 2026-10-10: Reader personalisation (Phase 3)
- **Added** `reader/state.js`: per-show reader state (prefs, presenter-notes toggle, welcome done, position, visited, bookmarks, annotations) in IndexedDB, falling back to localStorage and then memory. A debounced pure store, `migrate()` for robustness, flush when the page is hidden.
- **Added** `reader/tailor.js`: the first-visit welcome dialog (profile, depth, route), and a ⚙ Tailor panel in the top bar whose changes apply immediately and keep the position. URL parameters override stored prefs until changed in the UI.
- **Added** progress: visit tracking (3 s substantially in view), contents marks, "n of m read", and a "Welcome back. Continue with …" message.
- **Added** bookmarks: ★ per slide and `M`, listed at the top of the contents.
- **Added** search (`reader/search-index.js` + `reader/search.js`): `/` opens a dialog that searches as you type over slides, blocks, glossary and presenter notes. Accent-insensitive word-prefix matching, marked snippets, keyboard navigation, matches highlighted on the page, and a count of matches hidden by the tailoring.
- **Added** annotations (`reader/quote.js`, `reader/annotations.js`, `reader/notes-export.js`): highlight or note on selected text, drawn with the CSS Custom Highlight API and re-anchored by text quote. A "My notes" panel (`N`) groups notes, keeps "hidden by tailoring" and "text no longer found" notes separate, and offers Markdown/JSON export and JSON import with merging.
- **Added** keys `/`, `D`, `M`, `N`.
- **Fixed** the contents list now reads bookmarks and visits live, instead of from a snapshot taken at build time.

### 2026-10-10: Reader core (Phase 2)
- **Added** reader mode (`reader/reader.js`, `reader/reader.css`): a top bar with "Present ▶", a chapter contents list (a drawer below 900 px), and the article (hero, chapter sections, slide visuals that reflow on narrow screens, summaries, reader blocks, a collapsed "What the presenter said" panel, "See also" links). No third-party code.
- **Added** `reader/personalize.js`: profile, depth and path filtering, chapter grouping and nearest-visible-slide fallback. URL parameters `profile`, `depth` and `path` work now. 16 tests in `viewer/test/`.
- **Added** `reader/nav.js`: contents list and scroll-spy (current entry highlighted, hash kept in sync with `replaceState`).
- **Added** `reader/interactions.js`: one shared popover for glossary terms, footnotes and image hotspots (hover with a delay, tap/Enter toggles, Esc closes, positioned by JS), and ARIA tabs with arrow keys.
- **Added** deep links `#slide` and `#slide/block`, with fallback (and hash correction) for slides that are not visible.
- **Added** mode switching that keeps the position: `R` in audience mode, and `A` / "Present ▶" in reader mode (`js/mode-switch.js`).
- **Changed** `main.js`: reader mode replaces the placeholder and loads the template's `reader.css`.

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
