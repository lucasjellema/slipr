# CLAUDE.md: Editor

Read the root `CLAUDE.md` first. This file adds editor-specific guidance.

## Orientation in 60 seconds

- State flows one way: **UI → `dispatch(action)` → `store` → subscribers → UI**. Panels never modify the show object directly.
- Every change to show data is a pure function in `js/actions.js`. If you need a new kind of edit, add an action there first, with a unit test.
- The slide form is generated from the template's slot definitions. To support a new slot type, add a field editor in `ui/field-editors.js` **and** renderer support in `shared/render.js` **and** the type in the schema and spec.
- To support a new reader **block** type: block editor in `ui/reader-form.js` (value helpers with tests in `block-values.js`) + `convertBlock()` in `actions.js` + rendering in `shared/blocks.js` + schema + `docs/show-format.md`.
- The preview uses `shared/render.js` and `shared/blocks.js`, the same renderers as the viewer, and `viewer/reader/personalize.js` for the profile/depth simulation. Do not add editor-only rendering.

## Invariants

- The user manual (`help.html`) describes what the user sees. It is the only detailed user guide: a user-visible change updates `help.html` in the same change, and `README.md` only when its short overview table changes. Keep the section ids that `js/help.js` and the README link to; `test/help.test.js` checks them and every in-page link.

- The show in the store is treated as immutable. Replace objects, never mutate them, because undo depends on it.
- Saved `show.json` has a stable key order and 2-space indentation, so git diffs stay clean.
- Never delete image files from the show folder automatically. Unused images are reported, not removed.
- Slide `id`s are generated once (`s-` + short random) and never changed, even when slides are reordered.

## Smoke-test checklist

Step 7 (I-020) can't be run yet. For step 4 in Claude's browser pane, dispatch a `ClipboardEvent('paste')` or `DragEvent('drop')` whose `DataTransfer` holds a canvas-made PNG `File`; the Paste button (`navigator.clipboard.read()`) needs a real user and a permission prompt. For step 8, Claude's browser pane blocks popups: stub `window.open` from `javascript_tool` to check the URL, and open that URL in the pane. Shows by URL: `editor/?show=../shows/demo/show.json`. The native folder picker can't be driven from Claude's browser pane; there, test steps 1 and 6 with a folder in the origin-private file system (`navigator.storage.getDirectory()`) remembered via `shared/folder-handles.js` and opened as `editor/?folder=<key>`, and clean it up afterwards.

1. Create a new show from `templates/default` in an empty folder. `show.json` and `images/` appear.
2. Add 5 slides with different layouts, reorder them by dragging (the drop line shows where; dragging down and up both land next to the target), hide one with ◉, and delete one. With a long show (20+ slides), the list scrolls to the last slide, "Go to slide" finds a slide by number and by title, and the list keeps its scroll position after an edit.
3. Switch a slide from `bullets` to `two-column` and back with the layout picker (Layout button). The previews show the slide's content, the notes say what is hidden or brought back, the content survives the round trip, and the form shows the new layout's fields at once. "▾" next to "+ Add" adds a slide in a chosen layout.
4. Drop an image, paste one (`Ctrl+V` in the image field and on the page), and choose one. The file is copied into `images/` and the alt-text dialog appears. The same image on another slide reuses the file. Undo restores the previous image.
5. Undo/redo through all of the above.
6. `Ctrl+S`, reload the page, reopen the folder. Everything is intact.
7. Kill the tab while dirty and reopen. The draft restore is offered.
8. "Present" opens the viewer at the current slide.
8b. Reader tab: give a block a profile ("For"), add and reorder a related slide, untick "Show the slide…" (the reader preview drops the slide visual), and use the Markdown toolbar on a selected word. The preview with that profile shows or hides the block.
8c. Find & replace (`Ctrl+F`, `Ctrl+H` or the 🔍 button): a word from a slide, a reader block and the notes is listed with its location; clicking a match selects that slide; **Replace in Current Slide** and **Replace All** change the text, and one `Ctrl+Z` undoes each.
8a. Reader tab: add a block, switch it to *Image with Hotspots*, paste an image, click the image to add a hotspot (its title field gets focus with the default selected), drag a marker, nudge it with the arrow keys, delete one with `Delete`. The reader preview and `viewer/?…&mode=reader` show the hotspots.
8d. **? Help** and `F1` open `help.html` in a new tab at the section for the current tab (Slide, Reader, Show settings); the start screen links to it too. The manual reads well at 375 px and in dark mode.
8e. **Export…** saves the open show as one HTML file (unsaved changes included) and the success message gives its size. In Claude's browser pane the save dialog cannot be driven: stub `window.showSaveFilePicker` to return a file handle from the origin-private file system, then load the written file in a same-origin iframe (a `blob:` URL) and check that it presents with no network requests. Without `showSaveFilePicker` the file is downloaded.
8f. **Show grid** (▦): chapter runs match the reader's contents; select with click / Ctrl-click / Shift-click / keyboard; drag two slides into another chapter (they join it, the slide list follows) and undo it in one step; drag a chapter by its title bar; ▲ ▼ on a chapter; + Chapter with and without a selection; delete asks first; double-click opens the slide. Up / down arrows go to the card visually above or below.
9. The browser console is free of errors.

## Common pitfalls

- File System Access permissions are per session. After a reload, call `handle.requestPermission({ mode: 'readwrite' })` from a user gesture (click), never on page load.
- `actions.js` must stay DOM-free so it can be tested with `node --test`.
- A field editor must write the value **shape** the format requires: an `image` slot is `{ src, alt, … }`, `quote` / `code` are objects, `cards` is an array of objects (see `docs/show-format.md`). Writing a plain string turns a valid show into an invalid one (bug E-010). Slot types without an editor should be read-only, never a text input. The rules live in `js/slot-values.js` (and `js/card-values.js` for cards, quote and code); extend them (with a test) when you add a field editor. A cards editor writes the whole array through `setSlot`, reading the current value from the store at the moment of the edit.
- A form must not skip re-rendering just because it has focus: that leaves stale fields after a layout change, a button press or undo (bug E-013). Skip only the echo of the user's own typing (`isTypingEcho()`), and re-render with `rerenderKeepingFocus()` from `dom.js`. Add new typing actions to the form's `TYPING_ACTIONS`, and dispatch typing with a `coalesceKey`: that key is how a form recognises its own typing echo (a dispatch without one always re-renders the form).
- Reader blocks follow the same rule as slots: a block editor writes only the fields its type allows (`variant`, not `kind`, for callouts), and a type change goes through `setBlockType`. Block types without an editor are read-only.
- Find & replace has two walkers in `actions.js`: `findMatches()` (search) and `replaceInSlide()` + `replaceAllText()` (replace). When the format gains a text field, add it to both, or search finds text that replace leaves alone (or the other way round).
- Operations on several slides must be **one** action (one undo step): use or add a batch action (`moveSlides`, `deleteSlides`, …) instead of dispatching in a loop. Actions that reorder slides or change chapters call `syncChapterOrder()`, so the agenda (which lists `show.chapters` in order) follows the slides.
- Large images make the whole store slow if inlined. Keep only paths in the show, never data URLs.
