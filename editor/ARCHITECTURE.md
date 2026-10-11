# Editor: architecture

## Overview

The editor is a single-page app in vanilla JS. All state lives in one **store** that holds the show JSON. UI panels subscribe to the store and re-render the parts that changed. Every change goes through a named **action**, which makes undo/redo and dirty tracking straightforward (and will make draft autosave, I-020, simple).

```
            ┌──────────── user input ─────────────┐
            ▼                                     │
   ui/* panels ── dispatch(action) ──► store.js ──┘ notify(subscribers)
                                         │  ├─ history (undo/redo stack)
                                         │  └─ dirty flag
                                         ▼
                            io/fs-access.js  (open / save folder)
                            io/draft-store.js (IndexedDB autosave, planned: I-020)

   ui/preview.js ── shared/render.js + shared/validate.js
```

## File structure

✅ = exists. Everything else is planned.

```
editor/
├── index.html            ✅ 3-column shell: toolbar, sidebar, inspector, preview
├── help.html             ✅ user manual: static page, no scripts; sections have ids the editor links to (E-016)
├── css/
│   ├── editor.css        ✅
│   └── help.css          ✅ manual styles, light and dark
├── test/                 ✅ node --test: actions, store, slot-values, card-values, blocks-hotspots, images, io,
│                            layout-choice, reader-tab, show-settings, slide-filter, block-values, help
└── js/
    ├── main.js           ✅ bootstrap: ?folder=<key> (remembered folder), ?show=<url>, or the start screen; create store, mount panels, wire shortcuts
    ├── image-input.js    ✅ add an image to an image slot from a file, a drop or the clipboard; paste target; alt-text dialog (E-006)
    ├── export.js         ✅ Export…: the open show as one offline HTML file via shared/export/single-file.js; files from the editor state, the show folder and the server (I-085)
    ├── files.js          ✅ Open…, New…, Save (Ctrl+S), unsaved-changes guard (E-002); Present / Read (E-007)
    ├── store.js          ✅ state, dispatch, subscribe, undo/redo history, typing coalescing, validation diagnostics, issuesForSlide()
    ├── slot-values.js    ✅ DOM-free: which editor a slot type gets, and the value shape each edit writes (E-010)
    ├── card-values.js    ✅ DOM-free: value shapes for cards (add, remove, move, set field), quote, code; length hints (I-035)
    ├── markdown-insert.js ✅ DOM-free: insert glossary references, popups and slide links into Markdown text (E-008)
    ├── show-entities.js  ✅ DOM-free: unique ids, glossary references and unlinking, profile / chapter usage (E-009)
    ├── layout-choice.js  ✅ DOM-free: the slide in another layout, what a switch hides / brings back / still needs, sample content (E-004)
    ├── block-values.js   ✅ DOM-free: tabs (add, move, remove, set), embed URL problems and height (I-036)
    ├── help.js           ✅ DOM-free: manual address and the section per inspector tab; openHelp() (E-016)
    ├── show-grid-model.js ✅ DOM-free: chapter runs (as reader mode groups them), empty chapters, range selection, grid keys (I-081)
    ├── slide-filter.js   ✅ DOM-free: "Go to slide" matching and list navigation keys (E-012)
    ├── actions.js        ✅ pure functions: (show, payload) → new show, with reference cleanup; find / replace across the show (I-025)
    ├── dom.js            ✅ h() element builder, addStylesheet()
    ├── shortcuts.js      ✅ Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+F / Ctrl+H, Ctrl+Enter, Ctrl+D, Alt+↑/↓, PageUp/PageDown, F5, F1
    ├── io/
    │   ├── fs-access.js  ✅ File System Access API: pick folder, permission, write show.json, create a new show, copy an image in (`writeImage`, `findImageBySuffix`)
    │   ├── images.js     ✅ DOM-free: supported image types, `images/<slug>-<hash8>.<ext>` names, content suffix (E-006)
    │   ├── serialize.js  ✅ DOM-free: show.json text with schema key order and 2-space indent
    │   ├── new-show.js   ✅ DOM-free: show.json for a new show from a template (root-relative ref, D-012)
    │   └── draft-store.js   (planned, I-020) IndexedDB drafts for crash recovery
    └── ui/
        ├── toolbar.js       ✅ title, dirty dot, undo, redo, find & replace, open, new, save, present, read, ? Help (a link, so no popup blocker)
        ├── show-grid.js     ✅ the show grid: all slides as thumbnails in chapter runs; select, drag, batch operations, chapter moves (I-081)
        ├── slide-list.js    ✅ items, selection, reorder (buttons, Alt+↑/↓, drag and drop), hide toggle, add, duplicate, delete; "Go to slide" filter and keyboard navigation (E-012, E-003)
        ├── slide-form.js    ✅ "Slide" tab: form generated from layout slot definitions, Layout button (opens the layout picker), notes, chapter, hidden
        ├── reader-form.js   ✅ "Reader" tab: summary, block list, profile (`for`) and depth per block, related slides, showSlide (E-008); block editors for every block type: text, details, callout, image, tabs, embed, slide-ref (I-036)
        ├── markdown-toolbar.js ✅ toolbar above Markdown fields: glossary term, popup, slide link (E-008)
        ├── image-field.js   ✅ image preview + choose / drop / paste, used by image slots and image blocks (E-006)
        ├── show-settings.js ✅ "Settings" tab: meta, settings; chapters, profiles, glossary and reading routes with usage, reorder and explained deletes (E-009)
        ├── preview.js       ✅ live render: audience slide, or reader view as profile X at depth N, plus warnings
        ├── block-editors.js    (idea) the block editors moved out of reader-form.js, which has grown large
        ├── hotspot-editor.js ✅ click on an image to place hotspots; drag or arrow keys to move; title + Markdown per hotspot (E-006)
        ├── layout-picker.js ✅ grid of template layouts, each rendering the current slide (or sample text for a new slide), with the effect of switching (E-004)
        ├── field-editors.js ✅ quote, code and cards editors (E-004, I-035); text, rich text, list and image fields are in slide-form.js
        ├── find-replace.js  ✅ Find & Replace dialog: matches with snippets, jump to slide, replace on this slide or everywhere (I-025)
        └── dialogs.js       ✅ start screen, access screen, new-show, choose-folder, alt-text and confirm dialogs, `openDialog()`, banners
```

