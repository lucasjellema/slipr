# CLAUDE.md: Viewer

Read the root `CLAUDE.md` first. This file adds viewer-specific guidance.

## Orientation in 60 seconds

- Tests for pure viewer modules live in `viewer/test/` (run by `npm test`).

- Two **separate** mode apps behind one entry (`js/main.js`):
  - `audience/`: a thin layer over Reveal.js. Linear and stateless. Keep it thin.
  - `reader/`: an interactive app with state, personalisation, search, popovers and annotations. Most viewer code lives here.
- They share only `shared/` (loading, slide renderer, block renderer, Markdown). Do not import across `audience/` ↔ `reader/`.
- Slide visuals come from `shared/render.js` and reader blocks from `shared/blocks.js`. If something looks wrong in the editor preview too, the bug is in `shared/` or the template.
- `reader/personalize.js` is the heart of "tailored" reading. It is pure and has unit tests. Keep DOM code out of it.

## Invariants

- All reader state goes through the store in `reader/state.js`. Never write to IndexedDB or localStorage directly, and never store anything outside it.
- Annotations are never deleted automatically, even when their text disappears.

- The viewer never modifies the show. It is read-only.
- Identity is `slide.id` and `block.id`, never an index. Use ids for links, mode switching, progress and annotation anchors.
- Reveal.js is loaded only in audience mode. Reader mode has no third-party dependencies.
- Reader personal data (prefs, progress, bookmarks, annotations) stays in the browser (IndexedDB, keyed by `show.id`) and is never sent anywhere (D-010).
- Audience mode never shows reader-layer content. Glossary references render as plain text and `^[popups]` are omitted.
- Every interactive element must be reachable by keyboard: popover triggers are `<button>`s, tabs follow the ARIA tablist pattern.

## Smoke-test checklist (run after every viewer change)

With `shows/demo`:

