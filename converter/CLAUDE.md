# CLAUDE.md: Converter

Read the root `CLAUDE.md` first. This file adds converter-specific guidance.

## Orientation in 60 seconds

- Pipeline: `pptx-reader` → `extract` → `map` → `emit`. Each stage is a pure function, and the CLI in `bin/` is the only place that touches the filesystem.
- The **intermediate model** (see ARCHITECTURE.md) is the seam between "understanding PowerPoint" and "producing Slipr". PowerPoint knowledge goes in `extract.js`/`text.js`, Slipr/template knowledge goes in `map.js`.
- Unlike the web apps, this component **may** use npm dependencies, but only `jszip` and `fast-xml-parser` so far. Keep `src/` browser-compatible: no `fs`, `path` or `Buffer` in `src/`; use `Uint8Array`.

## Invariants

- Never lose content silently. Anything that can't be placed goes to the slide's notes *and* the report.
- Never carry PowerPoint styling (colors, fonts, positions) into the show. The template owns the looks.
- Output must validate against `shared/schema/show.schema.json`.
- Never overwrite an existing output folder without `--force`.

## Working with OOXML

- Useful references: the ECMA-376 spec (PresentationML `p:`, DrawingML `a:`), and unzipping a `.pptx` by hand (`Expand-Archive` after renaming to `.zip`) to inspect the XML.
- Text lives in `p:sp/p:txBody/a:p/a:r/a:t`. The bullet level is `a:p/a:pPr/@lvl` (0-based, missing means 0).
- The placeholder type is `p:nvSpPr/p:nvPr/p:ph/@type`. A missing type on a placeholder means `body`.
- Image references: `p:pic/p:blipFill/a:blip/@r:embed` → slide `.rels` → `ppt/media/...`.
- The alt text is `p:pic/p:nvPicPr/p:cNvPr/@descr`.
- Notes: slide `.rels` → `notesSlideN.xml`. Take the body placeholder text and ignore the slide-image placeholder.
- `fast-xml-parser` returns a single child as an object and multiple children as an array. Always normalise with a `toArray()` helper.

## Testing

- `npm test` from `converter/` (or the root).
- To add a feature, first add a tiny fixture `.pptx` in `test/fixtures/` that contains *only* that feature, then a test, then the code.
- Don't commit real decks with confidential content as fixtures.
