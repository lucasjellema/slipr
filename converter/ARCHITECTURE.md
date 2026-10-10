# Converter: architecture

## Overview

The converter is a Python package (`slipr_convert`) built on **`python-pptx`**. It is a pipeline of stages. The **core** has no filesystem side effects: it takes a `.pptx` (path, bytes or file-like object) and returns a `ConversionResult`. Only the **CLI** writes files. This keeps the core easy to test, and leaves the door open to running it in the browser later via Pyodide (backlog I-023).

```
 deck.pptx
      │
      ▼
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │   reader     │──►│   extract    │──►│   mapping    │──►│    emit      │
 │ python-pptx  │   │ → neutral    │   │ → Slipr      │   │ show dict +  │
 │ + raw XML    │   │   slide model│   │   layouts    │   │ assets+report│
 └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                              ▲                   │
                                     template.json     shared/schema/show.schema.json
                                                         (validated with jsonschema)
```

## File structure

```
converter/
├── pyproject.toml            package metadata; deps: python-pptx, jsonschema; dev: pytest
│                             console script: slipr-convert = slipr_convert.cli:main
├── src/slipr_convert/
│   ├── __init__.py           exposes convert(), write_show(), ConversionResult
│   ├── cli.py                argparse, template + mapping loading, relative refs, write output, summary
│   ├── convert.py            convert(source, template, …) → ConversionResult (the pure core)
│   ├── model.py              dataclasses: TextBody, ImageRef, SlideModel, DeckModel, Asset, ConversionResult
│   ├── reader.py             open the deck; raw-XML helpers (sections, hidden, alt text, builds,
│   │                         graphic kinds, line breaks, explicit + inherited bullets). The ONLY module touching XML
│   ├── extract.py            python-pptx objects → DeckModel / SlideModel
│   ├── text.py               paragraphs/runs → Slipr Markdown (levels, bold, italic, links, escaping)
│   ├── mapping.py            SlideModel → Slipr slide dict (layout choice + slot filling + reader-layer leftovers)
│   ├── emit.py               show dict (meta, settings, chapters, slides), image assets, report; write_show()
│   ├── report.py             per-slide decisions and losses → conversion-report.md
│   └── validate.py           jsonschema validation against <repo>/shared/schema/*.schema.json
└── tests/
    ├── conftest.py           builds the sample deck *in code* (python-pptx default layouts, generated PNGs,
    │                         injected sections, alt text, build animation, hidden slide, table)
    ├── test_convert.py       end-to-end: slide by slide
    ├── test_mapping.py       layout choice and slot filling on hand-made models
    └── test_cli.py           CLI behaviour + cross-check with the JavaScript validator (shared/validate.js)
```

## Stages

### 1. `reader.py`: opening the deck
- `open_presentation()` accepts a path, bytes or a file object, and turns every python-pptx failure into a `ReadError` with a readable message.
- Gaps in python-pptx's public API, filled here with lxml on the underlying elements:
  - **Sections**: `p14:sectionLst/p14:section` (namespace `http://schemas.microsoft.com/office/powerpoint/2010/main`), matched to slides via `slide.slide_id`.
  - **Hidden slides**: attribute `show="0"` on the slide element.
  - **Alt text**: the `descr` attribute on the shape's `p:cNvPr`. A bare file name ("image.png") is treated as no alt text: tools fill that in automatically.
  - **Build animations**: `p:timing//p:bldP`.
  - **Graphic frames**: `a:graphicData/@uri` → table, chart, SmartArt, OLE.
  - **Line breaks**: `paragraph_parts()` yields runs, fields and `<a:br>` in order (python-pptx's `runs` drops breaks).
  - **Bullets**: the paragraph's explicit `buNone` / `buChar` / `buAutoNum`, else `inherited_bullet()`, which looks up the layout placeholder's and then the master placeholder's `lstStyle/lvlNpPr` (via python-pptx's `_base_placeholder`). This matters: e.g. a "Section Header" description has *no bullets* by layout.
- Keeping all private (`_element`) access in this one module limits the damage when python-pptx changes.

### 2. `extract.py`: intermediate model
Per slide a `SlideModel`: `index`, `slide_id`, `layout_name`, `hidden`, `section`, `title`, `subtitle`, `bodies` (TextBody: Markdown, `is_list`, placeholder type, position), `images` (ImageRef: blob, ext, sha1, alt, box), `notes`, `unsupported`, `has_build_animations`. Plus a `DeckModel` with title, author, date (modified, else created), aspect ratio and section names.

