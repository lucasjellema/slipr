# I-105: Tag clouds (`tag-cloud` slot and block)

Status: **done** · 2026-10-15 · Builds on I-070 (embed foundation), I-086 (glossary terms in slides) and I-104 (CSV reading). Verified in Claude's browser pane: audience steps (default and Conclusion templates), the reader popups (glossary definition, weight, "Mentioned on" links that navigate and close the popup), the CSV block, phone width, the single-file export, and the editor (typing a weight, + Term, + Highlight, order, Move into the slide, a Text block switched to Tag cloud, undo). Real Reveal navigation and touch are for Lucas to try in a normal browser.

## Goal

A cloud of terms on a slide or in the reader layer: the themes of a talk, the answers to a survey question, the keywords of a document. Bigger and stronger-coloured words weigh more. Terms that are glossary terms open their definition in reader mode, and every term leads readers to the slides that talk about it.

## Lucas's decisions (2026-10-15)

1. **Layout**: a **flowing, centred** cloud (terms wrap in centred lines, sized by weight; the heaviest in the middle by default, or ordered by weight, alphabetically or as written). Not a spiral-packed cloud: deterministic, scales with the slide, readable by screen readers. A spiral shape goes to Ideas (I-108).
2. **Reader click**: a **popup with the glossary definition** (when the term is a glossary term) **plus a list of the slides that mention the term**, each a link. Works for terms outside the glossary too.
3. **Scope** as I-104: format, renderer, both modes, a layout in both templates, the demos, single-file export, **and the full editor**. Not the PPTX converter.
4. **Steps**: **reveal the heaviest n terms** and **highlight terms**. No pulse animation (Ideas, I-108).

## Format (show format 0.2)

A `tag-cloud` slot value and a `tag-cloud` reader block share these fields:

```json
{
  "terms": [
    { "text": "reader layer", "weight": 14 },
    { "text": "templates", "weight": 10 },
    { "text": "Popovers", "weight": 5, "glossary": "reader-layer" }
  ],
  "order": "cloud",
  "maxTerms": 30,
  "weightLabel": "mentions",
  "steps": [{ "terms": 3 }, { "terms": "all" }, { "highlight": ["reader layer", "templates"] }],
  "caption": "What the show is about"
}
```

| Field | Meaning |
|---|---|
| `terms` | Inline terms `{ text, weight?, glossary? }`. Weight ≥ 0, default 1. Repeated names (ignoring case and accents) merge, their weights add up. An empty text is not shown (so the editor can add an empty row) |
| `data` | Instead of `terms`: a CSV file in the show folder (`data/…csv`), read with `shared/csv.js` |
| `termColumn` | CSV column with the terms; default the first |
| `weightColumn` | CSV column with the weights; default the second when all its filled cells are numbers. Without one every row counts 1, so one survey answer per row works as is |
| `order` | `cloud` (default) · `weight` · `alphabetical` · `none` |
| `maxTerms` | Only the heaviest n |
| `weightLabel` | What a weight counts: the popup says "12 mentions", screen readers hear it. Without it the popup shows no weight (a bare "weight 12" means little to readers) |
| `steps` | Slots, audience mode: `{ "terms": n \| "all" }` reveals the heaviest n in their own places (the cloud starts empty once such a step exists); `{ "highlight": name \| [names] \| null }` highlights by name and dims the rest until the next step. Only in a running presentation |
| `title` | Block only |
| `caption`, `fallback` | As for tables |

**Glossary (D-015).** A term whose folded name equals a glossary term or alias is linked to it; `glossary` picks an entry explicitly.

**Telling a tag cloud from a table.** By the template's slot type or the block `type`. Where only the shape is known (`usedEmbedKinds()`, the editor's save order, the validator's per-value checks), a value with `terms`, or a CSV file with a tag-cloud-only field or step, is a tag cloud; a bare `{ "data": "…csv" }` is taken for a table, which is checked the same way.

**Validation.** Errors (schema): neither `terms` nor `data`; a term without `text`; a negative weight; an unknown `order` or step; a non-CSV `data`; a tag cloud in a 0.1 show; `steps` on a block. Warnings: a highlight naming a term the cloud does not have (inline terms); an unknown `glossary` id; a data file not found (with a file check).

## Rendering (`shared/embeds/tag-cloud.js`)

An embed kind without a library. The model (`tagCloudModel()`) merges, ranks, keeps `maxTerms`, gives every term a `level` (0–1, linear in weight) and a colour `tier` (1–4), links it to the glossary and orders it. The markup is a `<ul role="list">`; each `<li>` sets `--slipr-tag-level`, the font size runs from `--slipr-tag-cloud-min-size` to `-max-size` (em), the colour from `--slipr-tag-cloud-1` … `-4`, the highlight from `-highlight`, the font from `-font`; defaults from the template's muted, graph and primary colours, accent and heading font (`embeds.css`). Terms wrap between their words only when a line is too narrow.

- **Static content** is the cloud itself (inline terms), so print, thumbnails and failures show it; for a CSV file a note. Hydration reads the file.
- **Audience mode**: plain text with the weight in a visually hidden span. Steps are hidden Reveal fragments after the slot; revealed terms keep their places (`visibility`), so the cloud does not jump.
- **Reader mode**: each term is a `<button class="slipr-tag-cloud-term" data-tag data-term? data-tag-weight?>`. `viewer/reader/interactions.js` treats it like a glossary term (hover, click, tap, Enter): the popup shows the definition, the weight and "Mentioned on" with the other slides whose text or reader blocks contain the term or the glossary term's names as whole words (`slidesMentioning()` in `viewer/reader/search-index.js`, over the search index, built once on the first popup). A link navigates and closes the popup.
- Reader search indexes inline terms (not a CSV file's, like table rows).

## Templates

Both templates get a `tag-cloud` layout (default: title, cloud, caption; Conclusion: kicker, title, cloud) and the `--slipr-tag-cloud-*` tokens (Conclusion: grey to magenta, yellow highlights, the heading font), plus popup styles for the slide list. Default 1.7.0, Conclusion 0.1.8.

## Editor

A **Tag cloud** field editor for the `tag-cloud` slot and a **Tag cloud** block type (`editor/js/tag-cloud-values.js`, DOM-free and tested; `editor/js/ui/tag-cloud-fields.js`, laid out with the table editor's classes):

- **Terms**: a grid of term, weight and glossary term (*Automatic: …* or a pick), ▲ ▼ 🗑, + Term; **Paste a list** (one per line, optional weight after a comma, semicolon or tab); **Use a CSV file…** (copied into `data/` like table data), with term and weight column pickers and the heaviest terms as the cloud reads them; **Move into the slide**.
- **Options**: order, show at most, what a weight counts, caption.
- **Steps** (slots): + Show terms, + Highlight (comma-separated names), + Clear highlight, ▲ ▼, remove.
- Every change is one undo step.

## Out of scope (Ideas, I-108)

A spiral-packed shape; a pulse on highlights; colours by category; filtering the contents to the slides that mention a term; CSV terms in the search index.
