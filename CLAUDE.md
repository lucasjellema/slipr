# CLAUDE.md: guide for AI coding agents

You are working on **Slipr** (short for *SlidePresenter*), personal presentation software with a viewer, an editor, and a PPTX converter. The owner is Lucas. This file tells you how to get oriented quickly and how to work here without breaking things.

**Mental model:** one show, two very different experiences.
- **Audience mode** is a linear, high-level slideshow (Reveal.js) with animations and visualizations.
- **Reader mode** is a separate, rich, interactive app. It shows the slides plus a detailed reader layer of popups, panels, tabs and hotspots, tailored by profile and depth, with personalised navigation, search and annotations.

Every slide has a concise audience layer (`content`) and an optional reader layer (`reader.blocks`). Keep slides concise and put depth in the reader layer.

## Read first (in this order)

1. [README.md](README.md): what Slipr is, key concepts (show, slide, template, layout, slot)
2. [ARCHITECTURE.md](ARCHITECTURE.md): how the components and the shared core fit together
3. [docs/show-format.md](docs/show-format.md) and [docs/template-format.md](docs/template-format.md): the data contracts
4. [docs/decisions.md](docs/decisions.md): why things are the way they are. Do not silently undo a decision.
5. The `CLAUDE.md` of the component you are touching (`viewer/`, `editor/`, `converter/`)
6. [BACKLOG.md](BACKLOG.md): what is being worked on now

## Hard rules

- **Vanilla only in the web apps.** HTML, CSS and plain JS ES modules plus Reveal.js. No frameworks, bundlers, TypeScript compilation or npm packages in browser code. Adding one requires a new entry in `docs/decisions.md`, approved by Lucas.
- **No runtime CDN calls.** Libraries go in `vendor/`, fonts and illustrations in the template's `assets/`. Shows must present offline.
- **Never modify files in `vendor/`.** Upgrade by replacing the whole library folder and noting it in `CHANGELOG.md`.
- **The format specs are contracts.** If you change `show.json` or `template.json` structure, update the spec doc, the JSON Schema in `shared/schema/`, the version number, and add a migration if older files would break.
- **Rendering lives in `shared/`.** Slide visuals go in `render.js` and reader blocks in `blocks.js`. Do not write a second renderer inside the viewer or editor.
- **Reader data stays in the reader's browser.** No analytics, no network calls with personal data.
- **Accessibility is not optional in reader mode.** Every hover interaction must also work with tap and keyboard.
- **Slides contain no styling.** Visual decisions belong in the template (`theme.css`, layouts).

## Workflow for every change

1. Pick or create an item in `BACKLOG.md` and mark it `in progress`.
2. Make the change and keep it focused.
3. Run the tests (`npm test`, and `pytest` for the converter) and run through the component's smoke-test checklist.
4. Update the docs in the same change:
   - `CHANGELOG.md` of the component (and the root one for format or shared-core changes)
   - `ARCHITECTURE.md` if you added or moved modules or changed data flow
   - `README.md` if user-visible behavior changed
   - `BACKLOG.md`: move the item to *Done* with the date
5. If you notice something out of scope, add it to `BACKLOG.md` under *Ideas* or *Chores* instead of fixing it on the side.

## Code conventions

- ES modules (`import`/`export`), one responsibility per module, named exports.
- JSDoc on exported functions (types included). This gives editor IntelliSense without a build step. Add `// @ts-check` at the top of shared modules.
- `const`/`let`, no `var`. Use `async`/`await` over `.then()` chains.
- DOM: query once, keep references; build elements with `document.createElement` or `<template>` cloning. Do not concatenate untrusted strings into `innerHTML`, because slide content is user data.
- CSS: custom properties (`--slipr-*`) for anything a template may override. BEM-ish class names prefixed `slipr-`.
- File and folder names: `kebab-case`.

## Commands

Requires Node ≥ 22 (JSON module imports) and Python ≥ 3.11 (converter).

The demo show `shows/demo/` exercises every format feature. Use it as the reference when building or testing anything. Keep it valid **without warnings**, because a test enforces that.

| Task | Command |
|---|---|
| Serve everything locally | `npm run serve` (then open `http://localhost:8080/viewer/?show=../shows/demo/show.json`). In Claude's browser pane: `preview_start` with the `slipr` entry from `.claude/launch.json` |
| Run JS tests | `npm test` (Node built-in runner; finds `*.test.js` files) |
| Run converter tests | `pytest` in `converter/` with its venv active (or `converter/.venv/Scripts/python -m pytest`) |
| Convert a PPTX | `slipr-convert <file.pptx> --template ../templates/default --out ../shows/<name>` in `converter/` |

Two toolchains: the web side uses npm and Node (dev tooling only), and the converter is **Python** (D-006, see `converter/CLAUDE.md`).

## When in doubt

Ask Lucas rather than guessing on: format changes, new dependencies, anything that changes how a show looks with an existing template, and deleting files.
