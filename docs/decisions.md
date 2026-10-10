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

## D-006: Converter in Node.js with an environment-agnostic core
**Proposed** · 2026-10-10
**Context**: PPTX is a zip of XML files. Parsing it needs a zip library and an XML parser. The converter is a batch tool, not part of the live presenting path.
**Decision**: The converter is written in JavaScript (Node.js ≥ 20). The core (`converter/src/`) takes a `Uint8Array` and returns `{ show, assets[], report }` without touching the filesystem. A thin CLI wraps it. Dependencies: `jszip`, `fast-xml-parser`.
**Consequences**: There is one language across Slipr, and the converter can reuse `shared/validate.js`. The same core can later run in the browser (drag a `.pptx` onto the editor) because both dependencies work there. *Alternative considered:* Python with `python-pptx`. It is more mature for reading PPTX but would split the stack.

## D-007: Editor saves through the File System Access API
**Accepted** · 2026-10-10
**Context**: The editor runs in the browser without a backend but must read and write show folders.
**Decision**: Use `showDirectoryPicker()` to open a show folder and write `show.json` and images directly. Drafts are kept in IndexedDB for crash recovery. Fallback: download `show.json` or a zip.
**Consequences**: The editor needs a Chromium browser (Edge or Chrome), which is acceptable for personal software. There is no server to run or secure.

## D-008: Reader mode is its own application, not Reveal.js scroll view
**Accepted** · 2026-10-10 (revised the same day)
**Context**: Reveal.js 5 has a built-in *scroll view*. Reader mode, however, is meant to be a very different, highly interactive experience: popups, collapsible panels, tailored content, personalised navigation, search and annotations.
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
