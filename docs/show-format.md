# Show format: version 0.2 (draft)

A **show** is a folder:

```
my-talk/
├── show.json        the show definition (this spec)
└── images/          images used by the show (png, jpg, webp, svg, gif)
```

Later a show can also be packaged as a single `.slipr` file, which is a zip of this folder (see backlog).

## One source, two depths

Every slide carries two layers of content:

| Layer | Used by | Character |
|---|---|---|
| **Audience layer** (`content`, `audience`) | Audience mode, the big screen | Concise and high level: the slide itself, with animations and visualizations |
| **Reader layer** (`reader`) | Reader mode, one person at a screen | Detailed and interactive: prose, collapsible panels, popups, tabs, hotspots, embeds. It can be tailored to the reader's profile and preferred level of detail |

On top of the slides, show-level structures power the reader experience: **chapters**, a **glossary** (hover/tap popups), **profiles** (tailored content) and **paths** (personalised routes through the show).

## `show.json`: example

```json
{
  "slipr": "0.1",
  "id": "intro-to-slipr",
  "meta": {
    "title": "Introducing Slipr",
    "subtitle": "One show, two ways to experience it",
    "author": "Lucas Jellema",
    "date": "2026-10-10",
    "language": "en",
    "description": "Short summary shown in reader mode and link previews."
  },
  "template": { "ref": "../../templates/default", "version": "^1.0" },
  "settings": { "aspectRatio": "16:9", "transition": "fade", "slideNumbers": true },

  "chapters": [
    { "id": "why", "title": "Why Slipr", "summary": "The problem with decks that are read afterwards." },
    { "id": "how", "title": "How it works" }
  ],
  "glossary": {
    "reveal-js": {
      "term": "Reveal.js",
      "definition": "Open-source framework for HTML presentations.",
      "link": "https://revealjs.com"
    }
  },
  "profiles": [
    { "id": "dev", "label": "Developer", "description": "Shows technical details and code." },
    { "id": "mgr", "label": "Manager", "description": "Focuses on value and trade-offs." }
  ],
  "paths": [
    { "id": "quick", "label": "5-minute overview", "slides": ["s-01", "s-02", "s-05"] },
    { "id": "full", "label": "The full story", "slides": "*" }
  ],

  "slides": [
    {
      "id": "s-01",
      "layout": "title",
      "chapter": "why",
      "content": { "title": "Introducing Slipr", "subtitle": "One show, two ways to experience it" },
      "notes": "Welcome everyone. Mention the **demo** at the end."
    },
    {
      "id": "s-02",
      "layout": "bullets",
      "chapter": "why",
      "tags": ["motivation"],
      "content": {
        "title": "Why another presentation tool?",
        "body": "- Present on the **big screen**\n- Publish for **readers**\n  - same source\n- Keep the house style consistent"
      },
      "notes": "Keep this short.",
      "audience": { "fragments": true, "transition": "slide" },
      "reader": {
        "summary": "Decks are written for the room and fall flat when read alone.",
        "blocks": [
          { "id": "b1", "type": "text",
            "md": "Slipr renders slides with [[reveal-js]] for the room, and gives readers far more depth.^[This page is an example of exactly that.]" },
          { "id": "b2", "type": "details", "title": "How does this compare to PowerPoint?",
            "md": "PowerPoint's *notes pages* are the closest thing, but they are static and not interactive." },
          { "id": "b3", "type": "callout", "variant": "tip", "for": ["mgr"],
            "md": "One source means no second document to keep in sync." },
          { "id": "b4", "type": "tabs", "for": ["dev"], "depth": 3,
            "tabs": [
              { "label": "show.json", "md": "```json\n{ \"layout\": \"bullets\" }\n```" },
              { "label": "Layout", "md": "```html\n<ul data-slot=\"body\"></ul>\n```" }
            ] }
        ],
        "related": ["s-05"]
      }
    },
    {
      "id": "s-03",
      "layout": "image-full",
      "chapter": "how",
      "content": {
        "image": { "src": "images/architecture.png", "alt": "Slipr architecture", "fit": "contain" },
        "caption": "Three components, one shared core"
      },
      "audience": { "autoAnimate": true },
      "reader": {
        "blocks": [
          { "id": "b1", "type": "image",
            "image": { "src": "images/architecture.png", "alt": "Slipr architecture" },
            "hotspots": [
              { "x": 0.18, "y": 0.40, "title": "Converter", "md": "Turns PPTX into `show.json`." },
              { "x": 0.70, "y": 0.40, "title": "Viewer", "md": "Audience mode and reader mode." }
            ] }
        ]
      }
    }
  ]
}
```

## Top-level fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `$schema` | string | no | Path to `shared/schema/show.schema.json`, for autocomplete in editors outside this repo's VS Code workspace |
| `slipr` | string | yes | Format version of this file: `"0.2"` (current) or `"0.1"`. 0.2 adds `overlays` on slides (extra images and text elements), `style` / `opacity` on pictures, `aliases` on glossary terms, `fallback` / `load` on embeds and web pages (`web` slots, `allow`, `aspect`, `present`); a show without them may stay 0.1. The editor and the converter write 0.2 only when a show uses them |
| `id` | string | yes | Stable identifier (kebab-case), used in URLs and as the key for the reader's personal data |
| `meta` | object | yes | `title` (required), `subtitle`, `author`, `date` (ISO), `language` (BCP-47), `description`, `tags[]` |
| `template` | object | yes | `ref`: path or URL to the template folder, relative to `show.json` (see *Template references* below). `version`: semver range |
| `settings` | object | no | `aspectRatio` (`"16:9"` default, `"4:3"`), `transition` (`none`, `fade`, `slide`, `convex`, `concave`, `zoom`), `slideNumbers` (bool), `agenda` (bool: audience mode inserts a generated agenda slide before each chapter) |
| `chapters` | array | no | `{ id, title, summary? }` in display order. They drive the audience agenda and progress, and the reader table of contents |
| `glossary` | object | no | id → `{ term, aliases?, definition, link? }`. Referenced from Markdown as `[[id]]` and shown as a popup in reader mode. In reader mode, slides also link the first occurrence of each term (or one of its `aliases`, format 0.2) automatically (D-015) |
| `profiles` | array | no | `{ id, label, description? }`. A reader picks one, and blocks tagged `for` other profiles are hidden |
| `paths` | array | no | `{ id, label, description?, slides }`, where `slides` is an array of slide ids or `"*"` for all. A curated route through the show |
| `slides` | array | yes | Ordered list of slides (see below) |

## Slide fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique within the show and never reused. Deep links, paths and reader annotations depend on it |
| `layout` | string | yes | ID of a layout in the template |
| `chapter` | string | no | ID of a chapter |
| `tags` | string[] | no | Topics, used for reader filtering, search facets and "related" suggestions |
| `content` | object | yes | **Audience layer.** Slot name → slot value (see slot types). Unknown slots produce a warning |
| `overlays` | array | no | **Extra images** and **text elements** placed freely on the slide, in front of the layout (format 0.2, D-013, D-016). See *Extra images* and *Text elements* below |
| `notes` | string | no | Speaker notes (Markdown). Presenter view only, unless the reader opts to see them |
| `audience` | object | no | Audience-mode options: `hidden` (backup slide), `fragments` (bool or `"fade-up"` etc.), `autoAnimate` (bool: Reveal auto-animate to the next slide; set it on both slides. Pictures morph: position, size, crop, focus and opacity, I-091), `transition`, `background` |
| `reader` | object | no | **Reader layer** (see below) |

### Extra images (`slide.overlays`, format 0.2)

Besides the layout's own image slots, a slide can carry extra images that the author places and sizes freely: a logo, an arrow, a screenshot next to the bullets. This is the one accepted exception to "slides contain no styling" (D-013); everything else stays template-driven.

```json
"overlays": [
  { "image": { "src": "images/logo.svg", "alt": "Slipr logo" }, "x": 0.78, "y": 0.06, "w": 0.16, "h": 0.12 },
  { "image": { "src": "images/arrow.png", "alt": "Arrow to the second bullet" }, "x": 0.52, "y": 0.48, "w": 0.1, "h": 0.08, "fragment": "fade-left" }
]
```

| Field | Type | Meaning |
|---|---|---|
| `image` | image value | `{ src, alt, fit?, focus? }`, as in an image slot. `fit` defaults to `contain` (never distorted); `cover` fills the box and may crop |
| `x`, `y` | number 0–1 | Top-left corner, as a fraction of the canvas width (`x`) and height (`y`) |
| `w`, `h` | number 0–1 | Width as a fraction of the canvas width, height as a fraction of the canvas height |
| `fragment` | `true` or effect | Appear one by one in audience mode, optionally with an effect (the values of `audience.fragments`) |

- Later overlays are in front of earlier ones; all are in front of the layout's content.
- Overlays with `fragment` appear after the slide's own fragments (bullets, cards), in array order.
- They scale with the slide. In reader mode a slide with overlays keeps its picture layout on narrow screens instead of reflowing (see `docs/template-format.md`).
- A 0.1 show with overlays is an error. An overlay that sticks out of the canvas (more than 0.5 %) is a warning.

### Text elements (`slide.overlays` with `text`, format 0.2)

An overlay with `text` instead of `image` is a **text element**: a badge, a label on a photo, a callout, a pill (I-089). It is placed like an extra image (`x`, `y`, `w`, `h`, `fragment`, the same stacking and order of appearance), and its look is set on the element itself: the accepted exception of D-016. Spec: `docs/specs/I-089-text-elements.md`.

```json
{
  "text": "**New** in 2026",
  "style": { "font": "heading", "size": 1.6, "bold": true, "uppercase": true, "align": "center", "valign": "middle",
             "color": "#FFFFFF", "background": "#BC448C", "backgroundOpacity": 0.9, "radius": 2, "padding": 0.6 },
  "x": 0.8, "y": 0.06, "w": 0.14, "h": 0.07
}
```

`text` is inline Markdown (bold, italic, code, links, `[[glossary]]`, `^[popup]`); a `\n` starts a new line. An overlay has either `image` or `text`, never both. All `style` fields are optional; lengths are percentages of the slide width (1 = 1 %), so the element scales with the slide.

| `style` field | Values | Default |
|---|---|---|
| `font` | `heading`, `body` (the template's fonts), `mono` (its code font), `system`, `serif` (platform fonts) | `body` |
| `size` | a number 0.5–20, or `small`, `body`, `subtitle`, `title`, `hero` (the template's sizes) | `body` |
| `bold`, `italic`, `underline`, `uppercase` | boolean | false |
| `align` / `valign` | `left` `center` `right` / `top` `middle` `bottom` | `left` / `top` |
| `color` | `#rgb` or `#rrggbb` | the template's text color |
| `background`, `backgroundOpacity` | a color; 0–1 (fades the fill only) | none; 1 |
| `borderWidth` (0–5), `borderStyle` (`solid` `dashed` `dotted`), `borderColor` | box border | none; `solid`; the text color |
| `radius` | 0–50: rounded corners, pills | 0 |
| `outlineWidth` (0–2), `outlineColor` | a halo around the letters, for text over photos | none; white |
| `padding` | 0–10 | 0 |

