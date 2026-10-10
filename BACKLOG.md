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

## Now: finishing Phase 4, then the company template

- [ ] **P-006** [converter] Convert one of Lucas's real decks end-to-end (Lucas supplies a deck without confidential content) · todo · lucas
- [ ] **I-043** [converter] Derive a Slipr template from the company PowerPoint template (`slipr-template-from-pptx`): theme colours/fonts → tokens, layouts/placeholders → layout fragments, layout names → `pptxMapping`, master images → assets; then refine by hand (reflow, reader.css). Spec: `docs/specs/I-043-conclusion-template.md`. **First version done** (12 layouts, conversion of all 20 PowerPoint layouts); left: see I-043b/c/d · in progress · claude
- [ ] **I-043b** [format/templates] `cards` slot type + the card layouts (Textbox 4x / 9x, Facts & figures, Onze markten, Introduction) · todo · —
- [ ] **I-043c** [converter] `slipr-template-from-pptx`: generate a draft template from a PowerPoint template (for business-unit variants) · todo · —
- [ ] **I-043d** [templates] Review of the Conclusion template by Lucas, and later by the brand team, before external use · todo · lucas
- [ ] **C-003** [decisions] Confirm the phase order and the first template (see ROADMAP.md). D-001…D-010 were accepted on 2026-10-10 (D-006 is Python) · todo · lucas
- [ ] **V-017** [viewer] Verify the speaker view (`S`) in a normal browser: Claude's browser pane blocks popups · todo · lucas

## Next: Phase 5 (see ROADMAP.md)

**Phase 5: Editor MVP**: E-001 … E-009 (see ROADMAP) · todo · —

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
- [ ] **I-025** [editor] Find & replace across slides, blocks and notes
- [ ] **I-026** [editor] Image handling: resize/compress to WebP, crop, focal point
- [ ] **I-027** [editor] AI assist (Claude API): draft slides from an outline, tighten bullets, write alt text, **generate a reader layer from speaker notes**, suggest glossary terms
- [ ] **I-028** [editor] Version history (snapshots, or git commits when the folder is a repo)
- [ ] **I-029** [editor] Slide library: reuse slides across shows
- [ ] **I-033** [editor] Coverage view: which slides lack a reader layer, which profiles see too little

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
- [ ] **I-054** [format] Single-file HTML export: show + template + viewer inlined
- [ ] **I-055** [format] Multilingual shows: per-slide content per language
- [ ] **I-057** [format] Profile-specific audience variants (a different deck cut per audience)

### Rich embeds & visualizations
- [ ] **I-070** [format] **Shared foundation for rich embeds** (do this first; I-071…I-075 build on it):
  - Every embed kind is available both as an audience **slot type** and a reader **block type**, with one renderer per kind in `shared/embeds/<kind>.js`, called by `render.js` and `blocks.js`.
  - Libraries are vendored (D-002) and **lazy-loaded** only on slides that use them, so the core stays light.
  - Styling comes from the template's `--slipr-*` tokens.
  - Every kind has a static fallback (image or link card) for print/PDF, editor thumbnails and failures.
  - **Click-to-load** for anything that contacts an external server (websites, map tiles), so no reader data leaves the browser without consent (D-010).
  - Needs a new decision entry (D-011: embed architecture and the list of approved libraries) · todo · —
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
- [ ] **I-073** [format/viewer] **Mermaid diagram**: implements the planned `diagram` slot (already in the schema) plus a `diagram` block. Supersedes the Mermaid part of I-007.
  - Vendored **Mermaid**, about 3 MB, so lazy-loading is essential. `securityLevel: 'strict'`, and theme variables taken from the template tokens.
  - Reader mode: pan and zoom for large diagrams, and clickable nodes that open a Slipr popover or jump to a slide (`#slide-id`).
  - Audience mode: build the diagram up step by step with fragments (stretch goal).
  - Rendered SVG is cached per diagram source.
  - Editor: a live preview while typing the Mermaid source · todo · —
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
    - click-to-load (I-070)
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
