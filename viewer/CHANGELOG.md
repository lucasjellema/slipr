# Changelog: Viewer

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-15: Videos (I-110)
- **Added** videos on slides and in the reader layer (`shared/embeds/video.js`): files from the show folder (offline, with captions), YouTube (youtube-nocookie.com) and Vimeo (no tracking), and https video files. In audience mode a video pauses when you leave its slide, and can start on a click, when the slide appears, or on a step; with chapter steps each click jumps to the next chapter, ← jumps back. In reader mode videos from other servers wait behind **Load**; a block lists its chapters (a click jumps there, the playing chapter is marked) and a collapsible transcript, a slot gets a chapter menu and a Transcript dialog. Search finds chapter titles and transcripts; a chapter result plays the video from there.

### 2026-10-15: Create a show with AI (I-080)
- **Added** `create-with-ai.html` (`js/create-with-ai.js`), linked from the start page and the manual: pick a template and a length (full or compact), describe the show (topic, audience, number of slides, reader layer, profiles, language, source material), then **Copy instruction** or **Download .md** for an AI chatbot. The page fetches the generated prompts from `docs/ai/prompts/` and sends nothing anywhere.
- **Added** **Copy fix-up prompt** on the "This show can't be shown yet" page: the errors and warnings (without missing images) as a message asking the chatbot for a corrected `show.json`.
- **Added** `copyText()` in `js/dom.js` (Clipboard API with a fallback), and the manual section *Create a show with AI* (`help.html#ai`).

### 2026-10-15: Tag clouds (I-105)
- **Added** tag clouds on slides and in the reader layer (`shared/embeds/tag-cloud.js`): terms sized and coloured by weight from the template. In audience mode the heaviest terms can appear first and terms can be highlighted, click by click. In reader mode every term is a button (tap and keyboard too): its popup shows the glossary definition when the term is a glossary term, the weight when the author said what it counts, and links to the other slides that mention the term (`slidesMentioning()` in `reader/search-index.js`, used by `reader/interactions.js`). Search finds typed-in terms. The terms wrap between words on narrow screens instead of being cut off.

### 2026-10-14: Data tables (I-104)
- **Added** tables on slides and in the reader layer (`shared/embeds/table.js`): sorting and a filter box (in both modes when the author allows them), totals, colours from the template, a header that stays in place and a first column that can. In audience mode rows appear and rows, columns or cells are highlighted click by click, and the table starts from the author's sort and filter each time the slide is shown. Reader mode adds a **Columns** menu, **Copy** and **Download CSV**; search finds headers and typed-in cells. The manual (`help.html`) has a *Tables* part.

### 2026-10-14: Local map tiles in folder and zip shows (I-099)
- **Fixed** maps with tiles in the show folder showed no background in shows opened with `?folder=` or `?zip=`; audience and reader mode now read the tiles from the folder or zip.

### 2026-10-14: Map fixes (I-075)
- **Fixed** the **Place…** list of a map leaves out places hidden by the tag filter.
- **Added** background layers (a GeoJSON layer without a tag) draw in neutral colors under the rest; the first view fits the places, not the background.

### 2026-10-13: Maps (I-075)
- **Added** map slides and blocks. Audience mode tours a map from place to place, click by click. Reader mode: drag to pan, + / −, Fit, click a pin or pick it from the Place… list to see its text and slide, filter by tag; the background map from OpenStreetMap waits for **Load**, like an embedded page. Reader search finds place titles and text.

### 2026-10-13: Grid overview (I-098)
- **Changed** `Esc` / `O` in audience mode open `audience/grid-overview.js` instead of Reveal's overview (`overview: false`): a grid of thumbnails that wraps to the window (2–8 columns), grouped by chapter with backup slides last. The row under the mouse, or with the keyboard focus, grows to the full width (1.25 ×) while the others make room. Click, tap or `Enter` goes to the slide at its start; arrow keys, `Home` and `End` move; `Esc` or `O` returns. Thumbnails are copies of the presented slides with every step shown and embeds as their static fallback, made as they scroll into view. Esc still closes Reveal's help first; presenter tools turn off.