- Placeholder types decide what goes where: TITLE / CENTER_TITLE → title, SUBTITLE → subtitle, date / footer / slide-number placeholders are ignored, everything else with text becomes a body.
- Group shapes are walked recursively. Bodies and pictures are sorted in reading order (top, then left).
- Only `slide.shapes` is read, so logos and decorations from the layout/master are left out on purpose.
- `slide.has_notes_slide` is checked before `notes_slide`, because merely accessing `notes_slide` creates one.

### 3. `text.py`: Markdown
- Bulleted paragraphs become `- item`, with two spaces per level. Other paragraphs become Markdown paragraphs. Line breaks become a space inside list items and a line break in paragraphs.
- Runs: `**bold**`, `*italic*`, `[text](url)` (only http(s)/mailto links). Neighbouring runs with the same formatting are merged first, so there is never `**a****b**`.
- `\ ` `` ` `` `*` `_` `[` `]` in the source text are escaped, so a literal "*" or "[x]" stays literal in Slipr.

### 4. `mapping.py`: choosing the layout and filling it
Layout choice (template-agnostic: it only looks at slot *types*):
1. **Explicit**: `--mapping`, then `template.pptxMapping`, by PowerPoint layout name. Skipped when the slide has pictures and the mapped layout has no image slot (while another layout does).
2. **Title-only slides**: `title` for the first slide, `section` later (if the template has them).
3. **Best fit**: for each layout, a cost is computed:
   - +3 per text block when the layout has no text slots
   - +1 per text block that has to be merged into another slot
   - +5 per picture without an image slot
   - +1 per empty slot
   - +2 if the slide has a title and the layout doesn't

   The cheapest layout wins, with ties going to template order.

Slot filling: title → `title`, subtitle → `subtitle` / `caption` / `byline`. Text blocks fill the list/richtext slots in order, and extra blocks are merged into the last one. Short one-line leftovers can fill remaining text slots (e.g. a caption). Pictures fill image slots.
**Everything else goes to the reader layer** (`converted-text-N` / `converted-image-N` blocks), so readers still see it, and it is listed in the report. Unsupported elements get a marker line in the speaker notes and an entry in the report.

### 5. `emit.py`: output
- Slide ids are `s-01`, `s-02`, …, with zero-padding sized to the deck.
- Chapters come from section names (slugified, made unique). `meta.title` is the deck title, else the first slide title. `template.version` becomes `^major.minor` of the template.
- Assets are deduplicated by sha1: `images/slideNN-K.ext`.
- `validate.py` checks the result against the shared JSON Schema, and any problems go into `report.warnings`.
- `write_show()` (CLI only) refuses a non-empty folder without `--force`. It writes `show.json` (UTF-8, 2-space indent, LF), `images/` and `conversion-report.md`.
- The CLI writes `template.ref` and `$schema` **relative to the output folder** (forward slashes).

## Error handling

- An unreadable or corrupt file, a missing or invalid template, or a non-empty output folder: a clear message and exit code 1.
- Nothing slide-level is fatal. Unknown content is reported, never dropped silently.
- Console output is plain ASCII, and stdout/stderr use `errors="replace"`: Windows consoles with a legacy code page must not crash on a slide title.

## Testing

- `pytest` from `converter/` (with the venv active, or `.venv\Scripts\python -m pytest`).
- The sample deck is **generated in `conftest.py`**: Title Slide, bullets with levels/bold/italic/link/literal Markdown characters, notes and a build animation, Section Header, Two Content, Picture with Caption (with alt text), a Blank slide with a text box and a picture without alt text, a table, a hidden slide, and two sections. There are no binary fixtures in the repo.
- **Contract test**: the converted show is fed to the JavaScript validator (`shared/validate.js`, via `node`) together with the default template. It must give no errors and only the expected warning. The test is skipped when Node.js is not installed.

## Relation to the rest of Slipr

- The **JSON Schema** in `shared/schema/` is the contract between the converter (Python) and the viewer/editor (JS). The converter loads it from the repository at runtime (`SLIPR_SCHEMA_DIR` overrides), so there is no copy to drift.
- Semantic checks (layouts and slots exist in the template) are guaranteed by `mapping.py`, which only emits the template's layouts and slots, and verified by the contract test.
- Templates make conversion precise through `pptxMapping`. A template derived from a company PowerPoint template (backlog I-043) maps decks made with it one-to-one.