- Text that does not fit the box is still shown; make the box larger.
- Reader search finds the text; in reader mode glossary terms in it are linked (D-015).
- A text element in a 0.1 show is an error. An empty text is a warning, and so is one that sticks out of the canvas.

### Reader layer (`slide.reader`)

| Field | Type | Meaning |
|---|---|---|
| `hidden` | bool | Leave this slide out of reader mode |
| `showSlide` | bool | Show the slide visual above the blocks (default `true`). Set `false` for reader-only text pages |
| `summary` | string | One-line takeaway, used in the TOC, search results and the "overview" detail level |
| `blocks` | array | Ordered content blocks (see below) |
| `related` | string[] | Slide ids offered as "go deeper / see also" |

### Reader blocks

Every block has an `id` (unique within the slide, stable, used to anchor annotations) and a `type`. Optional on every block:
- `for`: profile ids that see this block (absent = everyone)
- `depth`: `1` essential · `2` standard (default) · `3` deep dive. The reader's chosen detail level shows blocks with `depth ≤ level`

| Type | Fields | Renders as |
|---|---|---|
| `text` | `md` | Prose |
| `details` | `title`, `md`, `open?` | Collapsible panel |
| `callout` | `variant` (`info` \| `tip` \| `warning` \| `quote`), `title?`, `md` | Highlighted box |
| `tabs` | `tabs: [{ label, md }]` | Tabbed alternatives, e.g. code in several languages |
| `image` | `image` (as slot value), `hotspots?: [{ x, y, title, md }]` (x/y as fraction 0–1) | Image with clickable hotspots that open popups |
| `embed` | `url`, `title`, `height?`, `aspect?`, `allow?`, `load?`, `fallback?` | Sandboxed iframe (live demo, a video site other than YouTube or Vimeo). A page on another server is **click-to-load** unless `load` is `"auto"` (0.2); see *Embeds* below |
| `slide-ref` | `slide`, `label?` | Link card to another slide |
| `diagram` | `mermaid`, `caption?`, `fallback?` | Rendered SVG diagram from Mermaid source |
| `pdf` | `pdf`, `title`, `page?`, `pages?`, `load?`, `fallback?` | (0.2) A PDF document with page navigation, zoom and searchable text; see *PDF documents* below |
| `video` | `video`, `title`, `start?`, `end?`, `muted?`, `loop?`, `controls?`, `captions?`, `chapters?`, `transcript?`, `caption?`, `load?`, `fallback?` | (0.2) A video file, or a YouTube or Vimeo video, with chapters to jump to and a transcript; see *Videos* below |
| `graph` | `nodes` and / or `data`, `edges?`, `layout?`, `title?`, `caption?`, `fallback?` | (0.2) A graph to explore: pan, zoom, select a node, filter by tag; see *Graphs* below |
| `map` | `center` / `markers` / `layers`, `zoom?`, `tiles?`, `load?`, `title?`, `caption?`, `fallback?` | (0.2) An interactive map: pan, zoom, select a place, filter by tag; see *Maps* below |
| `table` | `columns` and `rows`, or `data`, plus `sortable?`, `sort?`, `filter?`, `maxRows?`, `pinFirst?`, `locale?`, `title?`, `caption?`, `fallback?` | (0.2) A data table: sort, filter, show or hide columns, copy, download; see *Tables* below |
| `tag-cloud` | `terms` or `data`, plus `termColumn?`, `weightColumn?`, `order?`, `maxTerms?`, `weightLabel?`, `title?`, `caption?`, `fallback?` | (0.2) A tag cloud: a click on a term shows its glossary definition and the slides that mention it; see *Tag clouds* below |
| `chart` | `columns` and `rows`, or `data`, plus `kind?`, `category?`, `series?`, `orientation?`, `stacked?`, `values?`, `min?`, `max?`, `sort?`, `highlight?`, `reference?`, `title?`, `caption?`, `fallback?` | (0.2) A data chart (`kind: "bar"`): accessible tooltips, legend toggle, show as table; see *Charts* below |

