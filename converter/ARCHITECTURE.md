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

## Planned file structure

```
converter/
├── pyproject.toml            package metadata; deps: python-pptx, jsonschema; dev: pytest
│                             console script: slipr-convert = slipr_convert.cli:main
├── src/slipr_convert/
│   ├── __init__.py           exposes convert()
│   ├── cli.py                argparse, read input, call convert(), write output folder
│   ├── convert.py            convert(source, template, options) → ConversionResult
│   ├── model.py              dataclasses: intermediate model + ConversionResult
│   ├── reader.py             open Presentation; helpers for things python-pptx has no API for
│   │                         (sections, hidden flag, alt text). The only module touching raw XML
│   ├── extract.py            python-pptx objects → intermediate model, one SlideModel per slide
│   ├── text.py               paragraphs/runs → Markdown (levels, bold, italic, links, escaping)
│   ├── mapping.py            SlideModel → Slipr slide dict (layout choice + slot filling)
│   ├── emit.py               assemble show dict, asset list, chapters; write_show() for the CLI
│   ├── report.py             collects decisions and warnings during all stages → Markdown
│   └── validate.py           jsonschema validation against shared/schema/show.schema.json
└── tests/
    ├── conftest.py           builds small fixture decks *in code* with python-pptx
    ├── fixtures/             a few real-world .pptx files for edge cases (no confidential content)
    └── test_*.py             pytest
```

## Stages

### 1. `reader.py`: opening the deck
- `Presentation(source)` from python-pptx gives slides in order, layouts (`slide.slide_layout.name`), shapes, placeholders, text frames, pictures, notes and core properties.
- Gaps in python-pptx's public API, filled here with lxml XPath on the underlying elements:
  - **Sections**: `p14:sectionLst/p14:section` in the presentation element (namespace `http://schemas.microsoft.com/office/powerpoint/2010/main`), matched to slides via `slide.slide_id`.
  - **Hidden slides**: attribute `show="0"` on the slide element.
  - **Alt text**: `descr` attribute on the shape's `p:cNvPr`.
- Keeping all private (`_element`) access in this one module limits the damage when python-pptx changes.

### 2. `extract.py`: intermediate model
For each slide it produces a neutral `SlideModel` (dataclass), independent of Slipr:

```python
SlideModel(
    index=3, hidden=False, section="How it works",
    pptx_layout_name="Title and Content",
    title="Why Slipr?", subtitle=None,
    bodies=[Body(markdown="- one\n  - nested", placeholder="body")],
    images=[Image(blob=b"...", ext="png", sha1="...", alt="...", bbox=(x, y, w, h))],
    notes="...",
    tables=[], charts=[],              # filled once tables/charts are supported
    unsupported=["smartArt"],
    has_build_animations=True,
)
```

- Placeholder types (`PP_PLACEHOLDER.TITLE`, `CENTER_TITLE`, `SUBTITLE`, `BODY`, `OBJECT`, `PICTURE`) decide what goes where. python-pptx resolves inherited positions from the layout and master.
- Group shapes are walked recursively. Non-placeholder text boxes are added to `bodies` in reading order (top-to-bottom, then left-to-right by bounding box).
- `text.py` converts paragraphs to Markdown: `paragraph.level` gives the bullet depth, and runs give `**bold**`, `*italic*` and `[links](url)`. Markdown special characters in the source text are escaped.

### 3. `mapping.py`: choosing the layout
1. **Explicit mapping**: CLI `--mapping`, then the template's `pptxMapping`, keyed by PowerPoint layout name.
2. **Heuristics** when no mapping applies:
   - title + subtitle, no body → `title`
   - title only, slide index > 0 → `section`
   - one image, little or no text → `image-full`
   - two bodies, or body + image → `two-column`
   - otherwise → `bullets`
3. Slot filling matches model fields to the chosen layout's slots by name and type. Anything left over is appended to `notes` with a marker, so no content is silently lost, and is recorded in the report.

### 4. `emit.py`: output
- Builds the show dict per `docs/show-format.md`: slide ids `s-01`, `s-02`, ..., and `chapters` from sections.
- Assets: `[Asset(path="images/slide03-1.png", data=b"...")]`. Images are deduplicated by `sha1`.
- `validate.py` checks the result against the shared JSON Schema, and violations go into the report.
- `write_show(result, out_dir, force)` is used by the CLI only. It writes `show.json` (UTF-8, 2-space indent, `ensure_ascii=False`), `images/` and `conversion-report.md`.

## Error handling

- An unreadable or corrupt file is a fatal error with a clear message (exit code 1).
- Anything slide-level is never fatal: the slide falls back to `bullets` with whatever text was found, plus a report entry.

## Testing

- **pytest**. Most fixture decks are **generated in `conftest.py` with python-pptx**, one feature each: bullet levels, notes, pictures, hidden slide, two-content layout, sections. They are readable, diffable and contain no binary blobs.
- A handful of real-world `.pptx` files in `tests/fixtures/` cover things python-pptx cannot create easily (SmartArt, charts, odd masters).
- Tests assert on the intermediate model and on the final show dict, not on internals.

## Relation to the rest of Slipr

- The **JSON Schema** in `shared/schema/` is the contract between the converter (Python) and the viewer/editor (JS). The converter loads it from the repository at runtime, so there is no copy to drift.
- Slipr-specific semantic checks that the schema cannot express (e.g. an unknown layout) are done by `mapping.py` itself, because it only emits layouts that exist in the template.
