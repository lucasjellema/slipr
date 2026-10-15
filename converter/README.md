# Slipr Converter (PPTX ⇄ Slipr)

The converter turns a PowerPoint file into a Slipr show folder, and with `slipr-export` a Slipr show back into a PowerPoint file (see [Export to PowerPoint](#export-to-powerpoint)). It keeps the **content** (titles, text, bullets, images, speaker notes, sections) and maps every slide onto a **layout of a Slipr template**. The show then takes on the look of that template, not the look of the original deck.

> Status: **works** (roadmap Phase 4). Requires Python 3.11 or newer.

## Installation

Run this once, from the `converter/` folder:

```
python -m venv .venv
.venv\Scripts\activate          # Windows; on macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
```

This installs the `slipr-convert` and `slipr-export` commands inside the virtual environment. Without activating the environment you can also run `.venv\Scripts\slipr-convert`.

## Usage

```
slipr-convert <deck.pptx> --template <template-folder> --out <show-folder> [options]
```

| Option | Meaning |
|---|---|
| `--template` | The Slipr template to map onto (required), e.g. `../templates/default` |
| `--out` | Output folder. It is created if missing, and existing files are only overwritten with `--force` |
| `--mapping <file.json>` | Extra layout mapping (PowerPoint layout name → Slipr layout id), which overrides the template's `pptxMapping` |
| `--id <show-id>` | Show id (default: derived from the file name) |
| `--lang <code>` | Language of the deck, e.g. `nl` (default `en`) |
| `--no-notes` | Skip speaker notes |
| `--notes-to-reader` | Also copy the speaker notes into a reader `text` block. This gives a quick first reader layer, which you then refine |
| `--force` | Overwrite an existing output folder |

Example (from `converter/`):

```
slipr-convert "C:\talks\cloud-native.pptx" --template ..\templates\default --out ..\shows\cloud-native
```

Then open the result with the dev server running: `http://localhost:8080/viewer/?show=../shows/cloud-native/show.json`.

The output folder contains `show.json`, `images/`, `media/` (videos, when the deck has any), and `conversion-report.md`. The `template.ref` and `$schema` paths in `show.json` are written relative to the output folder, so the show works wherever it sits in the Slipr folder.

## What gets converted

| PowerPoint element | Result in Slipr | Status |
|---|---|---|
| Slide order | `slides[]` order, ids `s-01`, `s-02`, … | ✅ |
| Sections | `chapters` + `slide.chapter` | ✅ |
| Hidden slides | backup slides (`audience.hidden: true`) | ✅ |
| Title / subtitle placeholders | `title` / `subtitle` slots | ✅ |
| Body text with bullet levels | Markdown list (nested). Bullet settings inherited from the layout/master are respected | ✅ |
| Paragraphs without bullets, text boxes | Markdown paragraphs | ✅ |
| Template text styles (numbered and `A.` lists, bold subheadings, serif lines) | `1.` / `A.` lists, `**subheading**`, `*serif line*`, resolved from the paragraph, layout and master styles | ✅ |
| Repeated placeholders (columns, boxes, key figures, photo cards, people) | a `cards` slot, when the template maps them with card roles | ✅ |
| Bold / italic / hyperlinks | `**…**` / `*…*` / `[…](url)`. Characters like `*` or `[` in your text are escaped | ✅ |
| Pictures (placeholders and free pictures) | copied to `images/` (identical pictures only once), `image` slot. Alt text comes from the picture's description; an automatic file-name description counts as missing | ✅ |
| Speaker notes | `notes` (and optionally a reader block) | ✅ |
| Bullet build animations | `audience.fragments: true` | ✅ |
| Picture shadow, soft edges, rounded corners, outline; transparency | the template's matching **picture style** (`pptxEffect`); `opacity` | ✅ |
| Picture crop | the image's `crop` (the shown part), so the picture looks the same | ✅ |
| Presentation title / author / date, slide size | `meta`, `settings.aspectRatio` (16:9 or 4:3) | ✅ |
| Pictures that don't fit the chosen layout | **extra images** on the slide (`overlays`, show format 0.2) at their PowerPoint position and size | ✅ |
| Text boxes and shapes with a fill or outline (badges, pills, callouts); text boxes that don't fit the chosen layout | **text elements** on the slide (`overlays` with `text`, show format 0.2) at their place, with font (the template's heading / body font when it matches), size, capitals, alignment, text color, fill and its transparency, outline, rounded corners and inner margin (theme colors resolved) | ✅ |
| Placeholder text that doesn't fit the chosen layout | **reader layer** text blocks, so it is never lost | ✅ |
| Tables | a `table` slot (or reader block) with inline columns and rows. Numbers, percentages and amounts (€, $, £; decimal comma or point) become numeric columns with a format; a last *Total* / *Totaal* row that adds up becomes column totals | ✅ |
| Charts | a `table` with the chart's data: a category column and one column per series with data bars; the chart title as caption, and a marker in the speaker notes. (Slipr has no chart type yet; I-046) | ✅ |
| SmartArt | a **Mermaid diagram** (`diagram` slot or block): org charts and hierarchies top-down, processes and cycles left to right (sub-points in the box). List-type SmartArt becomes a Markdown list | ✅ |
| Videos | embedded videos → `media/` and a `video` slot (or block) with the poster frame, the start trim and bookmarks as chapters; YouTube and Vimeo videos → their link. The end trim is reported (set `end` by hand) | ✅ |
| Transitions | `settings.transition` (the most common one) and `audience.transition` on slides that differ: fade, slide (push, wipe, cover…), zoom, convex, concave, none. A deck without transitions keeps `fade` | ✅ |
| Morph | `audience.autoAnimate` on the slide and the one before; pictures named `!!name` get the `morphId` `name` | ✅ |
| Entrance animations on pictures and text elements on the slide | `fragment` on the overlay: Fade → `fade-in`, Fly In → `fade-up` / `-down` / `-left` / `-right`, Zoom / Grow → `grow`, others → appear | ✅ |
| Links to other slides | slide links `[text](#s-07)`; jumps to the next / previous slide stay plain text | ✅ |
| Slide, section and summary zooms | `reader.related` (the slides they open) | ✅ |
| A slide's own background picture | `audience.background` | ✅ |
| Audio, OLE objects, equations, newer chart kinds (treemap, sunburst, waterfall…), linked videos | reported, plus a marker in the slide notes. A picture fallback via LibreOffice is I-041 | ❌ |
| Logos and decorations from the master | ignored on purpose: the template provides them | n/a |
| Colours, fonts, positions, background colours | ignored on purpose, because the template decides (except the place of extra pictures, D-013, and the place and look of text elements, D-016) | n/a |

### Coverage of the show format

Every feature of show format 0.2 and what the converter does with it (I-121). Keep this table current with every converter change.

| Show format feature | Converter |
|---|---|
| `meta` (title, author, date, language), `settings.aspectRatio`, `settings.slideNumbers` | converted (`language` from `--lang`) |
| `settings.transition`, `audience.transition`, `audience.autoAnimate`, `morphId` | converted (transitions, Morph) |
| `settings.agenda` | no PowerPoint counterpart |
| `chapters` | converted (sections) |
| `glossary`, `profiles`, `paths`, `[[term]]`, `^[popup]` | no PowerPoint counterpart |
| `slide.content`: `text`, `richtext`, `list`, `image`, `cards` | converted |
| `slide.content`: `table`, `diagram`, `video` | converted (tables and charts, SmartArt, videos) |
| `slide.content`: `code`, `quote` | partly: their text lands in text slots or the reader layer |
| `slide.content`: `web`, `pdf`, `graph`, `map`, `tag-cloud` | no PowerPoint counterpart |
| `overlays`: extra images (`fragment` included), text elements | converted |
| Image `crop`, `style`, `opacity`, `morphId`, `alt`; `fit` / `focus` | converted; `fit` / `focus` are the template's (a crop carries the focus) |
| `notes`, `audience.hidden`, `audience.fragments`, `audience.background` (picture) | converted; background colours stay with the template |
| `reader.blocks`: `text`, `image`, `table`, `diagram`, `video` | converted (content that doesn't fit the layout) |
| `reader.blocks`: `details`, `callout`, `tabs`, `embed`, `slide-ref`, `pdf`, `graph`, `map`, `tag-cloud` | no PowerPoint counterpart |
| `reader.related` | converted (zooms) |
| `reader.summary`, `reader.showSlide`, `reader.hidden`, block `for` / `depth`, `slide.tags` | no PowerPoint counterpart |
| Slide links `[text](#id)` | converted |
| Video `captions`, `transcript`, `play`, `chapterSteps` | no PowerPoint counterpart (chapters come from bookmarks) |
| Table `sortable`, `filter`, `steps`, `visual` (except chart bars) | no PowerPoint counterpart |

## How layouts are chosen

1. **By name:** if the PowerPoint layout name is in `--mapping` or in the template's `pptxMapping` (e.g. "Title and Content" → `bullets`), that layout is used. The exceptions: if the slide has pictures and the mapped layout can't hold any, or a table, chart, SmartArt or video and the mapped layout has no slot for it while another layout has, the best fit is used instead.
   - A template can also give **placeholder roles** (template format 0.2): which PowerPoint placeholder fills which slot, card or card field, and which placeholders are decoration to ignore (footer, logo, overlays). With roles the mapping always wins, and the content lands exactly where the template expects it. The Conclusion template maps all 20 of its PowerPoint layouts this way. See `docs/template-format.md`.
2. **Title-only slides:** the first one becomes `title`, later ones `section`.
3. **Best fit:** otherwise, the layout whose slots match the slide's text blocks and pictures with the least left over.

Placeholder text that doesn't fit, such as a third text block, goes to the slide's reader layer. A picture that doesn't fit, such as a second picture or a logo, becomes an **extra image** on the slide at the same place as in PowerPoint (the show is then format 0.2). A text box that doesn't fit becomes a **text element** at its place, and a text box or shape with a fill or outline (a badge, a pill, a callout) always does: it needs no slot. All are listed in the report.

## The conversion report

Every run writes `conversion-report.md` into the output folder. For each slide it lists which layout was chosen and why, what moved to the reader layer, what was **not converted**, and remarks such as missing alt text or a missing title. That tells you which slides to touch up.

## Export to PowerPoint

`slipr-export` does the reverse: it turns a show into an **editable** `.pptx` (I-045, D-018). Titles, text, lists, cards, tables and pictures become real PowerPoint text, tables and pictures on a matching layout; the reader layer goes into the speaker notes.

```
slipr-export <show-folder> --out <deck.pptx> [options]
```

| Option | Meaning |
|---|---|
| `--out` | The `.pptx` to write (required). An export report, `<deck>-export-report.md`, is written next to it |
| `--base <deck.pptx>` | Use the layouts, masters and theme of this deck, e.g. the company PowerPoint template a Slipr template was made from. Its own slides are dropped; its logo and slide numbers carry over. Without it: PowerPoint's default layouts, at the show's aspect ratio |
| `--template <folder>` | The Slipr template (default: the show's `template.ref`) |
| `--no-notes` | Leave out the speaker notes |
| `--no-reader` | Leave the reader layer out of the speaker notes |
| `--force` | Overwrite an existing `.pptx` |

Examples (from `converter/`):

```
slipr-export ..\shows\demo --out out\demo.pptx
slipr-export ..\shows\conclusion-demo --base ..\ConclusionTemplatePresentation.pptx --out out\conclusion.pptx
```

| Slipr | In PowerPoint |
|---|---|
| Slides, layouts | slides on the PowerPoint layout the template's `pptxMapping` names (the one that fits the slide's content best), with placeholder roles honoured; else *Title Only* with the content under the title |
| Text, lists, subheadings, `A.` / `1.` lists | paragraphs on the outline level whose style matches, so a corporate template's own bullets and text styles are used |
| Bold, italic, code, links, glossary terms | runs with that formatting; glossary terms as plain text, inline popups left out |
| Pictures | pictures with their crop, focus, opacity and alt text; SVG stays SVG (PowerPoint 2016 and later), WebP becomes PNG |
| Cards | the template's card placeholders, or a grid of text boxes (with their pictures) |
| Tables, tag clouds | a real table (at most 16 rows) / a text box with sized terms |
| Videos in the show folder | an embedded video with its poster |
| Graphs, maps | a list of nodes and links / places |
| Diagrams, web pages, PDFs, YouTube / Vimeo | their fallback picture (a click opens the link), else a card with the title and link; Mermaid source in the notes |
| Extra images, text elements | at their place and size, text elements with their look |
| Chapters, hidden slides, `meta` | sections, hidden slides, document properties |
| Speaker notes, reader layer | the notes, then the reader layer as text under **Reader layer** |

Not exported: animations and transitions, picture styles, and pictures at web addresses (no network calls). The report lists every fallback and anything that could not be exported. Spec: `docs/specs/I-045-pptx-export.md`.