*Planned block types (backlog):* `quiz` (self-check question).

### Embeds (I-070, D-011)

Content that needs a library or another server (or a data file) is an **embed**: today `diagram` (slot and block), web pages (`web` slot and `embed` block, I-071), PDF documents (`pdf` slot and block, I-072), videos (`video` slot and block, I-110; no library), graphs (`graph` slot and block, I-074), maps (`map` slot and block, I-075), tables (`table` slot and block, I-104; no library, but a data file) and charts (`chart` slot and block, I-109; no library). Embeds share two optional fields (format 0.2):

| Field | Type | Meaning |
|---|---|---|
| `fallback` | image value | A static picture (e.g. a screenshot) shown for print, in editor thumbnails, before the live content loads and when it fails. Without it, a diagram falls back to its source and a web page to a link card (title, site, *Open in new tab*) |
| `load` | `"click"` \| `"auto"` | For content from another server (an `http(s)` URL). `"click"` (default): the reader sees the link card and a **Load** button naming the site, and nothing is requested until they click; consent then holds for that site until the tab closes. `"auto"`: load straight away. Files next to `show.json` always load directly |

```json
{ "id": "docs", "type": "embed", "title": "Reveal.js documentation", "url": "https://revealjs.com/", "height": 420,
  "fallback": { "src": "images/revealjs-screenshot.png", "alt": "The Reveal.js documentation home page" } }
```

#### PDF documents (`pdf` slot and block; I-072, format 0.2)

| Field | Meaning |
|---|---|
| `pdf`, `title` | Required. The file: a path relative to `show.json` (e.g. `docs/report.pdf`), or an `https:` URL (its server must allow cross-origin requests, CORS). The key is `pdf`, not `src`, so a PDF value is never mistaken for an image |
| `page` | Show this one page |
| `pages` | `[first, last]`, inclusive. **Audience mode** starts at `first` and each click (a Reveal fragment) shows the next page. **Reader mode** opens at `first` and limits page navigation to the range. Wins over `page` (warning if both are set) |
| `load` | As for web pages: a PDF on another server is click-to-load in reader mode unless `"auto"` |
| `fallback` | As for every embed |

Without `page` or `pages`: page 1 on a slide, the whole document in a reader block. Reader blocks have a bar with previous / next, zoom and *Open PDF ↗*; a slot in reader mode has a compact bar. **Reader search** finds text in the shown pages (local PDFs, and remote ones once they may load), and a result opens the PDF at that page. PDFs are rendered with the vendored PDF.js (D-011), loaded only when a show has a PDF.

```json
"document": { "pdf": "docs/annual-report.pdf", "title": "Annual report 2026", "pages": [4, 7] }
```

#### Videos (`video` slot and block; I-110, format 0.2)

