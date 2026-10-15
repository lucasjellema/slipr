# I-045: Export a show to PowerPoint

Status: **done** 2026-10-15 · Component: converter · Decision: D-018

The reverse of the converter: `slipr-export` turns a Slipr show folder into a `.pptx` that people can open, present and edit in PowerPoint.

## Lucas's decisions (2026-10-15)

1. **Toolchain**: Python with `python-pptx`, as a second command (`slipr-export`) in the converter package. No new dependency (D-006); the export reuses the template's `pptxMapping` and placeholder roles backwards. CLI only, not in the editor (rejected for now: PptxGenJS in the browser, which needs a vendored library and cannot reuse the mapping; a headless browser, which needs a new dev dependency).
2. **Fidelity**: **editable** slides. Titles, text, lists, quotes, code, cards, tables and pictures become real PowerPoint text, tables and pictures on a matching layout. Rich slots fall back to something static (below), listed in an export report. The **reader layer goes into the speaker notes**.

## Command

```
slipr-export <show-folder | show.json> --out <deck.pptx> [--template <folder>] [--base <deck.pptx>] [--no-notes] [--no-reader] [--force]
```

- The template comes from `template.ref` (relative to `show.json`, or `/templates/<name>` in this repository; a ref that resolves nowhere is tried by its last segment), or from `--template`.
- `--base`: a `.pptx` whose layouts, masters and theme the deck uses, such as the company template a Slipr template was derived from (I-043). Its own slides are dropped. Without it, python-pptx's default Office layouts are used at the show's aspect ratio (16:9 or 4:3).
- Writes the deck and `<deck>-export-report.md` next to it. An existing `.pptx` is only overwritten with `--force`.

## Layouts and placeholders

1. **Layout**: of the `pptxMapping` entries that map to the slide's Slipr layout and exist in the deck, the one whose placeholders take the most of the filled slots (ties: the first). So a `two-column` slide with column headings gets *Comparison*, one without them *Two Content*. Without a mapping: *Title Slide* / *Section Header* for slides with only short texts, else *Title Only* (or, in a deck with its own layout names, the layout with a title and the fewest other placeholders).
2. **Placeholder roles** (`idx → slot`, `cards[i]`, `cards[i].field`) fill exactly the placeholder the converter reads them from. A `null`-role title placeholder off the slide (a corporate outline title) still gets the slide title.
3. **The other slots by type**: `title` → title placeholder; short `text` slots → subtitle, then body placeholders (subtitle, byline and caption first, kicker last); `list` / `richtext` / `cards` / `quote` / `code` → content, then body placeholders; `image` → picture, then content placeholders; other kinds → content placeholders.
4. **Leftovers**: `leftTitle`-style slots become the bold first line of their `left` slot; other short texts join a text placeholder that was filled (a kicker goes before it); the rest is drawn under the title (a kicker above, captions at the bottom, text to the left of pictures and visuals). The report lists them as "placed as a free shape".
5. Placeholders nobody filled are removed, so no "Click to add text" prompts remain. With `--base`, the first base slide on each layout lends its decoration to new slides: placeholders the template ignores (`pptxIgnore`, `null` roles) that hold something there (the logo, a space that hides a prompt), the slide number and the footer.

## Text

- Markdown becomes runs: bold, italic, code (Consolas), links (http(s) and mailto), glossary references as their term or own text; inline popups (`^[…]`) are left out of the slide. `text` slots are plain text, never parsed.
- **Outline levels as text styles**: in a placeholder, each paragraph goes to the outline level whose inherited style fits it (resolved with `reader.paragraph_style`, as the converter does): the n-th bullet level for a list item at depth n, the `A.` / `1.` level for those lists, a plain level for paragraphs, the bold-capitals level for a subheading (an entirely bold paragraph), the serif level for an entirely italic one. One-line `text` slots stay on level 0, the placeholder's own style; a card's first field too. Where the placeholder has no such level, the bullet is set on the paragraph itself.
- Free text boxes take the text colour of the layout's body text, so they stay readable on dark layouts.

## Pictures

- `fit` (default: `cover` in a picture placeholder, else `contain`), `focus`, `crop` and `opacity` are kept; alt text becomes the picture's description. Picture styles are not carried over.
- **SVG** is embedded the way PowerPoint 2016 and later do it (an `asvg:svgBlip` beside a plain grey PNG stand-in that older apps show). **WebP** is converted to PNG with Pillow (a python-pptx dependency). Pictures at an `http(s)` address are not fetched (no network calls): reported.

## Rich slots

| Slot | In PowerPoint |
|---|---|
| `table` | a real table: header, rows (at most 16, the rest reported), totals, number formats, alignment; inline rows or the CSV file |
| `tag-cloud` | one centred text box, terms sized 14–40 pt by weight in the cloud order, heavy ones in the accent colour |
| `video` (file in the show) | an embedded PowerPoint video with the poster; start / end times are reported (trim it in PowerPoint) |
| `graph` / `map` without a fallback | a list of nodes and links / places and layers |
| anything with a `fallback` picture | that picture; a click opens the web page or video link |
| `diagram`, `web`, `pdf`, YouTube / Vimeo without a fallback | a framed card with the title and the link; Mermaid source goes into the notes |

Extra images and text elements (`overlays`) keep their place and size; text elements keep font (theme heading / body font, Consolas, Georgia, Segoe UI), size (a percentage of the slide width; named sizes as the default theme), bold / italic / underline / capitals, alignment, colour, fill and its opacity, border, rounded corners, outline and padding.

## Show level

Chapters become PowerPoint **sections** (slides without a chapter stay in the section before them; an *Introduction* section holds slides before the first chapter). Hidden slides (`audience.hidden`) are hidden. `meta` becomes the document properties. Speaker notes keep their Markdown formatting; the reader layer follows under **Reader layer**: summary, then each block as text (details and callouts with their title, tabs with their label, image hotspots, tables as tab-separated rows, tag cloud terms, the address of embeds).

## Not in this item

- Rendering diagrams, graphs and maps to pictures with a headless browser (I-118), and an *Export to PowerPoint…* button in the editor (I-119).
- The template's colours and fonts as the deck's theme when there is no `--base`; the default Office theme is used (I-117).
- The Conclusion `agenda` items: the PowerPoint layout has no placeholder for them, so they are drawn under the title (I-120).
- Animations (fragments, steps, auto-animate) and transitions.
