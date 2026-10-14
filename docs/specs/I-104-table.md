# I-104: Interactive data tables (`table` slot and block)

Status: **done** · 2026-10-14 · Builds on I-070 (embed foundation). Verified in Claude's browser pane: audience steps, sorting and highlights (default and Conclusion templates), the reader CSV block (filter, Columns, totals, scrolling), reader search, the single-file export, and the editor (grid typing, + Row, column settings, steps, CSV preview, Move into the slide, paste into the grid, undo). Real Reveal navigation, clipboard Copy and Download CSV are for Lucas to try in a normal browser

## Goal

Tables of data on a slide or in the reader layer, from a CSV file or typed in: a clean, coloured layout from the template that scrolls when it is long or wide, and that the presenter and readers can sort and filter. Numbers get totals, formats and (optionally) colours that show patterns at a glance. Presenters can tell a story with it: reveal rows one by one, or point at a row, a column or a cell.

## Lucas's decisions (2026-10-14)

1. **Scope**: format, renderer, audience and reader mode, a `table` layout in both templates, the demos, single-file export and zip, **and the full editor** in the same delivery. Not the PPTX converter (I-040 stays open).
2. **Data**: a **CSV file** in the show folder (`data/…csv`) **or inline rows** in `show.json`. No remote URLs.
3. **Sorting and filtering work in both modes** when the author switches them on: the presenter can click a header or type a filter while presenting.
4. **Extras in the first version**: row reveal and highlight steps (audience), conditional colours and data bars, links in cells (Markdown, glossary terms, slide links). Group-by with subtotals goes to Ideas.
5. No library: plain DOM, so nothing to vendor and nothing to lazy-load.

## Format (show format 0.2)

A `table` slot value and a `table` reader block share these fields:

```json
{
  "data": "data/sales.csv",
  "columns": [
    { "key": "region", "label": "Region" },
    { "key": "revenue", "label": "Revenue", "format": "currency", "currency": "EUR", "total": "sum", "visual": "bar" },
    { "key": "growth", "label": "Growth", "format": "percent", "decimals": 1, "visual": "sign" },
    { "key": "notes", "format": "markdown", "hidden": true }
  ],
  "sortable": true,
  "sort": { "column": "revenue", "order": "desc" },
  "filter": true,
  "maxRows": 8,
  "pinFirst": true,
  "steps": [{ "rows": 2 }, { "rows": 4 }, { "highlight": { "column": "growth" } }],
  "caption": "Revenue per region, 2026",
  "fallback": { "src": "images/sales-table.png", "alt": "…" }
}
```

