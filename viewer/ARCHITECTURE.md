# Viewer: architecture

## Overview

The viewer is one entry page (`viewer/index.html`) with **two separate mode applications** that share only the show loading and the slide renderer:

- **Audience** (`audience/`): a thin layer over Reveal.js. It is linear, presenter-driven and stateless.
- **Reader** (`reader/`): a small interactive app of its own. It has a state model, personalisation, search, popups and annotations. It is by far the larger of the two.

```
index.html
   └─ main.js ── parse URL ── shared/load.js ── shared/validate.js ── errors → error-view.js
                     │
         ┌───────────┴─────────────┐
   mode=audience              mode=reader
         │                         │
   audience/audience.js      reader/reader.js (app shell)
     ├ Reveal.js               ├ state.js ── IndexedDB (per show id)
     ├ agenda.js               ├ personalize.js  (profile · depth · path → visible model)
     └ visuals.js              ├ nav.js          (TOC, progress, path next/prev, related)
                               ├ interactions.js (popovers, hotspots, tabs, details)
                               ├ search.js       (in-memory index)
                               └ annotations.js  (highlights, notes, bookmarks)
         │                         │
         └──── shared/render.js (slide visuals) ───┘
                shared/blocks.js (reader blocks, reader only)
                shared/markdown.js (incl. [[glossary]] and ^[popup] syntax)
```

## File structure

Built so far (Phase 1) is marked ✅. Everything else is planned.

```
viewer/
├── index.html              ✅ minimal shell: <div id="app">, <script type="module" src="js/main.js">
├── css/
│   └── viewer.css          ✅ chrome shared by both modes (loading, help and error pages)
├── js/
│   ├── main.js             ✅ entry: read URL params, load + validate, start mode app
│   ├── dom.js              ✅ h() element builder (never parses HTML), addStylesheet()
│   ├── error-view.js       ✅ help page, load-error page, validation-error page
│   └── mode-switch.js      map position between modes (index ↔ slide id), swap modes
├── audience/
│   ├── audience.js         ✅ build <section>s, configure and start Reveal
│   ├── agenda.js           ✅ generated agenda slides + chapter progress bar
│   ├── audience.css        ✅ Reveal integration, agenda and progress-bar styles
│   └── visuals.js          build-up of charts/diagrams on fragment events (with the chart slot type)
└── reader/
    ├── reader.js           app shell: layout, routing (#s-05/b3), keyboard map
    ├── state.js            reader state + persistence
    ├── personalize.js      pure: (show, prefs) → visible model
    ├── nav.js              TOC, progress marks, path navigation, related links, tag filter
    ├── interactions.js     popover wiring (glossary, footnotes, hotspots), tabs
    ├── search.js           index build + search UI
    ├── annotations.js      selection → highlight/note, margin rendering, export/import
    ├── welcome.js          first-visit profile / depth / path chooser
    └── reader.css          app layout; block styling comes from the template
```

## Start-up (`main.js`)

1. No `show` parameter → help page with links to the demo.
2. `loadShow()` → a `LoadError` (not found, invalid JSON, server unreachable) shows the load-error page. The "start the dev server" hint is only shown when the server could not be reached at all.
3. Validation errors → validation-error page listing each issue with its path. Warnings go to the console (collapsed group) and never block a show.
4. Set `document.title` and `lang`, load the template's `theme.css`, then dynamically `import()` the mode module, so Reveal.js is only fetched in audience mode.

## Audience mode