### 2026-10-13: Laser pointer, spotlight and pen (I-003)
- **Added** `audience/presenter-tools.js`: `L` laser pointer, `K` spotlight (the slide dims around the pointer), `D` pen (mouse, pen or touch; strokes in fractions of the slide, kept per slide until a reload, in the template's accent color; `X` erases the slide's drawing). One tool at a time; `Esc` turns it off before Reveal's overview. The overview and pause turn tools off. Listed in Reveal's `?` help and the viewer manual. `L` and `K` replace Reveal's vim-style navigation keys.

### 2026-10-13: Morph transitions for pictures (I-091)
- **Added** `audience/morph.js`: Reveal's `autoAnimateMatcher` for Slipr. Pictures pair by `morphId`, then by file (also when cropped by the canvas fallback), then by slot, and morph by width and height (no distorting scale) together with their crop, focus, opacity and corner radius, measured on screen so a picture can move between a slot and an extra image. Other pairs stay Reveal's. With `prefers-reduced-motion`, auto-animate is off.

### 2026-10-13: Import local zip archives (.zip / .slipr)
- **Added** **Open zip archive…** button and drag-and-drop zone on viewer start page: import presentations directly from disk in any browser (Chrome, Edge, Firefox, Safari) without server uploads or installations.
- **Added** `viewer/?archive=<key>` parameter backed by IndexedDB (`slipr-archives`) via `shared/archive-handles.js`. Enables seamless mode switching (<kbd>A</kbd> / <kbd>R</kbd>) between Audience and Reader mode, page reloads, and deep links for local presentations.
- **Added** multi-show archive detection: when an uploaded zip contains multiple presentations, a selection view prompts the user to choose which show to view.
- **Added** recent archives list on the viewer start page for quick access to previously opened local presentations.

### 2026-10-13: Present from a zip URL (I-087)

- **Added** `?zip=<url>` parameter: downloads a zipped Slipr presentation via `fetch()` with live progress bar, decompresses client-side in memory with standard Web Streams `DecompressionStream('deflate-raw')` without external dependencies or backend, and presents in audience or reader mode.
- **Added** GitHub compatibility: archives with single top-level directory wrappers (e.g. `repo-main/show.json`) are auto-detected; optional `&path=` allows selecting a specific show in repositories with multiple presentations.
- **Added** clear diagnostic feedback for CORS restrictions, missing files, and 404s.

### 2026-10-13: Cropped pictures (I-090)
- **Added** pictures show their crop in both modes (with a canvas fallback in browsers without `object-view-box`); hotspots stay on their spot of a cropped picture.

### 2026-10-13: Graphs (I-074)
- **Added** graph slides and blocks. Audience mode builds a graph up step by step (reveal nodes, or zoom in on one). Reader mode: drag to pan, + / − / Fit, click a node or pick it from the list to see its text, neighbours and slide, filter by tag. Reader search finds node labels and text.

### 2026-10-13: Text elements on slides (I-089)
- **Added** text elements on slides in both modes (drawn by `shared/render.js`), appearing one by one in audience mode like extra images. Reader search finds their text, and glossary terms in them open their definition.

### 2026-10-12: PDF documents (I-072)
- **Added** PDF slides (one page, or a range stepped through by clicks) and PDF blocks in reader mode (previous / next within the range, zoom, "Open PDF ↗", the page's text for screen readers). Reader search finds text in the PDFs on first use ("Reading the PDFs in this show…") and opens a result at its page (`pdfSearchDocs()`, `prepare` in `search.js`).
- **Changed** audience mode shows the deck at once and renders embeds in the background.

### 2026-10-12: Web pages (I-071)
- **Added** web page slides: in audience mode the page is live and clickable (or the author's screenshot); in reader mode a page from another site waits for **Load**. Every loaded page keeps an "Open in new tab" link. Embedded pages in reader mode can scale with an aspect ratio, and may get extra permissions (full screen, dialogs, …) when the author allows them.

### 2026-10-12: Rich embeds foundation (I-070)
- **Changed** audience and reader mode call `hydrateEmbeds()` (was `renderDiagrams()`). In reader mode, an embedded page from another site shows a link card and a **Load** button until the reader clicks it (unless the author chose `load: "auto"`); once loaded, other embeds from that site load directly until the tab closes. Diagrams and embeds can show the author's fallback image in print and when they fail.
- **Removed** the diagram error styles from `reader/reader.css`: they are now shared (`shared/embeds/embeds.css`).

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