**Current limits:** No draft autosave yet (I-020). Only unknown reader block types are read-only. The slide form has inputs for `text`, `richtext`, `list` and `image` (path + alt text) slots, built by the rules in `slot-values.js` so they always write the shape the format requires. `quote`, `code` and `cards` have their own editors (`ui/field-editors.js`, values from `card-values.js`); `chart`, `diagram` and unknown slot types are shown read-only.

## Key components

### Store (`store.js`)
- State: `{ show, template, layouts, resolveAsset, registerAsset, resolveTemplateAsset, folderHandle, selectedSlideId, activeTab, previewMode, previewProfile, previewDepth, dirty, validation, canUndo, canRedo }`. `validation` is recomputed with `validateShow()` after every change; `issuesForSlide()` filters it per slide.
- `dispatch(type, payload)` looks up `actions[type]`, computes a new `show` (structural sharing, never mutated in place), pushes the previous one onto the history stack (max 100), sets `dirty`, and notifies subscribers with the changed keys and the action (`{ type, payload, coalesceKey }`).
- Typing in a text field is coalesced into a single history entry per field per 1 s pause: dispatches with the same `coalesceKey` within the window share one undo step. Forms also use the key to recognise the echo of their own typing (`isTypingEcho()`).

### Actions (`actions.js`)
Pure and unit-testable in Node:
- several slides or a chapter at once (show grid, one undo step each): `moveSlides`, `duplicateSlides`, `deleteSlides`, `setSlidesHidden`, `setSlidesChapter`, `moveChapter`, `createChapterFromSlides`; they keep `show.chapters` in the order of the slides (`syncChapterOrder`), because the agenda lists chapters in that order
- slides: `addSlide`, `duplicateSlide`, `deleteSlide`, `moveSlide`, `setLayout`, `setSlot`, `setNotes`, `setHidden`, `setSlideAudience`, `setChapter`, `setTags`
- reader layer: `setSummary`, `addBlock`, `updateBlock`, `moveBlock`, `deleteBlock`, `setBlockType`, `setBlockAudience` (for/depth), `addHotspot`, `updateHotspot`, `deleteHotspot`, `setRelated`, `setShowSlide`
- show: `setMeta`, `setSettings`, `upsertChapter`, `deleteChapter`, `upsertGlossaryTerm`, `deleteGlossaryTerm` (optionally `unlink`), `upsertProfile`, `deleteProfile`, `upsertPath`, `deletePath`, `moveShowItem`
- find & replace: `replaceAllText`, `replaceSlideText` (plus the pure query `findMatches()`, which is not an action)

`addSlide` without a layout picks one with `layoutForNewSlide()` (the current slide's layout after a content slide, else the template's plain content layout). Deleting a slide also removes it from `paths` and `related`. Deleting a chapter clears it from its slides; deleting a profile removes it from blocks' `for`; usage counts for the confirm dialogs come from `show-entities.js`. `setLayout` keeps the values of slots whose name and type also exist in the new layout. Values that don't fit are kept in a hidden `_orphaned` field, so switching back restores them.

