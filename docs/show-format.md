# Show format: version 0.1 (draft)

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
| `slipr` | string | yes | Format version of this file, currently `"0.1"` |
| `id` | string | yes | Stable identifier (kebab-case), used in URLs and as the key for the reader's personal data |
| `meta` | object | yes | `title` (required), `subtitle`, `author`, `date` (ISO), `language` (BCP-47), `description`, `tags[]` |
| `template` | object | yes | `ref`: path or URL to the template folder, relative to `show.json` (see *Template references* below). `version`: semver range |
| `settings` | object | no | `aspectRatio` (`"16:9"` default, `"4:3"`), `transition` (`none`, `fade`, `slide`, `convex`, `concave`, `zoom`), `slideNumbers` (bool), `agenda` (bool: audience mode inserts a generated agenda slide before each chapter) |
| `chapters` | array | no | `{ id, title, summary? }` in display order. They drive the audience agenda and progress, and the reader table of contents |
| `glossary` | object | no | id → `{ term, definition, link? }`. Referenced from Markdown as `[[id]]` and shown as a popup in reader mode |
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
| `notes` | string | no | Speaker notes (Markdown). Presenter view only, unless the reader opts to see them |
| `audience` | object | no | Audience-mode options: `hidden` (backup slide), `fragments` (bool or `"fade-up"` etc.), `autoAnimate` (bool: Reveal auto-animate to the next slide), `transition`, `background` |
| `reader` | object | no | **Reader layer** (see below) |

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
| `embed` | `url`, `title`, `height?` | Sandboxed iframe (live demo, video) |
| `slide-ref` | `slide`, `label?` | Link card to another slide |

*Planned block types (backlog):* `quiz` (self-check question), `chart` (data-driven visualization), `diagram` (Mermaid).

## Markdown subset

Used in `richtext` and `list` slots, `notes` and all block `md` fields:

- `**bold**`, `*italic*`, `` `code` ``, `[link](url)`, line breaks, `- bullet` lists (nested with two spaces), `1.` numbered lists, `A.` / `a.` letter lists, fenced code blocks (blocks only)
- **Subheading**: a paragraph that is entirely bold (`**Key findings**` on a line of its own) is rendered as `<p class="slipr-md-subheading">`, which templates style as a subheading. It's still plain bold Markdown elsewhere.
- **Glossary reference**: `[[reveal-js]]` shows the term, and `[[reveal-js|the framework]]` shows custom text. Both get a popup with the definition in reader mode and plain text in audience mode
- **Inline popup** (footnote): `^[text shown in a popup]`. In reader mode it is a small marker that opens a popover. In audience mode it is omitted
- **Slide link**: `[see the demo](#s-05)`. It navigates within the show in both modes

Raw HTML is **not** allowed. It is escaped.

## Slot value types (audience layer)

The template defines which slots a layout has and the type of each slot.

| Type | JSON value | Notes |
|---|---|---|
| `text` | string | Plain text, single line |
| `richtext` | string | Markdown subset, including paragraphs and bullet lists |
| `list` | string | Markdown bullet list, or an array of strings |
| `image` | object | `{ "src": "images/x.png", "alt": "...", "fit": "contain" \| "cover", "focus": "center" }`. `src` is relative to `show.json` |
| `code` | object | `{ "language": "js", "code": "..." }` |
| `quote` | object | `{ "text": "...", "source": "..." }` |
| `cards` | array of objects | One object per card: field name → value. The template's slot definition lists the fields and their types (`text`, `richtext`, `list` as strings, `image` as an image object). Example: `[{ "title": "Analyse", "text": "Read the **template**." }, { "title": "Map" }]`. Empty or missing fields are allowed; the layout leaves them out |
| `chart` | object | *(planned)* `{ "kind": "bar", "data": {...} }` rendered as an animatable SVG |
| `diagram` | object | *(planned)* `{ "mermaid": "graph LR; A-->B" }` |

## Template references

`template.ref` is a URL reference resolved against `show.json`, so all of these work when the show is loaded by URL:

- `../../templates/default`: relative, for shows inside the Slipr repository (the demos, converter output).
- `/templates/default`: **root-relative**. The editor writes this for new shows (D-012), because a folder picked on disk has no known path relative to Slipr. It assumes Slipr is served at the root of its host.
- `https://…/templates/brand`: a template on another host.

When a show is opened **from a folder** (the editor's *Open…*, File System Access), only files inside the folder can be read. A ref that leaves the folder is then resolved **by name**: its last segment picks Slipr's own `templates/<name>/`, and the editor shows a notice unless the ref is already `/templates/<name>`. Templates stored inside a show folder are not supported yet.

## Validation rules

The structure is defined by the JSON Schema `shared/schema/show.schema.json`. It is used by VS Code (autocomplete), by `shared/validate.js` (browser and Node), and by the Python converter. Everything below the schema level is checked by `shared/validate.js`. Unknown properties are errors, so typos are caught. The only exception is `_orphaned`, which is reserved for the editor.

- **Errors** (the show cannot render): missing required top-level fields, unknown `layout`, wrong slot value type, duplicate slide or block `id`, unknown block `type`.
- **Warnings** (it renders, but something is off): unknown slot name, missing required slot, text longer than the slot's `maxLength` or more list items (or cards) than its `maxItems`, an unknown or empty required card field, image file not found (only when the caller supplies a file check), missing `alt` text, unknown glossary id in `[[...]]`, unknown profile in `for`, unknown slide id in `paths`/`related`/links, unknown `chapter`, template version outside range.

## Versioning

- `0.x`: draft. Breaking changes are allowed but must be recorded in the root `CHANGELOG.md`.
- From `1.0`: breaking changes require a major bump and a migration in `shared/migrate.js`.
