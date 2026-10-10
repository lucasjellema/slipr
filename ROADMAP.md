# Roadmap: first implementation steps

The plan builds Slipr in thin vertical slices. Each phase ends with something you can **run and look at**. The data format comes first because everything depends on it. The two viewer modes are built next, because they *are* the product. The audience mode is small, while the reader mode is the larger and more distinctive part.

```
Phase 0  Foundations
   └► Phase 1  Audience mode
         └► Phase 2  Reader core (interactive content)
               └► Phase 3  Reader personalisation (profiles, depth, paths, search, annotations)
                     └► Phase 4  Converter MVP
                           └► Phase 5  Editor MVP
                                 └► Phase 6  Polish & publish
```

Until the editor exists, shows are written by hand in VS Code, with schema-driven autocomplete set up in Phase 0. *Alternative:* swap Phases 3 and 4 if you want your existing decks in Slipr sooner.

Each phase is broken into backlog items (IDs in brackets) in [BACKLOG.md](BACKLOG.md).

---

## Phase 0: Foundations (≈ 1 session) ✅ done 2026-10-10

**Goal**: The repository, the formats and a rich sample exist, so all later work has something concrete to build against.

1. `git init`, `.gitignore`, root `package.json` (dev scripts only: `serve`, `test`). [C-001]
2. Vendor Reveal.js into `vendor/reveal.js-<version>/` (6.0.2, which ships native ES modules). [C-002]
3. Write `shared/schema/show.schema.json` and `template.schema.json` from the specs in `docs/`. [S-001]
4. Add a VS Code setting that associates `show.json` files with the schema, giving autocomplete and validation while hand-writing. [C-004]
5. Create `templates/default/` with 5 layouts (`title`, `section`, `bullets`, `two-column`, `image-full`), `theme.css` and `reader.css`. [T-001]
6. Create `shows/demo/`, a 10–12 slide show that exercises everything: all layouts, chapters, fragments, auto-animate, notes, a backup slide, and a reader layer with every block type, glossary terms, popups, hotspots, two profiles, three depths and two paths. [T-002]
7. `shared/validate.js` + tests: the demo validates, and broken fixtures fail with clear messages. [S-002]

**Done when**: `npm test` passes, the demo validates, and VS Code autocompletes in `show.json`.

## Phase 1: Audience mode (≈ 1–2 sessions) ✅ done 2026-10-10

**Goal**: Present the demo show on the big screen.

1. `shared/load.js`: load show + template, resolve paths. [S-003]
2. `shared/markdown.js`: Markdown subset + Slipr extensions, safe escaping, an audience/reader `mode` option. [S-004]
3. `shared/render.js`: slide + layout → element, all slot types. [S-005]
4. `viewer/audience/audience.js`: Reveal sections, notes, fragments, auto-animate, transitions, backup slides. [V-001]
5. `viewer/audience/agenda.js`: agenda slides from chapters + chapter progress bar. [V-007]
6. Readable error page for invalid shows. [V-002]

**Done when**: The demo presents at 1920×1080 and 1280×720, the presenter view shows notes, and the builds and morphs look smooth.

## Phase 2: Reader core (≈ 2 sessions) ✅ done 2026-10-10

**Goal**: A reader can read and explore the full depth of the demo, without personalisation yet.

1. `shared/blocks.js`: render all reader block types. [S-006]
2. `viewer/reader/reader.js`: app shell (contents, article, margin), routing `#slide/block`, keyboard map. [V-004]
3. `reader/interactions.js`: popovers for glossary, footnotes and hotspots (hover + tap + keyboard), tabs, details, embeds. [V-008]
4. `reader/nav.js`: chapter TOC, scroll-spy, related links, next/previous. [V-009]
5. Mode switch `R`/`A` that keeps the position, plus deep links in both modes. [V-005, V-006]
6. Responsive pass: phone, tablet, laptop. Layout reflow in reader CSS. [V-010]

**Done when**: Every block type and popup in the demo works with mouse, touch emulation and keyboard, and at 375 px there is no horizontal scrolling.

## Phase 3: Reader personalisation (≈ 2–3 sessions) ✅ done 2026-10-10

