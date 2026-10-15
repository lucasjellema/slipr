# Write a Slipr show: Slipr Default template (compact instruction)

> Compact version for tools with small prompt limits. When even this is too long, attach the file instead of pasting it.

## What you are writing
Slipr is presentation software. A show is one JSON file, `show.json`, that gives two experiences:
- **Audience mode**: a linear slideshow for the room. Every slide has a concise **audience layer** (`content`): a title and a few words, never paragraphs.
- **Reader mode**: an interactive page for one reader. Every slide can have a **reader layer** (`reader`) with the depth: explanations, collapsible details, tips, tabs, glossary popups. Readers pick a **profile** (blocks can target profiles) and a **detail level** (blocks have a `depth`).
Keep slides short and put the depth in the reader layer.

## Output rules
1. Answer with **one** ```json code block holding the complete show.json. Write nothing after the code block; a short sentence before it is fine.
2. Start with `"slipr": "0.2"` and use exactly `"template": {"ref":"/templates/default","version":"^1.0"}`.
3. Use only the fields, layouts, slot names and block types described here. Unknown fields are errors.
4. Ids: the show `id` is lower-case kebab-case (`quiet-mornings`). Slide, chapter, profile, path, block and glossary ids use letters, digits, `-` and `_`, preferably kebab-case, and are unique (block ids within their slide). Make slide ids describe the slide (`what-changes`, not `s1`).
5. Valid JSON: double quotes, no comments, no trailing commas; newlines inside strings as `\n`.

## Show structure
```
{
  "slipr": "0.2", "id": "kebab-case-id",
  "meta": { "title": "…" (required), "subtitle", "author", "date": "YYYY-MM-DD", "language": "en", "description", "tags": [] },
  "template": { … see output rules … },
  "settings": { "aspectRatio": "16:9" | "4:3", "transition": "none" | "fade" | "slide" | "convex" | "concave" | "zoom", "slideNumbers": true, "agenda": false },
  "chapters": [ { "id", "title", "summary"? } ],
  "glossary": { "term-id": { "term", "definition", "aliases"?: [], "link"? } },
  "profiles": [ { "id", "label", "description"? } ],
  "paths": [ { "id", "label", "description"?, "slides": ["slide-id", …] or "*" } ],
  "slides": [ slide, … ]
}
```
Only `slipr`, `id`, `meta`, `template` and `slides` are required. A slide:
```
{ "id", "layout": "layout id", "chapter"?: "chapter id", "tags"?: [],
  "content": { "slot name": value, … },      ← audience layer
  "notes"?: "speaker notes (Markdown)",
  "audience"?: { "fragments": true (bullets appear one by one), "hidden": true (backup slide) },
  "reader"?: { "summary": "one-line takeaway", "blocks": [ block, … ], "related": ["slide-id"], "showSlide": false (reader-only text page), "hidden": true } }
