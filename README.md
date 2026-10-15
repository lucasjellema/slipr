# Slipr

**Slipr** (short for *SlidePresenter*) is personal presentation software. You write a show once and it serves two very different experiences:

- **Audience mode** is for presenting to a room on the big screen, like a regular slideshow. It is concise and high level, with animations, visualizations (including client-side Mermaid diagrams), overview and agenda slides, speaker notes and a presenter view.
- **Reader mode** is for one person exploring the same show at their own pace, interactively and in much more depth. It offers:
  - hover and tap popups, collapsible panels, tabs, hotspots on images, and Mermaid diagrams
  - content tailored to the reader's profile and preferred level of detail
  - personalised navigation: paths, progress, bookmarks and "go deeper" links
  - full-text search, and the reader's own highlights and notes

Each slide carries both layers: the concise **audience layer** (the slide itself) and the detailed **reader layer** (blocks of interactive content). See [docs/show-format.md](docs/show-format.md).

> Status: **Phases 0–5 done, Phase 6 (polish & publish) in progress**. Shows, templates and validation work. **Audience mode** presents shows on Reveal.js, with a laser pointer, spotlight and pen for the presenter. **Reader mode** offers the full interactive reading experience: popups, panels, tabs and hotspots, tailoring by profile, depth and route, progress, bookmarks, search, and your own highlights and notes, on whole slides and on objects within them. The **PPTX converter** turns PowerPoint decks into Slipr shows, and `slipr-export` turns a show back into an editable PowerPoint deck (on the company template's layouts if you like). Three templates ship: a neutral `default`, **Forest** (deep greens on parchment, pine illustrations, classic serif type) and **Conclusion** (the company house style, 21 layouts, for internal use until the brand team has reviewed it). The **editor** (Chrome or Edge) opens, creates and saves show folders anywhere on disk. It edits slides with a form generated from the layout and a layout picker with live previews, as well as images and hotspots, the reader layer, show settings (chapters, profiles, glossary, routes), and find & replace, all with undo and a live preview. A show grid rearranges slides and chapters, a **slide library** keeps slides to reuse in other shows, **Export…** saves a show as one offline HTML file, and the editor has a light and a dark theme. Slides can show **Mermaid diagrams**, **live web pages** (or their screenshot; pages from other sites load only after the reader's click in reader mode), **PDF documents** (page by page; their text is searchable in reader mode), **videos** (a file from the show folder, YouTube or Vimeo; chapters to jump to or step through, captions and a searchable transcript), **graphs** (built up step by step; readers pan, zoom and click a node) **maps** (a tour from place to place; OpenStreetMap loads only after the reader's click) and **data tables** (from a CSV file or typed in, with totals and colours; sortable and filterable, rows revealed click by click) and **tag clouds** (terms sized by weight, linked to the glossary; in reader mode a click shows the slides that mention a term), carry **extra images** and styled **text elements** (badges, labels, callouts) placed anywhere on the slide, and give any picture a **picture style** (shadow, soft edges, rounded corners, frame), an opacity, a **crop** and a **focal point**, and shrink large photos to WebP; in reader mode, **glossary terms on the slides** open their definition too. Present and Read open the viewer on the same show. Still to come: draft autosave. See [ROADMAP.md](ROADMAP.md).
>
> Try it: start any local HTTP server in this folder (e.g. `npm run serve`, `python -m http.server 8080`, or Live Server) and open
> - <http://localhost:8080/viewer/?show=../shows/demo/show.json> (audience; add `&mode=reader` for reader mode)
> - <http://localhost:8080/viewer/?zip=https://raw.githubusercontent.com/lucasjellema/slipr/main/shows/quickstart-demo.zip> (remote ZIP demo; add `&mode=reader` for reader mode)
> - <http://localhost:8080/viewer/?show=../shows/conclusion-demo/show.json> (every layout of the Conclusion template)
> - <http://localhost:8080/editor/?show=../shows/demo/show.json> (editor; or open <http://localhost:8080/editor/> for a show folder on disk)
> - <http://localhost:8080/template-editor/> (template editor: a new template from an existing one, with live preview)

## Components

| Component | Folder | What it does | Technology |
|---|---|---|---|
| **Viewer** | [viewer/](viewer/README.md) | Presents a show in audience mode (Reveal.js) or lets a reader explore it in the interactive reader mode | HTML, CSS, vanilla JS, Reveal.js (audience mode only) |
| **Editor** | [editor/](editor/README.md) | Creates and edits shows in the browser | HTML, CSS, vanilla JS |
| **Template Editor** | [template-editor/](template-editor/README.md) | Makes a new template from an existing one: colours (with contrast checks), fonts and sizes, with a live audience and reader preview | HTML, CSS, vanilla JS |
| **Converter** | [converter/](converter/README.md) | Turns a PowerPoint file (`.pptx`) into a Slipr show, and a show back into a `.pptx` | Python (CLI), `python-pptx` |
| *Shared core* | `shared/` | Loads, validates and renders shows. All components use it | Vanilla JS (ES modules) |

## Getting started

Follow these steps to clone Slipr, run it locally, and explore presentations in both audience and reader mode.

### Prerequisites & server

Slipr is built entirely with web standards—HTML, CSS, and vanilla JavaScript ES modules. **There are no build tools, bundlers, or `npm install` requirements.**

- **A modern browser:** Chrome, Edge, Firefox, or Safari.
- **Any static HTTP server:** Web browsers require an HTTP origin to load ES modules. You can use any static server you prefer:
  - **Node.js / npx:** `npm run serve` (or `npx http-server . -p 8080 -c-1`)
  - **VS Code:** Right-click and select *Open with Live Server* (or use the Live Preview extension)
  - **Python:** `python -m http.server 8080`
  - Any local or remote web server (Caddy, nginx, GitHub Pages, etc.)

> **When is Node.js required?**  
> Node.js is **not** required to view, present, or edit presentations. Node (≥ 22) is only needed if you want to use your **smartphone as a remote presenter control** (which runs the local WebSocket relay server via `npm run remote` or `node tools/relay.js`), or to run developer CLI tools (`npm test`, single-file exporter `npm run export`, AI prompt kit `npm run prompt`).

### 1. Clone and run

```bash
git clone https://github.com/lucasjellema/slipr.git
cd slipr
```

Start your preferred local HTTP server in the repository root:

```bash
# Option A: With Node.js / npx (built into package.json)
npm run serve

# Option B: With Python
python -m http.server 8080

# Option C: With VS Code Live Server extension, or any static server
```

Then open <http://localhost:8080> (or your server's address).

### 2. Try out the demo show

Open the built-in demo show ([`shows/demo/`](shows/demo/)) in your browser:

- **Audience mode** (slideshow for the big screen with presenter view, animations, laser pointer, and pen):  
  👉 <http://localhost:8080/viewer/?show=../shows/demo/show.json>
- **Reader mode** (interactive reading article with deep dives, popups, tabs, full-text search, highlights, and notes):  
  👉 <http://localhost:8080/viewer/?show=../shows/demo/show.json&mode=reader>

> **Keyboard shortcuts:** Press **`A`** to switch to Audience mode and **`R`** to switch to Reader mode at any time. Press **`?`** or **`F1`** to open the viewer manual with all shortcuts. In audience mode, press **`P`** to pair a smartphone as a remote clicker (requires the WebSocket relay server: `npm run remote`).

You can also preview all 21 layouts of the Conclusion corporate template:  
<http://localhost:8080/viewer/?show=../shows/conclusion-demo/show.json>

### 3. Display a show from a ZIP file via URL

Slipr can download, decompress, and present `.zip` or `.slipr` presentation archives entirely in memory in the browser using standard Web Streams—keeping Slipr completely offline and serverless once loaded.

- **From a remote URL:** Use the `?zip=` parameter to load a zipped presentation archive directly:
  - **Audience mode:**  
    <http://localhost:8080/viewer/?zip=https://raw.githubusercontent.com/lucasjellema/slipr/main/shows/quickstart-demo.zip>
  - **Reader mode:**  
    <http://localhost:8080/viewer/?zip=https://raw.githubusercontent.com/lucasjellema/slipr/main/shows/quickstart-demo.zip&mode=reader>
- **From a local zip archive:**  
  You can also point to local zip files served by the web server:  
  <http://localhost:8080/viewer/?zip=../shows/quickstart-demo.zip>
- **Drag & drop or file chooser:**  
  Open the viewer start screen at <http://localhost:8080/viewer/> and click **Open zip archive…**, or simply drag and drop any `.zip` or `.slipr` file directly onto the browser window. Works in Chrome, Edge, Firefox, and Safari.

> **Note on CORS:** Remote zip URLs must allow cross-origin requests. Raw links from GitHub (`https://raw.githubusercontent.com/...`) and GitHub Pages include the required `Access-Control-Allow-Origin` headers by default.

### 4. Edit and create shows

- **Open the editor on the demo show:**  
  <http://localhost:8080/editor/?show=../shows/demo/show.json>
- **Create or open shows on disk:**  
  Open <http://localhost:8080/editor/> to start a new show from a template or open an existing show folder on your disk (Chrome or Edge via the File System Access API). In any browser, you can also click **Open zip…** to load and edit a `.zip` archive.
- **Live preview and presentation:**  
  Select slides in the left pane, edit layout slots and reader blocks in the center inspector, and inspect live updates in the right preview pane. Click **Present ▶** (`F5`) or **Read 📖** in the editor toolbar to preview. The complete user manual is at [editor/help.html](editor/help.html) or under **? Help** (`F1`) in the editor.

### 5. Share as a single offline HTML file

Package an entire presentation—including the show, template, fonts, images, and the viewer—into a single self-contained HTML file (using the export CLI script; requires Node.js):

```bash
npm run export -- shows/demo
```

This writes `exports/demo.html`. Double-click the file to open and present it completely offline (no server or internet required). Add `?mode=reader` to the address or press `R` for reader mode.

### 6. Create shows with AI

Open <http://localhost:8080/viewer/create-with-ai.html>, pick a template, describe your presentation topic, and paste the generated instruction into Claude, ChatGPT, or Copilot. Save the response as `show.json` in a folder (or zip it) and open it with the viewer or editor. The instructions are generated from the templates into [docs/ai/prompts/](docs/ai/prompts/) (regenerate with Node.js: `npm run prompt`).

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
├── docs/            show & template format specs, decision log, AI prompt kit (docs/ai/)
├── shared/          shared core: loader, validator, renderer, JSON schemas
├── viewer/          viewer web app
├── editor/          editor web app
├── template-editor/ template editor web app (I-106)
├── converter/       PPTX → Slipr converter
├── templates/       Slipr templates: default, forest, conclusion (house style)
├── shows/           shows: demo (every format feature), conclusion-demo, quickstart-demo.zip, fixtures
└── vendor/          third-party libraries, checked in (Reveal.js)
```

## Documentation

The purpose of each documentation file is explained in [OVERVIEW.md](OVERVIEW.md).
