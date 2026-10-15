# CLAUDE.md: Converter

Read the root `CLAUDE.md` first. This file adds converter-specific guidance. Note that this component is **Python**, unlike the rest of Slipr (decision D-006).

## Orientation in 60 seconds

- Package `src/slipr_convert/`, pipeline `reader` → `extract` → `mapping` → `emit`. Only `cli.py` (via `emit.write_show`) touches the filesystem.
- The reverse direction (show → `.pptx`, I-045) is the subpackage `export/` (`layouts` → `write`, with `markdown`, `data`, `report`) and `export_cli.py` (`slipr-export`), the only export module touching files. Its raw-XML module is `export/xml.py`.
- The **intermediate model** in `model.py` is the seam between "understanding PowerPoint" and "producing Slipr". PowerPoint knowledge goes in `reader.py`/`extract.py`/`text.py`, Slipr/template knowledge goes in `mapping.py`/`emit.py`.
- Raw XML access (`shape._element`, XPath, private python-pptx attributes) is allowed **only in `reader.py`** (import) and **`export/xml.py`** (export). Everywhere else, use the python-pptx public API.
- `mapping.py` is template-agnostic: it reasons about slot *types*, not about the default template's layout ids (except the `title` / `section` hints).
- Dependencies: `python-pptx`, `jsonschema` (runtime) and `pytest` (dev). Ask Lucas before adding more.

## Setup & commands

From `converter/`:

| Task | Command |
|---|---|
| Create venv + install | `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -e ".[dev]"` |
| Run tests | `pytest` (or `.venv\Scripts\python -m pytest` without activating) |
| Convert | `slipr-convert deck.pptx --template ../templates/default --out ../shows/deck` |
| Export to PowerPoint | `slipr-export ../shows/demo --out out/demo.pptx` (add `--base ../ConclusionTemplatePresentation.pptx` for the company layouts) |
| Try the sample deck | `python -c "import sys; sys.path.insert(0,'tests'); from conftest import build_sample_deck; open('out/sample.pptx','wb').write(build_sample_deck())"`, then convert into `out/sample` (`converter/out/` is git-ignored) and open `viewer/?show=../converter/out/sample/show.json` |

## Code conventions

- Python ≥ 3.11, PEP 8, type hints on all public functions, `dataclasses` for models, `pathlib` for paths.
- No `print` in the core: messages go to the `Report`. The CLI decides what to print.
- **CLI output is plain ASCII.** Windows consoles often use cp1252 and crash on "→" or "⚠". The report file may use any Unicode.
- Module and function names `snake_case`. Keep modules small and single-purpose, as in the JS code.

## Invariants

- **Never lose content silently.** Placeholder text that doesn't fit the chosen layout goes to the slide's **reader layer** (`converted-*` blocks) and the report; pictures that don't fit become **extra images** (`overlays`) at their PowerPoint place, and text boxes that don't fit (and shapes with a fill or line, always) **text elements**, or reader blocks when the slide size is unknown. Unsupported elements (tables, charts, SmartArt, …) get a marker in the speaker notes and the report.
- Never carry PowerPoint styling (colours, fonts, positions) into the show. The template owns the looks. The exceptions are the position and size of pictures that fit no slot (extra images, D-013), and the position, size and look of text elements (D-016: `reader.text_look()` → `mapping._text_style()`, fonts matched to the template's first). Write `"slipr": "0.2"` only when a show has them.
- Output must validate against `../shared/schema/show.schema.json` **and** pass `shared/validate.js` with the template (the contract test in `test_cli.py`). Never copy the schema into this package.
- Never overwrite an existing output folder without `--force`.
- Escape Slipr Markdown characters in PowerPoint text (`text.escape_markdown`). Unescape when filling plain `text` slots (`mapping.markdown_to_plain`).

## python-pptx pitfalls

- **`slide.notes_slide` creates a notes slide if none exists.** Always check `slide.has_notes_slide` first.
- `run.font.bold` / `.italic` are `None` when inherited. Treat `None` as "not set", not as `False`.
- Bullets are usually **inherited** from the layout/master placeholder. Always use `reader.bullet_setting()` + `reader.inherited_bullet()`, never just "is it a body placeholder".
- `paragraph.runs` drops line breaks. Use `reader.paragraph_parts()`.
- Picture placeholders (`PlaceholderPicture`) are not `MSO_SHAPE_TYPE.PICTURE`. Detect images with `hasattr(shape, "image")` and guard against empty placeholders.
- Pictures added by python-pptx (and often by PowerPoint) get the *file name* as description. `reader.alt_text()` treats that as missing alt text.
- Group shapes (`MSO_SHAPE_TYPE.GROUP`) must be walked recursively via `shape.shapes`.
- `paragraph.level` is 0-based. A paragraph in a title placeholder is not a bullet.
- Tables / charts inside content placeholders are `PlaceholderGraphicFrame`s. `reader.graphic_kind()` detects them via `a:graphicData/@uri`.
- Filling a picture placeholder (`insert_picture`) replaces its element: the old proxy's `_element` becomes `None`. Look placeholders up again afterwards.
- python-pptx's `add_slide` does not copy date, footer and slide-number placeholders; the export clones them from a base-deck slide (`xml.clone_shape`).
- Tables: `shape.has_table` → `shape.table.rows[i].cells[j].text`. Charts: `shape.has_chart` → `chart.plots[0].categories`, `series.values` (for I-040 / I-046).

## Testing

- To add a feature, first extend the generated deck in `tests/conftest.py` (or build a small dedicated one), then a test, then the code.
- Real `.pptx` fixtures only for what python-pptx can't generate (SmartArt, charts with data, odd masters). Never commit real decks with confidential content.

## Tooling pitfall (for AI agents)

- In this environment, Python code passed through a bash heredoc can have its `\n` escapes turned into real line breaks. Write source files with the file-writing tool, not via `python - <<EOF` scripts that contain escape sequences.
