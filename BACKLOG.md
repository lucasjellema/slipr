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

Phase 6 items done so far: Mermaid diagrams (I-073), single-file export (I-054, I-085), the show grid (I-081), the editor theme (I-082), extra images (I-083), picture styles (I-084), glossary terms in slides (I-086), text elements (I-089), graphs (I-074), maps (I-075), the slide library (I-029), image cropping (I-090), picture morphs (I-091), dedicated glossary editor (I-088) and draft autosave with crash recovery (I-020); see ROADMAP.md. Lucas has not yet picked the next item: ask him, or pick from *Ideas* only when he says so.

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
- [ ] **C-007** [editor] Find & replace does not look inside table cells (I-104) or tag cloud terms (I-105); add them to `findMatches()` and `replaceInSlide()` / `replaceAllText()` together · todo · —
- [ ] **C-008** [docs] Try the AI prompt kit (I-080) with ChatGPT and Copilot on the three briefs in `docs/ai/prompt-kit-results.md`, fill in the table, and report repeated mistakes so the generator can be tuned · todo · lucas
- [ ] **C-009** [templates] Contrast below WCAG AA, found by the template editor's checks (I-106): **default**: accent `#F2A900` on white 2.0 : 1 (used for the kicker text, bullets and lines), graph colour 2 (the same amber) 2.0, tip `#2E8B57` 4.24 and warning `#B5651D` 4.33 (callout titles in reader mode); **Conclusion**: tip (brand green) 3.27, warning (brand red) 4.31, graph colour 3 (cyan) 2.75. Changing them changes how existing shows look: Lucas decides (darker reader-only shades are an option for the callouts) · todo · —

## Later

*(empty: promote items from Ideas)*

## Ideas: suggested features

### Viewer
*(empty: promote items from below or add ideas)*

