# CLAUDE.md: Converter

Read the root `CLAUDE.md` first. This file adds converter-specific guidance. Note that this component is **Python**, unlike the rest of Slipr (decision D-006).

## Orientation in 60 seconds

- Package `src/slipr_convert/`, pipeline `reader` → `extract` → `mapping` → `emit`. Only `cli.py` (via `emit.write_show`) touches the filesystem.
- The **intermediate model** in `model.py` is the seam between "understanding PowerPoint" and "producing Slipr". PowerPoint knowledge goes in `reader.py`/`extract.py`/`text.py`, Slipr/template knowledge goes in `mapping.py`/`emit.py`.
- Raw XML access (`shape._element`, XPath) is allowed **only in `reader.py`**. Everywhere else, use the python-pptx public API.
- Dependencies: `python-pptx`, `jsonschema` (runtime) and `pytest` (dev). Ask Lucas before adding more.

## Setup & commands

From `converter/`:

| Task | Command |
|---|---|
| Create venv + install | `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -e ".[dev]"` |
| Run tests | `pytest` |
| Convert | `slipr-convert deck.pptx --template ../templates/default --out ../shows/deck` |

## Code conventions

- Python ≥ 3.11, PEP 8, type hints on all public functions, `dataclasses` for models, `pathlib` for paths.
- No `print` in the core: messages go to the `Report`. The CLI decides what to print.
- Module and function names `snake_case`. Keep modules small and single-purpose, as in the JS code.

## Invariants

- Never lose content silently. Anything that can't be placed goes to the slide's notes *and* the report.
- Never carry PowerPoint styling (colors, fonts, positions) into the show. The template owns the looks.
- Output must validate against `../shared/schema/show.schema.json`. Never copy the schema into this package.
- Never overwrite an existing output folder without `--force`.

## python-pptx pitfalls

- **`slide.notes_slide` creates a notes slide if none exists.** Always check `slide.has_notes_slide` first.
- `run.font.bold` / `.italic` are `None` when inherited. Treat `None` as "not set", not as `False`, and don't try to resolve the inheritance for the MVP.
- Picture placeholders (`PlaceholderPicture`) are not `MSO_SHAPE_TYPE.PICTURE`. Detect images with `hasattr(shape, "image")` and guard against empty placeholders.
- Group shapes (`MSO_SHAPE_TYPE.GROUP`) must be walked recursively via `shape.shapes`.
- `paragraph.level` is 0-based. A paragraph in a title placeholder is not a bullet.
- Sections, the hidden flag and alt text have no public API. See `reader.py` for the XPath helpers.
- Tables: `shape.has_table` → `shape.table.rows[i].cells[j].text`. Charts: `shape.has_chart` → `chart.plots[0].categories`, `series.values`.

## Testing

- To add a feature, first add a generated fixture deck in `tests/conftest.py` that contains *only* that feature, then a test, then the code.
- Real `.pptx` fixtures only for what python-pptx can't generate. Never commit real decks with confidential content.