```
Reader blocks: every block has `id` and `type`; optional `for: ["profile-id"]` (only those profiles see it) and `depth` (1, 2, 3: essential, standard (default), deep dive). Types:
- `text`: `md`
- `details` (collapsible): `title`, `md`, `open`?
- `callout`: `variant` (`info`, `tip`, `warning`, `quote`), `title`?, `md`
- `tabs`: `tabs: [{ "label", "md" }]`
- `image`: `image` (an image value), `caption`?, `hotspots`?: `[{ "x": 0–1, "y": 0–1, "title", "md" }]` (positions on the picture, opened as popups)
- `slide-ref` (link card): `slide`, `label`?
- `diagram`: `mermaid` (Mermaid source, e.g. `"flowchart LR\n  A --> B"`), `caption`?
- `table`: `columns`, `rows`, `title`? (see *Tables* below)
- `tag-cloud`: `terms`, `title`? (see *Tag clouds* below)
Tables: `{ "columns": [{ "key", "label"?, "format"? }], "rows": [[cell, …], …] }`, cells in column order. Tag clouds: `{ "terms": [{ "text", "weight"? }] }`. No CSV `data` files, no other block types.

## Layouts of the Slipr Default template
Every slide uses one layout; its `content` holds the slots listed. **Required** slots must be filled; others are optional and can be left out. Keep within the limits: "≤ 70" is a maximum number of characters, "≤ 7 items" the most list items or cards.

- **`title`** (Title slide): Opening slide with title, subtitle and byline.
  - `title`: text, **required**, ≤ 80
  - `subtitle`: text, ≤ 140
  - `byline`: text
- **`section`** (Section header): Divider that opens a chapter.
  - `kicker`: text, ≤ 40
  - `title`: text, **required**, ≤ 60
  - `subtitle`: text, ≤ 120
- **`bullets`** (Title and bullets): The workhorse: a title and a bullet list.
  - `title`: text, **required**, ≤ 70
  - `body`: list, ≤ 7 items
- **`two-column`** (Two columns): Comparison or side-by-side content.
  - `title`: text, **required**, ≤ 70
  - `leftTitle`: text, ≤ 40
  - `left`: richtext, **required**
  - `rightTitle`: text, ≤ 40
  - `right`: richtext, **required**
- **`image-full`** (Full image): One large image with optional title and caption.
  - `image`: image, **required**
  - `title`: text, ≤ 70
  - `caption`: text, ≤ 120
- **`diagram`** (Diagram): One large Mermaid diagram with optional title and caption.
  - `diagram`: diagram, **required**
  - `title`: text, ≤ 70
  - `caption`: text, ≤ 120
- **`table`** (Table): A data table from a CSV file or typed in (sortable, filterable, totals; rows revealed step by step in audience mode), with optional title and caption.
  - `table`: table, **required**
  - `title`: text, ≤ 70
  - `caption`: text, ≤ 120
- **`tag-cloud`** (Tag cloud): A cloud of terms sized by weight, from a CSV file or typed in (glossary terms open their definition in reader mode; terms revealed or highlighted step by step in audience mode), with optional title and caption.
  - `cloud`: tag-cloud, **required**
  - `title`: text, ≤ 70
  - `caption`: text, ≤ 120

**Do not use** these layouts:
- `web`: needs a live web page
- `pdf`: needs a PDF file
- `video`: needs a video file or address
- `graph`: needs a network of nodes and links
- `map`: needs coordinates and map tiles
- `chart`: needs data or a chart configuration

**Slot values by type:**
- `text`: a plain string, one line, no Markdown
- `richtext`: a Markdown string (paragraphs and `- ` bullet lists)
- `list`: a Markdown bullet list as one string (`"- one\n- two"`), or an array of strings
- `image`: `{ "src": "images/name.png", "alt": "…" }`, optionally `"fit": "cover"` (fill, may crop) or `"contain"` (default)
- `diagram`: `{ "mermaid": "flowchart LR\n  A --> B", "caption": "…" }`
- `table`: inline `columns` and `rows`, as the table block
- `tag-cloud`: `{ "terms": [{ "text", "weight" }] }`, as the tag cloud block

## Markdown
`**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `- bullets`, `[[glossary-id]]` or `[[glossary-id|text]]` (ids must exist in `glossary`), `^[popup note]` (reader mode only), `[text](#slide-id)`. No HTML.

## Images
You cannot supply image files, so use placeholders: `"src": "images/<descriptive-kebab-name>.png"` and an `alt` text that describes the wanted picture in detail (subject, setting, mood, any text in it), so the user can find or make it. Every image needs `alt`. Use an image only where the layout requires one or it really helps.

## Check before you answer
- [ ] One ```json code block with the complete show; `slipr`, `id`, `meta.title`, `template` and `slides` are present; the JSON parses.
- [ ] Every `layout` is one of the layouts above (not a *Do not use* one), and its `content` uses only that layout's slot names, with every required slot filled.
- [ ] No text is longer than its slot limit, no list has more items than allowed.
- [ ] Slide ids are unique; block ids are unique within their slide; `chapter`, `for`, `related`, `slide-ref`, `paths` and `[text](#…)` only name ids that exist.
- [ ] Every `[[term-id]]` is in `glossary`.
- [ ] Every image has a placeholder `src` under `images/` and a descriptive `alt`.
- [ ] No fields that are not described here.

## Your content
Topic: <what the show is about>
Audience: <who will watch or read it>
Number of slides: <about 10>
Reader layer: <yes: add reader blocks with depth | no: only a summary per slide>
Profiles: <e.g. Developer, Manager; or none>
Language: en
Source material:
<paste notes, an outline or an article here, or attach files>