**Goal**: The reader experience adapts to the person and remembers them.

1. `reader/state.js`: prefs, position, visited, bookmarks, persisted in IndexedDB. [V-011]
2. ~~`reader/personalize.js` + unit tests: profile, depth and path filtering.~~ Done early in Phase 2, so only the UI wiring is left. [V-012]
3. Welcome chooser + toolbar controls (URL parameters `profile`, `depth`, `path` already work). [V-013]
4. Progress marks, resume where you left off, bookmarks. [V-014]
5. `reader/search.js`: index, `/` search UI, jump + highlight. [V-015]
6. `reader/annotations.js`: highlights + notes in the margin, Markdown/JSON export & import. [V-016]

**Done when**: A "Manager / Overview / 5-minute" link and a "Developer / Deep dive / Full story" link visibly produce different experiences, and highlights survive a reload.

## Phase 4: Converter MVP (≈ 2 sessions) ✅ done 2026-10-10 (real-deck check P-006 pending)

**Goal**: Turn your real decks into Slipr shows.

1. Python package skeleton (`pyproject.toml`, venv, pytest) + `reader.py`: open the deck, plus XPath helpers for sections, hidden slides and alt text. [P-001]
2. `extract.py` + `text.py`: intermediate model with Markdown text and bullet levels. [P-002]
3. `mapping.py`: layout mapping + heuristics. [P-003]
4. `emit.py`, `validate.py` (shared JSON Schema), CLI `slipr-convert` + `conversion-report.md`, with `--notes-to-reader`. [P-004]
5. Tests with fixture decks generated in code. [P-005]

**Done when**: A real deck converts, validates, and presents with text, images, notes and chapters intact.

## Side track: company template (I-043), alongside Phases 4–5

Derive a Slipr template from the Conclusion PowerPoint template. ✅ First version (12 layouts) and the card layouts with the new `cards` slot type (I-043b), 17 layouts in total. Left: a generator for business-unit variants (I-043c), review by Lucas and the brand team (I-043d), and the Facts icons (I-058). Spec: [docs/specs/I-043-conclusion-template.md](docs/specs/I-043-conclusion-template.md).

## Phase 5: Editor MVP (≈ 3–4 sessions) · in progress

**Goal**: Make and change shows, both layers, without touching JSON.

1. ✅ Shell, store, actions, undo/redo (done 2026-10-10). This also gives first versions of steps 3 and 5–7. [E-001]
2. Open, save and new-from-template via the File System Access API. [E-002]
3. Slide list: add, duplicate, delete, reorder, hide. [E-003]
4. Slide tab: generated slot form + layout picker. [E-004]
5. Reader tab: summary, block editors with profile/depth, related. [E-008]
6. Show settings: chapters, glossary, profiles, paths. [E-009]
7. Live preview in both modes, with a profile/depth simulation. [E-005]
8. Images and hotspots: drop or paste, alt text, hotspot placement. [E-006]
9. Present / Read buttons. [E-007]

**Done when**: You can build the demo show from scratch in the editor.

## Phase 6: Polish & publish

Pick from the *Next* section of the backlog. Likely candidates: PDF export, house-style template, single-file HTML export, PPTX import inside the editor, a publish script.

---

## Decisions to confirm before Phase 0

All format and technology decisions (D-001 … D-010) were accepted on 2026-10-10. D-006 was changed to Python. The table below is kept for reference, and only the rows marked n/a are still open:

| # | Question | Proposal |
|---|---|---|
| D-007 | Editor only on Chromium (Edge/Chrome)? | Yes, for the File System Access API. The viewer works in all modern browsers |
| D-002 | Reveal.js vendored, no CDN? | Yes, for offline presenting |
| D-008 | Reader mode as its own app (not Reveal scroll view)? | Yes |
| D-009 | Two-layer content model (slide + reader blocks, profiles, depth, paths)? | Yes, see `docs/show-format.md` |
| D-010 | Reader data only in the reader's browser? | Yes, for now. Sync is a later idea |
| n/a | Phase order: reader personalisation before the converter? | Yes, unless your decks are needed sooner |
| n/a | First template: neutral default, or house style right away? | Neutral default first |