| Field | Meaning |
|---|---|
| `video`, `title` | Required. A video file in the show folder (e.g. `media/clip.mp4`; MP4 or WebM), a **YouTube** or **Vimeo** link in any form (`youtu.be/…`, `watch?v=…`, `shorts/…`, `vimeo.com/123`, an unlisted `vimeo.com/123/hash`), or an `https:` link to a video file. The key is `video`, not `src`, so a video value is never mistaken for an image. Other video sites: use an `embed` block |
| `start`, `end` | Seconds (numbers ≥ 0): play from `start`, stop at `end`. A YouTube link's own `t=` counts when `start` is not set. Vimeo plays on after `end` |
| `muted`, `loop` | Booleans, default false |
| `controls` | Boolean, default true. Without controls a click, Space or Enter on the video plays or pauses it |
| `captions` | `{ "src": "media/clip.en.vtt", "label"?: "English", "lang"?: "en" }`: a WebVTT file in the show folder, shown by default. Video files only (YouTube and Vimeo bring their own; a warning otherwise) |
| `chapters` | `[{ "time": 0, "title": "Introduction" }, …]`, times in seconds. Reader blocks list them below the video (a click jumps there); reader slots get a chapter menu; reader search finds them and a result plays the video from that chapter |
| `transcript` | Markdown. Reader blocks show it in a collapsible *Transcript*; reader slots behind a *Transcript* button; reader search finds it |
| `caption` | A caption below the video (blocks; on a slide, layouts usually have a caption slot) |
| `play` | Slots, audience mode: `"click"` (default: the presenter presses play), `"slide"` (plays when the slide appears; muted if the browser refuses sound) or `"step"` (plays on the next click, a Reveal fragment) |
| `chapterSteps` | Slots, audience mode: `true` makes every further chapter a step, so each click jumps to the next chapter (after the play step with `play: "step"`). Going back jumps back; before the first step the video pauses at `start` |
| `present` | Slots, audience mode: `"live"` (default) or `"static"`: only the poster (or card), never contacting another server |
| `load` | As for web pages: a video from another server (YouTube, Vimeo, an https file) is click-to-load in reader mode unless `"auto"`. In audience mode it loads without asking |
| `fallback` | The **poster**: shown before the video plays, in print and thumbnails, while presenting `static`, and while a video waits for *Load* |

A video pauses when its slide is left. Video files play in the browser's own player; YouTube in its privacy-friendly player (`youtube-nocookie.com`), Vimeo with `dnt=1`, both in a frame that may run their own scripts on their own origin (D-011) and that sends the referrer origin (YouTube refuses to play without one). No player library is loaded. Without a poster, the static content is a card with the title, the source and *Watch ↗*. The single-file export embeds video files up to **25 MB** (with their captions); a larger file is left out with a warning, and the export shows its poster.

```json
"video": { "video": "media/launch.mp4", "title": "The launch in two minutes", "play": "step", "chapterSteps": true,
  "chapters": [{ "time": 0, "title": "Countdown" }, { "time": 42, "title": "Lift-off" }],
  "captions": { "src": "media/launch.en.vtt", "label": "English", "lang": "en" },
  "fallback": { "src": "media/launch-poster.jpg", "alt": "The rocket on the launch pad" } }
```

#### Graphs (`graph` slot and block; I-074, format 0.2)

A network of nodes and links, laid out automatically and drawn with the vendored Cytoscape.js (D-011), loaded only when a show has a graph. Spec: `docs/specs/I-074-graph.md`. For authors, the editor manual explains it step by step (`editor/help.html#graphs`).

```json
"graph": {
  "nodes": [
    { "id": "show", "label": "show.json", "tags": ["format"], "md": "One file per show.", "slide": "s-data-1" },
    { "id": "template", "label": "Template", "tags": ["template"] }
  ],
  "edges": [{ "from": "show", "to": "template", "label": "names" }],
  "layout": "cose",
  "steps": [{ "show": ["template"] }, { "focus": "show" }]
}
```

