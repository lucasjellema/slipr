# Editor: architecture

## Overview

The editor is a single-page app in vanilla JS. All state lives in one **store** that holds the show JSON. UI panels subscribe to the store and re-render the parts that changed. Every change goes through a named **action**, which makes undo/redo, dirty tracking and autosave straightforward.

```
            ┌──────────── user input ─────────────┐
            ▼                                     │
   ui/* panels ── dispatch(action) ──► store.js ──┘ notify(subscribers)
                                         │  ├─ history (undo/redo stack)
                                         │  └─ dirty flag
                                         ▼
                            io/fs-access.js  (open / save folder)
                            io/draft-store.js (IndexedDB autosave)

   ui/preview.js ── shared/render.js + shared/validate.js
```

## File structure

✅ = exists (E-001, 2026-10-10). Everything else is planned.

```
editor/
├── index.html            ✅ 3-column shell: toolbar, sidebar, inspector, preview
├── css/
│   └── editor.css        ✅
├── test/                 ✅ actions.test.js, store.test.js (node --test)
└── js/
    ├── main.js           ✅ bootstrap: load the show (?show=…) via shared/load.js, create store, mount panels, wire shortcuts
    ├── store.js          ✅ state, dispatch, subscribe, undo/redo history, typing coalescing, validation diagnostics, issuesForSlide()
    ├── slot-values.js    ✅ DOM-free: which editor a slot type gets, and the value shape each edit writes (E-010)
    ├── actions.js        ✅ pure functions: (show, payload) → new show, with reference cleanup
    ├── dom.js            ✅ h() element builder, addStylesheet()
    ├── shortcuts.js      ✅ Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+Enter, Ctrl+D, Alt+↑/↓, F5
    ├── io/                  (planned, E-002)
    │   ├── fs-access.js     File System Access API: open dir, read/write show.json, copy images
    │   └── draft-store.js   IndexedDB drafts for crash recovery
    └── ui/
        ├── toolbar.js       ✅ title, dirty dot, save, undo, redo, present, read
        ├── slide-list.js    ✅ items, selection, reorder, add, duplicate, delete
        ├── slide-form.js    ✅ "Slide" tab: form generated from layout slot definitions, layout select, notes, chapter, hidden
        ├── reader-form.js   ✅ "Reader" tab: summary, block list, profile/depth controls, related slides
        ├── show-settings.js ✅ "Settings" tab: meta, settings, chapters, glossary, profiles, paths
        ├── preview.js       ✅ live render: audience slide, or reader view as profile X at depth N, plus warnings
        ├── block-editors.js    (planned) one editor per reader block type
        ├── hotspot-editor.js   (planned, E-006) click on an image to place and edit hotspots
        ├── layout-picker.js    (planned, E-004) grid of template layouts with previews
        ├── field-editors.js    (planned, E-004) one editor per slot type, including a cards editor (I-035)
        └── dialogs.js          (planned) new-show, alt-text, confirm
```

**Current limits (E-001, E-010):** Save only marks the store clean; nothing is written to disk until E-002. The slide form has inputs for `text`, `richtext`, `list` and `image` (path + alt text) slots, built by the rules in `slot-values.js` so they always write the shape the format requires. `quote`, `code`, `cards` and unknown slot types are shown read-only until they get real field editors (E-004 / I-035).

## Key components

### Store (`store.js`)
- State: `{ show, template, folderHandle, selectedSlideId, dirty, warnings }`.
- `dispatch(type, payload)` looks up `actions[type]`, computes a new `show` (structural sharing, never mutated in place), pushes the previous one onto the history stack (max ~100), sets `dirty`, and notifies subscribers with the set of changed keys.
- Typing in a text field is coalesced into a single history entry per field per 1 s pause.

### Actions (`actions.js`)
Pure and unit-testable in Node:
- slides: `addSlide`, `duplicateSlide`, `deleteSlide`, `moveSlide`, `setLayout`, `setSlot`, `setNotes`, `setHidden`, `setChapter`, `setTags`
- reader layer: `setSummary`, `addBlock`, `updateBlock`, `moveBlock`, `deleteBlock`, `setBlockAudience` (for/depth), `setRelated`
- show: `setMeta`, `upsertChapter`, `upsertGlossaryTerm`, `upsertProfile`, `upsertPath` (and their deletes)

Deleting a slide also removes it from `paths` and `related`. Deleting a profile or glossary term reports the places that referenced it. `setLayout` keeps the values of slots whose name and type also exist in the new layout. Values that don't fit are kept in a hidden `_orphaned` field, so switching back restores them.

### Slide form (`slide-form.js` + `field-editors.js`)
The form is generated, not hand-built. For the selected slide's layout it iterates over `layout.slots` and mounts the matching field editor. This means a new layout in a template appears in the editor automatically.

### Reader tab (`reader-form.js` + `block-editors.js`)
Like the slide form, block editors are chosen by block `type`, so a new block type means a new editor module plus support in `shared/blocks.js`. Every block editor carries the common controls: profiles (`for`) and depth. Markdown fields get a small toolbar for inserting `[[glossary]]` references (with autocomplete from the glossary), `^[popups]` and slide links.

### Preview (`preview.js`)
In **audience** mode it renders the selected slide with `shared/render.js` into a fixed 1920×1080 container that is CSS-scaled to fit the pane. In **reader** mode it renders the slide visual plus its blocks via `shared/blocks.js`, after filtering with the viewer's `personalize.js` for the profile and depth chosen in the preview toolbar. Re-renders debounced at 150 ms. It also shows `validate.js` warnings for that slide. Thumbnails in the slide list use the same renderer at a smaller scale.

### Persistence (`io/`)
- **Open**: `showDirectoryPicker()` → read `show.json` → `load.js` resolves the template.
- **Save**: write `show.json` (pretty-printed, 2-space indent, stable key order for clean git diffs).
- **Images**: written to `images/<slug>-<hash8>.<ext>` to avoid name collisions.
- **Drafts**: the current show goes to IndexedDB every 5 s while dirty. On open, if a newer draft exists, the editor offers to restore it.
- Folder handles are remembered in IndexedDB for "recent shows". Permission is re-requested on reopen.

### Viewer integration
"Present" and "Read" save first, then open `viewer/?show=<path>`. File System Access handles don't give a URL, so this requires that the show folder sits under the dev server's root. *(See open questions.)*

## Open questions

- Presenting an unsaved or out-of-tree show: hand the show JSON to the viewer via `postMessage` / BroadcastChannel instead of a URL?
- Should the editor be able to edit templates too, or is that a separate tool? The current plan: no, templates are edited by hand.
