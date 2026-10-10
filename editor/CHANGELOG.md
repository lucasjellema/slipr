# Changelog: Editor

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

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
