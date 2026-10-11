# I-054: Single-file HTML export

Status: **done** (export command, and the editor's Export… button, I-085) · 2026-10-11 · Phase 6. Verified: both demos export and present in audience and reader mode with no network requests (served over http). Opening the file with `file://` was not tested in Claude's browser pane

## Goal

One `.html` file that contains a show, its template and the viewer, and presents **offline**: double-click it, no server, no internet. Both audience mode and reader mode work, including search, tailoring and personal notes (which stay in that browser, D-010). Typical uses: send a talk to someone, put it on a USB stick, attach it to an e-mail, keep an archive copy.

## Constraints

- The web apps stay vanilla ES modules with no build step (D-001). The export is a **generated artifact**: the app's own files are never bundled or changed for it.
- No runtime network calls (D-002): everything the show needs is inside the file.
- No npm dependencies: the packer is our own small module.

## Design

**Virtual origin.** Every file in the bundle gets a virtual address under `https://slipr.invalid/` (`.invalid` is reserved, so it can never be a real site), keyed by its path: `viewer/js/main.js`, `template/theme.css`, `show/show.json`, `show/images/…`. The show is placed at `show/`, its template at `template/`; the show's `template.ref` is rewritten to `../template`.

**Modules: an import map of `data:` URLs.** Every ES module the viewer can load (followed from `viewer/js/main.js` through static imports, dynamic imports with a literal path, JSON modules, and `new URL('literal', import.meta.url)`) is put in the page's import map as `virtual URL → data:` URL. A module loaded from a `data:` URL cannot resolve *relative* imports, so at export time each module's relative specifiers become absolute virtual URLs, and `import.meta.url` becomes the module's own virtual URL. That rewriting only touches import specifiers that start with `./` or `../`; JSDoc `import('…')` types are rewritten too, which is harmless.

**Other files: an embedded file table + a tiny runtime.** Show and template files are embedded once (text as-is, binaries as base64) in a `<script type="application/json">`. A classic script defines `globalThis.SLIPR_BUNDLE` with:
- `fetch(url)`: answers virtual URLs from the table (injected into `loadShow()`, which already takes a `fetch` option);
- `url(href)`: turns a virtual URL into an object (`blob:`) URL, for images, stylesheets, backgrounds and embed pages.

**Inlined at export time.** CSS `url(…)`s (fonts, images) become `data:` URIs, so a stylesheet works from a `blob:` URL; relative `src`/`href` in layout fragments become `data:` URIs, so `shared/render.js` leaves them alone; the viewer's own `viewer.css` goes into a `<style>`.

**Viewer changes (small):**
- `viewer/js/main.js`: when `SLIPR_BUNDLE` exists, load the bundled show with the bundle's `fetch`, and resolve show and template assets through `SLIPR_BUNDLE.url`.
- `viewer/js/dom.js` `addStylesheet`: map virtual URLs through `SLIPR_BUNDLE.url`.
- `viewer/audience/audience.js`: name Reveal's CSS files directly (`new URL('…/reset.css', import.meta.url)`), so the exporter finds them.

**Mermaid** (2.6 MB, 64 modules) is included only when the show has a diagram.

## Tools

- `shared/export/single-file.js`: the packer, DOM-free and environment-free. It gets a `readFile(path)` function, so the same code runs in Node and (later) in the editor.
- `npm run export -- <show folder> [output.html]`: a Node command (dev tooling).
- Later: an **Export…** button in the editor, using the same packer (reads the show through the folder handle and the app files from the server).

## Limits

- An embed page from the show folder works if it is self-contained (it becomes a `blob:` URL, so its own relative links do not resolve). External `https:` embeds need the internet, as before.
- Reader state uses `localStorage` for `file:` pages (IndexedDB may be unavailable there); `state.js` already falls back.
- The file is larger than the show folder (base64 adds about a third for images and fonts).
