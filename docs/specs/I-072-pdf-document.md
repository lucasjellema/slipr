# I-072: PDF document

Status: **done** 2026-10-12 · Builds on I-070 · Decision: D-011 (refined)

## Spike: built-in viewer or PDF.js

| | Browser's built-in viewer (iframe `#page=n`) | PDF.js (vendored) |
|---|---|---|
| Text for Slipr search | no (the viewer is a closed plugin) | yes (`getTextContent`) |
| Audience fragments stepping pages | only by reloading the frame | yes (render another page) |
| Same look everywhere | no (Chrome, Edge, Firefox, Safari differ; mobile often downloads instead) | yes |
| Inside Slipr's sandboxed frames | Chrome refuses PDFs in sandboxed iframes | not a frame |
| Cost | none | ~4 MB in `vendor/`, lazy-loaded only for shows with PDFs |

Result: **PDF.js 4.10.38**.

## Lucas's decisions (2026-10-12)

1. Download PDF.js 4.10.38 from npm (`pdfjs-dist`), vendor only what's needed (`vendor/pdfjs-4.10.38/`, see its `VENDORED.md`).
2. PDFs from the **show folder and https** (click-to-load in reader mode, CORS needed).
3. **`page` or `pages: [first, last]`**: audience mode starts at the first page and each click steps to the next; reader mode limits navigation to the range. Neither: page 1 on a slide, the whole PDF in a reader block.
4. **Search**: PDF text is extracted when the reader first searches (the shown pages, at most 200 per PDF); results open the PDF at the page. Nothing stored in show.json.

Also chosen here (consistent with I-071): `pdf` layouts in both templates (default 1.3.0, Conclusion 0.1.3).

## Notes

- The file is in a **`pdf`** key, not `src` as the backlog sketched: an object with `src` is an image value everywhere in Slipr (validation, the editor's key order, export).
- Rendering uses PDF.js's **print intent**: the default display intent paints in `requestAnimationFrame` callbacks, which never run in a hidden tab, so a deck opened in the background (or a hidden preview) would stay empty. Print intent leaves out annotations meant for screens only.
- Audience mode used to wait for all embeds before showing the deck; with PDFs that could take seconds (or forever in a hidden tab), so embeds now render in the background.
- Single-file export: the PDF.js worker cannot start from a file inside the export, so there it runs on the page (`globalThis.pdfjsWorker`). Character maps and standard fonts are not embedded there; PDFs with embedded fonts (nearly all) are unaffected.
- Local PDFs are listed by `collectImagePaths()`, which gives them file checks, `blob:` URLs when a show is opened from a folder, and a place in exports.

## Not verified here

Claude's browser pane never fires `requestAnimationFrame`, so Reveal navigation could not be driven there; stepping was checked by toggling the fragments' `visible` class, the way Reveal does.