### Slide form (`slide-form.js` + `field-editors.js`)
The form is generated, not hand-built. For the selected slide's layout it iterates over `layout.slots` and mounts the matching field editor. This means a new layout in a template appears in the editor automatically.

### Reader tab (`reader-form.js`)
Changing a block's type goes through `setBlockType` / `convertBlock()` in `actions.js`, which gives the block a valid shape for the new type (keeping id, `for`, `depth`, and the text where it fits). Types without an editor are read-only, never a Markdown box. Hotspots (`hotspot-editor.js`) are edited with `addHotspot` / `updateHotspot` / `deleteHotspot`; coordinates are fractions 0–1, clamped and rounded to 4 decimals. A drag moves the marker locally and stores the position on release, so it is one undo step.

Like the slide form, block editors are chosen by block `type`, so a new block type means a new editor (in `reader-form.js`, with DOM-free value helpers in `block-values.js`) plus support in `shared/blocks.js`. Every block editor carries the common controls: profiles (`for`) and depth. Markdown fields get a small toolbar (`markdown-toolbar.js`) for inserting `[[glossary]]` references (picked from the glossary), `^[popups]` and slide links; the insert is dispatched as the field's own `input` event. The "For" picker keeps its open state per block across re-renders.

### Preview (`preview.js`)
In **audience** mode it renders the selected slide with `shared/render.js` into a fixed 1920×1080 container that is CSS-scaled to fit the pane. In **reader** mode it renders the slide visual plus its blocks via `shared/blocks.js`, after filtering with the viewer's `personalize.js` for the profile and depth chosen in the preview toolbar. Re-renders debounced at 150 ms. A note above the slide says when the viewer would not show it the normal way: a backup slide (`audience.hidden`) in audience mode, or a reader-hidden slide in reader mode; the blocks of a reader-hidden slide are still filtered with `blockVisible()`. It also shows `validate.js` errors and warnings for that slide. The slide list shows titles, not thumbnails. The layout picker (`layout-picker.js`) renders its previews with the same `shared/render.js`.

### Persistence (`io/`, `files.js`)
- **Open**: `showDirectoryPicker()` → check for `show.json` → remember the handle in IndexedDB (`shared/folder-handles.js`) → reload as `?folder=<key>`. On load, `loadShowFromFolder()` reads the show and its images through the handle and resolves the template by name (D-012). Reloading keeps working; if the browser dropped the permission, an access screen asks for it with one click.
- **New**: title + template (from `templates/index.json`) → pick an empty folder → write `show.json` (template ref `/templates/<id>`) and `images/` → open it like *Open*.
- **Save**: write `show.json` (`io/serialize.js`: 2-space indent, key order from the JSON Schema, like the converter's output). Saving a hand-formatted file reformats it once. A show opened by URL (`?show=`) first asks for its folder and checks the show id. Edits made while saving stay dirty (`store.markSaved()`).
- **Images** (`image-input.js`): written to `images/<slug>-<hash8>.<ext>`, where the hash is of the content. The slug is the file name, or for pasted images (`image.png`) the slide title and slot. An image whose hash is already in `images/` is reused, whatever its name. The slot gets `{ src, alt }` through `setSlot`, so undo works; the file is never deleted. Folder shows resolve images as `blob:` URLs, so a new image is registered with `ctx.registerAsset()` (`shared/load.js`).
- **Drafts** (planned, I-020): the current show goes to IndexedDB every 5 s while dirty. On open, if a newer draft exists, the editor offers to restore it.
- Folder handles are remembered in IndexedDB for "recent shows" (start screen). Permission is re-requested on reopen, from a click.

### Find & replace (`ui/find-replace.js`, `actions.js`)
`findMatches(show, { query, matchCase, matchWholeWord })` walks show metadata, chapters, glossary, slide slots (text, lists, cards), speaker notes, reader summaries, block text (including tabs and hotspots) and returns snippets with a location label and slide id. `replaceAllText` and `replaceSlideText` walk the same fields and return a new show, so a replace is one undo step. The two walkers are separate: a new text field in the format must be added to both.

### Viewer integration (`files.js`: `openViewer()`, `viewerUrl()`)
"Present" and "Read" save first, then open the viewer on the same show at the selected slide. The viewer tab is opened inside the click (so the popup blocker allows it) and pointed at the viewer once the save is done; if saving fails or still needs a folder, the tab is closed. A show opened by URL opens `viewer/?show=<path>`. A show opened from a folder opens `viewer/?folder=<key>`: the folder handle is shared through IndexedDB, and the viewer reads the folder itself (D-012, E-007).

## Open questions

- ~~Presenting an out-of-tree show~~: decided in D-012 (shared folder handle; templates by name). Presenting *unsaved* drafts by snapshot hand-off was left for later.
- Should the editor be able to edit templates too, or is that a separate tool? The current plan: no, templates are edited by hand.
