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

Built so far (Phases 1–3, plus slide and object annotations and cards support) is marked ✅. Everything else is planned.

```
viewer/
├── index.html              ✅ minimal shell: <div id="app">, <script type="module" src="js/main.js">
├── css/
│   └── viewer.css          ✅ chrome shared by both modes (loading, help and error pages)
├── js/
│   ├── main.js             ✅ entry: read URL params, load + validate, start mode app
│   ├── dom.js              ✅ h() element builder (never parses HTML), addStylesheet()
│   ├── error-view.js       ✅ help page, load-error page, validation-error page, folder access page
│   └── mode-switch.js      ✅ audienceUrl() / readerUrl() by slide id, parseReaderHash()
├── audience/
│   ├── audience.js         ✅ build <section>s, configure and start Reveal
│   ├── agenda.js           ✅ generated agenda slides + chapter progress bar
│   ├── audience.css        ✅ Reveal integration, agenda and progress-bar styles
│   └── visuals.js          build-up of charts/diagrams on fragment events (with the chart slot type)
└── reader/
    ├── reader.js           ✅ app shell: top bar, contents, article; routing (#s-05/b3); keys
    ├── state.js            ✅ reader state: pure store + migrate(); IndexedDB → localStorage → memory adapters
    ├── personalize.js      ✅ pure: (show, prefs) → visible model; prefs from URL; nearest visible slide
    ├── nav.js              ✅ contents with progress marks + bookmarks, scroll-spy, visit tracker
    ├── interactions.js     ✅ popover wiring (glossary, footnotes, hotspots), ARIA tabs
    ├── search-index.js     ✅ pure: build index, search, snippets (accent-insensitive, word-prefix)
    ├── search.js           ✅ search dialog + on-page highlight of matches
    ├── quote.js            ✅ pure: text-quote anchoring (describe / locate)
    ├── pin.js              ✅ pure: pin geometry (point ↔ object/canvas fractions), object labels
    ├── annotations.js      ✅ text highlights, slide notes, pins; "My notes" panel, export/import
    ├── notes-export.js     ✅ pure: Markdown / JSON export, JSON merge-import
    ├── tailor.js           ✅ choices form, first-visit welcome dialog, Tailor panel
    └── reader.css          ✅ page structure; block and popover styling comes from the template

viewer/test/
    ├── personalize.test.js ✅ node --test
    └── phase3.test.js      ✅ state, quote, search, notes export
```

## Start-up (`main.js`)

0. A single-file export (I-054; `globalThis.SLIPR_BUNDLE` is defined by the exported page before any module runs) → `loadShow()` with the bundle's `fetch` for the bundled `show.json`, template and layouts; `resolveAsset` and `resolveTemplateAsset` are wrapped so show and template files become object URLs (`SLIPR_BUNDLE.url`). `addStylesheet` (`js/dom.js`) maps virtual URLs the same way, so module-relative stylesheets (`audience.css`, `reader.css`, Reveal's CSS) load from the file too. URL parameters (`mode`, `profile`, `depth`, `path`) and hashes work as usual. How the file is packed: `docs/specs/I-054-single-file-export.md`.
1. No `show` or `folder` parameter → help page with links to the demo, and "Open a show folder…" where the File System Access API exists (it remembers the folder and reloads as `?folder=<key>`).
2. `?folder=<key>` → the handle comes from `shared/folder-handles.js` and the show from `loadShowFromFolder()` (D-012). An unknown key shows the load-error page. Without read permission, an access page asks for it from a click (`showAccessPage()`). Loader notices (template resolved by name) go to the console.
3. `loadShow()` or `loadShowFromFolder()` → a `LoadError` (not found, invalid JSON, server unreachable) shows the load-error page. The "start the dev server" hint is only shown when the server could not be reached at all.
4. Validation errors → validation-error page listing each issue with its path. Warnings go to the console (collapsed group) and never block a show.
5. Set `document.title` and `lang`, load the template's `theme.css`, then dynamically `import()` the mode module, so Reveal.js is only fetched in audience mode.