- `audience.js` loads Reveal's `reset.css` + `reveal.css` and `audience.css`, waits for `document.fonts.ready`, then builds `.reveal > .slides > section` per slide, filled by `renderSlide(slide, ctx, { mode: 'audience' })`.
- Each `<section>` gets `id = slide.id`, so Reveal's own `#/slide-id` deep links work. In-show Markdown links `[x](#s-id)` are rendered with `href="#/s-id"`, so no click handling is needed.
- Every `[data-slot]` element gets `data-id="slot-<name>"`, so **auto-animate** morphs the same slot between consecutive `audience.autoAnimate` slides. Reveal matches list items and images by content automatically, and unmatched items fade in.
- `audience.fragments` adds `class="fragment [style]"` to every `<li>`, nested ones included.
- Notes go in `<aside class="notes">` (Reveal Notes plugin). Glossary references and `^[popups]` render as plain text or are omitted (`markdown.js`, `mode: 'audience'`).
- Backup slides (`audience.hidden`) are moved to the end with `data-visibility="uncounted"` and class `slipr-backup`.
- `audience.background` becomes `data-background-color` (when it looks like a CSS colour) or `data-background-image` (resolved against `show.json`).
- `agenda.js`: with `settings.agenda` and at least two chapters, an agenda slide (built-in markup styled with the template's `--slipr-*` tokens) goes before the first slide of each chapter. The exception is the start of the show, where it goes *after* the first slide (the title slide). The chapter bar sizes each segment by the chapter's slide count and updates on Reveal's `slidechanged` event. It is hidden on backup slides and in the overview.
- Reveal config: `width: 1920, height: 1080` (1440×1080 for 4:3), `margin: 0`, `center: false`, `hash: true`, `progress: false` (replaced by the chapter bar), `slideNumber: 'c/t'` when `settings.slideNumbers`, `transition` from settings. Plugins: Notes, Zoom, Search.
- The slide number sits bottom-left, because bottom-right belongs to the template logo and Reveal's controls.

## Reader mode

### Data flow

```
show + template ──► personalize(show, prefs) ──► visible model ──► render ──► DOM
                         ▲                                                    │
                    state.prefs  ◄──── user changes profile/depth/path ───────┘
```

- **`state.js`** holds `{ prefs: {profile, depth, path, showNotes}, position: {slideId, blockId}, visited: Set, bookmarks: Set, annotations: [] }`. It is persisted per `show.id` in IndexedDB, with `localStorage` as fallback. URL parameters override the stored prefs for the current visit. A small subscribe/notify, the same pattern as the editor store.
- **`personalize.js`** is pure and DOM-free (unit-testable in Node). It applies `reader.hidden`, the path (order and selection), the profile filter (`for`) and the depth filter (`depth ≤ level`), and returns the ordered list of visible slides and blocks.
- **Rendering**: each visible slide becomes `<section id="s-05">` containing an optional slide visual (`shared/render.js`, `mode: 'reader'`, in an aspect-ratio frame), then the blocks (`shared/blocks.js`), then related links. Changing prefs re-renders the article and restores the scroll position by slide and block id.

### Interactions
- **Popovers** use the native **Popover API** (`popover` attribute) with **CSS anchor positioning**, both supported in current Chromium. On pointer devices they open on hover (with a delay), on touch devices on tap. Each popover has an `id`, and its trigger is a `<button>` for keyboard access.
- **Details** use native `<details>/<summary>`. **Tabs** are a small ARIA tablist component.
- **Hotspots** are absolutely positioned buttons over the image (percent coordinates), each with a popover.
- **Embeds**: `<iframe sandbox loading="lazy">`.

### Search
- `search.js` builds an in-memory inverted index at load (lower-cased, accent-folded tokens) over slide titles, slot text, block text, summaries and glossary. Notes are only included when enabled. Shows are small (hundreds of slides at most), so no library is needed.
- Results are ranked by field weight (title > summary > body) and term proximity. Clicking a result navigates to `#slide/block` and highlights the match with the CSS Custom Highlight API.

### Annotations
- Anchoring follows the W3C Web Annotation idea: **block id + text-quote selector** (`prefix`, `exact`, `suffix`). This lets highlights survive small edits to the show. Orphaned annotations (text no longer found) are kept and listed separately.
- Highlights are drawn with the CSS Custom Highlight API, so the content DOM is not modified.
- Export/import: Markdown (readable) and JSON (lossless).

### Navigation & progress
- A slide counts as *visited* once ≥ 50 % of it has been in view for 3 s (IntersectionObserver).
- `nav.js` renders the TOC by chapter, filtered by the active path, with progress marks. Scroll-spy updates the current item and the URL hash with `history.replaceState`.

## Dependencies

- `vendor/reveal.js-6.0.2/`: imported as ES modules (`dist/reveal.mjs`, `dist/plugin/{notes,zoom,search}.mjs`) plus `dist/reset.css` and `dist/reveal.css`. Loaded only in audience mode. Reveal's own themes are not used, because the Slipr template provides the looks.
- `shared/` modules. Reader mode has **no third-party dependencies**.

## Decisions & open questions

- D-008 → reader mode is its own app, not Reveal's scroll view (see `docs/decisions.md`).
- D-010 → reader data stays in the browser.
- Phones: below about 700 px the slide visual reflows using the layout's reader CSS (`.slipr-mode-reader`) instead of being scaled. Needs a design pass per layout.
- Profiles might eventually also change the *audience* layer (e.g. a different deck variant per audience). This is out of scope for now and listed in the backlog.
