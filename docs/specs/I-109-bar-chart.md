# I-109: Embedded bar charts (`chart` slot and block, `kind: "bar"`)

Status: **in progress** · 2026-10-15 · Builds on I-070 (embed foundation), I-104 (table data & CSV reading). First concrete chart kind of I-007.

## Goal

Data-driven bar visualizations on a slide or in the reader layer, from a CSV file or typed inline: a clean, responsive SVG chart taking its palette, fonts and gridlines from the template. Presenters can tell a visual story (bars grow in, steps reveal categories or series one by one, or highlight a category), while readers get exact values on hover/tap/keyboard focus, can toggle series from the legend, or switch to the full interactive table of the same data (with Copy and Download CSV).

## Lucas's decisions (2026-10-15)

1. **Scope**: format, renderer, audience and reader mode, a `chart` layout in both templates, the demo shows, single-file export and zip, and the full editor. The PPTX converter mapping PPTX charts to `chart` stays out of scope (I-046).
2. **Data source**: shares the I-104 table data model: inline `columns` / `rows` or a CSV file in `data/` read with `shared/csv.js` (detecting comma, semicolon and tab, with decimal comma support). A table and a chart may point at the same CSV file.
3. **No library**: plain SVG drawn by `shared/embeds/chart.js` (D-001/D-002: no Chart.js, D3 or other vendored charting engine). Deterministic, zero dependencies, responsive, completely offline.
4. **Chart options**: vertical or horizontal bars; grouped or stacked for multiple series; value labels on or off; axis min/max and number formatting (reusing table column formatting: currency, percentage, decimals); sort by value or keep data order; highlighted category; optional reference line (target value or average).
5. **Reader mode**: accessible tooltips with exact values on hover, tap and keyboard focus (bars are focusable); click the legend to show or hide a series; **Show as table** switches smoothly to the I-104 table of the same data (with Copy and Download CSV).
6. **Audience mode**: bars grow in when the slide appears; optional steps (hidden Reveal fragments) reveal categories or series, or highlight a category.
7. **Editor**: a dedicated chart field editor like the table editor (data source, category and series pickers, chart options, steps) with live preview, and one-click conversion between table and chart.

## Format (show format 0.2)

A `chart` slot value and a `chart` reader block share these fields:

```json
{
  "kind": "bar",
  "data": "data/sales.csv",
  "category": "region",
  "series": ["revenue", "customers"],
  "orientation": "vertical",
  "stacked": false,
  "values": true,
  "min": 0,
  "max": 2000,
  "sort": "desc",
  "highlight": "East",
  "reference": { "value": "average", "label": "Average revenue" },
  "steps": [
    { "categories": 2 },
    { "categories": "all" },
    { "highlight": "East" }
  ],
  "caption": "Revenue per region (Q1)",
  "fallback": { "src": "images/sales-chart.png", "alt": "Sales per region chart" }
}
```

Or with inline data:

```json
{
  "kind": "bar",
  "columns": [
    { "key": "quarter", "label": "Quarter" },
    { "key": "revenue", "label": "Revenue", "format": "currency", "currency": "EUR" },
    { "key": "target", "label": "Target", "format": "currency", "currency": "EUR" }
  ],
  "rows": [
    ["Q1", 1200, 1000],
    ["Q2", 1340, 1100],
    ["Q3", 980, 1100],
    ["Q4", 1650, 1300]
  ],
  "category": "quarter",
  "series": ["revenue", "target"],
  "values": true
}
```

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | `"bar"` (required, or defaults to `"bar"`). Future chart kinds (line, pie, scatter) will use other values. |
| `data` | string | CSV file in the show folder (`data/…csv`). First row contains column keys. |
| `rows` | array of arrays | Inline rows, each an array of cells in the order of `columns`. |
| `columns` | array | Column configurations `{ key, label?, format?, decimals?, currency? }`. For inline data defines columns; for CSV files configures them. |
| `category` | string | Column key used for category labels. Default: the first column. |
| `series` | array of strings | Column keys used for value series. Default: all numeric columns except the category column. |
| `orientation` | string | `"vertical"` (default) or `"horizontal"`. Also accepts boolean `horizontal: true`. |
| `stacked` | boolean | `true` for stacked bars; `false` (default) for grouped bars. |
| `values` | boolean | `true` to display formatted value labels directly on or above bars (default `false`). |
| `min` | number | Optional custom axis minimum. |
| `max` | number | Optional custom axis maximum. |
| `sort` | string \| boolean | `"asc"` (lowest first), `"desc"` (highest first), or `"none"` / `false` (default: preserve data order). |
| `highlight` | string \| null | Category name to highlight (dimming other categories). |
| `reference` | number \| string \| object | Optional reference line: a number, `"average"`, or `{ "value": number \| "average", "label": string }`. |
| `steps` | array | Audience mode steps (hidden Reveal fragments): `{ "categories": n \| "all" }` or `{ "bars": n }`, `{ "series": n \| key \| "all" }`, `{ "highlight": name \| null }`. |
| `title` | string | Reader block only: title above the chart. |
| `caption` | string | Caption below the chart. |
| `fallback` | object | Fallback image `{ src, alt }` as for all embeds (I-070). |

