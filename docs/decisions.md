# Decision log

This file explains *why* Slipr is built the way it is. Each decision has a status: **Proposed** (awaiting Lucas), **Accepted**, **Superseded by D-xxx**, or **Open** (needs investigation). Add new decisions at the bottom and never delete old ones; mark them superseded instead.

Template:

```
## D-000: Title
Status · Date
**Context**: what problem or choice we faced
**Decision**: what we chose
**Consequences**: what this makes easier / harder
```

---

## D-001: Vanilla web stack, no build step
**Accepted** · 2026-10-10
**Context**: Slipr is personal software that must stay easy to maintain for one person plus AI agents, for years.
**Decision**: The viewer and editor use plain HTML, CSS and JS ES modules plus Reveal.js. There is no bundler, framework or transpiler. Types come from JSDoc with `// @ts-check`.
**Consequences**: There is no toolchain churn and any static server works. In return, UI state management stays hand-written (see the editor's store), and npm packages cannot be used in browser code unless they ship as ES modules and are vendored.

## D-002: Third-party code vendored, no runtime CDN
**Accepted** · 2026-10-10
**Context**: Presentations happen at venues with unreliable Wi-Fi.
**Decision**: Reveal.js (and any later library) is checked into `vendor/<lib>-<version>/`. Fonts live in the template's `assets/`.
**Consequences**: Shows work fully offline. Upgrades are explicit, by replacing the folder and logging it in the changelog.

## D-003: A show is a folder with `show.json` + `images/`
**Accepted** · 2026-10-10
**Context**: Shows need images, and must be easy to inspect, diff (git) and edit by hand.
**Decision**: A show is a folder. Images are referenced by relative path. A zipped `.slipr` package is a later addition for sharing.
**Consequences**: Shows are git-friendly and inspectable. Sharing a show means sharing a folder until packaging exists.

## D-004: Layouts are HTML fragments with `data-slot` attributes
**Accepted** · 2026-10-10
**Context**: Templates need to be authorable by hand, and the renderer must stay tiny.
**Decision**: Each layout is a static HTML fragment. The renderer fills elements marked `data-slot="name"` according to the slot type. There is no template language and no logic.
**Consequences**: Templates are simple to write and preview. Anything conditional is done in CSS (`[data-empty]`, mode classes). Very dynamic layouts would need a new slot type.

## D-005: One shared renderer for all modes and the editor preview
**Accepted** · 2026-10-10
**Decision**: `shared/render.js` is the only code that turns slide data into HTML. The audience view wraps its output in Reveal.js sections, reader mode in article sections, and the editor in a scaled preview frame.
**Consequences**: What you see in the editor is what you present. Mode-specific differences must be expressed through CSS classes, not separate renderers.

## D-006: Converter in Python with python-pptx
**Accepted** · 2026-10-10 (first proposed as Node.js, changed the same day)
**Context**: PPTX is a zip of XML files. The converter is a batch tool, not part of the live presenting path. JavaScript has no well-maintained library for *reading* PPTX, so a Node converter would parse OOXML by hand (relationships, placeholder inheritance, namespaces, text runs).
**Decision**: The converter is a Python (≥ 3.11) package `slipr_convert` built on `python-pptx`, with `jsonschema` for validation and `pytest` for tests. It has a pure core (`convert()` → `ConversionResult`) and a thin CLI `slipr-convert`.
**Consequences**:
- Much simpler extraction code, and robust handling of real-world decks.
- Tables and real chart data become cheap to support.
- Test decks can be generated in code.
- Slipr now has two languages and toolchains (npm for the web side, venv/pip for the converter).
- The converter cannot reuse `shared/validate.js`. The shared JSON Schema is the contract instead.
- Importing a PPTX inside the editor (I-023) would need Pyodide or a small local helper process instead of running the same JS core.
*Alternative rejected:* Node.js with `jszip` + `fast-xml-parser`, which would mean one language but much more hand-written OOXML parsing.

## D-007: Editor saves through the File System Access API
**Accepted** · 2026-10-10
**Context**: The editor runs in the browser without a backend but must read and write show folders.
**Decision**: Use `showDirectoryPicker()` to open a show folder and write `show.json` and images directly. Drafts are kept in IndexedDB for crash recovery. Fallback: download `show.json` or a zip.
**Consequences**: The editor needs a Chromium browser (Edge or Chrome), which is acceptable for personal software. There is no server to run or secure.

## D-008: Reader mode is its own application, not Reveal.js scroll view
**Accepted** · 2026-10-10 (revised the same day)
**Context**: Reveal.js (since version 5) has a built-in *scroll view*. Reader mode, however, is meant to be a very different, highly interactive experience: popups, collapsible panels, tailored content, personalised navigation, search and annotations.
**Decision**: Reader mode is a separate vanilla-JS app inside `viewer/reader/`. It renders slide visuals via `shared/render.js` and reader blocks via `shared/blocks.js`, and does not use Reveal.js.
**Consequences**: Full control over interaction, layout and accessibility. More code to own, which is why reader mode gets its own modules and tests. Audience mode stays a thin Reveal.js layer.

## D-009: Two-layer content model (audience layer + reader layer)
**Accepted** · 2026-10-10
**Context**: Audience slides should stay concise. Readers want much more detail, tailored to who they are.
**Decision**: A slide has `content` (slots of the layout: the audience layer) and `reader` (`summary`, `blocks[]`, `related[]`: the reader layer). Blocks are typed, have stable ids, and can be filtered by `for` (profiles) and `depth` (1–3). Show-level `chapters`, `glossary`, `profiles` and `paths` support navigation and tailoring. Markdown gains `[[glossary]]` and `^[popup]` syntax.
**Consequences**: One source for both experiences, and the reader layer never clutters the slides. The editor needs a block editor next to the slot form. Block types are an extension point: new interactive elements are added as new block types, not as free HTML.

## D-010: Reader personal data stays in the browser
**Accepted** · 2026-10-10
**Context**: Personalised navigation and annotations need state (profile, depth, path, progress, bookmarks, highlights, notes).
**Decision**: Store it client-side in IndexedDB, keyed by `show.id`, with export/import as Markdown/JSON. There is no backend, no accounts and no analytics.
**Consequences**: It is private and works on any static host. State does not sync across devices. Optional sync, or shared annotations, would need a backend later (backlog idea).

## D-011: Embed architecture, click-to-load, approved libraries
**Accepted** · 2026-10-12 (Lucas; backlog I-070, spec `docs/specs/I-070-embed-foundation.md`)
**Context**: Rich content (diagrams, web pages, PDFs, graphs, maps) needs third-party libraries or other servers. Without a common shape each kind would invent its own rendering, loading and fallback, the core would grow with every library, and content from other servers would be fetched without the reader's consent (against D-010).
**Decision**:
- **One module per embed kind**, `shared/embeds/<kind>.js`, registered in `shared/embeds/index.js`. Every kind is available as an audience **slot type** and a reader **block type**; `render.js` and `blocks.js` call the registry and never render a kind themselves.
- **Two-step rendering**: the renderers write an embed element with a **static fallback** inside (the value's optional `fallback` image, or the kind's own: Mermaid source, a link card); `hydrateEmbeds(root)` then renders the live content. Print, editor thumbnails and failures fall back to the static content.
- **Libraries are vendored (D-002) and lazy-loaded**: a kind imports its library only when the first embed of that kind is hydrated, and the single-file export leaves out the libraries of kinds a show does not use.
- **Click-to-load**: content from another server waits behind a **Load** button that names the site. Consent is remembered **per site (origin) for the tab** (sessionStorage), never persisted. The author may set **`load: "auto"`** on an embed to load it straight away; the default is click-to-load. Files next to `show.json` always load directly.
- **Styling** comes from the template's `--slipr-*` tokens (`shared/embeds/embeds.css`); kinds keep their template hooks (e.g. `.slipr-diagram`).
- **Approved libraries**: Mermaid (in use, `vendor/mermaid-11.4.1`, I-073), Cytoscape.js (I-074), Leaflet (I-075) and PDF.js (I-072, if its spike chooses it over the browser's built-in viewer). Another library needs a new decision.
**Consequences**: Show format 0.2 (still a draft) gains `fallback` on embed values and `load` on embeds; a 0.1 show using them is an error. Adding a kind is one module plus a slot/block type in the schema and spec. A reader who wants an external page must click once per site and tab. Editor thumbnails show web pages as their card. An author who chooses `load: "auto"` takes responsibility for that page contacting its server.
**Refined** · 2026-10-12 (Lucas, while specifying I-071): click-to-load is a **reader-mode** rule. In **audience mode** a web page slot is `present: "live"` (default, loads without a Load button: the presenter's own laptop, the author chose the page) or `"static"` (shows the fallback screenshot, never contacts the page). Authors may loosen the frame sandbox per page from an allow-list (`same-origin`, `fullscreen`, `modals`, `downloads`, `presentation`); `same-origin` only applies to pages on other servers. Reader frames take an `aspect` ratio or a `height`. Spec: `docs/specs/I-071-website-embed.md`.
**Refined** · 2026-10-12 (Lucas, I-072): the PDF spike chose **PDF.js** (vendored as `vendor/pdfjs-4.10.38`) over the browser's built-in viewer, which cannot give Slipr the text for search, cannot step through pages on fragments, differs per browser, and is refused by Chrome inside sandboxed frames. PDFs may come from the show folder or from `https:` (click-to-load in reader mode; the server must allow CORS). Spec: `docs/specs/I-072-pdf-document.md`.

## D-012: Show folders outside the server root (shared folder handle, templates by name)
**Accepted** · 2026-10-10 (options and trade-offs: `docs/specs/E-007-shows-outside-server-root.md`)
**Context**: The editor opens show folders with `showDirectoryPicker()` (D-007). A directory handle has no path or URL, so the viewer can't load such a show by URL, and a relative `template.ref` that points outside the folder can't be read through the handle. For new shows, the editor also can't compute a relative ref.
**Decision**: (1) The editor and the viewer share the folder **handle** through IndexedDB (same origin) and load the show through a read-only folder source (`shared/folder-source.js`), with images turned into `blob:` URLs. The editor uses `editor/?folder=<key>`, and the viewer will use `viewer/?folder=<key>` (E-007). Present and Read save first. (2) New shows reference their template **root-relative** (`"ref": "/templates/<id>"`), which is still a valid URL reference, so the format doesn't change. When a show is loaded from a folder, a ref that leaves the folder resolves **by name** against Slipr's own `templates/<last segment>/`, and the editor shows a notice.
**Consequences**: Shows can live anywhere on disk. Loading by folder is Chromium-only, while `?show=` URLs keep working everywhere. After a reload, access may need one click to re-grant, never a prompt on page load. A root-relative ref assumes Slipr is served at the root of its host. Templates inside a show folder are not supported yet. Presenting unsaved drafts (a snapshot hand-off) was rejected for now and can be added later on top of the same loader.

## D-013: Extra images may be placed freely on a slide
**Accepted** · 2026-10-11 (Lucas; backlog I-083)
**Context**: Layouts offer a fixed set of image slots. Real decks often need an extra picture, a logo or an arrow exactly where the author wants it, and the PPTX converter meets pictures that fit no placeholder (they end up in the reader layer today). The hard rule "slides contain no styling; visual decisions belong in the template" (CLAUDE.md) does not allow that.
**Decision**: A slide may carry extra images on top of its layout, placed and sized freely by the author. This is an accepted exception to "slides contain no styling", limited to these images: everything else stays template-driven.
- Position and size are fractions of the slide canvas (like hotspots), so the images scale with the slide.
- They sit **in front of** the layout's content.
- In reader mode they **scale with the slide** (no separate reflow).
- They can appear **one by one** in audience mode (fragments).
- The PPTX converter **uses them** for pictures that fit no placeholder, instead of moving those to the reader layer.
**Consequences**: A show-format change (a new slide field, schema + spec + version bump, a migration is not needed because the field is optional). `shared/render.js` gets an absolutely positioned layer over the canvas; the editor gets drag and resize on the preview with keyboard alternatives; validation checks that images stay inside the canvas and have alt text. Free placement can clash with a template's design, so it is the author's responsibility; templates keep full control of everything else.
**Refined** · 2026-10-11 (Lucas, while specifying I-083): on narrow screens in reader mode a slide with extra images **keeps its picture layout** instead of reflowing (it gets the mode class `slipr-mode-reader-fixed`). The field is `slide.overlays` in show format **0.2**; 0.1 stays valid, and a show becomes 0.2 when it gets its first extra image. Spec: `docs/specs/I-083-extra-images.md`.

## D-014: Picture styles are template presets, plus a free opacity
**Accepted** · 2026-10-11 (Lucas; backlog I-084)
**Context**: Authors want effects on pictures: a drop shadow, soft edges, transparency. Free effect values per picture would let every show drift from its house style; presets alone cannot express "this photo at 40 %".
**Decision**: Option (c). A template defines named **picture styles** (for example `shadow`, `soft`, `faded`): each is a CSS class in its `theme.css`, listed in `template.json` with a label so the editor can offer it. A picture (image slot, card image, reader image block, or an extra image from D-013) may name one style. On top of that, a picture may have a free **opacity** (0–100 %). The opacity is the only free value, and it is an accepted exception to "slides contain no styling" alongside D-013; the styles themselves stay in the template.
**Consequences**: A show-format change on the image value (for example `style` and `opacity`) and a template-format change (the list of picture styles); schemas, specs and version bumps. Each template designs its own on-brand styles (the Conclusion template can match its brand). The PPTX converter maps PowerPoint's picture effects to the closest style the template offers and keeps the transparency as opacity. A show that names a style the template does not have renders the picture unstyled, with a validation warning.
**Refined** · 2026-10-11 (Lucas, while specifying I-084): `style` and `opacity` belong to show format **0.2** (with the extra images of D-013); `pictureStyles` is template format **0.3**. Both templates offer `shadow`, `soft`, `rounded` and `frame` (Conclusion: on-brand, subject to I-043d). Opacity is stored as 0–1. Spec: `docs/specs/I-084-picture-styles.md`.

## D-015: Glossary terms are linked automatically in reader-mode slides
**Accepted** · 2026-10-11/12 (Lucas; backlog I-086)
**Context**: Slides use glossary words in titles, bullets and card fields, but only `[[term]]` Markdown became a popup, and plain `text` slots cannot hold markup at all. Readers met terms on the slide without a way to look them up.
**Decision**: In reader mode, the renderer links the **first occurrence of each term per slide** automatically: whole words, case- and accent-insensitive, longest term first. **Always on**, no show setting. **Pin mode keeps priority**: while placing a pin, a click on a term places the pin. Other names come from an optional **`aliases`** list per glossary term (option b), part of show format **0.2**. Audience mode is unchanged.
**Consequences**: `shared/glossary.js` (matching, DOM-free; linking, browser), called by `shared/render.js` in reader mode; `aliases` in the schema, validator (0.1 → error; a name on two terms → warning), reader search and the editor's Show settings. Matching works per text node, so a term split by formatting is not found. Spec: `docs/specs/I-086-glossary-in-slides.md`.

## D-016: Text elements may be placed and styled freely on a slide
**Accepted** · 2026-10-13 (Lucas; backlog I-089)
**Context**: Layouts offer a fixed set of text slots. Real decks have badges, labels on photos, callouts and pills placed exactly where the author wants them, and the PPTX converter meets text boxes that fit no placeholder (their text ends up in the reader layer today). D-013 allowed this for images only, and D-014 kept picture looks to template presets plus one free value.
**Decision**: A slide may carry **text elements** on top of its layout: entries in `slide.overlays` with `text` (inline Markdown) instead of `image`, placed like extra images (D-013). Unlike pictures (D-014), their look is set with **free values** on the element: font (the template's heading / body / code font, or a platform font), size, bold / italic / underline / uppercase, alignment, text color, fill with opacity, border, corner radius, text outline and padding. This is an accepted exception to "slides contain no styling", limited to these elements. The editor offers the template's palette and fonts **first** and a free value second; the converter keeps a PowerPoint text box's look. Part of show format **0.2** (optional field, no bump).
**Consequences**: Schema, spec and validator changes; a DOM-free style module (`shared/text-style.js`) that only emits checked values. A show can drift from its house style through these elements; that is the author's choice, and the editor's palette-first controls make the on-brand choice the easy one. Named text styles in the template (like picture styles) remain possible later. Spec: `docs/specs/I-089-text-elements.md`.
