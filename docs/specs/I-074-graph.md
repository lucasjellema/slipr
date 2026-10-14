# I-074: Graph visualization (Cytoscape.js)

Status: **done** · 2026-10-13 · Builds on I-070 · Decision: D-011 (Cytoscape.js approved, refined). Verified in Claude's browser pane: audience mode (steps revealed and focused by toggling the fragments' `visible` class, and back), reader mode (slot and data-file block: node list, panel, tag filter, zoom, Esc), the editor (read-only summary, preview), and the single-file export (no requests besides the file). Real clicks, touch and camera animations are for Lucas to try: Claude's pane runs no animation frames, so the focus zoom does not animate there

## Goal

A network of ideas, components or people on a slide or in the reader layer: nodes with labels and links between them, laid out automatically. Readers explore it (pan, zoom, click a node for its explanation or its slide, filter by tag); presenters build it up step by step. The same component can later power I-017 (a concept map of the show's own slides).

## Lucas's decisions (2026-10-13)

1. **Library**: Cytoscape.js **3.34.3** from npm, vendored as `vendor/cytoscape-3.34.3/` (only `dist/cytoscape.esm.min.mjs`, see its `VENDORED.md`), lazy-loaded.
2. **Steps in audience mode: reveal and focus.** `steps` is a list; a step either **shows** more nodes (`{ "show": [ids] }`, their edges come along once both ends are visible) or **focuses** a node (`{ "focus": id }`: zoom to it and its neighbours, the rest fades). Without steps the whole graph is visible at once.
3. **Colors from the template, by tag.** The show holds no colors (slides contain no styling): a node's first tag picks the template's graph palette (`--slipr-graph-1` … `--slipr-graph-6`) in order of first use; an untagged node uses the first. In reader mode the tags are a legend and a filter.
4. **Scope**: format, renderer, audience and reader mode, a `graph` layout in both templates, the demo, export. The editor shows graphs read-only (like diagrams, E-019).

## Format (show format 0.2)

A `graph` slot value and a `graph` reader block share these fields:

```json
{
  "nodes": [
    { "id": "show", "label": "show.json", "tags": ["format"], "md": "One file per show: **content**, reader layer, settings.", "slide": "s-data-1" },
    { "id": "template", "label": "Template", "tags": ["template"] }
  ],
  "edges": [{ "from": "show", "to": "template", "label": "names" }],
  "layout": "cose",
  "steps": [{ "show": ["template"] }, { "focus": "show" }],
  "caption": "How the parts of Slipr relate",
  "fallback": { "src": "images/graph.png", "alt": "…" }
}
```

| Field | Type | Meaning |
|---|---|---|
| `nodes` | array | `id` (required, unique), `label` (default: the id), `tags` (strings), `md` (Markdown shown when a reader selects the node), `slide` (a slide id: the node links to it) |
| `edges` | array | `from`, `to` (node ids, required), `label` |
| `data` | string | Instead of (or besides) inline `nodes` / `edges`: a JSON file in the show folder (`data/…json`) with `{ "nodes": [...], "edges": [...] }`. Inline entries come after the file's |
| `layout` | `cose` · `breadthfirst` · `concentric` · `circle` · `grid` | Automatic placement. Default `cose` (force-directed, deterministic: it starts from a circle) |
| `steps` | array | Audience mode only, slots only: `{ "show": [ids] }` or `{ "focus": id }`, one per click, after the slide's own fragments. Nodes named in a `show` step are hidden until that step; the others are visible from the start |
| `caption` | string | Below the graph |
| `fallback` | image | Static image for print, editor thumbnails and when rendering fails (I-070) |

The reader block also has `id`, `type: "graph"`, `for`, `depth` and an optional `title`.

**Validation.** Errors (schema): neither `nodes` nor `data`; a node without `id`; an edge without `from` / `to`; a graph in a 0.1 show; an absolute or unsafe `data` address. Warnings: a duplicate node id, an edge or step naming an unknown node, a node `slide` that does not exist, a `data` file not found (with a file check). Node Markdown is checked like any Markdown (unknown glossary ids).

## Rendering (`shared/embeds/graph.js`)

An embed kind (I-070 contract). The static content is an accessible **list**: each node with its label and its links (`A → B (label)`), so print, thumbnails, screen readers and a failed load always show the structure. Hydration loads Cytoscape, reads the graph (inline, or fetched from `data` through `resolveAsset`, so folder sources and single-file exports work), and draws it with the template's tokens: node colors from `--slipr-graph-*`, text in `--slipr-font-body`, edges in `--slipr-color-muted`, the focus ring in `--slipr-color-accent`. Label color is chosen for contrast (white or the text color).

- **Reader mode** (blocks, and slots in reader mode): drag to pan; **+ / − / Fit** buttons zoom (the mouse wheel scrolls the page, it is not captured). Click or tap a node, or pick it from the **Node** list (keyboard): its neighbours are highlighted, the rest fades, and a panel shows its label, Markdown and **Go to slide**. **Tag** chips filter the nodes (toggle buttons, also the legend). Esc or **Clear** resets.
- **Audience mode**: a fixed viewport (no panning, no dragging), fitted to the whole graph so revealing never moves the camera. Steps are hidden Reveal fragments after the slot (like PDF pages, I-072); the graph follows the number of visible ones, so going back works too.
- Editor thumbnails show the static list (`thumbnail: false`); the editor's audience preview draws the graph.

## Templates

Both templates get a `graph` layout (title, graph, caption; Conclusion: kicker, title, graph) and define `--slipr-graph-1` … `6` from their palette (default 1.4.0, Conclusion 0.1.5). A template without them falls back to its primary and accent colors and four neutral ones (`shared/embeds/embeds.css`).

## Notes

- Layout is deterministic: `cose` starts from a circle, not at random, so every reader and the presenter see the same picture. Placement runs in a fixed box, because a slide that is not shown yet has no size; a force layout is then widened (up to 1.8 ×) towards the drawing's proportions.
- Node text has one size in graph units; the view's zoom scales it with the drawing.
- The drawing re-fits when its size changes, and once more shortly after it is drawn (resize observers wait for a rendered frame, so a page in a background tab would otherwise keep a stale size).
- Visibility is tracked with the display flag Slipr sets, not with Cytoscape's `:visible`, which lags behind a style change.
- The embed element gets `sliprGraph` (the Cytoscape instance) for debugging and browser checks.

## Graph editor (E-020, 2026-10-14)

Done with the recommended scope (the question was not answered; the same approach as the map editor, E-021): a **live mini graph in the form** with + Node, 🔗 Connect (click two nodes to link them), click-to-open a node's row, Fit and **Snapshot as fallback** (`cy.png()`, without the editor's marks, with an alt text naming the nodes); rows for nodes, links, layout and steps (slots); a **data file** picker (copied into `data/`): the file's nodes are drawn dashed and listed read-only, and **Move into the slide** copies them inline and drops the file reference (the editor never writes data files). Modules: `editor/js/graph-values.js` (DOM-free value helpers, tested) and `editor/js/ui/graph-fields.js`, shared by the slot editor and the new Graph block editor. The mini graph uses the viewer's Cytoscape loader, style and layout (`getCytoscape()`, `graphStyle()`, `runLayout()`, `themeOf()`, `highlight()` exported from `shared/embeds/graph.js`). Node ids come from labels; renaming an id renames it in links and steps, removing a node removes its links and its place in the steps. Found while checking: a fallback image added to a graph slot went through the web page value helper and added `title` / `url`; `withFallback()` (`editor/js/block-values.js`) now picks the value's own shape.

## Out of scope

- Fixed node positions (`preset` layout), node shapes or sizes per node, compound (nested) nodes.
- Glossary popups inside node Markdown (terms show as text in the node panel).
- I-017 (the show's own concept map) builds on this later.