| Field | Meaning |
|---|---|
| `nodes` | `id` (required, unique), `label` (default: the id), `tags`, `md` (shown when a reader selects the node), `slide` (the node links to that slide) |
| `edges` | `from`, `to` (node ids, required), `label` |
| `data` | Instead of, or besides, inline `nodes` / `edges`: a `.json` file in the show folder with `{ "nodes": [...], "edges": [...] }` (the file's entries come first). Checked, exported and opened from folders like images |
| `layout` | `cose` (default, force-directed), `breadthfirst`, `concentric`, `circle`, `grid` |
| `steps` | Slots in audience mode only: one per click, after the slide's own fragments. `{ "show": [ids] }` reveals nodes (hidden until then; a link appears once both ends show), `{ "focus": id }` zooms to a node and its neighbours and fades the rest. Going back works |
| `caption` | Below the graph, when the layout has no caption slot of its own |
| `fallback` | As for every embed. Without it, the static content is a list of the nodes and their links (also what screen readers get) |

The graph block also has `title` (and `id`, `type: "graph"`, `for`, `depth`); it has no `steps`. **Colors come from the template** (no colors in the show): a node's first tag picks `--slipr-graph-1` … `6` in order of first use. **Reader mode**: drag to pan, **+ / − / Fit**, click or tap a node (or choose it in the **Node…** list) to highlight its neighbours and show its text and **Go to slide**; the tag buttons are the legend and filter the nodes; Esc clears. Reader search finds node labels and text (inline graphs).

#### Maps (`map` slot and block; I-075, format 0.2)

Places on an interactive map, drawn with the vendored Leaflet (D-011), loaded only when a show has a map. Spec: `docs/specs/I-075-map.md`. For authors, the editor manual explains it step by step (`editor/help.html#maps`).

```json
"map": {
  "markers": [
    { "id": "ams", "lat": 52.3731, "lng": 4.8922, "title": "Amsterdam", "tags": ["city"], "md": "First stop.", "slide": "s-team" },
    { "id": "rtm", "lat": 51.9225, "lng": 4.4792, "title": "Rotterdam", "tags": ["port"] }
  ],
  "layers": [{ "data": "data/route.geojson", "title": "Route", "tag": "route" }],
  "steps": [{ "marker": "ams", "zoom": 11 }, { "marker": "rtm" }]
}
```

| Field | Meaning |
|---|---|
| `center`, `zoom` | The first view: `{ "lat", "lng" }` and a zoom level (0–22). Without a center the view fits the markers and layers, and `zoom` is the most it zooms in |
| `markers` | `lat`, `lng` (required), `title`, `md` (shown when a reader selects the place), `tags` (the first picks the color), `slide` (the place links to that slide), `id` (for steps) |
| `layers` | GeoJSON files in the show folder (`.geojson` / `.json`): `data` (required), `title`, `tag` (the color). A layer without a `tag` is background (land, borders): neutral colors, and not part of the fitted first view. Checked, exported and opened from folders like images |
| `tiles` | The background. Absent: OpenStreetMap (with its attribution). An `https:` URL template with `{z}/{x}/{y}`, or `{ "url", "attribution", "maxZoom" }` (attribution as plain text): another tile server. A relative template (`tiles/{z}/{x}/{y}.png`): tiles in the show folder: they work offline and wherever the show is opened (served, from a folder or a zip) and are packed into single-file exports (I-099). `"none"`: no background, nothing loaded from a server |
| `steps` | Slots in audience mode only: one per click, after the slide's own fragments. `{ "marker": id, "zoom"? }` flies to that place (zoom 12 by default) and shows its name. Going back works |
| `present` | Slots, audience mode: `"live"` (default) loads the tiles; `"static"` shows the fallback and contacts nothing |
| `load` | Reader mode, tiles from a server: `"click"` (default) or `"auto"`, as for every embed |
| `caption` | Below the map, when the layout has no caption slot of its own |
| `fallback` | As for every embed. Without it, the static content is a list of the places (also what screen readers get) |

The map block also has `title` (and `id`, `type: "map"`, `for`, `depth`); it has no `steps` or `present`. A map needs a `center`, `markers` or `layers`. **Colors come from the template**, from the graph palette: a marker's first tag (or a layer's `tag`) picks `--slipr-graph-1` … `6` in order of first use. **Reader mode**: drag to pan, **+ / −**, **Fit**, click or tap a pin (or choose it in the **Place…** list) to show its text and **Go to slide**; the tag buttons filter the places; Esc clears. Reader search finds place titles and text.

#### Tables (`table` slot and block; I-104, format 0.2)

A table of data from a **CSV file** in the show folder or typed in as **inline rows**: colours from the template, a header that stays in place while long tables scroll, and optionally sorting, a filter box, totals, colour scales, data bars and red / green numbers. Spec: `docs/specs/I-104-table.md`. For authors, the editor manual explains it step by step (`editor/help.html#tables`).

```json
"table": {
  "columns": [
    { "key": "region", "label": "Region" },
    { "key": "revenue", "label": "Revenue", "format": "currency", "decimals": 0, "currency": "EUR", "total": "sum", "visual": "bar" },
    { "key": "growth", "label": "Growth", "format": "percent", "decimals": 1, "visual": "sign" }
  ],
  "rows": [["North", 1200, 0.125], ["South", 800, -0.05]],
  "sortable": true,
  "steps": [{ "rows": 1 }, { "rows": "all" }, { "highlight": { "column": "growth" } }]
}
```