| Field | Type | Meaning |
|---|---|---|
| `data` | string | A CSV file in the show folder (`data/…csv`). The first line holds the column keys. Comma, semicolon or tab separated (detected); quotes as in RFC 4180; a byte-order mark is ignored. With semicolons, `1234,5` is read as a decimal comma |
| `rows` | array of arrays | Instead of `data`: the rows inline, each an array of cells (string, number or null) in the order of `columns` |
| `columns` | array | Column settings, by `key` (required). For inline rows they define the columns; for a CSV file they configure the file's columns: listed ones in the given order, then the file's other columns in file order |
| `sortable` | boolean | Click a header to sort: ascending, descending, back to the original order |
| `sort` | `{ column, order }` | Initial sort (`order`: `asc` · `desc`) |
| `filter` | boolean | A search box that keeps the rows containing the text (in any shown column) |
| `maxRows` | integer | Rows visible before the table scrolls vertically (reader blocks; on a slide the layout's space limits it too). The header stays in place |
| `pinFirst` | boolean | The first shown column stays in place while the table scrolls sideways |
| `locale` | string | Number and date formatting (`nl-NL`); default the show's `meta.language`, else the browser's |
| `steps` | array | Audience mode, slots only, one per click after the slide's own fragments: `{ "rows": n }` shows the first n rows (once any `rows` step exists, the table starts with none), `{ "highlight": { "row": n \| "first-column value", "column": key } }` highlights a row, a column or a cell (the rest dims) until the next step, `{ "highlight": null }` clears |
| `title` | string | Block only: above the table |
| `caption` | string | Below the table |
| `fallback` | image | As every embed (I-070) |

Column fields:

| Field | Meaning |
|---|---|
| `key` | Required. The CSV header or the inline column's name |
| `label` | Header text (default: the key) |
| `format` | `text` · `number` · `integer` · `percent` (0.125 → 12.5 %) · `currency` · `date` · `markdown`. Default: `number` when every filled cell is a number, else `text` |
| `decimals` | Digits after the decimal point for number, percent and currency |
| `currency` | ISO code for `currency` (default `EUR`) |
| `align` | `start` · `center` · `end` (default: numbers at the end, the rest at the start) |
| `hidden` | Not shown (readers can show it from the Columns menu) |
| `total` | `sum` · `avg` · `min` · `max` · `count`: a footer row with this value over the rows on show. Numeric columns only (except `count`) |
| `visual` | Numeric columns: `scale` (cell background from light to the template's strong colour, by value), `bar` (a bar inside the cell, by value), `sign` (negative values in the negative colour, positive in the positive one) |

`markdown` cells use inline Markdown: `**bold**`, links, `[[glossary-id]]` (a popup in reader mode) and slide links (`[text](#slide-id)`).

The reader block also has `id`, `type: "table"`, `for`, `depth` and `title`.

**Validation.** Errors (schema): neither `data` nor `rows`; a column without `key`; an unknown `format`, `total` or `visual`; a table in a 0.1 show; an absolute or unsafe `data` path. Warnings: a duplicate column key; a row with more cells than columns; `sort`, a step or a `highlight` naming an unknown column; a `total` or `visual` on a column that is not numeric (inline rows); a `data` file not found (with a file check). Markdown cells are checked like other Markdown (unknown glossary ids).

## Rendering (`shared/embeds/table.js`)

An embed kind (I-070 contract) without a library. The **static content is the table itself** (inline rows; for a CSV file the header from `columns` and a note), so print, thumbnails, screen readers and failures show the data. Hydration reads the CSV (through `resolveAsset`: folder and zip shows, single-file exports), builds the same table and adds the controls. Everything comes from template tokens: header `--slipr-table-header-bg` / `--slipr-table-header-text`, stripes `--slipr-table-stripe`, lines `--slipr-table-border`, `--slipr-table-positive` / `--slipr-table-negative`, the scale and bars from `--slipr-table-strong`, the highlight from `--slipr-color-accent`. A template without them gets defaults from its primary colour and surfaces (`embeds.css`).

- A real `<table>` with `<caption>`, `<th scope="col">`, `aria-sort` on sortable headers (buttons inside the headers), a `<tfoot>` for totals; the scroll area is focusable (`tabindex="0"`, labelled) so the keyboard can scroll it.
- **Reader mode** (blocks, and slots in reader mode): sorting and filter when switched on, a **Columns** menu to show or hide columns, **Copy** (tab-separated, pastes into a spreadsheet) and **Download CSV** (of the rows on show). A status line says "12 of 40 rows".
- **Audience mode**: sorting and filter when switched on (Reveal ignores keys typed in the filter box); steps are hidden Reveal fragments after the slot, like graph steps, so going back works too. Every time the slide is shown, the table starts from the author's sort and filter. Steps play only in a running presentation (inside `.reveal`): the static content, print, thumbnails and the editor's preview show every row, like the viewer's overview shows every step.
- Totals follow the rows on show (filtered, revealed).
- Reader search finds the text of inline rows. Rows in a CSV file are not in the search index (it is built before files are read).

## Templates

Both templates get a `table` layout (title, table, caption; Conclusion: kicker, title, table) and the `--slipr-table-*` tokens from their palette.

## Editor

A **Table** field editor for the `table` slot and a **Table** block type (`editor/js/table-values.js`, DOM-free and tested; `editor/js/ui/table-fields.js`):

- **Data**: *Inline* with a cell grid (+ Row, + Column, remove, and **Paste from a spreadsheet**: tab-separated text from Excel or Google Sheets, first line as headers), or *CSV file* with **Choose CSV…** (copied into `data/`, like graph data) and a preview of its first rows; **Move into the slide** turns a CSV file into inline rows.
- **Columns**: one row each with label, format (decimals, currency), alignment, hidden, total, visual; ◀ ▶ to reorder. Renaming a typed-in column changes its key, and sort and steps follow.
- **Options**: sortable and initial sort, filter, rows before scrolling, pin first column, locale, caption.
- **Steps** (slots): + Show rows, + Highlight row / column / cell, ▲ ▼, remove.
- Every change is one undo step; the preview shows it at once.

## Out of scope (Ideas)

See I-107: group-by with subtotals; charts from the same data (`chart`, planned); editing CSV files from the editor; remote CSV URLs; per-column filters; pagination.
