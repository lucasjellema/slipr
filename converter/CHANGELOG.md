# Changelog: Converter

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-10: Switch to Python
- **Changed** the planned implementation from Node.js (jszip + fast-xml-parser) to a Python package `slipr_convert` on `python-pptx`, with a `slipr-convert` command, pytest, and fixture decks generated in code (D-006).
- **Added** to the plan: tables and native chart data as near-term features.

### 2026-10-10: Reader layer
- **Added** to the plan: PowerPoint sections → chapters, and a `--notes-to-reader` option.

### 2026-10-10
- **Added** outline documentation: README (usage and coverage), ARCHITECTURE (pipeline design), CLAUDE.md.
