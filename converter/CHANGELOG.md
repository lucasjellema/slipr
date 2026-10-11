# Changelog: Converter

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-11: Picture effects → picture styles (I-084)
- **Added** `reader.picture_effects()`: a picture's outer shadow, soft edges, rounded-rectangle geometry and visible outline, and its transparency (`a:alphaModFix`). `ImageRef` gets `effects` and `opacity`.
- **Added** the mapping: the first template picture style whose `pptxEffect` matches one of the effects (in the order shadow, soft edges, rounded corners, border) becomes the picture's `style`; the transparency becomes `opacity`. Without a matching style the report says so. A show that uses either is format 0.2.
- **Added** test helpers `add_picture_effect()` and `set_transparency()`; the sample deck's photo has a shadow and 30 % transparency. 37 tests.

### 2026-10-11: Pictures without a slot become extra images (I-083)
- **Changed** a picture that fits no image slot is placed as an extra image (`slide.overlays`, D-013) at its PowerPoint position and size (fractions of the slide, kept inside it), instead of a reader image block. Without a known slide or picture size it still goes to the reader layer. The report lists it as "Placed as an extra image", and counts them; the CLI summary too.
- **Changed** a converted show is format 0.2 when it has extra images, else still 0.1.
- **Added** `DeckModel.slide_width` / `slide_height`, and a second picture on the sample deck's blank slide. 36 tests.

### 2026-10-10: Card roles (I-043b)
- **Added** card roles in `mapping._apply_roles`: `cards[i].field` fills that field of card *i* (plain text for `text` fields, Markdown for `richtext` / `list`, the picture for `image`). `cards[i]` fills the whole card: a picture goes to the first free image field, and text is split on paragraphs over the free non-image fields in order, the last field taking the rest. Cards that stay empty are dropped.
- **Changed** images no longer get a `fit` value: the template decides how a photo is cropped.
- **Verified** the five card layouts of the Conclusion template (Introduction, Facts & figures, Onze markten, Textbox 9x / 4x) convert with no reader leftovers. 32 tests.

### 2026-10-10: Real-template run (Conclusion)
- **Added** full paragraph-style resolution (`reader.paragraph_style`): bullets, auto-numbering type, bold, caps and serif font from the paragraph, layout placeholder, master placeholder and master body style. Template text styles become Markdown: `A.` / `1.` lists, `**subheading**`, `*serif line*`. Bullets nest at most 4 levels deep. This replaces `bullet_setting` / `inherited_bullet`.
- **Changed** placeholder-role mappings now always win over best fit (extra pictures go to the reader layer). Text boxes holding only a number (decorative numbering) are left out and reported.
- **Fixed** a crash on linked (not embedded) pictures: python-pptx raises `ValueError` from `shape.image`, which `hasattr()` doesn't catch.
- **Verified** with the 20 example slides of the Conclusion template: every slide maps by name and role, and the output passes the JS validator (only missing-alt warnings, because the template's photos have no descriptions). 30 tests.

### 2026-10-10: Placeholder roles (template format 0.2)
- **Added** the placeholder idx in the intermediate model (`TextBody.idx`, `ImageRef.idx`, `SlideModel.title_idx` / `subtitle_idx`).
- **Added** `mapping.py` support for `pptxMapping` objects with placeholder roles (content goes straight into the named slot, `null` = ignore) and template-wide `pptxIgnore` (also for unmapped layouts). Ignored placeholders, such as a logo, aren't reported as missing alt text.
- **Changed** the alt text: Office's automatic descriptions ("… Door AI gegenereerde inhoud is mogelijk onjuist.", "Description automatically generated", …) count as missing.
- **Added** 4 tests (28 in total).

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
