# Slipr

**Slipr** (short for *SlidePresenter*) is personal presentation software. You write a show once and it serves two very different experiences:

- **Audience mode** is for presenting to a room on the big screen, like a regular slideshow. It is concise and high level, with animations, visualizations, overview and agenda slides, speaker notes and a presenter view.
- **Reader mode** is for one person exploring the same show at their own pace, interactively and in much more depth. It offers:
  - hover and tap popups, collapsible panels, tabs, and hotspots on images
  - content tailored to the reader's profile and preferred level of detail
  - personalised navigation: paths, progress, bookmarks and "go deeper" links
  - full-text search, and the reader's own highlights and notes

Each slide carries both layers: the concise **audience layer** (the slide itself) and the detailed **reader layer** (blocks of interactive content). See [docs/show-format.md](docs/show-format.md).

> Status: **Phase 3 done**. Shows, templates and validation work. **Audience mode** presents shows on Reveal.js. **Reader mode** offers the full interactive reading experience: popups, panels, tabs and hotspots, tailoring by profile, depth and route, progress, bookmarks, search, and your own highlights and notes. The PPTX converter and the editor are next. See [ROADMAP.md](ROADMAP.md).
>
> Try it: run `npm run serve` in this folder and open <http://localhost:8080/viewer/?show=../shows/demo/show.json> (audience) or <http://localhost:8080/viewer/?show=../shows/demo/show.json&mode=reader> (reader).

## Components

| Component | Folder | What it does | Technology |
|---|---|---|---|
| **Viewer** | [viewer/](viewer/README.md) | Presents a show in audience mode (Reveal.js) or lets a reader explore it in the interactive reader mode | HTML, CSS, vanilla JS, Reveal.js (audience mode only) |
| **Editor** | [editor/](editor/README.md) | Creates and edits shows in the browser | HTML, CSS, vanilla JS |
| **Converter** | [converter/](converter/README.md) | Turns a PowerPoint file (`.pptx`) into a Slipr show | Python (CLI), `python-pptx` |
| *Shared core* | `shared/` | Loads, validates and renders shows. All components use it | Vanilla JS (ES modules) |

## Key concepts

| Concept | Meaning |
|---|---|
| **Show** | A presentation. It is a folder with a `show.json` file and an `images/` folder. |
| **Slide** | One entry in the show's `slides` array. It names a *layout* and fills that layout's *slots*. |
| **Template** | A reusable look and feel: a style guide (colors, fonts, illustrations) plus a set of base slide *layouts*. Each show links to one template. |
| **Layout** | A base slide format in a template, such as *title*, *section*, *bullets*, *image-full* or *two-column*. |
| **Slot** | A named place in a layout that a slide fills with content, such as `title`, `body` or `image`. |
| **Reader block** | A piece of reader-layer content attached to a slide: text, collapsible panel, callout, tabs, image with hotspots, embed. |
| **Chapter** | A group of slides. Chapters drive the agenda in audience mode and the table of contents in reader mode. |
| **Glossary** | Terms with definitions. In reader mode they appear as popups wherever the term is referenced. |
| **Profile** | A type of reader (e.g. *Developer*, *Manager*). Blocks can be targeted at profiles. |
| **Depth** | Detail level of a block: 1 essential, 2 standard, 3 deep dive. The reader chooses how deep to go. |
| **Path** | A curated route through the show, e.g. *5-minute overview*. |

The details are in [docs/show-format.md](docs/show-format.md) and [docs/template-format.md](docs/template-format.md).

## Repository layout

```
slipr/
├── README.md, OVERVIEW.md, ARCHITECTURE.md, CLAUDE.md
├── ROADMAP.md, BACKLOG.md, CHANGELOG.md
├── docs/            show & template format specs, decision log
├── shared/          shared core: loader, validator, renderer, JSON schemas
├── viewer/          viewer web app
├── editor/          editor web app
├── converter/       PPTX → Slipr converter
├── templates/       Slipr templates (style guide + layouts)
├── shows/           shows (sample shows live here)
└── vendor/          third-party libraries, checked in (Reveal.js)
```

## Documentation

The purpose of each documentation file is explained in [OVERVIEW.md](OVERVIEW.md).