**Audience**
1. Opens on slide 1. Arrows and PageUp/PageDown navigate. Fragments build one by one.
2. Auto-animate slides morph. The agenda slide shows the chapters.
3. `S` opens the presenter view with notes and the next slide (needs popups allowed; Claude's built-in browser pane blocks popups, so test this in a normal browser).
4. The backup slides come after "Thank you", are not counted in the slide number, and have a dashed outline in the overview (`O`).
4a. The chapter bar along the bottom fills as you advance. `#/s-architecture` deep-links to that slide.

**Reader**

5. The welcome chooser appears on first visit (clear the site data, or use a private window, to see it again) and is skipped on the next visit, and also when the link carries `profile`, `depth` or `path`.
6. `?profile=dev&depth=3` shows the developer deep-dive blocks (tabs on "A show is just data"), `?profile=mgr` hides them, and `?path=quick` shows 5 slides. ⚙ Tailor and `D` change this without losing the scroll position, and the choice survives a reload.
7. Glossary terms, footnotes and hotspots open popovers on hover (mouse), on tap (touch emulation) and with Enter (keyboard). On slides too: "A show is just data" links *template* and *layout* (inside bold), the section slide *templates* (an alias); each term once per slide; none in audience mode. In pin mode a click on a term places the pin.
8. Details panels and tabs work. Embeds load lazily.
9. `/` search finds text in a reader block and jumps to it with a highlight.
10. Select text in a block → Highlight / Add note. After a reload it is still highlighted and the note is back. With a profile that hides that block, the note moves to "Hidden by your tailoring". Export Markdown and JSON download files, and importing the JSON again reports "0 new".
10a. ✎ Note on a slide → a "✎ 1 note" chip appears. 📍 Pin → click on the image → pin 1 appears where you clicked, and its note opens. 📍 Pin → choose "Bullet 3" from the list → a pin on that bullet. At 375 px the pin is still on the same bullet. Select a slide title → Highlight works there too.
11. The contents entry of the slide being read is highlighted and the hash follows it. `#s-thanks` (reader-hidden) falls back to the nearest earlier slide. After 3 s on a slide its contents mark fills and "n of m read" goes up. `M` / ★ bookmarks a slide (listed at the top of the contents). Reopening without a hash offers "Continue with …".
12. At 375 px width there is no horizontal scrolling, the slide visual reflows, and ☰ opens the contents drawer.

**Both**

13. `R` / `A` switch modes and keep the position.
13a. A show folder: `viewer/?folder=<key>` opens it in both modes, with its images (keys come from the editor or "Open a show folder…"; in Claude's browser pane use an origin-private folder remembered via `shared/folder-handles.js`). An unknown key shows the "not known here" page.
14. An invalid show (`shows/fixtures/broken/`) shows the error page. `viewer/` without parameters shows the help page, and a non-existent show shows the load-error page.
15. The browser console is free of errors.
16. Single-file export: `npm run export -- shows/demo`, then open `exports/demo.html` (served: `http://localhost:8080/exports/demo.html`; and by double-click): audience and reader mode work, images, fonts and diagrams show, and DevTools → Network shows no request besides the file itself.

## Common pitfalls

- Reveal measures slides at init time. Inject the theme CSS and wait for `document.fonts.ready` **before** `Reveal.initialize()`.
- Relative image paths are relative to `show.json`, not to `viewer/`. Use `ctx.resolveAsset()` / `ctx.resolveTemplateAsset()` from `load.js`.
- `file://` will not work for the viewer itself because of `fetch()`. Always use the dev server (`npm run serve`, or the `slipr` entry in `.claude/launch.json` for Claude's browser pane). A **single-file export** (`npm run export`, I-054) is the exception: it is made to open from `file://`.
- **Keep the viewer exportable (I-054).** The single-file exporter follows the module graph from `js/main.js` and packs only what it can see: static imports, dynamic `import('./literal')`, and files named with a literal `new URL('./literal', import.meta.url)`. So: load files next to a module only with such literals (no computed or concatenated paths, no folder URL plus a file name); load show and template files only through `ctx.resolveAsset()` / `ctx.resolveTemplateAsset()`; and add stylesheets only through `addStylesheet()`. Anything else works from the server but is missing from an exported file. After such a change, run the export smoke test (step 16).
- **Never put `<section>` inside a slide.** Reveal treats every nested `<section>` as a vertical slide. A test guards the shipped layouts.
- Reveal's `reset.css` sets `font: inherit` on everything, which strips bold from `<strong>` and headings. Templates must restore text semantics inside `.slipr-slide` (see `templates/default/theme.css`).
- Reveal's notes plugin throws `Cannot set properties of null (setting 'marked')` when the popup is blocked. That is the blocked popup, not a Slipr bug.
- Screenshots of a hidden browser pane freeze CSS transitions mid-way. Check the DOM (`data-auto-animate-target`, opacity) rather than trusting a screenshot of an animation.
- Re-rendering the reader article after a pref change destroys DOM nodes. Re-apply annotation highlights and restore focus afterwards.
- Hover-only interactions are invisible on touch devices. Always provide the tap/click path too.
- `shared/blocks.js` returns HTML **strings** (so it is testable in Node), and `shared/render.js` returns **elements** (it clones template fragments). Insert block HTML with `innerHTML`. That is safe only because everything in it went through `escape()` or `markdown()`, so keep it that way.
- The browser pane sometimes captures stale or garbled screenshots. If a screenshot contradicts the DOM, re-take it after `resize_window`, or trust the DOM state.
- In Claude's browser pane, synthetic key presses sometimes don't arrive while the pane isn't drawing. Dispatch `KeyboardEvent`s from `javascript_tool` to test shortcuts. `requestAnimationFrame` also doesn't fire then, so don't use it for logic that must run (focus, state). Keep it for visuals only.
- In Claude's browser pane, `resize_window` can send the tab back to an earlier history entry, and screenshots often lag one navigation behind. After a resize, check `location.hash` and set it again from `javascript_tool` if needed. When a narrow pane makes a 1280×720 capture unreadable, measure positions instead (element rects as % of `.slipr-canvas`) and compare those with the PowerPoint geometry.
- The viewer resets `margin` on slide images (`.reveal .slipr-slide img { margin: 0 }`), and that rule outranks template rules. In a template, put spacing on the element after the image, or use padding.
- Reader state persists between test runs. To start fresh, delete the `slipr-reader` IndexedDB database (DevTools → Application) or use a private window.
