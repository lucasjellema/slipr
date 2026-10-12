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
| `slipr` | string | yes | Format version of this file: `"0.2"` (current) or `"0.1"`. 0.2 adds `overlays` on slides, `style` / `opacity` on pictures, `aliases` on glossary terms, `fallback` / `load` on embeds and web pages (`web` slots, `allow`, `aspect`, `present`); a show without them may stay 0.1. The editor and the converter write 0.2 only when a show uses them |
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
| `overlays` | array | no | **Extra images** placed freely on the slide, in front of the layout (format 0.2, D-013). See *Extra images* below |
| `notes` | string | no | Speaker notes (Markdown). Presenter view only, unless the reader opts to see them |
| `audience` | object | no | Audience-mode options: `hidden` (backup slide), `fragments` (bool or `"fade-up"` etc.), `autoAnimate` (bool: Reveal auto-animate to the next slide), `transition`, `background` |
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
| `embed` | `url`, `title`, `height?`, `aspect?`, `allow?`, `load?`, `fallback?` | Sandboxed iframe (live demo, video). A page on another server is **click-to-load** unless `load` is `"auto"` (0.2); see *Embeds* below |
| `slide-ref` | `slide`, `label?` | Link card to another slide |
| `diagram` | `mermaid`, `caption?`, `fallback?` | Rendered SVG diagram from Mermaid source |

*Planned block types (backlog):* `quiz` (self-check question), `chart` (data-driven visualization).

### Embeds (I-070, D-011)

Content that needs a library or another server is an **embed**: today `diagram` (slot and block) and web pages (`web` slot and `embed` block, I-071). Embeds share two optional fields (format 0.2):

| Field | Type | Meaning |
|---|---|---|
| `fallback` | image value | A static picture (e.g. a screenshot) shown for print, in editor thumbnails, before the live content loads and when it fails. Without it, a diagram falls back to its source and a web page to a link card (title, site, *Open in new tab*) |
| `load` | `"click"` \| `"auto"` | For content from another server (an `http(s)` URL). `"click"` (default): the reader sees the link card and a **Load** button naming the site, and nothing is requested until they click; consent then holds for that site until the tab closes. `"auto"`: load straight away. Files next to `show.json` always load directly |

```json
{ "id": "docs", "type": "embed", "title": "Reveal.js documentation", "url": "https://revealjs.com/", "height": 420,
  "fallback": { "src": "images/revealjs-screenshot.png", "alt": "The Reveal.js documentation home page" } }
```

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
| `image` | object | `{ "src": "images/x.png", "alt": "...", "fit": "contain" \| "cover", "focus": "center", "style": "shadow", "opacity": 0.8 }`. `src` is relative to `show.json`. `style` (0.2): one of the template's picture styles (D-014); `opacity` (0.2): 0–1, absent = 1. The same image value is used in card image fields, reader image blocks and extra images |
| `code` | object | `{ "language": "js", "code": "..." }` |
| `quote` | object | `{ "text": "...", "source": "..." }` |
| `cards` | array of objects | One object per card: field name → value. The template's slot definition lists the fields and their types (`text`, `richtext`, `list` as strings, `image` as an image object). Example: `[{ "title": "Analyse", "text": "Read the **template**." }, { "title": "Map" }]`. Empty or missing fields are allowed; the layout leaves them out |
| `chart` | object | *(planned)* `{ "kind": "bar", "data": {...} }` rendered as an animatable SVG |
| `diagram` | object | `{ "mermaid": "flowchart LR; A-->B", "caption": "...", "fallback": { "src": "images/flow.png", "alt": "..." } }` rendered as an SVG diagram; `fallback` (0.2) as for embeds |
| `web` | object | (0.2) `{ "url": "https://…", "title": "...", "allow": [...], "present": "live" \| "static", "load": "click" \| "auto", "fallback": {...} }`: a web page on the slide, see *Web pages* above |

## Template references

`template.ref` is a URL reference resolved against `show.json`, so all of these work when the show is loaded by URL:

- `../../templates/default`: relative, for shows inside the Slipr repository (the demos, converter output).
- `/templates/default`: **root-relative**. The editor writes this for new shows (D-012), because a folder picked on disk has no known path relative to Slipr. It assumes Slipr is served at the root of its host.
- `https://…/templates/brand`: a template on another host.

When a show is opened **from a folder** (the editor's *Open…*, File System Access), only files inside the folder can be read. A ref that leaves the folder is then resolved **by name**: its last segment picks Slipr's own `templates/<name>/`, and the editor shows a notice unless the ref is already `/templates/<name>`. Templates stored inside a show folder are not supported yet.

## Validation rules

The structure is defined by the JSON Schema `shared/schema/show.schema.json`. It is used by VS Code (autocomplete), by `shared/validate.js` (browser and Node), and by the Python converter. Everything below the schema level is checked by `shared/validate.js`. Unknown properties are errors, so typos are caught. The only exception is `_orphaned`, which is reserved for the editor.

- **Errors** (the show cannot render): missing required top-level fields, unknown `layout`, wrong slot value type, duplicate slide or block `id`, unknown block `type`, `overlays`, a picture `style` or `opacity`, glossary `aliases`, an embed `fallback` / `load` / `allow` / `aspect`, or a `web` slot value in a 0.1 show; an unsafe web page address.
- **Warnings** (it renders, but something is off): unknown slot name, missing required slot, text longer than the slot's `maxLength` or more list items (or cards) than its `maxItems`, an unknown or empty required card field, image file not found (only when the caller supplies a file check), missing `alt` text (also on extra images and embed fallbacks), an extra image that sticks out of the slide, a picture `style` the template does not define, unknown glossary id in `[[...]]`, a glossary name (term or alias) used by two terms, a web page presented `static` without a fallback image, `same-origin` on a file in the show folder, unknown profile in `for`, unknown slide id in `paths`/`related`/links, unknown `chapter`, template version outside range.

## Versioning

- `0.x`: draft. Breaking changes are allowed but must be recorded in the root `CHANGELOG.md`.
- `0.2` (2026-10-11): adds `slide.overlays` (I-083), `style` and `opacity` on image values (I-084), `aliases` on glossary terms (I-086), `fallback` / `load` on embeds (I-070, 2026-10-12), and the `web` slot type plus `allow` / `aspect` / `present` on web pages (I-071, 2026-10-12). Additive: every 0.1 show is still valid as it is, so there is no migration. A show becomes 0.2 when it first uses one of them.
- From `1.0`: breaking changes require a major bump and a migration in `shared/migrate.js`.