**Validation.**
- Errors: `kind` other than `"bar"`; neither `data` nor `rows`; chart in a 0.1 show; invalid CSV path.
- Warnings: `category` column key not found in columns; `series` column key not found; `highlight` category not found in data; data file not found (with file check).

## Rendering (`shared/embeds/chart.js`)

An embed kind following the I-070 contract without external libraries.

- **Static content**: For inline data, the SVG chart is rendered immediately into `.slipr-embed-fallback`, ensuring print, thumbnails and offline viewers show the visual without delay. For CSV data without a fallback image, a structured card with category and series names is rendered until hydration reads the file.
- **SVG structure**: Clean `<svg>` with `viewBox="0 0 800 450"`, `preserveAspectRatio="xMidYMid meet"`, semantic elements (`<g>`, `<rect>`, `<line>`, `<text>`), accessible `<title>` and `<desc>`.
- **Styling**: All colors, fonts, and gridlines come from template tokens:
  - Series colors: `--slipr-chart-1` through `--slipr-chart-6`, falling back to `--slipr-color-primary`, `--slipr-color-accent`, and `--slipr-graph-3` through `--slipr-graph-6`.
  - Gridlines: `--slipr-chart-grid` (fallback `--slipr-table-border` or `rgba(0,0,0,0.12)`).
  - Axis text: `--slipr-chart-text` (fallback `--slipr-color-muted`).
  - Highlight: `--slipr-chart-highlight` (fallback `--slipr-color-accent`).
  - Reference line: dashed line with label.
- **Reader mode**:
  - Interactive tooltips positioned over the hovered or focused bar.
  - Keyboard accessible: each bar has `tabindex="0"`, `role="img"`, and `aria-label`.
  - Legend items for multi-series charts can be clicked to toggle visibility of any series.
  - **Show as table** button toggles view to the I-104 table of the same data, with Copy, Download CSV, and a **Show as chart** toggle back.
  - Category names, title and series are indexed in reader search.
- **Audience mode**:
  - Bars grow in smoothly using CSS animations (`@media (prefers-reduced-motion: reduce)` disables).
  - Audience steps (Reveal fragments) reveal bars/categories/series or highlight a category.

## Templates

Both templates receive a `chart` layout:
- `templates/default`: layout `chart` (title, chart, caption), `--slipr-chart-*` tokens, version bump.
- `templates/conclusion`: layout `chart` (kicker, title, chart), magenta/blue/yellow Conclusion tokens, version bump.

## Editor

- Dedicated **Chart** field editor (`editor/js/ui/chart-fields.js`, `editor/js/chart-values.js`):
  - Data: Inline cell grid or CSV file with file picker and preview.
  - Category & Series pickers with auto-detection.
  - Options: Orientation, Grouped/Stacked, Value labels, Min/Max, Sort, Highlight, Reference line, Caption.
  - Audience steps manager (+ Reveal categories, + Highlight, + Clear).
  - One-click *Show as table* / *Make a chart* conversion.
