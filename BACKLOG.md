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

## Now: Phase 0 (Foundations)

- [ ] **C-002** [repo] Vendor Reveal.js 5.x into `vendor/` · todo · claude
- [ ] **S-001** [shared] JSON Schemas for show and template, from `docs/*-format.md` · todo · claude
- [ ] **C-004** [repo] VS Code schema association for `show.json` (autocomplete while hand-writing) · todo · claude
- [ ] **S-002** [shared] `validate.js` with errors/warnings + tests · todo · claude
- [ ] **T-001** [templates] `templates/default`: 5 layouts, `theme.css`, `reader.css` · todo · claude
- [ ] **T-002** [shows] `shows/demo`: sample show exercising both layers fully · todo · claude
- [ ] **C-003** [decisions] Confirm D-006 (converter language) and the phase order (see ROADMAP.md). D-001…D-005 and D-007…D-010 were accepted on 2026-10-10 · todo · lucas

## Next: Phases 1–5 (see ROADMAP.md)

**Phase 1: Audience mode**
- [ ] **S-003** [shared] `load.js`: load show + template, resolve paths · todo · —
- [ ] **S-004** [shared] `markdown.js`: subset + `[[glossary]]`, `^[popup]`, `#slide` links, mode option · todo · —
- [ ] **S-005** [shared] `render.js`: slide + layout → element · todo · —
- [ ] **V-001** [viewer] Audience mode on Reveal.js (fragments, auto-animate, backup slides) · todo · —
- [ ] **V-007** [viewer] Agenda slides from chapters + chapter progress bar · todo · —
- [ ] **V-002** [viewer] Readable error page for invalid shows · todo · —

**Phase 2: Reader core**
- [ ] **S-006** [shared] `blocks.js`: render all reader block types · todo · —
- [ ] **V-004** [viewer] Reader app shell: contents / article / margin, routing, keys · todo · —
- [ ] **V-008** [viewer] Popovers (glossary, footnotes, hotspots), tabs, details, embeds · todo · —
- [ ] **V-009** [viewer] Chapter TOC, scroll-spy, related, next/previous · todo · —
- [ ] **V-005** [viewer] Mode switch that keeps position · todo · —
- [ ] **V-006** [viewer] Deep links in both modes (`#/5`, `#s-05/b3`) · todo · —
- [ ] **V-010** [viewer] Responsive pass + layout reflow in reader mode · todo · —

**Phase 3: Reader personalisation**
- [ ] **V-011** [viewer] Reader state + IndexedDB persistence · todo · —
- [ ] **V-012** [viewer] `personalize.js`: profile / depth / path filtering + tests · todo · —
- [ ] **V-013** [viewer] Welcome chooser, toolbar controls, URL parameters · todo · —
- [ ] **V-014** [viewer] Progress marks, resume, bookmarks · todo · —
- [ ] **V-015** [viewer] Full-text search with jump + highlight · todo · —
- [ ] **V-016** [viewer] Annotations: highlights, margin notes, export/import · todo · —

**Phase 4: Converter MVP**: P-001 … P-005 (see ROADMAP) · todo · —

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
- [ ] **I-007** [format] Visualization slot types: `chart` (data → animated SVG), `diagram` (Mermaid), code with line-by-line highlighting, KaTeX
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
- [ ] **I-019** [viewer] Personal summary: export my highlights + notes + bookmarked slides as a nicely formatted document
- [ ] **I-030** [viewer] Optional sync / shared annotations across devices (needs a backend, revisits D-010)
- [ ] **I-031** [format] Glossary auto-linking: mark the first occurrence of each term per slide automatically
- [ ] **I-032** [viewer] Step through a slide's build animations inside reader mode

### Editor
- [ ] **I-020** [editor] Autosave draft to IndexedDB with crash recovery
- [ ] **I-021** [editor] Text-overflow detection: warn when content does not fit the layout at 1920×1080
- [ ] **I-022** [editor] Outline view: edit the whole show as one Markdown outline
- [ ] **I-023** [editor] Import a PPTX inside the editor (run the converter core in the browser)
- [ ] **I-024** [editor] Keyboard-first editing shortcuts
- [ ] **I-025** [editor] Find & replace across slides, blocks and notes
- [ ] **I-026** [editor] Image handling: resize/compress to WebP, crop, focal point
- [ ] **I-027** [editor] AI assist (Claude API): draft slides from an outline, tighten bullets, write alt text, **generate a reader layer from speaker notes**, suggest glossary terms
- [ ] **I-028** [editor] Version history (snapshots, or git commits when the folder is a repo)
- [ ] **I-029** [editor] Slide library: reuse slides across shows
- [ ] **I-033** [editor] Coverage view: which slides lack a reader layer, which profiles see too little

### Converter
- [ ] **I-040** [converter] Tables → a `table` slot/block type
- [ ] **I-041** [converter] Charts and SmartArt → image fallback (via LibreOffice headless, optional)
- [ ] **I-042** [converter] Whole-slide image fallback for slides that cannot be mapped
- [ ] **I-043** [converter] Extract colors and fonts from the PPTX master as a starting point for a new template
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

### Tooling
- [ ] **I-060** [tooling] Playwright smoke tests for viewer and editor
- [ ] **I-061** [tooling] Claude Code slash commands in `.claude/commands/` (e.g. `/new-layout`, `/new-block-type`)
- [ ] **I-062** [tooling] Publish script: copy viewer + shared + vendor + template + show to a static host

## Done

- [x] **C-001** [repo] Initialise git, `.gitignore`, root `package.json` with `serve` / `test` scripts · done 2026-10-10 · claude
- [x] **C-000** [docs] Documentation outline, roadmap and backlog · done 2026-10-10 · claude
- [x] **C-005** [docs] Reworked design for two distinct experiences (audience vs. interactive reader) · done 2026-10-10 · claude
