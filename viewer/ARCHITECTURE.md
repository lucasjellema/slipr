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

Built so far (Phases 1–2) is marked ✅. Everything else is planned.

```
viewer/
├── index.html              ✅ minimal shell: <div id="app">, <script type="module" src="js/main.js">
├── css/
│   └── viewer.css          ✅ chrome shared by both modes (loading, help and error pages)
├── js/
│   ├── main.js             ✅ entry: read URL params, load + validate, start mode app
│   ├── dom.js              ✅ h() element builder (never parses HTML), addStylesheet()
│   ├── error-view.js       ✅ help page, load-error page, validation-error page
│   └── mode-switch.js      ✅ audienceUrl() / readerUrl() by slide id, parseReaderHash()
├── audience/
│   ├── audience.js         ✅ build <section>s, configure and start Reveal
│   ├── agenda.js           ✅ generated agenda slides + chapter progress bar
│   ├── audience.css        ✅ Reveal integration, agenda and progress-bar styles
│   └── visuals.js          build-up of charts/diagrams on fragment events (with the chart slot type)
└── reader/
    ├── reader.js           ✅ app shell: top bar, contents, article; routing (#s-05/b3); keys
    ├── state.js            reader state + persistence
    ├── personalize.js      ✅ pure: (show, prefs) → visible model; prefs from URL; nearest visible slide
    ├── nav.js              ✅ chapter contents + scroll-spy (progress marks, tag filter: Phase 3)
    ├── interactions.js     ✅ popover wiring (glossary, footnotes, hotspots), ARIA tabs
    ├── search.js           index build + search UI
    ├── annotations.js      selection → highlight/note, margin rendering, export/import
    ├── welcome.js          first-visit profile / depth / path chooser
    └── reader.css          ✅ page structure; block and popover styling comes from the template

viewer/test/
    └── personalize.test.js ✅ node --test
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
show + URL params ──► personalize(show, prefs) ──► visible model ──► render ──► DOM
                              ▲                                                │
                         (Phase 3) stored prefs + toolbar controls ◄───────────┘
```

- **`personalize.js`** is pure and DOM-free (tests in `viewer/test/`). It applies the path (selection and order; `"*"` = all), drops `reader.hidden` slides, filters blocks by `for` (no profile chosen = show all) and `depth ≤ level` (default 2), and groups consecutive slides by chapter. `nearestVisibleSlide()` maps a requested id onto what is visible: the nearest earlier visible slide in show order, then the nearest later one.
- **Rendering** (`reader.js`): a hero header from `meta` (plus a "Tailored: …" note with a link back to the standard version when prefs differ from the default), one `<section>` per chapter run, and per slide an `<article id="{slide.id}">`. Each article holds a heading (visually hidden when the slide visual is shown), the slide visual (`shared/render.js`, `mode: 'reader'`, lazy images), the summary, blocks (`shared/blocks.js`, HTML strings), a collapsed "What the presenter said" panel, and "See also" links.
- **Phase 3:** `state.js` will hold prefs, position, visited slides, bookmarks and annotations, persisted per `show.id` in IndexedDB, with URL parameters overriding them for the current visit.

### Routing

- The hash is `#slide-id` or `#slide-id/block-id`. Blocks have DOM id `slide-id--block-id` (`blockDomId()`).
- On load and on `hashchange`, `go()` resolves the target through `nearestVisibleSlide()` (and updates the hash when it falls back), scrolls to it, and flashes it. After the window `load` event it settles once more, because late images can shift the layout.
- The scroll-spy (`IntersectionObserver` with a band 30–35 % down the viewport) highlights the contents entry, points "Present ▶" at the current slide, and keeps the hash in sync via `history.replaceState`, so no history entries pile up.
- `A` / "Present ▶" → `audienceUrl(currentSlideId)`. In audience mode `R` → `readerUrl(id)`, where an agenda slide maps to the next real slide.

### Interactions
- **Popovers**: one shared element in the top layer (`popover="auto"`, so Esc and light dismiss work), filled per trigger and **positioned by JS** below the trigger (above when there is no room), kept inside the viewport and repositioned on scroll and resize. JS positioning was chosen over CSS anchor positioning because it works in every current browser. Mouse: hover opens after 250 ms, and the popover stays open while the pointer is over trigger or popover. Touch and keyboard: click/Enter toggles. Triggers get `aria-expanded` / `aria-controls`.
  - Glossary terms: content from `show.glossary` (the definition is rendered in audience mode, so there are no nested popups) plus a "Learn more" link.
  - Footnotes: the hidden `.slipr-footnote` sibling generated by `markdown.js`.
  - Hotspots: the hidden `.slipr-hotspot-content` inside the same image frame.
- **Details** are native `<details>/<summary>`. **Tabs** use the ARIA tablist pattern with roving `tabindex` and ←/→/Home/End.
- **Embeds** are `<iframe sandbox="allow-scripts allow-forms allow-popups" loading="lazy">`. Without `allow-same-origin`, an embedded page cannot touch the reader page.

### Search *(Phase 3)*
- `search.js` builds an in-memory inverted index at load (lower-cased, accent-folded tokens) over slide titles, slot text, block text, summaries and glossary. Notes are only included when enabled. Shows are small (hundreds of slides at most), so no library is needed.
- Results are ranked by field weight (title > summary > body) and term proximity. Clicking a result navigates to `#slide/block` and highlights the match with the CSS Custom Highlight API.

### Annotations *(Phase 3)*
- Anchoring follows the W3C Web Annotation idea: **block id + text-quote selector** (`prefix`, `exact`, `suffix`). This lets highlights survive small edits to the show. Orphaned annotations (text no longer found) are kept and listed separately.
- Highlights are drawn with the CSS Custom Highlight API, so the content DOM is not modified.
- Export/import: Markdown (readable) and JSON (lossless).

### Progress *(Phase 3)*
- A slide counts as *visited* once ≥ 50 % of it has been in view for 3 s (IntersectionObserver).
- `nav.js` will add progress marks to the contents entries it already renders (filtered by the active path).

## Dependencies

- `vendor/reveal.js-6.0.2/`: imported as ES modules (`dist/reveal.mjs`, `dist/plugin/{notes,zoom,search}.mjs`) plus `dist/reset.css` and `dist/reveal.css`. Loaded only in audience mode. Reveal's own themes are not used, because the Slipr template provides the looks.
- `shared/` modules. Reader mode has **no third-party dependencies**.

## Decisions & open questions

- D-008 → reader mode is its own app, not Reveal's scroll view (see `docs/decisions.md`).
- D-010 → reader data stays in the browser.
- Phones: when the slide frame is narrower than 640 px, the default template reflows the slide visual (container query on `.slipr-slide`) instead of scaling it. This is verified at 375 px, with no horizontal scrolling. Other templates must provide their own reflow rules.
- Below 900 px the contents list becomes a drawer behind the ☰ button.
- Profiles might eventually also change the *audience* layer (e.g. a different deck variant per audience). This is out of scope for now and listed in the backlog.
