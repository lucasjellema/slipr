# Backlog

This is the shared work list for **Lucas** and **Claude**: features, chores and bugs.

## How to use this file

- **Item format**: `- [ ] **ID** [component] Title: one-line description. · status · owner`
  - IDs by component: `S-` shared core · `V-` viewer · `E-` editor · `P-` PPTX converter · `T-` templates & samples · `C-` chores/tooling · `I-` unsorted idea
  - Status: `todo` · `in progress` · `blocked (reason)` · `done YYYY-MM-DD`
  - Owner: `lucas`, `claude`, or `—` (unassigned)
- **Sections**: *Now* (current phase, see ROADMAP.md) → *Next* (agreed, not started) → *Later* (wanted, not scheduled) → *Ideas* (suggestions, not yet agreed) → *Done*.
- **Anyone** can add items to *Ideas*. **Lucas** decides what moves up to *Next* or *Now*.
- **Claude** marks an item `in progress` when starting it and moves it to *Done* (with date) when finished and logged in the changelog.
- Larger items get a short spec under `docs/specs/<ID>.md` before work starts.

---

## Now: Phase 6 (Polish & publish)

Phase 6 items done so far: Mermaid diagrams (I-073), single-file export (I-054, I-085), the show grid (I-081), the editor theme (I-082), extra images (I-083), picture styles (I-084) and glossary terms in slides (I-086); see ROADMAP.md. Lucas has not yet picked the next item: ask him, or pick from *Ideas* only when he says so.

**Handover notes (state on 2026-10-12, for the next session)**
- **Waiting for Lucas:**
  - **E-017** (under *Ideas → Editor*): when deleting slides empties a reading route, should the route be removed or turned into "all slides"?
  - I-083 (extra images), I-084 (picture styles) and I-086 (glossary terms in slides) are done.
- **Not verified in Claude's browser pane, so Lucas checks these in a real browser:**
  - an exported file opened by double-click (`file://`);
  - a real mouse drag in the show grid and the slide list (tested with synthetic events);
  - the real save dialog of Export…;
  - the editor theme following an OS light/dark switch while open (the pane cannot fire that event; on-load behaviour is verified).
- **How to verify in the pane:** see the notes at the top of `editor/CLAUDE.md`'s smoke-test checklist:
  - stub `window.open` and `showSaveFilePicker`;
  - use OPFS folders for the folder picker;
  - dispatch paste and drop events with a canvas-made PNG.
- **Working habits that avoided trouble:**
  - In a Python edit script, compute the new text completely before opening the file for writing. An exception after `open(…, 'w')` leaves an empty file.
  - Put long scripts in the scratchpad, not in shell heredocs.
  - When another session has uncommitted edits in a file you also changed, stage only your hunk. Write the blob as HEAD plus your edit with `git hash-object -w`, then `git update-index --cacheinfo`. Run the tests on the staged snapshot (`git checkout-index` into a scratch folder).
  - Never `git add -A`.
- **Editor colours:** use tokens only. `editor/test/theme-contrast.test.js` fails on a hard-coded colour or low contrast (see `editor/CLAUDE.md`).


## Pending verification & chores from earlier phases

- [ ] **P-006** [converter] Convert one of Lucas's real decks end-to-end (Lucas supplies a deck without confidential content) · todo · lucas
- [ ] **I-043** [converter] Derive a Slipr template from the company PowerPoint template (`slipr-template-from-pptx`): theme colours/fonts → tokens, layouts/placeholders → layout fragments, layout names → `pptxMapping`, master images → assets; then refine by hand (reflow, reader.css). Spec: `docs/specs/I-043-conclusion-template.md`. **Done so far**: first version (12 layouts) and the card layouts (I-043b): 17 layouts, and all 20 PowerPoint layouts convert. Left: I-043c, I-043d, I-058 · in progress · claude
- [ ] **I-043c** [converter] `slipr-template-from-pptx`: generate a draft template from a PowerPoint template (for business-unit variants) · todo · —
- [ ] **I-043d** [templates] Review of the Conclusion template by Lucas, and later by the brand team, before external use · todo · lucas
- [X] **C-003** [decisions] Confirm the phase order and the first template (see ROADMAP.md). D-001…D-010 were accepted on 2026-10-10 (D-006 is Python) · done · lucas
- [X] **V-017** [viewer] Verify the speaker view (`S`) in a normal browser: Claude's browser pane blocks popups · done · lucas

