# Write a Slipr show: Conclusion (magenta) template (full instruction)

> Paste this whole text into an AI chatbot, fill in the last section, and send it. When it is too long to paste, attach this file instead and write "Follow the attached instruction" with your content below it.

## What you are writing
Slipr is presentation software. A show is one JSON file, `show.json`, that gives two experiences:
- **Audience mode**: a linear slideshow for the room. Every slide has a concise **audience layer** (`content`): a title and a few words, never paragraphs.
- **Reader mode**: an interactive page for one reader. Every slide can have a **reader layer** (`reader`) with the depth: explanations, collapsible details, tips, tabs, glossary popups. Readers pick a **profile** (blocks can target profiles) and a **detail level** (blocks have a `depth`).
Keep slides short and put the depth in the reader layer.
You write the whole `show.json` from the content brief at the end of this message. The user opens it in the Slipr viewer, which checks it strictly against a schema: an unknown field or a wrong type is an error.

## Output rules
1. Answer with **one** ```json code block holding the complete show.json. Write nothing after the code block; a short sentence before it is fine.
2. Start with `"slipr": "0.2"` and use exactly `"template": {"ref":"/templates/conclusion","version":"^0.1"}`.
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

Do not use other block types or fields (no `embed`, `pdf`, `video`, `graph`, `map`, `data` files, `overlays`, or styling): they need files or settings a chatbot cannot provide.

**Tables** (block, or a `table` slot) hold their data inline:
```json
{ "columns": [{ "key": "team", "label": "Team" }, { "key": "hours", "label": "Focus hours", "format": "number", "total": "sum" }],
  "rows": [["Delta", 14], ["Echo", 9]], "sortable": true }
