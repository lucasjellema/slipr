# CLAUDE.md: Viewer

Read the root `CLAUDE.md` first. This file adds viewer-specific guidance.

## Orientation in 60 seconds

- Two **separate** mode apps behind one entry (`js/main.js`):
  - `audience/`: a thin layer over Reveal.js. Linear and stateless. Keep it thin.
  - `reader/`: an interactive app with state, personalisation, search, popovers and annotations. Most viewer code lives here.
- They share only `shared/` (loading, slide renderer, block renderer, Markdown). Do not import across `audience/` ↔ `reader/`.
- Slide visuals come from `shared/render.js` and reader blocks from `shared/blocks.js`. If something looks wrong in the editor preview too, the bug is in `shared/` or the template.
- `reader/personalize.js` is the heart of "tailored" reading. It is pure and has unit tests. Keep DOM code out of it.

## Invariants

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

5. The welcome chooser appears on first visit and is skipped on the next visit.
6. Switching profile/depth/path changes the visible blocks and keeps the scroll position.
7. Glossary terms, footnotes and hotspots open popovers on hover (mouse), on tap (touch emulation) and with Enter (keyboard).
8. Details panels and tabs work. Embeds load lazily.
9. `/` search finds text in a reader block and jumps to it with a highlight.
10. Highlight some text and add a note. After a reload it is still there. Export produces Markdown.
11. Progress marks update in the TOC. A reload resumes at the last position.
12. At 375 px width there is no horizontal scrolling and the slide visual reflows.

**Both**

13. *(from Phase 2)* `R` / `A` switch modes and keep the position.
14. An invalid show (`shows/fixtures/broken/`) shows the error page. `viewer/` without parameters shows the help page, and a non-existent show shows the load-error page.
15. The browser console is free of errors.

## Common pitfalls

- Reveal measures slides at init time. Inject the theme CSS and wait for `document.fonts.ready` **before** `Reveal.initialize()`.
- Relative image paths are relative to `show.json`, not to `viewer/`. Use `ctx.resolveAsset()` / `ctx.resolveTemplateAsset()` from `load.js`.
- `file://` will not work because of `fetch()`. Always use the dev server (`npm run serve`, or the `slipr` entry in `.claude/launch.json` for Claude's browser pane).
- **Never put `<section>` inside a slide.** Reveal treats every nested `<section>` as a vertical slide. A test guards the shipped layouts.
- Reveal's `reset.css` sets `font: inherit` on everything, which strips bold from `<strong>` and headings. Templates must restore text semantics inside `.slipr-slide` (see `templates/default/theme.css`).
- Reveal's notes plugin throws `Cannot set properties of null (setting 'marked')` when the popup is blocked. That is the blocked popup, not a Slipr bug.
- Screenshots of a hidden browser pane freeze CSS transitions mid-way. Check the DOM (`data-auto-animate-target`, opacity) rather than trusting a screenshot of an animation.
- Re-rendering the reader article after a pref change destroys DOM nodes. Re-apply annotation highlights and restore focus afterwards.
- Hover-only interactions are invisible on touch devices. Always provide the tap/click path too.