## Later

*(empty: promote items from Ideas)*

## Ideas: suggested features

### Audience mode
- [ ] **I-001** [viewer] Presenter view extras: per-slide time budget, "behind schedule" indicator
- [ ] **I-002** [viewer] Phone as remote control: next/previous plus notes on your phone (local WebSocket relay)
- [ ] **I-003** [viewer] Laser pointer, spotlight, on-slide drawing (Reveal plugins)
- [ ] **I-004** [viewer] QR code slot/overlay that links the audience to the reader version of the show, optionally at the current slide
- [ ] **I-006** [viewer] Kiosk mode: auto-advance and loop, for screens at events
- [ ] **I-007** [format] Visualization slot types: `chart` (data → animated SVG), code with line-by-line highlighting, KaTeX. Mermaid diagrams moved to I-073
- [ ] **I-008** [viewer] Jump to slide by number or title search (`G`)
- [ ] **I-009** [viewer] Zoomable "map" overview: chapters as clusters, zoom into a chapter (Prezi-like)

### Reader mode
- [ ] **I-010** [viewer] **Follow the presenter**: during a live talk, readers' devices follow the presenter's current slide, while still allowing them to dive deeper
- [ ] **I-011** [viewer] Print stylesheet and PDF export (reader mode at chosen profile/depth)
- [ ] **I-012** [viewer] Dark mode, font size, reduced-motion controls
- [ ] **I-013** [viewer] Open Graph meta + social preview image from the title slide
- [ ] **I-014** [viewer] Estimated reading time per path/depth, and a reading progress bar
- [ ] **I-015** [viewer] Show library page listing all shows in `shows/`
- [ ] **I-016** [format] `quiz` block: self-check questions with feedback
- [ ] **I-017** [viewer] Concept map navigation: a graph of slides linked by `related` and `tags`
- [ ] **I-018** [viewer] "Ask this show": a question box answered by Claude using only the show's content (needs an API key, so it is opt-in)
- [ ] **I-019** [viewer] Personal summary: a nicely formatted (printable / PDF) version of my highlights, notes and bookmarks. A Markdown export exists since Phase 3
- [ ] **I-030** [viewer] Optional sync / shared annotations across devices (needs a backend, revisits D-010)
- [ ] **I-031** [format] Glossary auto-linking: mark the first occurrence of each term per slide automatically
- [ ] **I-032** [viewer] Step through a slide's build animations inside reader mode
- [ ] **I-034** [viewer] Show my pins and notes in audience mode too (presenter's private view, e.g. in the speaker window), and pins on reader-block images (hotspot-style)

### Editor
- [ ] **I-020** [editor] Autosave draft to IndexedDB with crash recovery
- [ ] **I-021** [editor] Text-overflow detection: warn when content does not fit the layout at 1920×1080
- [ ] **I-022** [editor] Outline view: edit the whole show as one Markdown outline
- [ ] **I-023** [editor] Import a PPTX inside the editor (Python converter via Pyodide, or a small local helper process)
- [ ] **I-024** [editor] Keyboard-first editing shortcuts
- [ ] **I-026** [editor] Image handling: resize/compress to WebP, crop, focal point
- [ ] **I-027** [editor] AI assist (Claude API): draft slides from an outline, tighten bullets, write alt text, **generate a reader layer from speaker notes**, suggest glossary terms
- [ ] **I-028** [editor] Version history (snapshots, or git commits when the folder is a repo)
- [ ] **I-029** [editor] Slide library: reuse slides across shows
- [ ] **I-033** [editor] Coverage view: which slides lack a reader layer, which profiles see too little
- [ ] **E-017** [editor] Bug: deleting slides can leave a reading route with no slides, which the schema rejects (`paths[].slides` needs at least one). Seen while building the show grid's multi-delete. Ask what to do (remove the empty route, or keep it as "all slides"), then fix in `deleteSlide` with a test
- [ ] **E-018** [editor] Bug: **Save overwrites changes made to `show.json` on disk** since the editor opened it. The editor writes its in-memory show without checking the file, so newer work from elsewhere (another editor window, a Claude session, a git pull) is silently lost. Happened twice on 2026-10-11/12 with `shows/demo/show.json`: an editor window still holding older content saved over committed changes (I-084 styles, I-086 aliases) and brought back deleted test images. Fix: remember the file's `lastModified` (and content hash) when opening and after each save; before saving, read the file again, and if it changed, don't overwrite silently. Offer **Reload from disk** (discarding the in-memory edits), **Save anyway** (overwrite), or **Cancel**; ideally also notice the change when the window regains focus. Same check for Present / Read (they save first) · todo · —
- [ ] **E-019** [editor] Diagram editor: diagram slots and blocks are read-only in the editor (no Mermaid textarea, no caption, no fallback image from I-070). Add a field editor for the `diagram` slot and a Diagram block editor (`BLOCK_TYPES` lacks `diagram`), with a fallback image field like the Embedded Page block
- [ ] **I-059** [editor] `setLayout` keeps slots by name only; the design says name *and* type. No template has a slot name with two types today, but a future one would get an invalid value on a layout switch. Keep a value only if the new slot has the same type (else set it aside in `_orphaned`)

### Converter
- [ ] **I-040** [converter] Tables → a `table` slot/block type (cheap with python-pptx)
- [ ] **I-046** [converter] Charts → `chart` slot with the chart's real data (categories, series, values), so it is rendered and animated natively by Slipr
- [ ] **I-041** [converter] Charts and SmartArt → image fallback (via LibreOffice headless, optional)
- [ ] **I-042** [converter] Whole-slide image fallback for slides that cannot be mapped
- [ ] **I-044** [converter] Batch-convert a folder of decks
- [ ] **I-045** [converter] Reverse direction: export a Slipr show to PPTX (e.g. via PptxGenJS)

### Templates & format
- [ ] **I-050** [templates] House-style template based on your organization's style guide
- [ ] **I-051** [templates] Auto-generated style-guide page: all layouts, blocks, colors and fonts of a template
- [ ] **I-052** [templates] Generate `styleguide` JSON from `theme.css` (or vice versa)
- [ ] **I-053** [format] `.slipr` single-file package (zip of the show folder)
- [ ] **I-087** [viewer/shared] **Load and present a show from a zip-file URL (`?zip=<url>`)**:
  - A user specifies the location of a zipped Slipr presentation (e.g. on GitHub releases, a raw zipball URL, or any web server) in a URL parameter: `viewer/?zip=https://example.com/show.zip` (or `?zip=...&mode=reader`).
  - The viewer downloads the zip file client-side via `fetch()`, displaying download progress.
  - Decompresses in memory using a lightweight vendored zip reader (or standard browser streams), keeping D-001/D-002 (zero build step, offline once loaded, no backend server needed).
  - Adapts unzipped files into an in-memory source (similar to `shared/folder-source.js` for File System Access handles): parses `show.json` and creates `blob:` object URLs for images and assets.
  - **GitHub compatibility**: handles GitHub archive downloads where files are wrapped in a single top-level directory (e.g. `repo-main/show.json`) by auto-detecting `show.json` at root or one level down, with an optional `&path=` parameter for repos with multiple shows.
  - Presents the show in either audience mode or reader mode (`&mode=reader`), preserving deep links and personal annotations.
  - Clear error states for CORS restrictions (explaining why cross-origin fetches fail and how to use CORS-enabled hosting like GitHub Pages/raw), download failures, or missing `show.json`.
  - Pairs naturally with **I-053** (`.slipr` zip package) and makes sharing and embedding full shows as simple as sharing a link · todo · —
- [ ] **I-055** [format] Multilingual shows: per-slide content per language
- [ ] **I-057** [format] Profile-specific audience variants (a different deck cut per audience)
- [ ] **I-058** [templates] Conclusion Facts icons: the six brand icons are fixed in the PowerPoint layout, so converted Facts slides have none. Option: ship the original icons in `templates/conclusion/assets/icons/` (needs Lucas's OK, like the other assets) and let the converter fill empty `icon` fields from the layout

### Rich embeds & visualizations
- [ ] **I-071** [format/viewer] **Website embed**:
  - Upgrade the reader `embed` block, and add a `web` slot for audience mode.
  - Per-embed sandbox options (`allow-same-origin` only on explicit opt-in), an "Open in new tab" link, and an aspect ratio or height.
  - Many sites refuse framing (`X-Frame-Options` / CSP `frame-ancestors`), and that can't be detected reliably, so always offer a link card as fallback.
  - Optional screenshot image for offline presenting.
  - Audience mode: live and clickable during the talk, or a static screenshot (author's choice) · todo · —
- [ ] **I-072** [format/viewer] **PDF document**: a `pdf` slot and block with `src` (relative to show.json), `page` or page range, and optional `title`.
  - Reader mode: page navigation, zoom, and the PDF's text included in Slipr search (`search-index.js`, V-015). Either the browser's built-in viewer in an iframe (`#page=n`), or vendored **PDF.js** for consistent rendering. Decide in a spike.
  - Audience mode: show a chosen page as a slide, with fragments stepping through pages.
  - Local files work offline · todo · —
- [ ] **I-074** [format/viewer] **Cytoscape graph visualization**: a `graph` slot and block, with nodes and edges inline in show.json or in a `data/*.json` file. Each node has an `id`, `label` and optional `md` / `slide` / `tags`. Also a layout (`cose`, `breadthfirst`, `concentric`, …) and styles mapped from template tokens.
  - Vendored **Cytoscape.js**.
  - Reader mode: pan and zoom, click a node → popover with its Markdown or a jump to its slide, highlight neighbours, filter by tag.
  - Audience mode: a fixed viewport, with fragments that reveal nodes or focus on them in turn.
  - The same component can power I-017 (concept map of the show's own slides) · todo · —
- [ ] **I-075** [format/viewer] **Interactive map (Leaflet)**: a `map` slot and block with `center`, `zoom`, `markers` (`lat`, `lng`, `title`, `md`, optional `slide`), optional GeoJSON layers (relative file) and a tile source.
  - Vendored **Leaflet**.
  - Reader mode: pan and zoom, with marker popups as Slipr popovers.
  - Audience mode: fragments as a `flyTo` tour from marker to marker.
  - **Offline and privacy:** map tiles come from a server, which conflicts with D-002 (offline) and D-010 (privacy). Solutions:
    - click-to-load (I-070: done, per site per tab, `load: "auto"` to skip)
    - a static image fallback rendered at authoring time
    - optional local tiles for offline presenting
  - Respect the tile provider's usage policy and show the required attribution (e.g. OpenStreetMap) · todo · —

### AI authoring
- [ ] **I-080** [docs/tooling] **Prompt kit: let any AI chatbot write a Slipr show.** A ready-made instruction that users can copy or download, add their own content brief to, and paste into Claude, ChatGPT, Copilot or similar. The chatbot answers with a valid `show.json`.
  - **Contents of the instruction:**
    - what Slipr is and the two-layer idea: a concise audience layer, with depth in the reader layer
    - a condensed show-format spec
    - the **chosen template's layouts and slots**, with their limits
    - the reader block types, profiles, depth, paths, glossary, and the `[[term]]` / `^[popup]` syntax
    - writing guidelines: few words per slide, every image with alt text, stable kebab-case ids
    - strict output rules: one JSON code block only, `slipr: "0.1"`, the correct `template.ref`
    - a small worked example
    - a self-check list for the chatbot
    - a clearly marked **"## Your content"** section where the user describes topic, audience, length, profiles and source material
  - **Always in sync:** generated from `shared/schema/show.schema.json` + `template.json` by a script (`npm run prompt -- --template templates/default`), never hand-maintained. A test checks that every layout appears and that the embedded example validates.
  - **Variants:** *full*, and *compact* (for tools with small prompt limits, such as some Copilot surfaces). Also a hint to attach the file instead of pasting when it's long.
  - **Images:** chatbots can't supply image files, so the instruction asks for placeholder paths (`images/<descriptive-name>.png`) with a detailed alt text describing the wanted image. The validator's "missing file" warnings then double as a to-do list.
  - **Where users get it:**
    - a "Create with AI" page linked from the viewer's help page, with template choice, options (reader layer yes/no, number of slides, profiles) and **Copy** / **Download .md** buttons
    - later, the same button in the editor
  - **Round trip:** the user saves the answer as `show.json` and opens it in the viewer. On the validation-error page, a **"Copy fix-up prompt"** button bundles the errors into a follow-up message for the same chatbot.
  - **Acceptance:** tried with Claude, ChatGPT and Copilot on three different content briefs. Results (valid on first try? which errors?) recorded in `docs/ai/prompt-kit-results.md`, and the instruction tuned until the first answer is usually valid.
  - **Related:** I-027 (AI assist inside the editor), I-018 ("Ask this show"), I-022 (Markdown outline view) · todo · —

### Tooling
- [ ] **I-060** [tooling] Playwright smoke tests for viewer and editor (would also give `render.js` automated tests, which need a DOM)
- [ ] **I-061** [tooling] Claude Code slash commands in `.claude/commands/` (e.g. `/new-layout`, `/new-block-type`)
- [ ] **I-062** [tooling] Publish script: copy viewer + shared + vendor + template + show to a static host

## Done

- [x] **I-070** [format] Shared foundation for rich embeds (D-011): `shared/embeds/` registry with one module per kind (`diagram`, `web` for the reader `embed` block), static fallback inside every embed element (optional `fallback` image, show format 0.2), `hydrateEmbeds()` with lazy-loaded vendored libraries, click-to-load for other servers (per site per tab; `load: "auto"` set by the author in the editor), `embeds.css` from `--slipr-*` tokens; the single-file export drops unused libraries; approved libraries Mermaid, Cytoscape.js, Leaflet, PDF.js. Spec: `docs/specs/I-070-embed-foundation.md` · done 2026-10-12 · claude
- [x] **I-086** [viewer/format] Glossary terms clickable in slides in reader mode (D-015): automatic linking of the first occurrence per slide (whole words, case- and accent-insensitive, longest first, also in plain text slots), pin mode keeps priority, audience mode unchanged; optional `aliases` per term (show format 0.2), in validation, reader search and the editor's Show settings (Other names). Spec: `docs/specs/I-086-glossary-in-slides.md` · done 2026-10-12 · claude
- [x] **I-084** [format/editor/templates/converter] Picture styles (D-014): template format 0.3 `pictureStyles` (shadow, soft, rounded, frame in both templates), `style` and `opacity` on image values (show format 0.2), rendering via `shared/picture.js`, validation, a style picker with live previews and an opacity slider in every image field, and the converter mapping PowerPoint shadow / soft edges / rounded corners / outline and transparency. Spec: `docs/specs/I-084-picture-styles.md` · done 2026-10-11 · claude
- [x] **I-083** [format/editor/viewer/converter] Extra images on a slide (D-013, show format 0.2): `slide.overlays` with position and size as fractions of the canvas, in front of the layout, optionally one by one; reader mode keeps such a slide a picture on narrow screens; editor: "Extra images" in the Slide tab (choose / drop / paste, alt text, order, appear one by one) and move / resize on the audience preview (drag, corners with aspect lock, arrow keys, Alt+arrows, Delete); the converter places pictures that fit no slot as extra images. Spec: `docs/specs/I-083-extra-images.md` · done 2026-10-11 · claude
- [x] **I-082** [editor] Light / dark theme switch (Light, Dark, System) in the toolbar, remembered per browser, applied before the first paint; a lighter dark theme; all colours as tokens; the manual follows the choice; WCAG AA contrast checked by a test · done 2026-10-11 · claude
- [x] **I-081** [editor] Show grid: all slides as thumbnails in chapter runs; multi-select, drag slides and chapters, duplicate / hide / assign chapter / new chapter / delete as one undo step each, rename / move / delete chapters, empty chapters as drop targets, keyboard alternatives, badges · done 2026-10-11 · claude
- [x] **I-085** [editor] Export… button: the open show (unsaved changes included) as one offline HTML file, same packer as `npm run export`; save dialog or download · done 2026-10-11 · claude
- [x] **I-054** [format] Single-file HTML export: `npm run export -- <show folder>` packs the show, its template and the viewer into one HTML file that presents offline in both modes (import map of `data:` modules, embedded files, inlined fonts and images; Mermaid only when needed). Spec: `docs/specs/I-054-single-file-export.md`. Next: an Export button in the editor (I-085) · done 2026-10-11 · claude
- [x] **I-073** [format/viewer] **Mermaid diagram**: support for Mermaid diagrams in audience layout slot (`diagram`) and reader block (`diagram`), client-side rendering with vendored Mermaid 11.4.1 (D-002, lazy loaded, strict security), theme integration, SVG caching, search indexing, and demo show example (`s-pipeline`) · done 2026-10-11 · claude
- [x] **E-016** [editor] User manual inside the editor: `editor/help.html` (every part of the editor, Markdown reference, shortcuts, troubleshooting; light and dark, phone width, offline), opened from **? Help** in the toolbar, the start screen, and `F1` at the section for the current tab · done 2026-10-11 · claude
- [x] **E-015** [editor] The last controls needed to build the demo from scratch: slide tags, audience options (step-by-step builds, auto-animate, transition), image fit, show language / description / tags, slide numbers, agenda; empty metadata no longer stored as `""` · done 2026-10-11 · claude
- [x] **E-014** [editor] Bug: `Ctrl+F` / `Ctrl+H` threw `ReferenceError: onFindReplace is not defined`, because `registerShortcuts()` did not take the handler that `main.js` passes. Found in the docs pass · done 2026-10-11 · claude
- [x] **E-005** [editor] Live preview in both modes with profile/depth simulation (checked against the viewer: same `personalize()` rules, `showSlide`, diagnostics); notes for backup and reader-hidden slides · done 2026-10-11 · claude
- [x] **I-036** [editor] Block editors for tabs (labels, Markdown, add / reorder / remove), embed (URL with hints, title, height) and slide-ref (slide picker, label); every block type now has an editor · done 2026-10-11 · claude
- [x] **E-003** [editor] Slide list: add, duplicate, delete, reorder (buttons, Alt+↑/↓, drag and drop with a drop line and edge scrolling), hide from audience mode (◉ / ◌) · done 2026-10-11 · claude
- [x] **E-004** [editor] Slide tab: generated slot form with a field editor for every slot type, and a layout picker with live previews of the slide in each layout (what is hidden, brought back, needed); "▾" to add a slide in a chosen layout · done 2026-10-10 · claude
- [x] **E-009** [editor] Show settings: chapters (with summary), profiles, glossary and reading routes: edit, reorder, usage counts, deletes that explain their effect (glossary: keep the words as plain text) · done 2026-10-10 · claude
- [x] **E-008** [editor] Reader tab: summary, block editors with profile (`for`) and depth, related slides, `showSlide`, Markdown toolbar (glossary, popup, slide link). Editors for tabs, embed and slide-ref blocks are I-036 · done 2026-10-10 · claude
- [x] **I-035** [editor] Cards editor for `cards` slots: fields per card by type, length counters, move / remove / add up to `maxItems`, card images; plus quote and code editors · done 2026-10-10 · claude
- [x] **I-025** [editor] Global search & replace across slides, blocks, notes and settings: modal dialog (Ctrl+F / Ctrl+H / toolbar button), match previews with clickable jump-to-slide, case/whole-word options, replace in current slide or across whole show, pure actions + 4 tests · done 2026-10-10 · claude

- [x] **E-006** [editor] Images and hotspots: choose / drop / paste images into image slots and reader image blocks, alt-text dialog, dedup by content; hotspot editor (click to place, drag or arrow keys to move, title + Markdown). Also fixed the Reader tab writing invalid blocks (type change, callout `kind` → `variant`, `md` on non-text blocks) · done 2026-10-10 · claude
- [x] **E-013** [editor] Bug: after changing a slide's layout the form kept the old layout's fields (no image field for `text-image`); buttons and undo inside the inspector tabs showed stale content. Forms now re-render for everything except the echo of the user's own typing, keeping focus · done 2026-10-10 · claude
- [x] **E-012** [editor] Bug: the slide list did not scroll, so slides beyond the window could not be reached; the toolbar hid its buttons in narrow windows. Fixed, plus a slide navigator ("Go to slide" filter, keyboard navigation, PageUp/PageDown) · done 2026-10-10 · claude
- [x] **E-007** [editor/viewer] Present / Read: save first, then open the viewer at the current slide, `viewer/?folder=<key>` for folder shows (D-012) or `?show=` for URL shows. Viewer: `?folder=`, access page, "Open a show folder…" on the help page · done 2026-10-10 · claude
- [x] **E-011** [editor] Bug: "+ Add" / `Ctrl+Enter` always used layout `bullets`. The layout now comes from the template (`layoutForNewSlide()`): the current slide's layout after a content slide, else the template's plain content layout · done 2026-10-10 · claude
- [x] **E-002** [editor] Open, save and new-from-template via the File System Access API: start screen with recent shows, `?folder=<key>` with permission re-request from a click, Save/`Ctrl+S` with schema key order, saving URL-opened shows after picking their folder, `templates/index.json`, shared folder loader (D-012) · done 2026-10-10 · claude
- [x] **E-010** [editor] Bug: the slide form corrupted non-text slots. Image slots now get a path and an alt-text input and always write `{ src, alt, … }`; `quote`, `code`, `cards` (and unknown types) are read-only with a summary; array lists stay arrays. Also fixed on the way: the store passed the template to `validateShow` in the wrong argument (template checks never ran), the preview's diagnostics never matched slide warnings and hid errors, and wrong import paths in `ui/preview.js` / `ui/slide-list.js` stopped the editor from loading · done 2026-10-10 · claude
- [x] **I-043b** [format/templates] `cards` slot type (template format 0.2) + the five card layouts of the Conclusion template (Textbox 4x / 9x, Facts & figures, Onze markten, Introduction): schemas, specs, validator, renderer, viewer (fragments, search, pins), converter card roles, demo slides, tests · done 2026-10-10 · claude
- [x] **E-001** [editor] Shell, store, actions, undo/redo: 3-column app, pure actions with reference cleanup, store with coalescing, live preview, shortcuts, 24 tests · done 2026-10-10 · claude
- [x] **P-001** [converter] Package skeleton (`pyproject.toml`, venv, pytest) + `reader.py` (sections, hidden slides, alt text, builds, inherited bullets) · done 2026-10-10 · claude
- [x] **P-002** [converter] `extract.py` + `text.py`: intermediate model, Markdown with bullet levels, formatting and escaping · done 2026-10-10 · claude
- [x] **P-003** [converter] `mapping.py`: name mapping, title/section hints, best-fit scoring, reader-layer leftovers · done 2026-10-10 · claude
- [x] **P-004** [converter] `emit.py`, `validate.py`, CLI `slipr-convert`, `conversion-report.md`, `--notes-to-reader` · done 2026-10-10 · claude
- [x] **P-005** [converter] 24 tests with a deck generated in code, plus the JS-validator contract test · done 2026-10-10 · claude
- [x] **V-018** [viewer] Annotate slides and objects on slides: slide notes, pins (click or object list), highlights in slide text · done 2026-10-10 · claude
- [x] **V-011** [viewer] Reader state: IndexedDB → localStorage → memory, debounced store, `migrate()` · done 2026-10-10 · claude
- [x] **V-013** [viewer] Welcome chooser and ⚙ Tailor panel (profile / depth / route / presenter notes), `D` key · done 2026-10-10 · claude
- [x] **V-014** [viewer] Progress marks + "n of m read", resume message, bookmarks (★ / `M`) · done 2026-10-10 · claude
- [x] **V-015** [viewer] Search (`/`): word-prefix, accent-insensitive, snippets, on-page highlight, hidden-match count · done 2026-10-10 · claude
- [x] **V-016** [viewer] Annotations: highlights + notes, text-quote anchoring, "My notes" panel, Markdown/JSON export, JSON import · done 2026-10-10 · claude
- [x] **S-006** [shared] `blocks.js`: all reader block types as safe HTML strings, 14 tests · done 2026-10-10 · claude
- [x] **V-004** [viewer] Reader app shell: top bar, contents (drawer on phones), article, routing, keys · done 2026-10-10 · claude
- [x] **V-008** [viewer] Popovers (glossary, footnotes, hotspots), tabs, details, embeds · done 2026-10-10 · claude
- [x] **V-009** [viewer] Chapter contents, scroll-spy, related links, J/K next/previous · done 2026-10-10 · claude
- [x] **V-005** [viewer] Mode switch (`R` / `A` / "Present ▶") that keeps the position · done 2026-10-10 · claude
- [x] **V-006** [viewer] Deep links in reader mode (`#s-05/b3`) with fallback for invisible slides · done 2026-10-10 · claude
- [x] **V-010** [viewer] Responsive pass: verified at 375 px (reflow, no horizontal scroll, drawer) · done 2026-10-10 · claude
- [x] **V-012** [viewer] `personalize.js`: profile / depth / path filtering + URL parameters, 16 tests · done 2026-10-10 · claude
- [x] **T-004** [shows] Demo: "AI help, kept in its cage" slide with `caged-agent.jpg`; hotspots moved to box corners · done 2026-10-10 · claude
- [x] **S-003** [shared] `load.js`: show + template + layouts, image checks, `LoadError`, 7 tests · done 2026-10-10 · claude
- [x] **S-004** [shared] `markdown.js`: safe subset + glossary, popups, slide links, mode option, 29 tests · done 2026-10-10 · claude
- [x] **S-005** [shared] `render.js`: slide + layout → element, all slot types · done 2026-10-10 · claude
- [x] **V-001** [viewer] Audience mode on Reveal.js 6 (fragments, auto-animate, notes, backup slides, `#/slide-id`) · done 2026-10-10 · claude
- [x] **V-007** [viewer] Agenda slides from chapters + chapter progress bar · done 2026-10-10 · claude
- [x] **V-002** [viewer] Help, load-error and validation-error pages · done 2026-10-10 · claude
- [x] **T-003** [templates] Visual check of the default template in audience mode; fixed `<section>` in two-column, restored bold/italic under Reveal's reset, column height, body size · done 2026-10-10 · claude
- [x] **C-002** [repo] Vendor Reveal.js 6.0.2 into `vendor/` (ES modules, unmodified `dist/`) · done 2026-10-10 · claude
- [x] **S-001** [shared] JSON Schemas for show and template (cross-checked with Python `jsonschema`) · done 2026-10-10 · claude
- [x] **C-004** [repo] VS Code schema association for `show.json` / `template.json` · done 2026-10-10 · claude
- [x] **S-002** [shared] `schema-check.js` + `validate.js` with errors/warnings + 43 tests · done 2026-10-10 · claude
- [x] **T-001** [templates] `templates/default`: 5 layouts, `theme.css`, `reader.css`, logo, illustration · done 2026-10-10 · claude
- [x] **T-002** [shows] `shows/demo` (13 slides, both layers) + `shows/fixtures/broken` · done 2026-10-10 · claude
- [x] **C-006** [repo] `.gitattributes`: LF line endings, binary assets · done 2026-10-10 · claude
- [x] **C-001** [repo] Initialise git, `.gitignore`, root `package.json` with `serve` / `test` scripts · done 2026-10-10 · claude
- [x] **C-000** [docs] Documentation outline, roadmap and backlog · done 2026-10-10 · claude
- [x] **C-005** [docs] Reworked design for two distinct experiences (audience vs. interactive reader) · done 2026-10-10 · claude