```
Column fields: `key` (required), `label`, `format` (`text`, `number`, `integer`, `percent`, `currency`, `date`, `markdown`; `percent` shows 0.125 as 12.5 %), `decimals`, `total` (`sum`, `avg`, `min`, `max`, `count`). Each row is an array of cells (string, number or null) in column order. Optional: `sortable`, `filter` (a search box), `caption`.

**Tag clouds** (block, or a `tag-cloud` slot): `{ "terms": [{ "text": "focus", "weight": 12 }, { "text": "meetings", "weight": 7 }] }`. A heavier term is shown bigger. Optional: `order` (`cloud`, `weight`, `alphabetical`, `none`), `maxTerms`, `weightLabel` (what a weight counts, e.g. "mentions"), `caption`. A term whose text is a glossary term links to its definition.

## Layouts of the Conclusion (magenta) template
Every slide uses one layout; its `content` holds the slots listed. **Required** slots must be filled; others are optional and can be left out. Keep within the limits: "≤ 70" is a maximum number of characters, "≤ 7 items" the most list items or cards.

- **`title-wave`** (Title slide (wave)): Opener without a photo: magenta wave on black.
  - `title`: text, **required**, ≤ 52. Up to two lines of about 26 characters.
  - `byline`: text, ≤ 40
- **`title-image`** (Title slide (image)): Opener with a full-bleed photo.
  - `title`: text, **required**, ≤ 52. Up to two lines of about 26 characters.
  - `byline`: text, ≤ 40
  - `image`: image, **required**. Real photography from the brand library.
- **`agenda`** (Agenda): Numbered agenda (up to 8 items) with a photo on the right. Also used for generated agenda slides.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `items`: list, **required**, ≤ 8 items
  - `intro`: text, ≤ 90
  - `image`: image
- **`text`** (Text (white)): Standard text slide on white.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `body`: richtext. Bullets (up to 4 levels), paragraphs, a bold line as subheading, A. and 1. lists. At most 12 bullets.
- **`text-dark`** (Text (black)): Standard text slide on black.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `body`: richtext. Bullets (up to 4 levels), paragraphs, a bold line as subheading, A. and 1. lists. At most 12 bullets.
- **`text-image`** (Text + image): Text column on the left, photo as background.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `body`: richtext
  - `image`: image, **required**
- **`text-quote-image`** (Text, quote & image): Text on the left, quote on the right, photo as background.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `body`: richtext
  - `quote`: text, ≤ 170
  - `image`: image, **required**
- **`quote-box`** (Quote in box): Quote in a magenta box over a photo.
  - `kicker`: text, ≤ 60
  - `title`: text, ≤ 46
  - `quote`: text, **required**, ≤ 200
  - `image`: image, **required**
- **`quote-image`** (Quote with image): Quote over a photo, without a box.
  - `kicker`: text, ≤ 60
  - `title`: text, ≤ 46
  - `quote`: text, **required**, ≤ 170
  - `image`: image, **required**
- **`section-wave`** (Section (wave)): Section divider without a photo (client case slide).
  - `kicker`: text, ≤ 32
  - `title`: text, **required**, ≤ 52
- **`section-image`** (Section (image)): Section divider with a full-bleed photo.
  - `kicker`: text, ≤ 32
  - `title`: text, **required**, ≤ 52
  - `image`: image, **required**
- **`title-only`** (Title only): Title with free content area (e.g. a map, diagram or illustration).
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `image`: image. Shown in full (contain), not cropped.
- **`table`** (Table): Title with a data table (sortable, filterable, totals; rows revealed step by step in audience mode) in the content area.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `table`: table, **required**
- **`tag-cloud`** (Tag cloud): Title with a cloud of terms sized by weight (glossary terms open their definition in reader mode; terms revealed or highlighted step by step in audience mode) in the content area.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `cloud`: tag-cloud, **required**
- **`columns-4`** (Text boxes 4x): Four columns, each with a heading and text or bullets.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `cards`: cards, **required**, ≤ 4 cards
    - card field `title`: text, **required**, ≤ 18
    - card field `text`: richtext
- **`boxes-9`** (Text boxes 9x): Nine numbered boxes (3 × 3), e.g. steps.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `cards`: cards, **required**, ≤ 9 cards
    - card field `title`: text, **required**, ≤ 24
    - card field `text`: richtext, ≤ 210
- **`facts`** (Facts & figures): Six key figures with an icon, over a photo.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `cards`: cards, **required**, ≤ 6 cards
    - card field `value`: text, **required**, ≤ 8
    - card field `label`: text, ≤ 42
    - card field `icon`: image
  - `image`: image
- **`image-cards-8`** (Image cards 8x): Eight photo cards with a title (e.g. markets).
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `cards`: cards, **required**, ≤ 8 cards
    - card field `image`: image, **required**
    - card field `title`: text, ≤ 26
- **`people-2`** (Introduction (2 people)): Two people with portrait, name, role and a short text.
  - `kicker`: text, ≤ 60
  - `title`: text, **required**, ≤ 46
  - `cards`: cards, **required**, ≤ 2 cards
    - card field `image`: image
    - card field `name`: text, ≤ 40
    - card field `role`: text, ≤ 40
    - card field `text`: richtext

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
- `table`: inline `columns` and `rows`, as the table block
- `tag-cloud`: `{ "terms": [{ "text", "weight" }] }`, as the tag cloud block
- `cards`: an array of objects, one per card, with the card fields listed (field name → value)

## Markdown
Used in `richtext` and `list` slots, `notes`, and every `md` field:
- `**bold**`, `*italic*`, `` `code` ``, `[link](https://…)`, `- bullets` (nested with two spaces), `1.` numbered lists, fenced code blocks (reader blocks only).
- A paragraph that is entirely bold (`**Key findings**` on its own line) becomes a subheading.
- Glossary term: `[[term-id]]` shows the term, `[[term-id|other words]]` shows other words; both open the definition in reader mode. Every id must exist in `glossary`. In reader mode, the first time a glossary term appears on a slide it is linked automatically too.
- Popup note: `^[extra detail]` shows a small marker in reader mode that opens the text; it is left out in audience mode.
- Slide link: `[see the plan](#slide-id)`.
- No HTML: it is shown as text.

## Images
You cannot supply image files, so use placeholders: `"src": "images/<descriptive-kebab-name>.png"` and an `alt` text that describes the wanted picture in detail (subject, setting, mood, any text in it), so the user can find or make it. Every image needs `alt`. Use an image only where the layout requires one or it really helps.

## Writing guidelines
- **Audience layer**: titles of a few words; at most 5–6 bullets of a few words each; no full sentences where a phrase will do. Respect every slot limit.
- **Reader layer**: give every slide a `reader.summary` (one sentence). Put explanations, evidence, examples and caveats in reader blocks: `text` for the main explanation, `details` for side questions, `callout` for tips and warnings, `tabs` for alternatives. Mark deep dives `depth: 3` and essentials `depth: 1`.
- **Profiles**: only when the brief names them. Target a block with `for` when it matters to one profile only; leave `for` out for everyone.
- **Chapters** for shows of more than about eight slides; set `chapter` on every slide. A **path** can offer a short route through the key slides.
- **Glossary**: define the jargon the audience may not know and refer to it with `[[term-id]]`.
- **Speaker notes** (`notes`): what the presenter says, a few sentences per slide.
- Start with an opening slide and end with a summary or call to action. Use the layouts the content asks for, with some variety.
- Write in the language of the brief (`meta.language`).
- When the brief says **Reader layer: no**, give each slide only `reader.summary`, no blocks.

## Example
A small show for this template (yours will be longer and about the brief):
```json
{
  "slipr": "0.2",
  "id": "quiet-mornings",
  "meta": {
    "title": "Quiet mornings",
    "subtitle": "Why we keep meetings out of the morning",
    "author": "Team Delta",
    "date": "2026-10-15",
    "language": "en"
  },
  "template": { "ref": "/templates/conclusion", "version": "^0.1" },
  "chapters": [{ "id": "why", "title": "Why" }, { "id": "how", "title": "How" }],
  "glossary": {
    "focus-time": {
      "term": "focus time",
      "definition": "A block of at least two hours without meetings or chat, for work that needs concentration."
    }
  },
  "profiles": [
    { "id": "lead", "label": "Team lead", "description": "Planning and agreements" },
    { "id": "member", "label": "Team member", "description": "What changes in your day" }
  ],
  "paths": [{ "id": "short", "label": "Two-minute version", "slides": ["opening", "what-changes"] }],
  "slides": [
    {
      "id": "opening",
      "layout": "title-wave",
      "chapter": "why",
      "content": { "title": "Quiet mornings", "byline": "Team Delta, October 2026" },
      "notes": "Start with the question: when did you last have two quiet hours?",
      "reader": { "summary": "We protect the morning for focused work and meet in the afternoon." }
    },
    {
      "id": "what-changes",
      "layout": "text",
      "chapter": "how",
      "content": {
        "kicker": "The plan",
        "title": "What changes",
        "body": "- No meetings before 12:00\n- Chat on mute until noon\n- Stand-up moves to 13:00"
      },
      "audience": { "fragments": true },
      "reader": {
        "summary": "Three agreements give everyone [[focus-time]] every morning.",
        "blocks": [
          {
            "id": "why-noon",
            "type": "text",
            "md": "Most of us do our best [[focus-time]] work before lunch.^[Based on our team survey of September 2026.]"
          },
          {
            "id": "exceptions",
            "type": "details",
            "title": "What about urgent issues?",
            "md": "Incidents still go through the on-call phone. Everything else can wait until noon.",
            "depth": 3
          },
          {
            "id": "lead-tip",
            "type": "callout",
            "variant": "tip",
            "for": ["lead"],
            "md": "Move recurring meetings yourself before asking the team to."
          }
        ],
        "related": ["the-room"]
      }
    },
    {
      "id": "the-room",
      "layout": "text-image",
      "chapter": "how",
      "content": {
        "kicker": "Where",
        "title": "A room for quiet work",
        "image": {
          "src": "images/quiet-room-library-corner.png",
          "alt": "A bright library corner with four desks by a window, plants, and nobody talking; a sign on the wall reads \"Quiet until noon\"."
        }
      },
      "reader": {
        "summary": "The library corner is the quiet room in the mornings.",
        "blocks": [
          {
            "id": "back",
            "type": "slide-ref",
            "slide": "what-changes",
            "label": "Back to the agreements"
          }
        ]
      }
    }
  ]
}
```

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
