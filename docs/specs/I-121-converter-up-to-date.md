# I-121: Bring the PPTX converter up to date with show format 0.2

Status: **done** · 2026-10-15 · Absorbs I-040 (tables) and I-116 (videos); charts go to tables until Slipr has a chart type (I-046 stays for that). I-041 and I-042 (picture fallbacks with LibreOffice) stay separate. Verified with pytest (90 tests, JavaScript validator included) and in Claude's browser pane: the converted feature deck renders its table, diagrams, slide link, background, fragment and auto-animate slides. Real PowerPoint decks with SmartArt, Morph and zooms are for Lucas to try (the fixtures write the XML as PowerPoint does, but were not made in PowerPoint).

## Goal

`slipr-convert` stopped growing at I-090 (picture crop), while the show format, the editor and `slipr-export` (I-045) moved on. After this item a PowerPoint deck converts to a show that uses everything Slipr can do where PowerPoint has a counterpart, and the report says clearly what has none. Round trip: `slipr-export` → `slipr-convert` of the demo shows keeps everything both sides support.

## Lucas's decisions (2026-10-15)

1. **Charts** become a **table with the chart's data** (categories × series), with a `bar` visual on the values and a note (speaker notes and report) that it was a chart. When Slipr gets a `chart` type, the converter switches to it.
2. **SmartArt** becomes a **Mermaid diagram** read from SmartArt's node tree: hierarchies (org charts) a top-down flowchart, processes, cycles and other shapes a left-to-right flowchart (cycles closed), list-type SmartArt a Markdown list.
3. **No LibreOffice** now. I-041 and I-042 stay later items; I-121 stays pure python-pptx (no new dependency).
4. **No reader-layer guessing**: summaries, glossary terms and tags are not derived from the deck (PowerPoint has nothing to map them from).

## What is mapped

| PowerPoint | Slipr | Notes |
|---|---|---|
| Table | `table` slot or block, inline `columns` + `rows` | First row = labels (keys are slugs of them). Numeric columns get `format` `number` / `integer` / `percent` / `currency` (€, $, £) with `decimals`; a decimal comma is recognised. A last row labelled *Total* / *Totaal* whose numbers are the column sums becomes `total: "sum"`. Merged cells: the text stays in the first cell |
| Chart | `table` slot or block | Category column, one column per series (series name as label), `visual: "bar"` on the series, `percent` when the number format has `%`. Caption: the chart title. A marker in the speaker notes says it was a chart |
| SmartArt | `diagram` slot or block (`mermaid`) | Node tree from the diagram's data part; the layout's `uniqueId` tells hierarchy / process / cycle / list. List SmartArt becomes a text body (a Markdown list) |
| Embedded video | `video` slot or block, file in `media/` | Poster frame → `fallback`; trim start → `start` (end trim is reported, PowerPoint stores it as time cut from the end); bookmarks → `chapters`; title from the alt text or "Video" |
| Online video (YouTube, Vimeo) | `video` with the link | `load` stays the default (click) |
| Slide transition | `settings.transition` / `audience.transition` | fade → `fade`; push, wipe, cover, pull, uncover, split, reveal → `slide`; zoom (and *vortex*, *ripple*…) → `zoom`; cut / none → `none`. The show default is the most common one; slides that differ get their own. A deck without any transitions keeps `fade` as today |
| Morph transition | `audience.autoAnimate` on the slide **and** the one before | Pictures named `!!name` get `morphId` (the slug of the name); pictures of the same file morph without one |
| Entrance animation on a picture or text box placed as an overlay | `fragment` on that overlay | Fade → `fade-in`, Fly in from below / left / right / above → `fade-up` / `fade-right` / `fade-left` / `fade-down`, Zoom / Grow → `grow`, others → `true` |
| Paragraph builds (bullets one by one) | `audience.fragments` | As before |
| Link to another slide in text | Slide link `[text](#s-07)` | Links to *next / previous / first / last slide* stay plain text |
| Slide zoom, summary zoom, section zoom | `reader.related` (the linked slides, or the first slide of the section) | Reported |
| The slide's own background picture | `audience.background` (an image path) | Background colours stay with the template (the template owns the looks); backgrounds inherited from the layout are the template's too |

**Placement** of tables, charts, diagrams and videos (*visuals*): the layout choice treats them like pictures. Best fit prefers a layout with a free slot of the visual's type (`table`, `diagram`, `video`); a PowerPoint layout mapped by name, even with placeholder roles, yields when the mapped layout has no slot for a visual and another layout does. The first visual of each type fills a free slot; others become reader blocks of the same type (never lost). With the Conclusion template a SmartArt therefore lands in the reader layer (it has no `diagram` layout), as the report says.

A show with a table, video or `morphId` is format 0.2.

## Not mapped (reported)

Equations, ink, 3-D models, embedded objects (OLE), audio, charts of kinds python-pptx cannot read (the newer *chartex* kinds: treemap, sunburst, waterfall, funnel…), SmartArt without its data part, linked (not embedded) videos on disk, and background colours. They get a marker in the speaker notes, as today.

## Coverage matrix

`converter/README.md` gets a table of every show format feature and how the converter treats it: *converted*, *partly converted*, *reported as lost*, or *no PowerPoint counterpart* (glossary, profiles, paths, reader blocks other than the ones above, graphs, maps, tag clouds, web pages, PDFs, text styles beyond D-016). Keep it current with every converter change.

## Tests

The generated deck in `tests/conftest.py` gets a table (with a totals row), a bar chart, a video with a poster, a slide link, transitions (fade, push, morph with a `!!` picture) and entrance animations; SmartArt, online video, zooms and bookmarks are added as small XML fixtures written in code (python-pptx cannot create them). A round-trip test exports `shows/demo` and `shows/conclusion-demo` with `slipr-export` and converts them back: every table, video and slide that both sides support comes back, and the result passes `shared/validate.js` without warnings.
