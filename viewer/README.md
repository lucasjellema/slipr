# Slipr Viewer

The viewer makes one show available in two very different ways:

| | **Audience mode** | **Reader mode** |
|---|---|---|
| For | A room full of people, a big screen | One person, at their own pace |
| Content | The slides: concise and high level | The slides **plus** a deep, detailed reader layer |
| Character | Linear, presenter-driven, with animations and visualizations | Interactive and explorative, tailored to the reader |
| Feels like | PowerPoint / Keynote | An interactive article or a small learning site |

> Status: **audience mode works** (roadmap Phase 1). Reader mode is *planned* (Phases 2–3). Features not built yet are marked *(planned)*.

## Opening a show

Start the dev server in the Slipr folder with `npm run serve`, then open:

```
http://localhost:8080/viewer/?show=../shows/demo/show.json                 audience mode
http://localhost:8080/viewer/?show=../shows/demo/show.json&mode=reader     reader mode
```

| URL parameter | Meaning |
|---|---|
| `show` | Path or URL to `show.json` (required) |
| `mode` | `audience` (default) or `reader` |
| `profile` | *(planned)* Reader mode: preselect a profile, e.g. `profile=dev` |
| `path` | *(planned)* Reader mode: preselect a path, e.g. `path=quick` |
| `depth` | *(planned)* Reader mode: detail level `1`, `2` or `3` |
| `#/5` or `#/s-architecture` | Audience mode: go to slide 5 (0-based) or to the slide with that id. `#/s-problem/2` also selects a build step |
| `#s-05` / `#s-05/b3` | *(planned)* Reader mode: go to a slide, or to a block within it |

Profile, path and depth in the URL let you send a tailored link, for example "the manager's 5-minute version".

---

## Audience mode

Built on Reveal.js. The aim is a polished, linear presentation.

- **Animations**: bullets that build one by one (several fragment styles), slide transitions, and *auto-animate*, where matching elements morph smoothly from one slide to the next.
- **Visualizations**: charts and diagrams that build up on screen *(planned slot types)*. Images and SVG diagrams work today.
- **High-level overviews**: with `settings.agenda: true`, an agenda slide is generated at the start of every chapter (after the title slide for the first chapter). A thin bar along the bottom shows chapter progress. `O` gives an overview of all slides.
- **Presenter view** (`S`): notes, timer, clock, and next-slide preview in a separate window on your laptop screen. The browser must allow popups for `localhost`.
- **Backup slides** (`audience.hidden`): placed after the last slide, not counted in the slide number, and marked with a dashed outline in the overview.

| Key | Action |
|---|---|
| `→` `Space` `PageDown` | Next slide / next build step |
| `←` `PageUp` | Previous |
| `S` | Presenter view |
| `O` / `Esc` | Overview of all slides, including backup slides |
| `F` | Full screen |
| `B` / `.` | Black screen |
| `R` | *(planned)* Switch to reader mode at the current slide |
| `Alt`+click | Zoom into the clicked area (click again to zoom out) |
| `Ctrl`+`Shift`+`F` | Search the slides |

Most presentation clickers send `PageUp`/`PageDown`, so they work out of the box.

---

## Reader mode *(planned)*

Built from scratch (no Reveal.js). The aim is a rich, personal reading and exploring experience.

### Getting started
On first visit the reader gets a short welcome showing the show's title and description, plus up to three optional choices. Readers can skip them, and they can be changed at any time from the toolbar:
- **Who are you?** Choose a profile (e.g. *Developer*, *Manager*) and content is tailored to it.
- **How deep?** *Overview*, *Standard* or *Deep dive*.
- **Which route?** A path such as *5-minute overview* or *The full story*.

### Screen layout

```
┌───────────────┬───────────────────────────────────────────┬──────────────┐
│ Contents      │  Chapter 1 · Why Slipr                    │ My notes     │
│ ✓ Why Slipr   │  ┌─────────────────────────────────────┐  │              │
│   ✓ Intro     │  │           slide visual              │  │  ▌highlight  │
│   ● Why?      │  └─────────────────────────────────────┘  │   "remember  │
│ ○ How it works│  Slipr renders slides with Reveal.js̲ …    │    this"     │
│               │  ▸ How does this compare to PowerPoint?   │              │
│ [path: full ▾]│  ┃ Tip: one source means no second doc    │              │
│ [🔍 search  ] │  See also → The demo                      │              │
└───────────────┴───────────────────────────────────────────┴──────────────┘
```

### Interactive content
- **Popups on hover or tap**: glossary terms (dotted underline), inline footnotes, and hotspots on images.
- **Collapsible panels** for background and side topics.
- **Tabs** for alternatives, such as code in several languages or *before / after*.
- **Callouts** for tips, warnings and quotes.
- **Embedded live demos and videos.**
- **The slide itself** can be enlarged, or stepped through build by build.

### Tailored information
- Blocks can be meant for specific **profiles**. A developer sees code and a manager sees trade-offs.
- The **detail level** shows or hides deeper blocks without losing your place.
- Speaker notes can be shown as an extra *"what the presenter said"* layer.

### Personalised navigation
- **Table of contents** by chapter, with progress marks (✓ read, ● current, ○ not yet).
- **Paths**: curated routes through the show. *Next* and *previous* follow your path.
- **Related slides**: "see also / go deeper" links at the end of a slide.
- **Resume where you left off**, plus **bookmarks**.
- **Tag filter**: show only slides about a topic.

### Search (`/`)
Full-text search across slides, reader blocks, glossary and (optionally) notes. Results show the slide title and the matching snippet, and clicking one jumps there with the match highlighted.

### Annotations
- Select text to **highlight** it or **add a note**. Notes appear in the margin.
- **Bookmark** any slide.
- Everything is stored **only in your own browser**. It can be **exported** as Markdown (and imported again).

### Keys

| Key | Action |
|---|---|
| `/` | Search |
| `J` / `K` or `↓` / `↑` | Next / previous slide on the current path |
| `D` | Cycle detail level |
| `N` | Toggle the notes panel |
| `M` | Bookmark the current slide |
| `A` | Switch to audience mode at this slide |
