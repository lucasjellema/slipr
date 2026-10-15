# Slipr

**Slipr** (short for *SlidePresenter*) is personal presentation software. You write a show once and it serves two very different experiences:

- **Audience mode** is for presenting to a room on the big screen, like a regular slideshow. It is concise and high level, with animations, visualizations (including client-side Mermaid diagrams), overview and agenda slides, speaker notes and a presenter view.
- **Reader mode** is for one person exploring the same show at their own pace, interactively and in much more depth. It offers:
  - hover and tap popups, collapsible panels, tabs, hotspots on images, and Mermaid diagrams
  - content tailored to the reader's profile and preferred level of detail
  - personalised navigation: paths, progress, bookmarks and "go deeper" links
  - full-text search, and the reader's own highlights and notes

Each slide carries both layers: the concise **audience layer** (the slide itself) and the detailed **reader layer** (blocks of interactive content). See [docs/show-format.md](docs/show-format.md).

> Status: **Phases 0–5 done, Phase 6 (polish & publish) in progress**. Shows, templates and validation work. **Audience mode** presents shows on Reveal.js, with a laser pointer, spotlight and pen for the presenter. **Reader mode** offers the full interactive reading experience: popups, panels, tabs and hotspots, tailoring by profile, depth and route, progress, bookmarks, search, and your own highlights and notes, on whole slides and on objects within them. The **PPTX converter** turns PowerPoint decks into Slipr shows. Two templates ship: a neutral `default` and **Conclusion** (the company house style, 21 layouts, for internal use until the brand team has reviewed it). The **editor** (Chrome or Edge) opens, creates and saves show folders anywhere on disk. It edits slides with a form generated from the layout and a layout picker with live previews, as well as images and hotspots, the reader layer, show settings (chapters, profiles, glossary, routes), and find & replace, all with undo and a live preview. A show grid rearranges slides and chapters, a **slide library** keeps slides to reuse in other shows, **Export…** saves a show as one offline HTML file, and the editor has a light and a dark theme. Slides can show **Mermaid diagrams**, **live web pages** (or their screenshot; pages from other sites load only after the reader's click in reader mode), **PDF documents** (page by page; their text is searchable in reader mode), **graphs** (built up step by step; readers pan, zoom and click a node) **maps** (a tour from place to place; OpenStreetMap loads only after the reader's click) and **data tables** (from a CSV file or typed in, with totals and colours; sortable and filterable, rows revealed click by click) and **tag clouds** (terms sized by weight, linked to the glossary; in reader mode a click shows the slides that mention a term), carry **extra images** and styled **text elements** (badges, labels, callouts) placed anywhere on the slide, and give any picture a **picture style** (shadow, soft edges, rounded corners, frame), an opacity and a **crop**; in reader mode, **glossary terms on the slides** open their definition too. Present and Read open the viewer on the same show. Still to come: draft autosave. See [ROADMAP.md](ROADMAP.md).
>
> Try it: run `npm run serve` in this folder and open
> - <http://localhost:8080/viewer/?show=../shows/demo/show.json> (audience; add `&mode=reader` for reader mode)
> - <http://localhost:8080/viewer/?show=../shows/conclusion-demo/show.json> (every layout of the Conclusion template)
> - <http://localhost:8080/editor/?show=../shows/demo/show.json> (editor; or open <http://localhost:8080/editor/> for a show folder on disk)

## Components

| Component | Folder | What it does | Technology |
|---|---|---|---|
| **Viewer** | [viewer/](viewer/README.md) | Presents a show in audience mode (Reveal.js) or lets a reader explore it in the interactive reader mode | HTML, CSS, vanilla JS, Reveal.js (audience mode only) |
| **Editor** | [editor/](editor/README.md) | Creates and edits shows in the browser | HTML, CSS, vanilla JS |
| **Converter** | [converter/](converter/README.md) | Turns a PowerPoint file (`.pptx`) into a Slipr show | Python (CLI), `python-pptx` |
| *Shared core* | `shared/` | Loads, validates and renders shows. All components use it | Vanilla JS (ES modules) |

## Quick start: editing and presenting

1. Start the local server:
   ```bash
   npm run serve
   ```
2. **Edit a show:** Open <http://localhost:8080/editor/> and choose **Open show folder…** (a show anywhere on your disk) or **New show…** (from a template), or open the demo at <http://localhost:8080/editor/?show=../shows/demo/show.json>. Select slides in the left pane, edit layout slots and reader blocks in the center inspector, and inspect live updates in the right preview pane. The editor's user manual ([editor/help.html](editor/help.html), also under **? Help** or `F1` in the editor) explains everything in detail, including keyboard shortcuts.
3. **Present to an audience:** Click **Present ▶** in the editor toolbar, press `F5`, or open <http://localhost:8080/viewer/?show=../shows/demo/show.json>.
4. **Explore in reader mode:** Click **Read 📖** in the editor or add `&mode=reader` to the viewer URL.
5. **Share it as one file:** `npm run export -- shows/demo` writes `exports/demo.html`: the show, its template and the viewer in one HTML file that presents offline (double-click it; no server, no internet). Add `?mode=reader` to its address for reader mode.

## Key concepts

| Concept | Meaning |
|---|---|
| **Show** | A presentation. It is a folder with a `show.json` file and an `images/` folder. |
| **Slide** | One entry in the show's `slides` array. It names a *layout* and fills that layout's *slots*. |
| **Template** | A reusable look and feel: a style guide (colors, fonts, illustrations) plus a set of base slide *layouts*. Each show links to one template. |
| **Layout** | A base slide format in a template, such as *title*, *section*, *bullets*, *image-full*, *two-column* or *diagram*. |
| **Slot** | A named place in a layout that a slide fills with content, such as `title`, `body`, `image`, `quote`, `diagram` or `cards`. |
| **Cards** | A slot that holds a small set of repeated items with the same fields, such as four columns with a heading and text, or key figures with an icon. |
| **Reader block** | A piece of reader-layer content attached to a slide: text, collapsible panel, callout, tabs, diagram (Mermaid), image with hotspots, embed, slide link. |
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
├── templates/       Slipr templates: default, conclusion (house style)
├── shows/           shows: demo (every format feature), conclusion-demo, impact-autonomy-agents, fixtures
└── vendor/          third-party libraries, checked in (Reveal.js)
```

## Documentation

The purpose of each documentation file is explained in [OVERVIEW.md](OVERVIEW.md).