### Audience mode
- [ ] **I-001** [viewer] Presenter view extras: per-slide time budget, "behind schedule" indicator
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
- [ ] **I-021** [editor] Text-overflow detection: warn when content does not fit the layout at 1920×1080
- [ ] **I-022** [editor] Outline view: edit the whole show as one Markdown outline
- [ ] **I-023** [editor] Import a PPTX inside the editor (Python converter via Pyodide, or a small local helper process)
- [ ] **I-024** [editor] Keyboard-first editing shortcuts
- [ ] **I-026** [editor] Image handling: resize/compress to WebP, focal point (cropping: I-090)
- [ ] **I-027** [editor] AI assist (Claude API): draft slides from an outline, tighten bullets, write alt text, **generate a reader layer from speaker notes**, suggest glossary terms
- [ ] **I-028** [editor] Version history (snapshots, or git commits when the folder is a repo)
- [ ] **I-033** [editor] Coverage view: which slides lack a reader layer, which profiles see too little
- [ ] **E-017** [editor] Bug: deleting slides can leave a reading route with no slides, which the schema rejects (`paths[].slides` needs at least one). Seen while building the show grid's multi-delete. Ask what to do (remove the empty route, or keep it as "all slides"), then fix in `deleteSlide` with a test
- [ ] **E-018** [editor] Bug: **Save overwrites changes made to `show.json` on disk** since the editor opened it. The editor writes its in-memory show without checking the file, so newer work from elsewhere (another editor window, a Claude session, a git pull) is silently lost. Happened twice on 2026-10-11/12 with `shows/demo/show.json`: an editor window still holding older content saved over committed changes (I-084 styles, I-086 aliases) and brought back deleted test images. Fix: remember the file's `lastModified` (and content hash) when opening and after each save; before saving, read the file again, and if it changed, don't overwrite silently. Offer **Reload from disk** (discarding the in-memory edits), **Save anyway** (overwrite), or **Cancel**; ideally also notice the change when the window regains focus. Same check for Present / Read (they save first) · todo · —
- [ ] **E-019** [editor] Diagram editor: diagram slots and blocks are read-only in the editor (no Mermaid textarea, no caption, no fallback image from I-070). Add a field editor for the `diagram` slot and a Diagram block editor (`BLOCK_TYPES` lacks `diagram`), with a fallback image field like the Embedded Page block
- [ ] **I-059** [editor] `setLayout` keeps slots by name only; the design says name *and* type. No template has a slot name with two types today, but a future one would get an invalid value on a layout switch. Keep a value only if the new slot has the same type (else set it aside in `_orphaned`)
- [x] **I-092** [editor/format] **Export a show to a zip file and import from an uploaded zip file in the editor**:
  - **Export to zip (`.zip` / `.slipr`)**:
    - An **Export to zip…** (or **Download zip**) action in the editor top bar / menu alongside HTML export (I-085).
    - Packages the current show in memory: `show.json`, referenced images (`images/`), data files (`data/`), and local documents (`docs/`), including any unsaved in-memory edits.
    - Compresses client-side using standard Web Streams (`CompressionStream('deflate-raw')`) or a lightweight zip writer (complementing `shared/zip.js`), triggering a browser download or file save dialog (`.zip` or `.slipr`).
  - **Import from uploaded zip file**:
    - An **Open zip archive…** button on the editor start screen and File menu (via `<input type="file" accept=".zip,.slipr">`).
    - Uses `shared/zip.js` (`readZip()` and `createZipSource()` from I-087) to decompress client-side in memory without uploading to any server (D-001/D-002/D-010).
    - Handles direct root shows, single-directory wrappers (e.g. GitHub archive downloads `repo-main/show.json`), and prompts if multiple shows are found in the archive.
    - Loads the unzipped show into the editor store and live preview with `blob:` object URLs for images and assets.
    - Saving: allows authoring and re-exporting as zip, or extracting/saving into a disk folder via `showDirectoryPicker()`.
    - Enables editing shows in browsers that lack the File System Access directory picker (Firefox, Safari).
  - Pairs with **I-053** (`.slipr` single-file package format) and **I-087** (`?zip=<url>` viewer loader) · 2026-10-13 · ✓

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
- [ ] **I-053** [format] `.slipr` single-file package (zip of the show folder) · see also **I-092** for editor export & import
- [ ] **I-055** [format] Multilingual shows: per-slide content per language
- [ ] **I-057** [format] Profile-specific audience variants (a different deck cut per audience)
- [ ] **I-058** [templates] Conclusion Facts icons: the six brand icons are fixed in the PowerPoint layout, so converted Facts slides have none. Option: ship the original icons in `templates/conclusion/assets/icons/` (needs Lucas's OK, like the other assets) and let the converter fill empty `icon` fields from the layout
- [ ] **I-111** [template-editor] **Layout composer** (from I-106): a visual canvas (16:9 and 4:3) to build and arrange layout fragments (`layouts/*.html`); add and configure slots (`text`, `image`, `quote`, `code`, `cards`, `diagram`, `graph`, `map`, `table`, …) with their limits (`maxLength`, `maxItems`, `required`, labels). Needs a spec: how positions become CSS without breaking hand-written layouts (D-017 keeps files hand-editable) · todo · —
- [ ] **I-112** [template-editor] **Master branding and chrome** (from I-106): header / footer rules, slide number placement, logos and watermarks on every slide, and editing picture styles (shadow, soft edges, rounded corners, frame). Today these are CSS rules and layout markup, not tokens: needs a spec (new tokens, or rule editing) · todo · —
- [ ] **I-113** [template-editor] **Reader theme styler** (from I-106): article typography, column width, tab bars, callout cards and glossary popups beyond today's `reader.css` tokens (phase 1 already edits `--slipr-reader-*` and the callout colours). Pairs with standard reader tokens in both templates · todo · —
- [ ] **I-114** [template-editor/editor] **Test drive** (from I-106): one click opens the show editor with a new show on the template being edited (needs the template in `templates/` and `templates/index.json`, or templates inside a show folder, D-012) · todo · —
- [ ] **I-115** [template-editor/converter] **Template from a PowerPoint** (from I-106): import a `.pptx` template's theme colours, fonts and placeholder mapping into a new Slipr template; pairs with I-043 (`slipr-template-from-pptx`) · todo · —

### Rich embeds & visualizations
- [ ] **I-110** [format/viewer/editor] **Video from a local MP4 file or from YouTube / another URL (`video` slot and block)**: today a video can only go in a reader `embed` block as a sandboxed iframe; this makes video a proper embed kind (D-011) in both modes:
  - **Sources**: a file in the show folder (`media/clip.mp4`, also WebM; played with the native `<video>` element, works offline and in the single-file export) or a URL: YouTube and Vimeo links (any form, e.g. `youtu.be/…`, `watch?v=…`, `shorts/…`) turned into their privacy-friendly embed address (`youtube-nocookie.com`, Vimeo `dnt=1`), or a direct link to a video file on another server.
  - **Options**: `start` / `end` time, `autoplay` (muted) when the slide appears, `loop`, `muted`, `controls`, a `poster` image (default for YouTube: none fetched, the fallback image), captions from a `.vtt` file for local video, `fit` (contain / cover) from the template.
  - **Audience mode**: plays when the slide appears or on a step (Reveal fragment), pauses when leaving the slide; `present: "live"` (default) or `"static"` (poster / fallback only, never contacts the server), as for web pages (I-071). Local video needs no network, so it fits the offline rule.
  - **Reader mode**: click-to-load for YouTube, Vimeo and other servers (names the site, per site per tab, D-011); local video plays straight away; keyboard-accessible controls; a transcript or chapter list as Markdown next to the video (chapter times seek the video), indexed for reader search (`/`).
  - **Export**: the single-file export embeds local video only below a size limit (warns above it and keeps a link / poster instead); YouTube stays a click-to-load frame.
  - **Editor**: a video form (file picker or URL with source detection and a preview of the embed address, start / end, options, poster, captions), a `video` layout in both templates; the converter could map PPTX videos later (out of scope here).
  - Needs a spec `docs/specs/I-110-video.md` with Lucas's decisions first (e.g. file size limit for export, which hosts besides YouTube / Vimeo, whether the `embed` block keeps video URLs working) and a format change (new `video` slot and block type in `docs/show-format.md`, schema and version). · todo · —
- [ ] **I-109** [format/viewer/editor] **Embedded bar charts from CSV or inline data (`chart` slot and block, `kind: "bar"`)**: the first concrete chart kind of I-007, built on the I-104 table data so the same data can be shown as a table or a chart:
  - **Data source**: the same as tables (I-104): inline `columns` / `rows` or a CSV file in `data/` read with `shared/csv.js` (separators, quotes and decimal commas as for tables); `category` names the label column, `series` one or more value columns (default: every numeric column). A table and a chart may point at the same CSV file.
  - **Chart options**: vertical or horizontal bars; grouped or stacked for more than one series; value labels on or off; axis min / max and number format (as table column formats: currency, percentage, decimals); sort by value or keep the data order; a highlighted category; an optional reference line (target or average).
  - **Visual design**: plain SVG drawn by `shared/embeds/chart.js` (no chart library, D-001/D-002); colours, gridlines, fonts and the series palette from template tokens (`--slipr-chart-*`, falling back to the accent palette); legend only with more than one series; scales to the slot and stays legible at slide size.
  - **Audience mode**: bars grow in when the slide appears; optional steps (Reveal fragments) to reveal bars or series one at a time, or to highlight a category, as for table rows.
  - **Reader mode**: tooltips with exact values on hover, tap and keyboard focus (accessible: bars are focusable, with a screen-reader summary); click the legend to show or hide a series; **Show as table** switches to the I-104 table of the same data (with Copy and Download CSV); category names and title in the reader search index.
  - **Editor**: a chart form like the table form (data source, category / series pickers, options, steps) with a live preview; *Make a chart* from an existing table value.
  - Out of scope here (later kinds or items): line, pie and scatter charts (I-007), the converter mapping PPTX charts to `chart` (I-046), remote data. Needs a spec `docs/specs/I-109-bar-chart.md` with Lucas's decisions first, and a format change (`chart` moves from *planned* to real in `docs/show-format.md`, schema and version). · todo · —
- [ ] **I-108** [format/viewer] **More for tag clouds** (left out of I-105): a spiral-packed "word cloud" shape as an alternative to the flowing layout; a pulse animation on highlighted terms; colours by a category column instead of by weight; filtering the reader's contents to the slides that mention a term; terms from a CSV file in the reader search index · todo · —
- [ ] **I-107** [format/viewer/editor] **More for data tables** (left out of I-104): group rows by a column with a subtotal per group (collapsible in reader mode); filters per column (a value list or a range); pagination as an alternative to scrolling; a remote CSV address (click-to-load, like web pages); editing a CSV file's cells from the editor (now: *Move into the slide*); charts from the same data (`chart`, planned) · todo · —

### AI authoring

### Tooling
- [ ] **I-060** [tooling] Playwright smoke tests for viewer and editor (would also give `render.js` automated tests, which need a DOM)
- [ ] **I-061** [tooling] Claude Code slash commands in `.claude/commands/` (e.g. `/new-layout`, `/new-block-type`)
- [ ] **I-062** [tooling] Publish script: copy viewer + shared + vendor + template + show to a static host

## Done

- [x] **I-106** [template-editor] **Template editor, phase 1: theme designer** (Lucas's decisions 2026-10-15: a new app `template-editor/`; token values rewritten in place, D-017; only the tokens a template declares). Start from a template or open a template folder; colours with links between tokens and WCAG AA checks, fonts with `.woff2` upload, sizes; the Template tab (name, id, version, description, style guide fonts); live audience and reader preview in an iframe (demo shows or a generated slide per layout, 16:9 / 4:3); undo / redo; Save, Save as folder…, Download .zip; `template.json` keeps its formatting and its style guide colours follow their tokens. The other parts of the original idea are I-111 … I-115; contrast findings in the shipped templates are C-009. Spec `docs/specs/I-106-template-editor.md` · done 2026-10-15 · claude
- [x] **I-080** [docs/tooling] **Prompt kit: let any AI chatbot write a Slipr show.** A ready-made instruction that users can copy or download, add their own content brief to, and paste into Claude, ChatGPT, Copilot or similar. The chatbot answers with a valid `show.json`.
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
  - **Related:** I-027 (AI assist inside the editor), I-018 ("Ask this show"), I-022 (Markdown outline view). Spec with Lucas's decisions: `docs/specs/I-080-prompt-kit.md`. Built: `npm run prompt` writes *full* and *compact* prompts per template into `docs/ai/prompts/` (committed, a test fails when they are stale), teaching the core of format 0.2 (no overlays, web pages, PDFs, graphs, maps or CSV files; layouts that need them are listed under *Do not use*); the viewer's **Create with AI** page (`viewer/create-with-ai.html`, from the start page and the manual) fills in the brief, with **Copy** and **Download .md**; **Copy fix-up prompt** on the validation-error page. Three shows written from the prompt by Claude validated first time; the ChatGPT and Copilot tries are C-008. The editor button stays with I-027. `shared/prompt-kit.js`, `tools/prompt-kit.js`, `viewer/js/create-with-ai.js` · done 2026-10-15 · claude
- [x] **I-105** [format/viewer/editor] **Tag cloud / word cloud from CSV data (`tag-cloud` slot and block)**:
  - **Data source**: external `.csv` file in `data/` (e.g. `data/keywords.csv`) or inline CSV block with terms and optional weights or frequencies (`term, weight`), parsed client-side with zero external runtime dependencies (D-001/D-002).
  - **Layout & visual design**: font sizes scaled proportionally to weight/frequency; colors styled with template tokens (`--slipr-graph-*` or accent palette); clean spatial packing that stays legible and fits the slide aspect ratio.
  - **Glossary integration (D-015)**: tags matching glossary entries (`show.glossary[term]`) automatically link to their glossary definitions. In **Reader mode**, clicking a tag opens its glossary popover with term details, aliases, markdown notes, and related slides.
  - **Audience mode**: clean presentation view for key themes, survey results, or audience keywords; optional steps to pulse, highlight or reveal top terms on clicks.
  - **Reader mode**: fully interactive with glossary popovers, click-to-filter related slides, and inclusion of terms in the reader full-text search index (`/`). Spec with Lucas's decisions: `docs/specs/I-105-tag-cloud.md`. Built as a flowing, centred cloud (heaviest in the middle), inline terms or a CSV file (rows counted when there is no weight column), glossary links by name or alias, reveal / highlight steps (no pulse), a reader popup with the definition and the slides that mention the term, and the full editor; not the converter. `shared/embeds/tag-cloud.js`, `editor/js/tag-cloud-values.js`, `editor/js/ui/tag-cloud-fields.js` · done 2026-10-15 · claude
- [x] **I-104** [format/viewer/editor] **Interactive data tables from CSV (`table` slot and block)**:
  - **Data source**: external `.csv` file in `data/` (e.g. `data/sales.csv`) or inline CSV string; parsed client-side with zero external runtime dependencies (D-001/D-002); packaged in single-file HTML exports and zip archives.
  - **Presentation & styling**: clean layout styled with `--slipr-*` template tokens, zebra striping, sticky header row, and auto-alignment (numbers right-aligned, text left-aligned, dates/codes centered).
  - **Scrollable & pinned**: scrollbars when rows exceed visible limit (`maxRows` or container height) and when columns exceed container width; sticky header stays fixed while scrolling rows; optional pinned first column stays fixed while scrolling horizontally.
  - **Sorting & filtering**: optional interactive sorting (click column header to toggle ascending / descending / original order) and text filter / search box to instantly filter rows.
  - **Aggregates & totals**: optional summary footer row with calculated totals (sum, average, min, max, count) for numeric columns.
  - **Column controls**: hide specific columns (via author config or interactive toggle), customize display headers, and specify column formatting (currency, percentage, decimals, date).
  - **Audience mode**: clean slide layout; optional step-by-step row reveals or highlighting on clicks (Reveal fragments).
  - **Reader mode**: full interactivity with search, column sorting, pagination/filter, "Copy to clipboard", and "Download CSV"; cell text is indexed for reader full-text search (`/`). Spec with Lucas's decisions: `docs/specs/I-104-table.md`. Built with the full editor, CSV or inline rows, sorting and filter in both modes, row reveal / highlight steps, colour scales / bars / sign colours and Markdown cells; not the converter (I-040). `shared/csv.js`, `shared/embeds/table.js`, `editor/js/table-values.js`, `editor/js/ui/table-fields.js` · done 2026-10-14 · claude
- [x] **I-103** [editor] **Enlarged preview in a near-full-page dialog**, for easier editing of text elements, extra images and other things placed on the slide:
  - A **⤢ Enlarge** button in the preview header (and a shortcut, e.g. `F11` or `Ctrl+Shift+E`) opens the slide preview in a modal dialog that fills almost the whole window (e.g. 96 vw × 92 vh, the slide scaled to fit at 16:9); **Esc**, ✕ or the button again closes it.
  - Same renderer and the same editing as the side pane: select, drag, resize and keyboard-move extra images and text elements (`mountOverlayEditor`), double-click a text element to edit its text; every change is one undo step, and the side pane and form follow while the dialog is open.
  - A slim bar in the dialog: slide number and title with ‹ › to the previous / next slide (or PageUp / PageDown), Audience / Reader switch, and a compact panel (or the selected element's style controls) so a text element can be styled without closing the dialog.
  - Focus moves into the dialog and back to the button on close; works in light and dark theme; theme tokens only.
  - Update `editor/help.html` (Live preview) and the shortcut table. Built with `Ctrl+Shift+E` and the *Extra images and text* section as the panel beside the slide. `editor/js/ui/preview-dialog.js` · done 2026-10-14 · claude
- [x] **I-102** [editor] **One-row top bar, grouped by task** (proposal 2026-10-14; the bar now has 17 controls on two rows). Saves a row of height (about 45 px) for the form and preview:
  - **File ▾** menu next to the show title: New show…, Open folder… (new shortcut `Ctrl+O`), Open zip…, the recent shows (the start screen's remembered folders), Save (`Ctrl+S`), Export as one HTML file…, Export as zip…. Replaces six buttons; the two exports get clear names.
  - Show title with the unsaved-changes dot, then **Save** as the one visible primary button.
  - **Undo, Redo, Find** as icon buttons with tooltips (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+F`).
  - **Grid, Glossary, Library** keep their labels (editor views).
  - Right side: **Read** and **Present ▶** (Present the more prominent), then **⋯ More**: theme (System / Light / Dark), Help (`F1`), keyboard shortcuts.
  - Narrow windows: Grid, Glossary and Library move into ⋯ instead of wrapping to a second row.
  - Menus follow the menu-button pattern (arrow keys, Enter, Esc, `aria-haspopup` / `aria-expanded`), vanilla JS; theme tokens only (`theme-contrast` test).
  - Update `editor/help.html` (the screen, toolbar, shortcuts) and the README table.
  - Questions for Lucas: keep **Save** visible (recommended) or only in File + `Ctrl+S`? Theme in ⋯ (recommended) or still a visible control? Built with both recommendations (Save visible, theme in ⋯). `editor/js/ui/toolbar.js`, `editor/js/ui/menu-button.js`, `editor/js/menu-nav.js` · done 2026-10-14 · claude
- [x] **I-101** [editor] Collapsible slide list: ◀ in its header (or `Ctrl+\`) collapses it to a rail of slide numbers (current slide highlighted, titles as tooltips and for screen readers) so the slide form and the preview get its width (the preview may grow to 1280 px); ▶ or `Ctrl+\` expands it; remembered in `localStorage`. `editor/js/sidebar.js` · done 2026-10-14 · claude
- [x] **E-020** [editor] Graph editor: the `graph` slot and a new **Graph** reader block type get a live mini graph (+ Node, 🔗 Connect two nodes, click a node to open its row, Fit, snapshot as fallback with an alt text naming the nodes), rows for nodes, links, layout and the build-up while presenting, a data file picker (into `data/`; the file's nodes read-only, **Move into the slide** to edit them), caption and fallback image. Fixed on the way: a fallback image on a graph slot added web page fields. `editor/js/graph-values.js`, `editor/js/ui/graph-fields.js`. Spec: `docs/specs/I-074-graph.md`, section *Graph editor* · done 2026-10-14 · claude
- [x] **E-021** [editor] Map editor (Lucas's decisions 2026-10-14: mini map in the form, snapshot, full scope): the `map` slot and a new **Map** reader block type get an interactive mini map (click to add places, drag pins, use this view, fit to places, snapshot as fallback with an alt text naming the places), rows for places, the tour while presenting, GeoJSON layers (file picker into `data/`), background (OpenStreetMap / none / show folder / other server), while presenting, load, caption and fallback image. `editor/js/map-values.js`, `editor/js/ui/map-fields.js`. Spec: `docs/specs/I-075-map.md`, section *Map editor* · done 2026-10-14 · claude
- [x] **I-099** [format/viewer] Local map tiles everywhere (I-075 follow-up), without a format change: folder and zip shows read tiles through the context's `readAsset` (passed by `hydrateEmbeds`, also in the editor preview); the single-file export lists the tile folder (`packShow` `listFiles`: `npm run export`, editor Export… for folder shows) and packs the tiles the template names; fixture `shows/fixtures/local-tiles/`. Spec: `docs/specs/I-075-map.md` · done 2026-10-14 · claude
- [x] **I-100** [editor] Double-click a slide in the show grid opens it in the editor (grid closes, the slide is selected in the slide list, Slide tab and preview). The handler existed, but every click re-renders the cards, so the browser's own `dblclick` never fired: the grid now counts two plain clicks on the same slide (`event.detail`, or within 500 ms) · done 2026-10-14 · claude
- [x] **I-029** [editor] Slide library (Lucas's decisions 2026-10-14): copy slides (show grid selection, or the current slide) into a library in the browser (IndexedDB `slipr-library`) with their files, reader layer and glossary terms, tags, note and collection; **📚 Library** browses (thumbnails in this show's template, search, filters, sorting) and inserts after the current slide in one undo step: same layout or the best fit (content kept aside), links between inserted slides remapped and others removed, unknown profiles removed, glossary terms added (the show's win), files copied or renamed on a clash, chapter of the slide before; manage title / tags / note / collection / order (drag, ▲ ▼), update from the current slide, remove, collections, export / import as zip. Spec: `docs/specs/I-029-slide-library.md` · done 2026-10-14 · claude
- [x] **I-075** [format/viewer] Interactive maps with vendored **Leaflet 1.9.4** (D-011 refined): `map` slot and block (show format 0.2) with `center` / `zoom`, `markers` (position, title, Markdown, tags, linked slide), GeoJSON `layers` from the show folder and `tiles` (OpenStreetMap by default with its attribution, another https server, tiles in the show folder, or `"none"`); audience `steps` fly from place to place; reader pan / zoom / Fit, place panel with "Go to slide", place list, tag filter; pins and layers in the template's graph palette by tag; click-to-load in reader mode, live in audience mode (`present: "static"` for none), static place list and fallback image; `map` layouts in both templates (default 1.5.0, Conclusion 0.1.6); demo slide with an offline map block; export (Leaflet only for shows with maps); editor read-only (E-021); local tiles beyond served shows: I-099. Spec: `docs/specs/I-075-map.md` · done 2026-10-13 · claude
- [x] **I-098** [viewer] Grid overview in audience mode (`Esc` / `O`): thumbnails wrapping to the window, grouped by chapter, the row under the mouse or keyboard focus enlarged 1.25 × while the others make room; click / Enter goes to the slide at its start, arrow keys move, Esc returns; replaces Reveal's single-row overview (`viewer/audience/grid-overview.js`) · done 2026-10-13 · claude
- [x] **I-003** [viewer] Laser pointer (`L`), spotlight (`K`) and pen (`D`; `X` erases) in audience mode: own vanilla module `viewer/audience/presenter-tools.js` (Lucas: no third-party plugin), drawings per slide until a reload, template accent color, touch-safe, `Esc` turns tools off · done 2026-10-13 · claude
- [x] **I-091** [viewer/format/editor] Morph transition for pictures between auto-animate slides: a Slipr `autoAnimateMatcher` (`viewer/audience/morph.js`) pairs pictures by `morphId`, file or slot and animates width / height (no distortion), crop, focus, opacity and radius; `morphId` on image values (show format 0.2); editor **Morph name** field; reduced motion turns it off; demo slide `s-ai-detail`. Spec (with the Reveal spike): `docs/specs/I-091-image-morph.md` · done 2026-10-13 · claude
- [x] **I-087** [viewer/shared] **Load and present a show from a zip-file URL (`?zip=<url>`)**: client-side download via `fetch()` with live progress bar; in-memory decompression via Web Streams `DecompressionStream('deflate-raw')` keeping D-001/D-002 (zero build step, zero backend); adapts unzipped files into an in-memory source with `blob:` object URLs; GitHub archive auto-detection (single-directory wrapper) and optional `&path=` resolution for multi-show repos; audience and reader mode presentation (`&mode=reader`) with deep link and personal annotation preservation; clear diagnostics for CORS restrictions, missing files, and 404s · done 2026-10-13 · gemini
- [x] **I-090** [format/editor/viewer/converter] Image cropping: `crop` (`{ x, y, w, h }`, fractions of the picture) on every image value (show format 0.2); rendered with `object-view-box` and a canvas fallback (`shared/crop.js`); hotspots stay positions on the whole picture (hidden and flagged outside the crop); editor **Crop…** dialog with shapes, numbers and keyboard, hotspot editor maps to the crop; converter keeps PowerPoint's picture crop. Spec: `docs/specs/I-090-image-cropping.md` · done 2026-10-13 · claude
- [x] **I-074** [format/viewer] Graphs with vendored **Cytoscape.js 3.34.3** (D-011 refined): `graph` slot and block (show format 0.2) with inline `nodes` / `edges` or a `data/*.json` file, `layout`, and audience `steps` that reveal nodes or focus one; node colors from the template by tag (`--slipr-graph-*`); reader pan, zoom, node panel with "Go to slide", tag filter, keyboard node list; static node list as fallback and for screen readers; `graph` layouts in both templates (default 1.4.0, Conclusion 0.1.5); demo slide and data-file block; export; editor read-only (E-020). Spec: `docs/specs/I-074-graph.md` · done 2026-10-13 · claude
- [x] **I-089** [format/editor/viewer/converter] Text elements on slides (D-016): overlays with `text` (inline Markdown) and a free `style` (font, size, bold / italic / underline / uppercase, alignment, colors, fill opacity, border, radius, text outline, padding) in show format 0.2; `shared/text-style.js`; rendered in both modes (reader search, glossary terms); editor **+ Add text** with palette-first style controls, free resize and keyboard moves on the preview; the converter turns badges, callouts and leftover text boxes into text elements with their look (theme colors resolved). Spec: `docs/specs/I-089-text-elements.md` · done 2026-10-13 · claude
- [x] **V-019** [viewer] User manual inside the viewer: `viewer/help.html` (comprehensive offline guide for audience and reader experiences, phone remote control pairing, mobile ergonomics, Wi-Fi hotspot setup with Windows Defender Firewall Private profile and Node.js rule fixes, interactive blocks, popups, personal annotations, full-text search, keyboard and clicker cheatsheet, and troubleshooting; light and dark themes, offline-first), opened via `?` / `F1` in both modes, top-bar Help button in Reader mode, pairing dialog tip, and viewer start screen · done 2026-10-13 · claude
- [x] **I-002** [viewer/tools] Phone as remote control: next/previous tactile buttons and swipe navigation, live speaker notes with font scaling, upcoming slide peek, presentation timer, haptic feedback and wake lock, zero-dependency local WebSocket relay (RFC 6455 over Node.js http) with LAN IP discovery, and instant QR-code pairing modal · done 2026-10-12 · claude
- [x] **I-020** [editor] Autosave draft to IndexedDB with crash recovery: automatic persistence to IndexedDB every 5 s while dirty, flush on tab hide/close, recovery dialog on open with relative timestamps, undoable restoreDraft action, banner fallback, and cleanup on clean save · done 2026-10-12 · claude
- [x] **I-088** [editor] Dedicated Glossary Editor with deck-aware word completion: split view, search, filters, sorting, real-time deck word autocompletion and unglossaried suggestions drawer, ID rename with show-wide reference rewriting, live Markdown preview, and slide jump navigation · done 2026-10-12 · claude
- [x] **I-072** [format/viewer] PDF document: spike chose vendored **PDF.js 4.10.38** (D-011 refined); `pdf` slot and block (show format 0.2) with `page` or `pages: [first, last]`, files from the show folder or https (click-to-load); audience mode fits the page and steps through a range on clicks; reader blocks with page navigation, zoom and screen-reader text; PDF text in reader search (on first use, results open at the page); `pdf` layouts in both templates (default 1.3.0, Conclusion 0.1.3); editor fields with **Choose PDF…** (copied to `docs/`); works in the single-file export. Spec: `docs/specs/I-072-pdf-document.md` · done 2026-10-12 · claude
- [x] **I-071** [format/viewer] Website embed: `web` slot (show format 0.2) with a `web` layout in both templates (default 1.2.0, Conclusion 0.1.2); `allow` sandbox extras from an allow-list (`same-origin` for other servers only), `aspect` or height on the `embed` block, "Open in new tab" below loaded frames, link card / screenshot fallback; audience mode `present: "live"` (no Load button) or `"static"` (screenshot); editor fields for both (`ui/web-fields.js`). Spec: `docs/specs/I-071-website-embed.md` · done 2026-10-12 · claude
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