## Audience mode

- `audience.js` loads Reveal's `reset.css` + `reveal.css` and `audience.css`, waits for `document.fonts.ready`, then builds `.reveal > .slides > section` per slide, filled by `renderSlide(slide, ctx, { mode: 'audience' })`.
- Each `<section>` gets `id = slide.id`, so Reveal's own `#/slide-id` deep links work. In-show Markdown links `[x](#s-id)` are rendered with `href="#/s-id"`, so no click handling is needed.
- Every `[data-slot]` element gets `data-id="slot-<name>"`, so **auto-animate** morphs the same slot between consecutive `audience.autoAnimate` slides. Reveal matches list items and images by content automatically, and unmatched items fade in.
- `audience.fragments` adds `class="fragment [style]"` to every `<li>`, nested ones included, and to every card of a `cards` slot (`.slipr-card`). List items inside a card are not split further.
- Extra images (`slide.overlays`, I-083): an overlay with `fragment` gets `class="fragment [style]"` on its box (`div.slipr-overlay`), after the slide's own fragments. The box, not the `<img>`: the picture carries its inline opacity (I-084), which would otherwise beat Reveal's fragment opacity.
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
                       stored prefs + Tailor panel / welcome ◄──────────────────┘
```

- **`personalize.js`** is pure and DOM-free (tests in `viewer/test/`). It applies the path (selection and order; `"*"` = all), drops `reader.hidden` slides, filters blocks by `for` (no profile chosen = show all) and `depth ≤ level` (default 2), and groups consecutive slides by chapter. `nearestVisibleSlide()` maps a requested id onto what is visible: the nearest earlier visible slide in show order, then the nearest later one.
- **Rendering** (`reader.js`): a hero header from `meta` (plus a "Tailored: …" note with a link back to the standard version when prefs differ from the default), one `<section>` per chapter run, and per slide an `<article id="{slide.id}">`. Each article holds a heading (visually hidden when the slide visual is shown), the slide visual (`shared/render.js`, `mode: 'reader'`, lazy images; glossary terms on it are linked by the renderer, I-086; a slide with extra images gets `slipr-mode-reader-fixed` and keeps its picture layout on narrow screens, I-083), the summary, blocks (`shared/blocks.js`, HTML strings), a collapsed "What the presenter said" panel, and "See also" links.
- **State** (`state.js`): `{ prefs, showNotes, welcomed, position, visited, bookmarks, annotations }` per `show.id`. A small pure store (`get` / `update` / `subscribe`) saves with a 300 ms debounce, and flushes on `pagehide` and when the tab is hidden. The adapter is IndexedDB (`slipr-reader` database), else localStorage, else memory (private modes). `migrate()` repairs anything stored, so a corrupt or old state never breaks the page.
- **Effective prefs** = stored prefs overlaid with URL parameters. URL parameters apply for the visit. Once the reader changes something in the Tailor panel, they are removed from the URL (`replaceState`) and the stored prefs take over.
- **Re-rendering** (`render()`): on any prefs change the article and contents are rebuilt, the scroll-spy, visit tracker and highlights are re-created, and the reader is scrolled back to the slide they were on (or the nearest visible one).

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

### Search
- `search-index.js` (pure) builds one document per slide (title, summary, slot text, including card fields and card image alt text), per reader block (titles, captions, tab and hotspot labels, Markdown bodies), per presenter-notes text and per glossary entry. Text is folded (lower case, accents stripped) with an index map back to the original, so snippets and highlights point at the right characters.
- Matching: every query word must match the start of a word in the document (AND). Score = the best field weight per word (title 5 > summary / label 3 > content 2 > body 1), plus 2 for the full phrase. Shows are small, so a linear scan is fast enough and no inverted index is needed.
- Results respect the tailoring: matches in hidden content are only counted, with a "show everything" action. Presenter notes are searched only while they are shown.
- `search.js`: a modal `<dialog>` that searches as you type (↑/↓/Enter). The chosen result is reached through the normal routing, and the query words inside the target are marked with the CSS Custom Highlight API (`slipr-search`) for 5 s.

### Annotations
- Three kinds (`kind` in `state.js`, absent = `text`):
  - **text**: a quote in a reader block (`.slipr-block[data-block-id]`), the slide summary (`blockId "_summary"`), or a text slot of the slide visual (`blockId "slot:<name>"`, found via `[data-slot]` inside `.reader-slide-frame`)
  - **slide**: a note on the slide as a whole, shown as a "✎ n notes" chip in the slide's header row
  - **pin**: a note attached to an object on the slide visual
- Creating: the selection must start and end in one scope. Its offsets in `scope.textContent` are computed with a `Range` (so hidden footnote text counts consistently), trimmed, and stored as a **text-quote selector** (`exact`, plus 32 characters of `prefix` / `suffix`, in `quote.js`) together with `slideId` and `blockId`.
- **Pins** (`pin.js` + `annotations.js`): "📍 Pin" puts a transparent capture layer over the slide frame plus a bar listing the slide's objects (filled slots, with list slots split into bullets and cards slots into cards, via `itemsOf()`), which is the keyboard-accessible way to pin. A click finds the object under the point (`elementsFromPoint` → innermost `li` or `.slipr-card`, else the slot element `[data-slot]:not([data-field])`, else the canvas) and stores `{ slot, item, x, y, cx, cy, label }`: the position within the object, and within the canvas as a fallback. Pins are drawn as numbered buttons inside the frame, positioned in % of the frame. A `ResizeObserver` recomputes them when the layout changes, so they follow their object through reflow. A pin whose object can't be found falls back to the canvas position and is drawn grey (`is-approximate`).
- Drawing text: after every render, each annotation is re-anchored with `locateQuote()` (the best-matching occurrence wins) and mapped back to a DOM `Range`. All ranges go into one `Highlight` (`slipr-annotation`), so the content DOM is never modified. A click on highlighted text (`caretPositionFromPoint` → `Range.isPointInRange`) opens its note.
- The "My notes" panel lists notes in show order, plus two separate groups: *hidden by your tailoring* (the slide, block or slide visual exists but isn't shown) and *no longer found* (the slide or block is gone, or the quote can't be located). Notes are never deleted automatically.
- Export: Markdown (with bookmarks) and JSON `{ slipr: "notes", version, show, annotations }`. Import merges by id, and the most recently `updated` version wins. Files for another show are refused.

### Progress & bookmarks
- `trackVisits()`: a slide counts as *read* once ≥ 50 % of it (or half the viewport, for tall slides) has been in view for 3 s. The contents list shows the marks and "n of m read".
- The position (last slide read) is saved by the scroll-spy. On a visit without a hash, a toast offers "Continue with …".
- Bookmarks: the ★ button per slide, or `M`. They are listed at the top of the contents and included in the Markdown export.

## Dependencies

- `vendor/reveal.js-6.0.2/`: imported as ES modules (`dist/reveal.mjs`, `dist/plugin/{notes,zoom,search}.mjs`) plus `dist/reset.css` and `dist/reveal.css`. Loaded only in audience mode. Reveal's own themes are not used, because the Slipr template provides the looks.
- `shared/` modules. Reader mode has **no third-party dependencies**.

## Decisions & open questions

- D-008 → reader mode is its own app, not Reveal's scroll view (see `docs/decisions.md`).
- D-010 → reader data stays in the browser.
- Phones: when the slide frame is narrower than 640 px, the default template reflows the slide visual (container query on `.slipr-slide`) instead of scaling it. This is verified at 375 px, with no horizontal scrolling. Other templates must provide their own reflow rules.
- Below 900 px the contents list becomes a drawer behind the ☰ button.
- Profiles might eventually also change the *audience* layer (e.g. a different deck variant per audience). This is out of scope for now and listed in the backlog.
