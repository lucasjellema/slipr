# CLAUDE.md: Editor

Read the root `CLAUDE.md` first. This file adds editor-specific guidance.

## Orientation in 60 seconds

- State flows one way: **UI → `dispatch(action)` → `store` → subscribers → UI**. Panels never modify the show object directly.
- Every change to show data is a pure function in `js/actions.js`. If you need a new kind of edit, add an action there first, with a unit test.
- The slide form is generated from the template's slot definitions. To support a new slot type, add a field editor in `ui/field-editors.js` **and** renderer support in `shared/render.js` **and** the type in the schema and spec.
- To support a new reader **block** type: block editor in `ui/block-editors.js` + rendering in `shared/blocks.js` + schema + `docs/show-format.md`.
- The preview uses `shared/render.js` and `shared/blocks.js`, the same renderers as the viewer, and `viewer/reader/personalize.js` for the profile/depth simulation. Do not add editor-only rendering.

## Invariants

- The show in the store is treated as immutable. Replace objects, never mutate them, because undo depends on it.
- Saved `show.json` has a stable key order and 2-space indentation, so git diffs stay clean.
- Never delete image files from the show folder automatically. Unused images are reported, not removed.
- Slide `id`s are generated once (`s-` + short random) and never changed, even when slides are reordered.

## Smoke-test checklist

1. Create a new show from `templates/default` in an empty folder. `show.json` and `images/` appear.
2. Add 5 slides with different layouts, reorder them by dragging, and delete one.
3. Switch a slide from `bullets` to `two-column` and back. The content survives.
4. Drop an image. The file is copied into `images/` and the alt-text dialog appears.
5. Undo/redo through all of the above.
6. `Ctrl+S`, reload the page, reopen the folder. Everything is intact.
7. Kill the tab while dirty and reopen. The draft restore is offered.
8. "Present" opens the viewer at the current slide.
9. The browser console is free of errors.

## Common pitfalls

- File System Access permissions are per session. After a reload, call `handle.requestPermission({ mode: 'readwrite' })` from a user gesture (click), never on page load.
- `actions.js` must stay DOM-free so it can be tested with `node --test`.
- Large images make the whole store slow if inlined. Keep only paths in the show, never data URLs.
