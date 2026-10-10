# Changelog: Converter

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-10: Converter MVP (Phase 4)
- **Added** the Python package `slipr_convert` (`pyproject.toml`, console script `slipr-convert`), with modules `reader`, `extract`, `text`, `mapping`, `emit`, `report`, `validate`, `convert` and `cli`.
- **Added** extraction of titles, subtitles, text with bullet levels (including bullets inherited from the layout/master), bold/italic/links with Markdown escaping, line breaks, pictures with alt text (file-name descriptions count as missing), speaker notes, sections → chapters, hidden slides → backup slides, build animations → fragments, metadata, and aspect ratio.
- **Added** template-agnostic layout choice: `--mapping` / `pptxMapping` by layout name, title/section hints, then a best-fit score on slot types. Content that doesn't fit goes to the **reader layer** (a change from the original plan, which put it in the notes).
- **Added** `conversion-report.md` per run, deduplicated images, relative `template.ref` / `$schema`, `--force` protection, and readable errors.
- **Added** 24 pytest tests with a deck generated in code, including a contract test that runs the output through `shared/validate.js`.
- **Fixed** a CLI crash on Windows consoles (cp1252) caused by non-ASCII characters in output.

### 2026-10-10: Switch to Python
- **Changed** the planned implementation from Node.js (jszip + fast-xml-parser) to a Python package `slipr_convert` on `python-pptx`, with a `slipr-convert` command, pytest, and fixture decks generated in code (D-006).
- **Added** to the plan: tables and native chart data as near-term features.

### 2026-10-10: Reader layer
- **Added** to the plan: PowerPoint sections → chapters, and a `--notes-to-reader` option.

### 2026-10-10
- **Added** outline documentation: README (usage and coverage), ARCHITECTURE (pipeline design), CLAUDE.md.