| Field | Meaning |
|---|---|
| `data` | A CSV file in the show folder (`data/…csv`, `.tsv` or `.txt`). The first line holds the column keys. Comma, semicolon or tab separated (detected from the first line); quotes as in RFC 4180; with semicolons, `1234,5` and `12,5%` are read with a decimal comma |
| `rows` | Instead of `data`: the rows inline, each an array of cells (string, number or `null`) in the order of `columns` |
| `columns` | Column settings by `key` (required). For inline rows they define the columns; for a CSV file they configure them: listed columns in the given order, then the file's others in file order |
| `sortable` | Click a header to sort: ascending, descending, the original order. In both modes |
| `sort` | Initial sort: `{ "column": key, "order": "asc" \| "desc" }` |
| `filter` | A search box that keeps the rows containing the text in a shown column. In both modes |
| `maxRows` | About this many rows are visible before the table scrolls (reader blocks; on a slide the layout's space limits it too) |
| `pinFirst` | The first shown column stays in place while the table scrolls sideways |
| `locale` | Number and date formatting (`nl-NL`); default the show's `meta.language` |
| `steps` | Slots, audience mode: one per click, after the slide's own fragments. `{ "rows": n \| "all" }` shows the first n rows in data order (once a `rows` step exists the table starts with none); `{ "highlight": { "row": n \| "first-column text", "column": key } }` highlights a row, a column or a cell and dims the rest until the next step (a `rows` step ends it); `{ "highlight": null }` clears. Print, thumbnails and the editor show every row |
| `caption` | Below the table, when the layout has no caption slot of its own |
| `fallback` | As for every embed. Without it, the static content is the table itself (for a CSV file: its header and a note) |

Column fields: `key` (required), `label` (default the key), `format` (`text` · `number` · `integer` · `percent`, where 0.125 shows as 12.5 % · `currency` · `date`, for `2026-10-14` · `markdown`, for inline Markdown with links, `[[glossary]]` terms and slide links; default: a column whose filled cells are all numbers is numeric and shown as written, else text), `decimals`, `currency` (ISO code, default `EUR`), `align` (`start` · `center` · `end`; default numbers at the end), `hidden` (readers can show it from the **Columns** menu), `total` (`sum` · `avg` · `min` · `max` · `count`: a footer row over the rows on show), `visual` (numeric columns: `scale` colours the cells from light to the template's strong colour, `bar` draws a bar in the cell, `sign` colours negative and positive numbers).

The table block also has `title` (and `id`, `type: "table"`, `for`, `depth`); it has no `steps`. **Colours come from the template**: `--slipr-table-header-bg`, `-header-text`, `-stripe`, `-border`, `-strong` (scales and bars), `-positive`, `-negative`, `-highlight`. **Reader mode** adds **Columns** (show or hide), **Copy** (tab separated, pastes into a spreadsheet) and **Download CSV** (the rows on show). Reader search finds headers and inline cells; rows in a CSV file are not in the search index.

#### Tag clouds (`tag-cloud` slot and block; I-105, format 0.2)

Terms sized by their weight, from a **CSV file** in the show folder or typed in as **inline terms**: themes of a talk, survey answers, keywords. The terms flow in centred lines (a list, so screen readers read them in order), each sized and coloured by its weight; colours and sizes come from the template. Spec: `docs/specs/I-105-tag-cloud.md`. For authors: `editor/help.html#tag-clouds`.

```json
"cloud": {
  "terms": [
    { "text": "reader layer", "weight": 14 },
    { "text": "templates", "weight": 10 },
    { "text": "Markdown", "weight": 7 },
    { "text": "Popovers", "weight": 5, "glossary": "reader-layer" }
  ],
  "steps": [{ "terms": 2 }, { "terms": "all" }, { "highlight": ["reader layer", "templates"] }]
}
```

| Field | Meaning |
|---|---|
| `terms` | The terms inline: `{ "text", "weight"?, "glossary"? }`. `weight` is a number ≥ 0 (default 1). A term written twice (ignoring case and accents) is shown once with the weights added up; an empty `text` is not shown |
| `data` | Instead of `terms`: a CSV file in the show folder (`data/…csv`, `.tsv` or `.txt`, first line the headers; separators and decimal commas as for tables) |
| `termColumn` | The CSV column with the terms (default: the first column) |
| `weightColumn` | The CSV column with the weights (default: the second column when every filled cell in it is a number). Without a weight column every row counts 1, so a file with one answer per row shows the most frequent answers biggest |
| `order` | `cloud` (default): the heaviest term in the middle, lighter ones alternately before and after it · `weight`: heaviest first · `alphabetical` · `none`: as written |
| `maxTerms` | Show only the heaviest n terms |
| `weightLabel` | What a weight counts (`mentions`, `answers`): readers see "12 mentions" in the term's popup, screen readers hear it. Without it the weight is read out as "weight 12" and not shown in the popup |
| `steps` | Slots, audience mode: one per click, after the slide's own fragments. `{ "terms": n \| "all" }` shows the heaviest n terms, each in its own place (once a `terms` step exists the cloud starts empty); `{ "highlight": "term" \| ["term", …] }` highlights terms (by name, ignoring case and accents) and dims the rest until the next step (a `terms` step ends it); `{ "highlight": null }` clears. Print, thumbnails and the editor show every term |
| `caption` | Below the cloud, when the layout has no caption slot of its own |
| `fallback` | As for every embed. Without it, the static content is the cloud itself (for a CSV file: a note) |

**Glossary (D-015).** A term whose name is a glossary term or one of its `aliases` (ignoring case and accents) is linked to that entry; `glossary` names an entry explicitly. **Reader mode**: every term is a button; a click (or Enter) opens a popup with the entry's definition (linked terms only), the weight (with `weightLabel`) and links to the **other slides that mention the term** (its name, or the glossary term's names, as whole words in slide text and reader blocks). Audience mode shows plain text. Reader search finds inline terms; terms in a CSV file are not in the search index.

The tag cloud block also has `title` (and `id`, `type: "tag-cloud"`, `for`, `depth`); it has no `steps`. **Colours and sizes come from the template**: `--slipr-tag-cloud-1` … `-4` (light to strong, by weight), `-highlight`, `-min-size`, `-max-size` (in em) and `-font`.

A value with only `data` (a CSV file) has the same shape as a table's; the slot type in the template (or the block `type`) tells them apart.

#### Charts (`chart` slot and block; I-109, format 0.2)

A data chart from a **CSV file** in the show folder or typed in as **inline rows**: responsive SVG rendered directly with template tokens (`--slipr-chart-*`, falling back to the template palette). The first concrete chart kind of I-007 (`kind: "bar"`). Spec: `docs/specs/I-109-bar-chart.md`.

```json
"chart": {
  "kind": "bar",
  "data": "data/sales.csv",
  "category": "region",
  "series": ["revenue", "customers"],
  "orientation": "vertical",
  "values": true,
  "reference": { "value": "average", "label": "Average" },
  "steps": [{ "categories": 2 }, { "highlight": "East" }]
}
```

| Field | Meaning |
|---|---|
| `kind` | `"bar"` (default `"bar"`). Future kinds: line, pie, scatter |
| `data` | A CSV file in the show folder (`data/…csv`, `.tsv` or `.txt`, first line headers) |
| `columns`, `rows` | Instead of `data`: inline column configurations and rows of cells in column order (as for tables) |
| `category` | The column key for category labels (default: the first column) |
| `series` | Array of column keys for value series (default: every numeric column except the category) |
| `orientation` | `"vertical"` (default) or `"horizontal"` (or `horizontal: true`) |
| `stacked` | `true` for stacked bars; `false` (default) for grouped bars |
| `values` | `true` to display formatted value labels directly on or above bars (default `false`) |
| `min`, `max` | Custom minimum and maximum values for the value axis |
| `sort` | `"asc"` (lowest first), `"desc"` or `true` (highest first), or `"none"` / `false` (default: preserve data order) |
| `highlight` | Category name to highlight (dimming other categories) |
| `reference` | A number, `"average"`, or `{ "value": number \| "average", "label": string }` |
| `steps` | Slots, audience mode: `{ "categories": n \| "all" }` or `{ "bars": n }`, `{ "series": n \| key \| "all" }`, `{ "highlight": name \| null }` |
| `caption` | Below the chart |
| `fallback` | As for every embed. Without it, the static content is the chart itself (for a CSV file: a summary card) |

**Reader mode**: tooltips with exact values on hover, tap and keyboard focus; clicking a legend item toggles visibility of that series; **Show as table** switches smoothly to the I-104 table of the same data (with Copy and Download CSV). Reader search indexes category names, title and series labels.

#### Web pages (`web` slot, `embed` block; I-071, format 0.2)

| Field | Where | Meaning |
|---|---|---|
| `url`, `title` | both | Required. An `https:` address, or a file relative to `show.json`. `javascript:`, `data:` and `vbscript:` addresses are an error |
| `allow` | both | Extra permissions for the sandboxed frame, any of `"same-origin"`, `"fullscreen"`, `"modals"`, `"downloads"`, `"presentation"`. The frame always has `allow-scripts allow-forms allow-popups`. `same-origin` (the page keeps its own cookies and logins) applies to pages on other servers only; on a file in the show folder it is ignored with a warning, because such a page shares Slipr's origin and could reach the reader's notes |
| `present` | slot | Audience mode: `"live"` (default) shows the page on the slide, clickable, without a Load button (the presenter's own laptop); `"static"` shows the `fallback` image and never contacts the page (offline presenting). Without a fallback image, `"static"` shows the link card (warning). Reader mode ignores `present` and uses `load` |
| `aspect` | block | `"W:H"` (e.g. `"16:9"`): the frame scales with the column. Wins over `height` (default 400 px). In a slot the layout decides the size |

Once a page is loaded, an *Open in new tab* link stays below the frame, for sites that refuse to be framed (`X-Frame-Options` / `frame-ancestors`; this can't be detected, so the frame then stays empty).

```json
"page": { "url": "https://example.com/dashboard", "title": "Live dashboard", "allow": ["fullscreen"],
          "present": "static", "fallback": { "src": "images/dashboard.png", "alt": "Screenshot of the dashboard" } }
```

## Markdown subset

Used in `richtext` and `list` slots, `notes` and all block `md` fields:

- `**bold**`, `*italic*`, `` `code` ``, `[link](url)`, line breaks, `- bullet` lists (nested with two spaces), `1.` numbered lists, `A.` / `a.` letter lists, fenced code blocks (blocks only)
- **Subheading**: a paragraph that is entirely bold (`**Key findings**` on a line of its own) is rendered as `<p class="slipr-md-subheading">`, which templates style as a subheading. It's still plain bold Markdown elsewhere.
- **Glossary reference**: `[[reveal-js]]` shows the term, and `[[reveal-js|the framework]]` shows custom text. Both get a popup with the definition in reader mode and plain text in audience mode
- **Inline popup** (footnote): `^[text shown in a popup]`. In reader mode it is a small marker that opens a popover. In audience mode it is omitted
- **Slide link**: `[see the demo](#s-05)`. It navigates within the show in both modes

Raw HTML is **not** allowed. It is escaped.

### Glossary terms in slides (reader mode)

In reader mode the renderer links the **first occurrence of each glossary term on a slide** to its definition, also in plain `text` slots that cannot hold `[[term]]` markup (D-015, I-086):

- whole words, case- and accent-insensitive (`Cafe` matches `café`), any white space for any white space;
- the longest name first (*layout picker* before *layout*); a longer term that was already linked is not split into a shorter one;
- a term's `aliases` (`"aliases": ["AI", "A.I."]`) match like the term itself;
- terms the slide already references with `[[term]]` count as linked; text in links, code and diagrams is skipped;
- audience mode is unchanged (plain text).

## Slot value types (audience layer)

The template defines which slots a layout has and the type of each slot.

| Type | JSON value | Notes |
|---|---|---|
| `text` | string | Plain text, single line |
| `richtext` | string | Markdown subset, including paragraphs and bullet lists |
| `list` | string | Markdown bullet list, or an array of strings |
| `image` | object | `{ "src": "images/x.png", "alt": "...", "fit": "contain" \| "cover", "focus": "center", "style": "shadow", "opacity": 0.8 }`. `src` is relative to `show.json`. `style` (0.2): one of the template's picture styles (D-014); `opacity` (0.2): 0–1, absent = 1. `crop` (0.2, I-090): `{ "x", "y", "w", "h" }`, the shown part as fractions of the picture; the cropped part takes the picture's place, then `fit` / `focus` apply; hotspots stay positions on the whole picture (outside the crop they are not shown). `morphId` (0.2, I-091): a name (letters, digits, `-`, `_`) that pairs this picture with the one of the same name on the next or previous auto-animate slide, so it morphs even between different files; without it the same file morphs. The same image value is used in card image fields, reader image blocks, extra images and embed fallbacks |
| `code` | object | `{ "language": "js", "code": "..." }` |
| `quote` | object | `{ "text": "...", "source": "..." }` |
| `cards` | array of objects | One object per card: field name → value. The template's slot definition lists the fields and their types (`text`, `richtext`, `list` as strings, `image` as an image object). Example: `[{ "title": "Analyse", "text": "Read the **template**." }, { "title": "Map" }]`. Empty or missing fields are allowed; the layout leaves them out |
| `chart` | object | (0.2) `{ "kind": "bar", "columns": [...], "rows": [...], "steps": [...] }` or `{ "data": "data/sales.csv" }`: a data chart, see *Charts* above |
| `diagram` | object | `{ "mermaid": "flowchart LR; A-->B", "caption": "...", "fallback": { "src": "images/flow.png", "alt": "..." } }` rendered as an SVG diagram; `fallback` (0.2) as for embeds |
| `pdf` | object | (0.2) `{ "pdf": "docs/report.pdf", "title": "...", "page": 3 }` or `"pages": [3, 7]`: a PDF on the slide, see *PDF documents* above |
| `video` | object | (0.2) `{ "video": "media/clip.mp4", "title": "...", "play": "step", "chapters": [...] }` or a YouTube / Vimeo link in `video`: a video on the slide, see *Videos* above |
| `graph` | object | (0.2) `{ "nodes": [...], "edges": [...], "steps": [...] }` or `{ "data": "data/graph.json" }`: a graph, see *Graphs* above |
| `map` | object | (0.2) `{ "markers": [...], "layers": [...], "tiles": ..., "steps": [...] }`: a map, see *Maps* above |
| `table` | object | (0.2) `{ "columns": [...], "rows": [...], "steps": [...] }` or `{ "data": "data/sales.csv" }`: a data table, see *Tables* above |
| `tag-cloud` | object | (0.2) `{ "terms": [{ "text": ..., "weight": ... }], "steps": [...] }` or `{ "data": "data/keywords.csv" }`: a tag cloud, see *Tag clouds* above |
| `web` | object | (0.2) `{ "url": "https://…", "title": "...", "allow": [...], "present": "live" \| "static", "load": "click" \| "auto", "fallback": {...} }`: a web page on the slide, see *Web pages* above |

## Template references

`template.ref` is a URL reference resolved against `show.json`, so all of these work when the show is loaded by URL:

- `../../templates/default`: relative, for shows inside the Slipr repository (the demos, converter output).
- `/templates/default`: **root-relative**. The editor writes this for new shows (D-012), because a folder picked on disk has no known path relative to Slipr. It assumes Slipr is served at the root of its host.
- `https://…/templates/brand`: a template on another host.

When a show is opened **from a folder** (the editor's *Open…*, File System Access), only files inside the folder can be read. A ref that leaves the folder is then resolved **by name**: its last segment picks Slipr's own `templates/<name>/`, and the editor shows a notice unless the ref is already `/templates/<name>`. Templates stored inside a show folder are not supported yet.

## Validation rules

The structure is defined by the JSON Schema `shared/schema/show.schema.json`. It is used by VS Code (autocomplete), by `shared/validate.js` (browser and Node), and by the Python converter. Everything below the schema level is checked by `shared/validate.js`. Unknown properties are errors, so typos are caught. The only exception is `_orphaned`, which is reserved for the editor.

- **Errors** (the show cannot render): missing required top-level fields, unknown `layout`, wrong slot value type, duplicate slide or block `id`, unknown block `type`, an overlay with both or neither of `image` and `text`, an invalid text element `style`, `overlays`, a picture `style`, `opacity`, `crop` or `morphId`, glossary `aliases`, an embed `fallback` / `load` / `allow` / `aspect`, or a `web` / `pdf` / `video` / `graph` / `map` / `table` / `chart` slot value or `pdf` / `video` / `graph` / `map` / `table` / `chart` block in a 0.1 show; an unsafe web page, PDF or video address (a video that is not in the show folder nor at an http(s) address); video `captions` that are not a `.vtt` file in the show folder, a video chapter without a numeric `time` or a `title`; a graph without `nodes` or `data`, a node without `id`, an edge without both ends, `steps` on a graph block, a graph `data` address that is not a `.json` file in the show folder; a map without `center`, `markers` or `layers`, a position or zoom out of range, a tile address that is not `https:` or relative with `{z}`, a layer that is not a `.geojson` / `.json` file in the show folder, `steps` or `present` on a map block; a table without `rows`, `columns` or `data`, a column without `key`, an unknown column `format`, `total`, `visual` or `align`, a table `data` address that is not a CSV file in the show folder, `steps` on a table block; a tag cloud without `terms` or `data`, a term without `text`, a negative weight, an unknown `order` or step, a tag cloud `data` address that is not a CSV file in the show folder, `steps` on a tag cloud block; a chart without `rows`, `columns` or `data`, an unknown `kind`, a chart `data` address that is not a CSV file in the show folder, `steps` on a chart block.
- **Warnings** (it renders, but something is off): unknown slot name, missing required slot, text longer than the slot's `maxLength` or more list items (or cards) than its `maxItems`, an unknown or empty required card field, image file not found (only when the caller supplies a file check), missing `alt` text (also on extra images and embed fallbacks), an extra image or text element that sticks out of the slide, a text element without text, a picture `style` the template does not define, a crop that sticks out of the picture or has no size, a hotspot outside its picture's crop, a `morphId` used twice on one slide, unknown glossary id in `[[...]]`, a glossary name (term or alias) used by two terms, a web page presented `static` without a fallback image, `same-origin` on a file in the show folder, a PDF file not found (local files, with a file check), both `page` and `pages`, a reversed page range, a video file or captions file not found, an `https:` video address that is neither YouTube, Vimeo nor a video file, a video `end` not after `start`, video chapters out of order, captions on a YouTube or Vimeo video, a video presented `static` without a poster, `chapterSteps` without chapters, a duplicate graph node id, a graph edge or step naming an unknown node, a graph data file not found, a duplicate map marker id, a map step naming an unknown marker, a map layer file not found, a tile server without an attribution, a duplicate table column key, a table row with more cells than columns, a table sort or highlight naming an unknown column, a total (other than `count`) or visual on a column without numbers, a table data file not found, a tag cloud highlight naming a term it does not have (inline terms), an unknown glossary id on a tag cloud term, a tag cloud data file not found, a chart category or series naming an unknown column, a chart highlight naming a category not found in data, a chart data file not found, unknown profile in `for`, unknown slide id in `paths`/`related`/links, unknown `chapter`, template version outside range.

## Versioning

- `0.x`: draft. Breaking changes are allowed but must be recorded in the root `CHANGELOG.md`.
- `0.2` (2026-10-11): adds `slide.overlays` (extra images I-083; text elements I-089, 2026-10-13), `style` and `opacity` on image values (I-084), `crop` and `morphId` on image values (I-090, I-091, 2026-10-13), `aliases` on glossary terms (I-086), `fallback` / `load` on embeds (I-070, 2026-10-12), the `web` slot type plus `allow` / `aspect` / `present` on web pages (I-071, 2026-10-12), the `pdf` slot and block types (I-072, 2026-10-12), the `graph` slot and block types (I-074, 2026-10-13), the `map` slot and block types (I-075, 2026-10-13), the `table` slot and block types (I-104, 2026-10-14), the `tag-cloud` slot and block types (I-105, 2026-10-15), the `video` slot and block types (I-110, 2026-10-15), and the `chart` slot and block types (I-109, 2026-10-15). Additive: every 0.1 show is still valid as it is, so there is no migration. A show becomes 0.2 when it first uses one of them.
- From `1.0`: breaking changes require a major bump and a migration in `shared/migrate.js`.
