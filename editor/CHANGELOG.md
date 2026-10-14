# Changelog: Editor

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-14: Slide library (I-029)
- **Added** a slide library in the browser (IndexedDB `slipr-library`): **Copy to library…** in the show grid's selection bar and **Copy current slide…** in the library copy slides with their files, reader layer and glossary terms, with tags, a note and a collection. **📚 Library** in the toolbar browses it (thumbnails in this show's template, search, tag / collection / template / source filters, sorting) and inserts the selected slides after the current one in one undo step: layouts switched when this template lacks them (content kept aside), links between inserted slides remapped and others removed, missing profiles removed, glossary terms added (the show's own win), files copied (renamed on a clash), chapter of the slide before. Manage entries (title, tags, note, collection, order by drag or ▲ ▼, update from the current slide, remove), collections, and export / import the library as a zip. Modules `js/library/` and `ui/library-dialog.js`; action `insertSlides`. Spec `docs/specs/I-029-slide-library.md`.

### 2026-10-13: Maps, read-only (I-075)
- **Added** map slots and blocks show a summary ("Map: 3 places, 3 steps, OpenStreetMap tiles") with a link to the new **Maps** section of the manual, and are edited in show.json for now; the preview draws them. Saving keeps the key order of maps, markers, layers, tiles and steps.

### 2026-10-13: Morph name (I-091)
- **Added** a **Morph name** field under every picture, next to Crop… (cleaned to letters, digits, `-` and `_`; empty removes it), to pair two different pictures for the morph between auto-animate slides.

### 2026-10-13: Export and import zip archives (.zip / .slipr) in editor (I-092)
- **Added** **Export to zip archive (`.zip` / `.slipr`)**: an **Export Zip…** action in the editor toolbar (`editor/js/export-zip.js`). Packages `show.json`, referenced images, data files, and local documents in memory (including unsaved edits). Compresses client-side using standard Web Streams (`CompressionStream('deflate-raw')`) via `shared/zip.js` with pure JS CRC-32 and UTF-8 filenames; triggers `showSaveFilePicker` (`.zip` / `.slipr`) or browser download.
- **Added** **Import from uploaded zip archive**: an **Open zip archive…** button on the start screen and an **Open Zip…** button in the toolbar (`editor/js/files.js`). Decompresses client-side in memory without server upload; handles root shows, single-directory wrappers (e.g. GitHub archives), and prompts if multiple presentations are found.
- **Added** cross-browser editing and in-memory asset support: enabled authoring, image drop/paste, and zip re-exporting in browsers lacking the File System Access directory picker (Firefox, Safari). Saving an unzipped show offers saving as zip or extracting/saving to a disk folder.
- **Added** unit test suite `editor/test/export-zip.test.js` (5 tests) and extended `shared/test/zip.test.js` (22 tests).

### 2026-10-13: Crop pictures (I-090)
- **Added** **Crop…** on every picture (image slot, card image, reader image, extra image): a dialog with a frame to drag and resize, shapes (free, like the picture, 1:1, 4:3, 3:2, 16:9, portrait), Left / Top / Width / Height in %, keyboard moves; one undo step. **Show the whole picture** removes the crop. Picture style previews show the crop (`ui/crop-dialog.js`, `js/crop-values.js`, tested).
- **Changed** the hotspot editor shows a cropped picture cropped and maps clicks, drags and arrow keys to positions on the whole picture; a hotspot outside the crop has no marker and its row says so.

### 2026-10-13: How to write a graph (I-074)
- **Added** the manual section **Graphs** (`help.html#graphs`): a slide example, every field, steps, data files, reader blocks, colors and the checks. Graph slots and blocks link to it (`GRAPH_HELP` in `js/help.js`), and the summary names a data file instead of counting 0 nodes.

### 2026-10-13: Graphs, read-only (I-074)
- **Added** graph slots and blocks show a summary ("Graph: 7 nodes, 8 links, 3 steps") and are edited in show.json for now; the preview draws them. Saving keeps the key order of graphs, nodes, edges and steps.

### 2026-10-13: Collapsible rows for extra images and text elements
- **Changed** each row in **Extra images and text** is collapsed by default to one line (number, thumbnail or text, tools); its header (▸) expands the settings. A new overlay and the one selected on the preview open by themselves; the state survives re-renders and follows ▲ / ▼ and delete (`isOverlayExpanded()` and friends in `ui/overlay-editor.js`).

### 2026-10-13: Selecting on the preview shows the settings
- **Added** selecting an extra image or text element on the preview (click, or Tab to it) highlights its row in the Slide tab and scrolls the whole row into view, so its fields are ready to edit; keyboard focus stays on the preview. No animation with reduced motion (`revealOverlayRow()` in `ui/overlay-editor.js`).

### 2026-10-13: Text elements on slides (I-089, D-016)
- **Added** the Slide tab section **Extra images and text** (was *Extra images*): **+ Add text** places a text element in the middle of the slide and selects its text. A text row has the text (inline Markdown) and its look (`ui/text-style-controls.js`): font and size (the template's first), bold / italic / underline / uppercase, alignment, text color and fill from the template's palette or a color picker, fill opacity, and folded away border, corners, padding and text outline.
- **Added** text boxes on the audience preview: moved like extra images, resized freely (Shift keeps the ratio), Alt+Left / Right width and Alt+Up / Down height, and double-click or Enter (when selected) jumps to the text.
- **Changed** each extra image and text element has **Left / Top / Width / Height** number fields (in % of the slide) instead of a read-only "at x, y · w × h" line.
- **Added** actions: `addOverlay` / `updateOverlay` take text elements and clean their style (`cleanTextStyle`); find & replace include their text. The manual has a *Text elements* section.

### 2026-10-12: Autosave draft to IndexedDB with crash recovery (I-020)
- **Added** draft storage module (`io/draft-store.js`): persists unsaved show drafts into IndexedDB (`slipr-drafts`, object store `drafts`), falling back to `localStorage` or in-memory storage. Keyed stably by folder key (`folder:<key>`), show URL (`url:<url>`), or show ID (`id:<id>`).
- **Added** automatic background autosaving (`startAutosave`): checks dirty status every 5 seconds and persists modified shows without redundant serialization. Flushes immediately upon `visibilitychange` (tab hidden), `pagehide`, and `beforeunload`.
- **Added** crash recovery on open (`checkDraftRecovery`, `openDraftRecoveryDialog`): detects unpersisted drafts when opening a show, displays a recovery dialog showing draft timestamp (`formatDraftTime`), and offers **Restore draft** or **Discard draft**. Restoring dispatches the `restoreDraft` action, placing the draft into the editor with the pre-restoration disk show preserved in the undo stack (`Ctrl+Z` to undo).
- **Added** banner recovery fallback: dismissing the recovery dialog leaves a non-intrusive banner with one-click **Restore draft** and **Discard** actions.
- **Added** draft lifecycle integration: successful disk saves (`save(store)`) and intentional discards in folder switches automatically remove the draft from IndexedDB.
- **Added** 15 unit tests in `editor/test/draft-store.test.js`.

### 2026-10-12: Dedicated Glossary Editor with deck-aware completion (I-088)
- **Added** a dedicated, full-screen Glossary Editor (`ui/glossary-editor.js`, `glossary-model.js`): split view with real-time search, filters (`All`, `In Use`, `Unused`, `No Def`), and sorts (`A → Z`, `Z → A`, `Most used`, `Least used`). Accessible via the toolbar (`📖 Glossary`), the Show Settings panel, and keyboard shortcut (`Esc` closes, `↑`/`↓` switches terms, `Ctrl+N` or `+` adds a new term).
- **Added** deck-aware word completion: scans words, acronyms, CamelCase terms, and technical phrases across slides, cards, notes, and reader blocks to offer real-time autocompletion suggestions when typing term names, plus a **Deck suggestions** drawer that lists frequently occurring unglossaried terms with one-click addition.
- **Added** term editing and inspection: term name, stable ID with renaming that automatically rewrites all `[[oldId]]` occurrences across the presentation (`renameGlossaryTerm`, `renameGlossaryRef`), aliases / other names (`I-086`), external link with preview, and Markdown definition with live reader-mode popup preview.
- **Added** usage tracking and slide navigation: exact reference counts and list of slide references with one-click **Jump to slide →** navigation; orphaned term flagging with safe deletion (leaving references vs unlinking to plain text).
- **Changed** Show settings: replaced the cramped inline glossary card list with an overview card showing term counts, reference stats, quick term pills, and a launcher button for the dedicated Glossary Editor.

### 2026-10-12: PDF slots and blocks (I-072)
- **Added** a field editor for `pdf` slots and a **PDF Document** block type (`ui/pdf-fields.js`): file path or https address, **Choose PDF…** (copied into the show's `docs/` folder with a content hash, `addPdf()`, `pdfPath()`), title (taken from the file name when empty), pages (first and last), click-to-load for remote PDFs, and the fallback image (`fallbackImageField()`, now shared with web pages). `pdfValue()`, `pdfPagesPatch()`; `setSlot` and `setBlockType` raise a 0.1 show to 0.2; key order for PDF values follows the schema.

### 2026-10-12: Web page slots and page options (I-071)
- **Added** a field editor for `web` slots (Slide tab): address, title, **While presenting** (live page / fallback image), click-to-load for reader mode, **Allow the page to…** (same origin, full screen, dialogs, downloads, presentation) and the fallback image (`ui/web-fields.js`, `addFallbackToSlot()`). The Embedded Page block uses the same fields, plus **Size** (fixed height or an aspect ratio). Choices re-render the form; typing coalesces. New helpers `webValue()`, `toggleAllow()`; `setSlot` raises a 0.1 show to 0.2 for a web page; key order for web values follows the schema.

### 2026-10-12: Click-to-load and fallback image for embedded pages (I-070)
- **Added** to the Embedded Page block editor: **Load straight away, without asking the reader** (stored as `load: "auto"`; off by default, so a page from another site waits for a click) and an optional **fallback image** with alt text and a Remove button (choose, drop or paste; `addImageToBlock()` takes a `field`). `updateBlock` raises a 0.1 show to format 0.2 for either; changing the block type keeps them; `show.json` key order follows the schema.
- **Changed** the preview and the show grid call `hydrateEmbeds()`; grid thumbnails show embedded pages as their link card (or fallback image) instead of loading them.

### 2026-10-12: Other names for glossary terms (I-086)
- **Added** an **Other names** field per glossary term in Show settings (comma-separated), stored as `aliases`; `upsertGlossaryTerm` keeps them on other edits (it used to rebuild the entry from term, definition and link only) and sets the show to format 0.2 for the first one. New helper `glossaryAliases()`. The reader preview links terms on the slide, like the viewer.

### 2026-10-11: Picture styles and opacity (I-084)
- **Added** a style picker and an opacity slider to every image field with a picture: image slots, card images, reader image blocks and extra images (`ui/picture-style.js`). The picker shows "None" and one button per picture style of the template, each with this picture in that style (the template's `.slipr-picture-<id>` classes are loaded in the editor page). The slider (0–100 %, 5 % steps) updates its readout while dragging and stores on release, so a form re-render never interrupts a drag; 100 % removes `opacity`. A style the template lacks is reported with a "Remove it" button.
- **Added** `usesPictureStyle()`: `setSlot` and `updateBlock` raise a 0.1 show to format 0.2 when a picture gets a style or opacity. Tests in `editor/test/picture-style.test.js`.

### 2026-10-11: Extra images on a slide (I-083)
- **Added** an "Extra images" section in the Slide tab (`ui/overlay-list.js`): add an image (choose, drop or paste, with the alt-text dialog), and per image its picture, alt text, "appears on the next click" (with an effect), bring forward / send backward, select on the preview, and remove. A new image is placed in the middle at 30 % of the slide width with its own aspect ratio (`createImageBitmap`; SVG from its `viewBox`).
- **Added** move and resize on the audience preview (`ui/overlay-editor.js`): click to select, drag to move, drag a corner to resize keeping the aspect ratio (Shift: free); arrow keys move (Shift: 5 %), Alt+arrows resize, Delete removes, Esc deselects. A drag is one undo step, and so is a burst of key presses.
- **Added** actions `addOverlay`, `updateOverlay`, `deleteOverlay`, `moveOverlay` (boxes kept inside the canvas, rounded to 4 decimals; the first extra image makes the show format 0.2), helpers `overlayBox`, `newOverlayBox`, `resizedOverlayBox`, and `addOverlayImage` / `addImageToOverlay` in `image-input.js`. The serializer orders overlay keys. Tests in `editor/test/overlays.test.js`.

### 2026-10-11: Light and dark theme (I-082)
- **Added** a light theme and a theme switch at the end of the toolbar: ☀ Light, ☾ Dark, ◐ System (follows `prefers-color-scheme`, also when it changes). The choice is kept per browser in `localStorage` (`slipr-editor-theme`), and an inline script in `index.html` applies it before the first paint (no flash). The manual (`help.html`) follows the same choice instead of only the system setting. New module `theme.js`.
- **Changed** the dark theme to a lighter "dimmed" palette (dark grey `#22272E` instead of near-black `#0E1116`).
- **Changed** every colour in `editor.css` to go through `--slipr-editor-*` tokens (new: `border-strong`, `hover`, `selected`, `text-strong`, `link`, `indicator`, `on-color`, `danger-strong`, `success-text`, `accent-2`, `preview-bg`, `shadow` and hover variants); tints are `color-mix()` of tokens. Only the white behind slide thumbnails and template fallbacks stay literal.
- **Added** `editor/test/theme-contrast.test.js`: reads both themes (editor and manual) from the CSS and checks WCAG AA (4.5:1 text, 3:1 indicators) for every text/background pair used, that both themes define the same tokens, and that no colour is hard-coded outside the token blocks. It caught two dark-theme problems that are fixed: white on the Save button's hover green, and blue selection borders on dark panels (now the `indicator` token).
- **Fixed** the slide list header squeezing its buttons in a narrow sidebar (it wraps now), and the Present button turning brown on hover.

### 2026-10-11: Show grid chapter in the user manual
- **Changed** the manual's *Show grid* section into a full chapter: when to use it, opening and closing (`Esc` first clears the selection), what the cards, groups, *continued* and badges mean, selecting, rearranging slides and chapters, batch changes in the selection bar, that the chapter order follows the slides (agenda, contents, Show settings), keys, and a worked example (a backup chapter).

### 2026-10-11: Export chapter in the user manual
- **Changed** the manual's *Export as one file* section into a full chapter: when to use it, exporting step by step (fix errors first; unsaved changes included; shows opened by address only from inside the Slipr folder), opening an exported file in audience and reader mode, what the file contains and what not, changing an exported show, and the export messages.

### 2026-10-11: Show grid (I-081)
- **Added** the show grid (`ui/show-grid.js`): a full-width view of all slides as thumbnails, in show order and grouped into chapter runs as reader mode groups them (a chapter that returns later is marked *continued*), with badges for backup and reader-hidden slides and for errors and warnings. Opened with **▦ Grid** (toolbar) or **▦** (slide list header). Select with click, Ctrl/Cmd-click, Shift-click or the keyboard; drag slides (they join the chapter they are dropped in) and chapters (all their slides move); a selection bar to duplicate, hide or show, assign a chapter, make a new chapter, move (◀ ▶, Alt+←/→) and delete; rename, move (▲ ▼) and delete chapters; empty chapters as drop targets; **+ Add slide…** with the layout picker. Up and down arrows go by what is on screen (rows restart per chapter). Thumbnails are cached per slide object and draw Mermaid diagrams.
- **Added** batch actions, each one undo step: `moveSlides`, `duplicateSlides`, `deleteSlides` (never all slides), `setSlidesHidden`, `setSlidesChapter`, `moveChapter`, `createChapterFromSlides`, and `syncChapterOrder` (chapters in the order of their first slide, so the agenda follows), with `show-grid-model.js` (runs, empty chapters, range selection, grid keys). Tests in `editor/test/show-grid.test.js`.
- **Added** "Show grid" to the manual and the README.

### 2026-10-11: Glossary chapter in the user manual
- **Added** a *Glossary* section to `help.html`: adding and changing terms, the term's id (fixed at creation, so new terms get `new-term`, `new-term-2`…), using terms with the insert toolbar or by hand (`[[id]]`, `[[id|words]]`), finding where a term is used, the two ways to delete a used term, what readers get, and the warnings. Show settings, Key ideas and the Markdown section link to it.
- **Fixed** the manual scrolling sideways on phones: the narrow layout's column could not shrink below its widest code block.

### 2026-10-11: Export… button (I-085)
- **Added** **Export…** in the toolbar: save the open show as one HTML file that presents offline, with the same packer as `npm run export` (`shared/export/single-file.js`). The show is exported as it is in the editor, unsaved changes included (show.json comes from the editor's state; images and other show files from the show folder, or from the server for a show opened by URL; viewer and template from the Slipr server). The save dialog opens first, inside the click; without one the file is downloaded. New module `export.js`.
- **Added** "Export as one file" to the manual (`help.html`).

### 2026-10-11: User manual (E-016)
- **Added** `help.html`, the editor's user manual: getting started, key ideas, the screen, opening / creating / saving, the slide list, the Slide tab, images, the Reader tab, hotspots, a Markdown reference with the insert toolbar, show settings, preview and problems, find and replace, Present and Read, undo, keyboard shortcuts and troubleshooting. A static page (`css/help.css`, light and dark, phone width, printable) with a contents list.
- **Added** ways to open it: **? Help** in the toolbar, a link on the start screen, and `F1`, which opens the section for the current tab (Slide, Reader or Show settings). `js/help.js` holds the address and the sections; `test/help.test.js` checks that those sections and every link inside the manual exist, and that it loads nothing from the network.
- **Changed** `README.md` into a short overview (status, quick start, a table of what the editor does with links into the manual, browser requirements), so the detailed guide lives in one place.

### 2026-10-11: The last missing controls; Phase 5 done (E-015)
- **Added** to the Slide tab: **Tags** (comma-separated), and an **Audience mode** group with **Build step by step** (off, one by one, or one by one with a Reveal effect such as `fade-up`), **Auto-animate**, the **transition into this slide** (or the show default), and **Hide from audience mode**. New action `setSlideAudience`.
- **Added** a **Fit** choice to image fields: as the layout decides, fill the frame (`cover`), or show the whole image (`contain`).
- **Added** to Show Settings: **Language** (checked as a language code), **Description**, **Tags**, **Show slide numbers**, **Agenda slide before each chapter**, and all six transitions plus "Reveal default". The date field is a date picker.
- **Fixed** emptied metadata and settings being stored as `""`, which made the show invalid for `date` and `language`: `setMeta` and `setSettings` now remove keys set to `undefined`, and empty optional fields are removed.
- **Checked** Phase 5's "done when": every field used by `shows/demo/show.json` now has an editor control.

### 2026-10-11: Find & replace shortcuts (E-014)
- **Fixed** `Ctrl+F` / `Ctrl+H` throwing `ReferenceError: onFindReplace is not defined` instead of opening Find & Replace: `registerShortcuts()` now takes the `onFindReplace` handler that `main.js` passes.

### 2026-10-11: Live preview checked (E-005, done)
- **Checked** the preview against the viewer: reader mode filters blocks with the viewer's own `personalize()` (profile and depth give the same blocks as the viewer), follows `showSlide`, and shows the slide's errors and warnings.
- **Added** a note above the preview when the viewer would not show the slide the normal way: a backup slide in audience mode ("shown after the last slide, unnumbered"), or a slide hidden from reader mode.
- **Fixed** the reader preview of a reader-hidden slide showing all its blocks unfiltered: they are now filtered by profile and depth like any other slide's.

### 2026-10-11: Editors for tabs, embed and slide-ref blocks (I-036)
- **Added** a tabs editor: one group per tab with a label and Markdown text (with the insert toolbar); add, reorder and remove tabs (a tabs block keeps at least one, and a label is never stored empty).
- **Added** an embedded-page editor: the address (with a hint when it will not work: empty, a blocked scheme such as `javascript:`, or plain `http:`), a required title, and an optional height (at least 100 px; empty uses the default).
- **Added** a slide-link editor: pick the slide from the show (not the slide itself) and an optional label; an unknown target is shown so it can be replaced.
- **Added** `block-values.js` (DOM-free tab, embed URL and height helpers; tests in `editor/test/block-values.test.js`). Every reader block type now has an editor; only unknown types stay read-only.

### 2026-10-11: Slide list: drag and drop, hide toggle (E-003, done)
- **Added** drag and drop in the slide list: a line shows where the slide will land (above or below the slide under the pointer), the list scrolls near its top and bottom edges, and the moved slide is selected. One drop is one undo step. The keyboard alternative stays `Alt+↑` / `Alt+↓`.
- **Added** a hide toggle (◉ / ◌) on every slide in the list: hide it from audience mode (a backup slide; reader mode still shows it) or show it again. Hidden slides are struck through.
- **Added** `dropIndex()` in `slide-filter.js` (the `moveSlide` index for "before / after this slide"), with tests.

### 2026-10-10: Layout picker with previews (E-004, done)
- **Added** the layout picker (`ui/layout-picker.js`): the Slide tab's layout dropdown is now a button with the layout's name (and description) that opens a grid of every template layout, rendered by the shared renderer with **this slide's content**. Each layout says what switching does: "Keeps all content", "Hides Text (kept; switch back to restore)", "Brings back Photo", "Needs Agenda items". Arrow keys move through the grid (by row and column), Home / End, Enter chooses, Esc closes; the current layout is focused first.
- **Added** "▾" next to "+ Add" in the slide list: add a slide with a layout chosen from the same grid, previewed with sample text; the new slide is selected.
- **Added** `layout-choice.js` (DOM-free: the slide in another layout, the effects of a switch, sample content; tests in `editor/test/layout-choice.test.js`), and `openDialog()` is exported from `ui/dialogs.js` (with a wide variant).
- **Fixed** the layout dropdown showing layout ids (`text-image`) instead of names ("Text + image"): templates call it `name`, the form read `title`.

### 2026-10-10: Show settings: chapters, profiles, glossary and reading routes (E-009)
- **Added** editing of profiles (name, description), glossary terms (term, Markdown definition with the insert toolbar, link) and reading routes (name, description, "all slides" or an ordered list of slides), next to chapters, which gain a summary. Chapters, profiles and routes can be reordered (new action `moveShowItem`). New items get an id from their name and their name field gets focus with the text selected; ids never change afterwards.
- **Added** usage shown per item ("3 slides", "2 blocks tailored for it", "used 4×"), and deletes that explain their consequences: a chapter's slides lose their chapter; a profile is removed from blocks (a block only for that profile becomes visible to everyone); a glossary term lists where it is used and offers to keep the words as plain text (`deleteGlossaryTerm` with `unlink`).
- **Added** `show-entities.js` (DOM-free: unique ids, glossary references, unlinking, usage counts; tests in `editor/test/show-settings.test.js`) and a confirm dialog.
- **Fixed** emptied optional fields (chapter summary, profile or route description) being kept: `upsertChapter`, `upsertProfile` and `upsertPath` now remove keys patched to `undefined`. Required fields (titles, names, terms) are never stored empty; the field is marked instead.
- **Fixed** a form sometimes not re-rendering after a non-typing change while a text field had focus (for example a slide added to a route right after creating it): a typing echo is now recognised by its `coalesceKey`, which the store passes in the change event. Reader-block text, titles, caption and alt text now dispatch with a `coalesceKey`, so typing there is one undo step, like elsewhere.

### 2026-10-10: Reader tab: profiles per block, related slides, Markdown toolbar (E-008)
- **Added** a "For" picker on every reader block: one checkbox per reader profile (none checked = everyone). Profiles the show doesn't define are listed so they can be removed.
- **Added** related slides ("see also") per slide: add from a list of the other slides, reorder, remove; unknown ids are marked.
- **Added** "Show the slide above its reader blocks" (`reader.showSlide`, new action `setShowSlide`), for reader-only text pages. The editor's reader preview now follows it, like the viewer.
- **Added** a Markdown toolbar above block text, details, callout and hotspot fields: insert a glossary reference (`[[term]]`, or `[[term|selected words]]`), a popup (`^[…]`, around the selection or empty with the cursor inside) or a link to another slide (`[text](#slide-id)`). Inserts go through the field's input event, so they save and undo like typing. Logic in the DOM-free `markdown-insert.js` (tests in `editor/test/reader-tab.test.js`).
- **Changed** block headers so type, depth and "For" share a row and wrap only in a narrow inspector.

### 2026-10-10: Cards, quote and code editors (E-004, I-035)
- **Added** a cards editor for `cards` slots (the five Conclusion card layouts): one group of fields per card, generated from the slot's `fields` (text, rich text, list, image with the usual choose / drop / paste and alt text), a live "12 / 18" counter that turns yellow past `maxLength`, move up / down, remove (asks first when the card has content), and "+ Add card" up to `maxItems` (the new card's first field gets focus).
- **Added** editors for `quote` (text and source) and `code` (language and code; Tab indents, Esc then Tab leaves the field) slots.
- **Added** `card-values.js` (DOM-free value shapes, tests in `editor/test/card-values.test.js`), `ui/field-editors.js`, and `addImageToCard()` in `image-input.js`. Only `chart`, `diagram` and unknown slot types are read-only now.

### 2026-10-10: Find and replace across the show (I-025)
- **Added** global Search & Replace (`ui/find-replace.js`): find text and replace occurrences across audience slide slots, speaker notes, reader summaries and blocks, and show settings (metadata, chapters, glossary).
- **Added** a Find & Replace dialog opened by clicking the **🔍 Find & Replace** button in the toolbar, or with `Ctrl+F` / `Cmd+F` and `Ctrl+H` / `Cmd+H`. Supports case-sensitive matching, whole-word matching, live match results preview with `<mark>` highlight snippets, and clickable results that jump directly to the target slide.
- **Added** actions `replaceAllText` and `replaceSlideText` (with pure search helper `findMatches` in `actions.js`), allowing replacement across either the whole show or only within the currently selected slide, fully integrated with undo/redo.

### 2026-10-10: Hotspots and image blocks (E-006, done)
- **Added** the hotspot editor (`ui/hotspot-editor.js`) for reader image blocks: click on the image to place a hotspot (its title is focused and selected), drag a numbered marker to move it (one undo step), or with a marker focused nudge it with the arrow keys (Shift: 5 %) and remove it with `Delete`. "+ Add hotspot" places one in the middle for keyboard users. Each hotspot has a title and Markdown popup text.
- **Added** an image-block editor: the same image field as image slots (choose, drop, paste, alt-text dialog), alt text and caption.
- **Added** actions `setBlockType` (with `convertBlock()`), `addHotspot`, `updateHotspot`, `deleteHotspot`; `updateBlock` removes keys patched to `undefined`. Tests in `editor/test/blocks-hotspots.test.js`.
- **Fixed** the Reader tab writing invalid blocks: changing a block's type only changed `type` (leftover fields, missing required ones); callouts were written with `kind` (note/warning/tip) instead of the format's `variant` (info/tip/warning/quote); and tabs, embed, slide-ref and image blocks got a Markdown box that added an `md` field. Type changes now convert the block, the callout editor uses `variant` (plus an optional title), and tabs, embed and slide-ref are read-only until they get editors. The type picker now offers *Embedded Page* too.
- **Changed** the image field into `ui/image-field.js`, shared by image slots and image blocks; `image-input.js` gains `addImageToBlock()`.

### 2026-10-10: Images: choose, drop and paste (E-006, first part)
- **Added** to every image field a preview and three ways to add an image: **Choose…**, dropping an image file, and pasting from the clipboard (`Ctrl+V` in the field, the **Paste** button, or `Ctrl+V` anywhere outside a text field, which fills the slide's first empty image slot). The image is copied into `images/<slug>-<hash8>.<ext>`; an image already in the folder (same content hash) is reused. Then the alt-text dialog asks for a description. Large images (over 3 MB) get a notice.
- **Added** `io/images.js` (names, types; tests), `image-input.js`, `writeImage()` / `findImageBySuffix()` in `io/fs-access.js`, and the alt-text dialog.
- A show opened by URL first asks for its folder, like Save.
- Not yet: hotspot placement on reader images, and images inside cards (cards are still read-only).

### 2026-10-10: Inspector forms update after every change (E-013)
- **Fixed** the Slide, Reader and Show Settings tabs not re-rendering while focus was inside them. Changing the layout left the old layout's fields on screen (no image field after switching to `text-image`), and "+ Add Block", "+ Add Chapter" and undo/redo with a field focused showed stale content. A form now skips a re-render only for the echo of the user's own typing (`isTypingEcho()`: a text field in that form has focus and the action is one of its typing actions), and otherwise re-renders keeping focus, text selection and scroll position (`rerenderKeepingFocus()` in `dom.js`).

### 2026-10-10: Slide list scrolls, slide navigator (E-012)
- **Fixed** the slide list not scrolling: with more slides than fit, the rest could not be reached. Its panel was not a bounded flex column. The list also keeps its scroll position when it re-renders after an edit, and scrolls the selected slide into view.
- **Fixed** the toolbar hiding Open, New, Save, Present and Read in narrower windows: it now wraps.
- **Added** a slide navigator: "Go to slide" filter above the list (number, title words, layout, chapter; `Enter` jumps, `Esc` clears), keyboard navigation in the list (`↑`/`↓`, `PageUp`/`PageDown`, `Home`/`End`, focus visible), and `PageUp`/`PageDown` for previous/next slide outside text fields. Matching and key logic in the DOM-free `slide-filter.js`, with tests.

### 2026-10-10: Present and Read (E-007)
- **Added** Present (`F5`) and Read save unsaved changes first, then open the viewer at the selected slide: `viewer/?folder=<key>` for a show opened from a folder (D-012), `viewer/?show=<url>` for a show opened by URL. A dirty show opened by URL first asks for its folder; nothing opens until it is saved.
- **Changed** `save()` resolves to whether the show is on disk.
- **Added** `viewerUrl()` with tests.

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
